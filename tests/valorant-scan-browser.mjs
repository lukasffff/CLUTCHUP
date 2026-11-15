import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const [recording, url = 'http://127.0.0.1:4174', port = '9341'] = process.argv.slice(2);
if (!recording) throw Error('Usage: node tests/valorant-scan-browser.mjs <local MP4> [local server URL] [Edge debugging port]');
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
const heap=[];
try {
  for(const domain of ['Page','Runtime','DOM','Performance'])await send(domain+'.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:
    "const original=window.fetch;window.scanQa={samples:0,bytes:0,providerPosts:0};window.fetch=(url,options)=>{"+
    "if(url==='/api/clip-analysis'){if(options){window.scanQa.providerPosts++;throw Error('QA must stay local');}return Promise.resolve(Response.json({enabled:false}));}"+
    "if(url==='/api/local-hud'&&options){window.scanQa.samples++;window.scanQa.bytes+=options.body.size;}return original(url,options);};"
  });
  await go('/#analysis');
  await until('document.querySelector("[data-vision-status]").textContent.includes("local Windows")');
  for(const [name,v] of Object.entries({riotName:'Fixture',tagline:'LOCAL',displayName:'Fixture Recorder'}))
    await value('[data-identity-setup] [name='+name+']',v);
  await click('[data-identity-setup] [name=confirmed]');
  await click('[data-identity-setup] button[type=submit]');
  await upload(recording);
  await until('document.querySelector(".film").childElementCount===16 && document.querySelector("[data-vision]").hidden===false',110000);
  const duration=await js('document.querySelector("video").duration');
  const start=performance.now();
  await click('#run-vision');
  try { await until('scanQa.samples>=4',30000); }
  catch(error) { throw Error((await text('[data-vision-status]'))+' '+JSON.stringify(await js('scanQa')),{cause:error}); }
  await click('#pause-vision');
  await until('document.querySelector("[data-vision-status]").textContent.includes("Analysis paused")',120000);
  const lastReport=()=>js('JSON.parse(localStorage.getItem("clutchup.video-reports.v1"))[0]');
  assert.equal((await lastReport()).coverage.completedBatches,1);
  console.log('Paused after the first window and resumed.');
  await click('#run-vision');
  const deadline=Date.now()+480000;
  let status;
  do {
    await delay(2000);
    status=await text('[data-vision-status]');
    const metrics=(await send('Performance.getMetrics')).metrics;
    heap.push(metrics.find(m=>m.name==='JSHeapUsedSize').value);
  } while(Date.now()<deadline && /^(Sampling|Analyzing) part /.test(status));
  assert.match(status,/Local gameplay-state scan finished/);
  const report=await lastReport();
  const reportFile=process.env.CLUTCHUP_HUD_REPORT;
  if(reportFile) (await import('node:fs')).writeFileSync(reportFile,JSON.stringify(report));
  const scan=await js('scanQa');
  const windows=report.identityReview.automatic;
  const stateSeconds=Object.fromEntries([...new Set(windows.map(row=>row.state))].map(state=>[state,
    Math.round(windows.filter(row=>row.state===state).reduce((sum,row)=>sum+row.end-row.start,0))]));
  console.log(JSON.stringify({duration,scannedSeconds:report.coverage.analyzedUntil,windows:report.coverage.completedBatches,
    ...scan,wallSeconds:Math.round((performance.now()-start)/1000),sampledMaxJSHeapMB:Math.round(Math.max(...heap)/1e6),
    stateSeconds,eventCounts:Object.fromEntries([...new Set(report.identityReview.events.map(e=>e.type))].map(type=>
      [type,report.identityReview.events.filter(event=>event.type===type).length]))}));
  assert.equal(report.coverage.analyzedUntil,duration);
  assert.equal(report.coverage.complete,true);
  assert.equal(report.findings.length,0);
  assert.equal(scan.providerPosts,0);
  assert.ok(report.identityReview.events.some(event=>event.type==='death'));
  assert.ok(report.identityReview.events.some(event=>event.type==='round_end'));
  assert.ok(windows.some(row=>row.state==='spectator'));
  assert.ok(windows.some(row=>row.state==='user'));
  assert.ok(!JSON.stringify(report).includes('data:image/'));
  assert.deepEqual(errors,[]);
} finally {ws.close();}
