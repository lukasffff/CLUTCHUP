import test from 'node:test';
import assert from 'node:assert/strict';
import {Element,installDOM} from './review-dom-fixture.mjs';
import {mountReview} from '../dist/gameplay-review.js';
import {identity,fixtures} from './identity-fixtures.mjs';
import {readReports} from '../dist/review-model.js';
import {readPlayerIdentity,personalFindings} from '../dist/player-identity.js';
const event={preventDefault(){}};

test('dashboard identity setup, 30-minute scan, correction, reanalysis, cache, history and deletion flow',async()=>{
 const calls=[];
 const restore=installDOM(async(url,options)=>{
  if(!options)return Response.json({enabled:true});
  const body=JSON.parse(options.body);calls.push(body);
  if(body.phase==='identity')return Response.json({observations:body.frames.filter((_,i)=>i%4===0).map((f,i)=>({...fixtures[0].observation,start:f.at,end:body.frames[i*4+3].at,scoreboardNames:['Example','Teammate']}))});
  return Response.json({findings:[{at:body.frames[0].at,timestamps:[body.frames[0].at],group:0,topic:'aim',strength:false,confidence:'medium',evidence:'Fixture reference.',meaning:'Fixture interpretation.',correction:'Fixture practice.'}]});
 });
 const root=new Element();let cleanup;
 try{
  cleanup=mountReview(root);await new Promise(resolve=>setImmediate(resolve));
  const $=s=>root.querySelector(s),setup=$('[data-identity-setup]');
  assert.equal($('#run-vision').disabled,true);
  for(const name of ['riotName','tagline','displayName'])setup.elements[name].value=identity[name];setup.elements.confirmed.checked=true;setup.onsubmit(event);
  assert.equal(readPlayerIdentity().displayName,'Example');
  $('#clip').files=[{name:'fixture.mp4',size:4e9,lastModified:1,type:'video/mp4'}];await $('#clip').onchange();
  assert.equal($('video').hidden,false);assert.match($('[data-live-identity]').textContent,/Unknown/);
  $('#review-consent').checked=true;$('#review-consent').onchange();assert.equal($('#run-vision').disabled,false);
  await $('#run-vision').onclick();
  assert.equal(calls.length,40);assert.equal(readReports().length,1);assert.equal(readReports()[0].coverage.completedBatches,20);
  assert.equal(readReports()[0].identityReview.identity.displayName,'Example');
  const before=calls.length;await $('#run-vision').onclick();assert.equal(calls.length,before,'completed windows reuse metadata and make no provider requests');
  const correction=$('[data-live-identity]').querySelector('form');correction.elements.start.value='0';correction.elements.end.value='1800';correction.elements.state.value='spectator';correction.elements.evidence.value='Checked spectator controls in playback.';correction.onsubmit(event);
  assert.equal(readReports()[0].identityReview.corrections.length,1,'manual correction is saved before reanalysis');
  assert.equal(personalFindings(readReports()[0].findings,readReports()[0].identityReview).length,0);
  await $('#run-vision').onclick();assert.equal(calls.slice(before).filter(c=>c.phase==='performance').length,0);
  assert.equal(readReports()[0].findings.length,0);
  const names=$('[data-scoreboard-names]').querySelectorAll('button');assert.equal(names.length,2);names[1].click();assert.equal(setup.elements.displayName.value,'Teammate');assert.equal(setup.elements.confirmed.checked,false);
  assert.equal(readPlayerIdentity().displayName,'Example','unconfirmed scoreboard selection does not change saved identity');
  const deletion=$('[data-player-identity]').querySelectorAll('button').find(n=>n.textContent==='Delete identity and its analysis history');deletion.click();
  assert.equal(readPlayerIdentity(),null);assert.deepEqual(readReports(),[]);assert.equal($('#run-vision').disabled,true);
  assert.ok(calls.every(c=>!('file' in c)&&!('identity' in c)&&!('riotName' in c)));
 }finally{cleanup?.();restore();}
});

test('resource limit and cancellation stop UI work without publishing another profile’s partial record',async()=>{
 let entered,resolvePending;
 const waiting=new Promise(resolve=>{entered=resolve;});
 const restore=installDOM(async(url,options)=>{if(!options)return Response.json({enabled:true});entered();return new Promise((resolve,reject)=>{resolvePending=resolve;options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});});
 const root=new Element();let cleanup;
 try{
  cleanup=mountReview(root);await new Promise(resolve=>setImmediate(resolve));const $=s=>root.querySelector(s),setup=$('[data-identity-setup]');
  for(const name of ['riotName','tagline','displayName'])setup.elements[name].value=identity[name];setup.elements.confirmed.checked=true;setup.onsubmit(event);
  $('[data-max-gb]').value='1';$('#clip').files=[{name:'big.mp4',size:4e9,lastModified:1,type:'video/mp4'}];await $('#clip').onchange();assert.match($('#clipStatus').textContent,/file-size limit/);
  $('[data-max-gb]').value='0';await $('#clip').onchange();$('#review-consent').checked=true;$('#review-consent').onchange();
  const pending=$('#run-vision').onclick();await waiting;
  const deletion=$('[data-player-identity]').querySelectorAll('button').find(n=>n.textContent==='Delete identity and its analysis history');deletion.click();await pending;
  assert.equal(readPlayerIdentity(),null);assert.deepEqual(readReports(),[],'aborted analysis cannot recreate deleted history');
  assert.equal($('#run-vision').disabled,true);
 }finally{resolvePending?.(Response.json({observations:[]}));cleanup?.();restore();}
});

test('deleting an individual report during reanalysis cannot recreate that record',async()=>{
 let started;const waiting=new Promise(resolve=>{started=resolve;});
 const restore=installDOM(async(url,options)=>{if(!options)return Response.json({enabled:true});started();return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));});
 const root=new Element();let cleanup;
 try{
  cleanup=mountReview(root);await new Promise(resolve=>setImmediate(resolve));const $=s=>root.querySelector(s),setup=$('[data-identity-setup]');
  for(const name of ['riotName','tagline','displayName'])setup.elements[name].value=identity[name];setup.elements.confirmed.checked=true;setup.onsubmit(event);
  $('#clip').files=[{name:'fixture.mp4',size:4e9,lastModified:1,type:'video/mp4'}];await $('#clip').onchange();
  const correction=$('[data-live-identity]').querySelector('form');correction.elements.start.value='0';correction.elements.end.value='1800';correction.elements.state.value='user';correction.elements.evidence.value='Checked the selected range.';correction.onsubmit(event);
  assert.equal(readReports().length,1);
  $('#review-consent').checked=true;$('#review-consent').onchange();const pending=$('#run-vision').onclick();await waiting;
  $('[data-report-list]').querySelectorAll('button').find(b=>b.textContent==='Delete report').click();await pending;
  assert.deepEqual(readReports(),[]);assert.equal(readPlayerIdentity().displayName,'Example');
 }finally{cleanup?.();restore();}
});
