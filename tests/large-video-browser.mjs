import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const [recording, url = 'http://127.0.0.1:4174', port = '9341'] = process.argv.slice(2);
if (!recording) throw Error('Usage: node tests/large-video-browser.mjs <local MP4> [local server URL] [Edge debugging port]');
if (new URL(url).hostname !== '127.0.0.1') throw Error('Use an isolated local CLUTCHUP server.');
const tabs = await fetch('http://127.0.0.1:'+port+'/json/list').then(response=>response.json());
const ws = new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
await new Promise((ok,no)=>{ws.onopen=ok;ws.onerror=no;});
const pending = new Map(), errors = [];
let sequence = 0;
ws.onclose = () => { for(const {no} of pending.values()) no(Error('Browser closed'));pending.clear(); };
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if(message.id) {
    const {ok,no}=pending.get(message.id); pending.delete(message.id);
    message.error?no(Error(message.error.message)):ok(message.result);
  }
  if(message.method==='Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((ok,no)=>{
  const id=++sequence;pending.set(id,{ok,no});ws.send(JSON.stringify({id,method,params}));
});
const js = async expression => {
  const res=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(res.exceptionDetails) throw Error(res.exceptionDetails.exception?.description||res.exceptionDetails.text);
  return res.result.value;
};
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));
const until=async (expression,ms=16000)=>{
  const end=Date.now()+ms;
  while(Date.now()<end){try {const result=await js(expression); if(result)return result;}catch{} await delay(150);}
  throw Error('Timeout: '+expression+' · '+JSON.stringify(errors));
};
const value = (selector, text) => js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(text)};e.dispatchEvent(new Event('input'));})()`);
const click = selector => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
const text = selector => js(`document.querySelector(${JSON.stringify(selector)})?.textContent`);
const go = async path => { await send('Page.navigate',{url:url+path}); await delay(400); };
const upload = async file => {
  const dom = await send('DOM.getDocument');
  const result = await send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#clip'});
  await send('DOM.setFileInputFiles',{nodeId:result.nodeId,files:[resolve(file)]});
};
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    const original=window.fetch;
    const sizes=[];
    const windows=[];
    window.uploadQA={sizes,windows};
    window.fetch=(url,options)=>{
      if(url==='/api/local-hud')return Promise.resolve(Response.json({available:false}));
      if(url!=='/api/clip-analysis')return original(url,options);
      if(!options)return Promise.resolve(Response.json({enabled:true}));
      const bytes=new TextEncoder().encode(options.body).length;
      const body=JSON.parse(options.body);
      if(!body.authorized||!body.frames.every(frame=>frame.image.startsWith('data:image/jpeg;base64,')))throw Error('Expected authorized JPEG samples.');
      if(Object.keys(body).sort().join()!=='authorized,frames,phase,section'||bytes>3900000)throw Error('Unexpected request data or size.');
      sizes.push(bytes);
      windows.push({start:body.section.start,end:body.section.end,phase:body.phase,at:body.frames.map(frame=>frame.at)});
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{
          const observations=body.frames.filter((_,i)=>i%4===0).map((first,i)=>({
            start:first.at,end:body.frames[i*4+3].at,visibleName:'Fixture Player',mode:'self',
            confidence:'high',signals:['self_identity','first_person_hud'],evidence:'Simulated HUD response for a local QA test'
          }));
          resolve(Response.json(body.phase==='identity'?{observations}:{findings:[]}));
        },250);
        options.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(options.signal.reason);},{once:true});
      });
    };
  `});
  await go('/#analysis');
  await until('document.querySelector("[data-identity-setup]")');
  for(const [name,v] of Object.entries({riotName:'Fixture',tagline:'LOCAL',displayName:'Fixture Player'})) await value('[data-identity-setup] [name='+name+']',v);
  await click('[data-identity-setup] [name=confirmed]');
  await click('[data-identity-setup] button[type=submit]');
  await upload(recording);
  await until('document.querySelector(".film").childElementCount===16 && document.querySelector("[data-vision]").hidden===false',110000);
  const media=await js(`(()=>{const v=document.querySelector('video'), f=document.querySelector('#clip').files[0];return {bytes:f.size,duration:v.duration,width:v.videoWidth,height:v.videoHeight,source:v.currentSrc.split(':')[0],end:document.querySelector('[name=clipEnd]').value};})()`);
  assert.ok(media.bytes>4e9 && media.duration>900 && +media.end===media.duration);
  assert.equal(media.source,'blob');
  console.log('Actual browser file:',JSON.stringify(media));
  await click('#review-consent');
  await click('#run-vision');
  await until('window.uploadQA.windows.length>=1',45000);
  await click('#pause-vision');
  await until('document.querySelector("[data-vision-status]").textContent.includes("Analysis paused")',60000);
  const rows=()=>js('JSON.parse(localStorage.getItem("clutchup.video-reports.v1"))[0]');
  const paused=await rows();
  assert.ok(paused.coverage.completedBatches===1 && !paused.coverage.complete);
  assert.equal(await text('#run-vision'),'Resume analysis');
  await click('#run-vision');
  await until('window.uploadQA.windows.some(w=>w.start===90)',60000);
  await click('#stop-vision');
  await until('document.querySelector("[data-vision-status]").textContent.includes("Analysis stopped")');
  assert.equal((await rows()).coverage.completedBatches,1);
  console.log('Paused after one part, resumed, cancelled in the next part and retained the completed report.');
  await click('#run-vision');
  await until('document.querySelector("[data-vision-status]").textContent.includes("Sampled analysis finished")',220000);
  const end=await rows();
  assert.equal(end.coverage.completedBatches,Math.ceil(media.duration/90));
  assert.equal(end.coverage.analyzedUntil,media.duration);
  assert.equal(end.identityReview.identity.displayName,'Fixture Player');
  assert.ok(end.identityReview.automatic.some(row=>row.start>media.duration-180 && row.state==='user'));
  assert.ok(!JSON.stringify(end).includes('data:image/'));
  const metrics=await js(`({posts:uploadQA.sizes.length,maxBytes:Math.max(...uploadQA.sizes),end:uploadQA.windows.at(-1).end,firstPartCalls:uploadQA.windows.filter(w=>w.start===0).length})`);
  assert.equal(metrics.firstPartCalls,2);
  assert.deepEqual(errors,[]);
  console.log('All windows sampled from actual recording. Mock provider accepted bounded frame payloads only:',JSON.stringify(metrics));
} finally {ws.close();}
