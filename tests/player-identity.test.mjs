import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {identity,fixtures} from './identity-fixtures.mjs';
import {classifyPerspective,classificationMetrics,createIdentityReview,ingestIdentity,identityTimeline,correctIdentity,confirmedUserAt,userFrameGroups,personalFindings,savePlayerIdentity,readPlayerIdentity,deletePlayerIdentity,identityMemory} from '../dist/player-identity.js';
import {reviewTimestamps,saveReport,readReports} from '../dist/review-model.js';
import {videoWindows,analyzeVideo} from '../dist/full-video-analysis.js';
import {analyzeIdentityWindow,transitionProbes} from '../dist/identity-pipeline.js';
import endpoint from '../clip-analysis.cjs';
import extractor from '../identity-analysis.cjs';

const makeReview=(end=1800)=>createIdentityReview(identity,{name:'fixture.mp4',size:4000000000,lastModified:1},0,end);
const own=fixtures[0].observation;
for(const fixture of fixtures)test('perspective gate: '+fixture.name,()=>{
 const result=classifyPerspective(fixture.observation,identity);
 const abstentions=['own perspective with unreadable name','next round transition with own player','spectator HUD disappears','unreadable spectator name','low confidence own name','spectator name lacks spectator controls'];
 assert.equal(result.state,abstentions.includes(fixture.name)?'unknown':fixture.expected);
 assert.ok(result.evidence);assert.equal(result.source,'automatic');
});

test('fixture metrics are reproducible and include deliberate abstentions',()=>{
 const result=classificationMetrics(fixtures.map(f=>({...f,actual:classifyPerspective(f.observation,identity).state})));
 assert.deepEqual(result,{samples:20,userPrecision:1,userRecall:.4,spectatorFalsePositiveRate:0,unknownRate:.85});
 assert.equal(classifyPerspective(own,{...identity,confirmed:false}).state,'unknown');
});

test('identity persists but perspective never carries through gaps or across batch boundaries',()=>{
 const r=makeReview();ingestIdentity(r,[{...own,start:10,end:11.6},{...fixtures[4].observation,start:91,end:92.6}],{start:0,end:100});
 assert.equal(r.identity.displayName,'Example');assert.equal(confirmedUserAt(r,10,11.6),true);
 assert.equal(confirmedUserAt(r,11.6,91),false);assert.equal(confirmedUserAt(r,91),false);
 assert.equal(identityTimeline(r).filter(s=>s.state==='unknown').length,3);
 ingestIdentity(r,[{...own,signals:[...own.signals,'death'],start:100,end:101}],{start:100,end:190});
 assert.equal(r.events[0].type,'death');assert.equal(r.events[0].at,100);
 assert.equal(confirmedUserAt(r,101),false);
});

test('overlapping conflicting evidence is Unknown; manual bounds override without modifying automatic labels',()=>{
 const r=makeReview(90);ingestIdentity(r,[{...own,start:10,end:12},{...fixtures[4].observation,start:11,end:13}],{start:0,end:90});
 assert.equal(confirmedUserAt(r,11,12),false);const original=JSON.stringify(r.automatic);
 correctIdentity(r,{start:11,end:12,state:'user',evidence:'Verified my HUD and perspective in playback.'});
 assert.equal(confirmedUserAt(r,11,12),true);assert.equal(JSON.stringify(r.automatic),original);
 correctIdentity(r,{start:11.2,end:11.8,state:'excluded',evidence:'Replay cut.'});
 assert.equal(confirmedUserAt(r,11,12),false);assert.equal(r.corrections.length,2);
 assert.throws(()=>correctIdentity(r,{start:-1,end:3,state:'user',evidence:'test'}));
 assert.throws(()=>correctIdentity(r,{start:1,end:3,state:'user',evidence:''}));
});

test('personal observations and provider sequences must fit entirely inside confirmed user intervals',()=>{
 const r=makeReview(90),frames=reviewTimestamps(90).map(f=>({...f,image:'JPEG'}));
 correctIdentity(r,{start:frames[4].at,end:frames[7].at,state:'user',evidence:'Checked playback.'});
 const groups=userFrameGroups(frames,r);assert.equal(groups.length,4);assert.ok(groups.every(f=>f.group===0));
 const findings=[{timestamps:[frames[4].at,frames[7].at]},{timestamps:[frames[4].at,frames[8].at]},{at:frames[4].at},{timestamps:[frames[4].at],dismissed:true}];
 assert.deepEqual(personalFindings(findings,r),[findings[0]]);
 assert.equal(confirmedUserAt(r,-1),false);assert.equal(confirmedUserAt(r,1,Infinity),false);
});

test('identity and match history remain under the active local profile',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 storage.setItem('clutchup.profile',JSON.stringify({riot:'Alpha#A'}));savePlayerIdentity(identity,storage);
 saveReport({id:'a',identityReview:makeReview()},storage);
 storage.setItem('clutchup.profile',JSON.stringify({riot:'Beta#B'}));assert.equal(readPlayerIdentity(storage),null);assert.deepEqual(readReports(storage),[]);
 savePlayerIdentity({...identity,displayName:'Beta'},storage);deletePlayerIdentity(storage);assert.equal(readPlayerIdentity(storage),null);
 storage.setItem('clutchup.profile',JSON.stringify({riot:'Alpha#A'}));assert.equal(readPlayerIdentity(storage).displayName,'Example');assert.equal(readReports(storage).length,1);
 assert.throws(()=>savePlayerIdentity({...identity,confirmed:false},storage));
 assert.throws(()=>savePlayerIdentity(identity,{getItem(){return null;},setItem(){throw Error('quota');}}));
});

test('memory deduplicates evidence, excludes other identities, spectator actions and legacy reports',()=>{
 const review=makeReview(90);correctIdentity(review,{start:0,end:30,state:'user',evidence:'Verified.'});
 const f={at:10,timestamps:[10,11],group:1,topic:'aim',confidence:'medium',strength:false,evidence:'Visible reference.'};
 const a={identityReview:review,findings:[f,{...f,at:50,timestamps:[50,51],group:2}]};
 assert.equal(identityMemory([a,a,{findings:[f]}],identity).weaknesses.length,0);
 const duplicate={identityReview:{...review,matchId:'duplicate'},findings:[f]};
 assert.equal(identityMemory([a,duplicate],identity).weaknesses.length,0,'reanalyzing the same file is not independent evidence');
 const b={identityReview:{...review,matchId:'second',file:{...review.file,name:'second.mp4'}},findings:[f]};
 assert.equal(identityMemory([a,b],identity).weaknesses[0].evidence.length,2);
 assert.equal(identityMemory([a,b],{...identity,displayName:'Other'}).matches,0);
});

test('pipeline never sends unknown or spectator groups for performance and keeps file metadata local',async()=>{
 const r=makeReview(90),frames=reviewTimestamps(90).map(f=>({...f,image:'JPEG'})),phases=[];
 const result=await analyzeIdentityWindow({frames,section:{start:0,end:90},review:r,captureProbe:()=>assert.fail('No transition probe required'),send:async(phase,sent)=>{
  phases.push(phase);
  assert.ok(sent.every(f=>!('riotName' in f)&&!('file' in f)));
  if(phase==='identity')return [own,fixtures[4].observation,{...own,ambiguous:true},{...own,signals:['first_person_hud']}].map((o,i)=>({...o,start:frames[i*4].at,end:frames[i*4+3].at}));
  assert.equal(sent.length,4);assert.ok(sent.every(f=>f.group===0));return [{at:sent[0].at,timestamps:[sent[0].at],group:0}];
 }});
 assert.deepEqual(phases,['identity','performance']);assert.equal(result.length,1);assert.equal(personalFindings(result,r).length,1);
 assert.ok(!JSON.stringify(r).includes('JPEG'));
});

test('manual User confirmation enables coaching; spectator correction blocks it on rerun',async()=>{
 const r=makeReview(90),frames=reviewTimestamps(90);let calls=0;
 const run=()=>analyzeIdentityWindow({frames,section:{start:0,end:90},review:r,captureProbe:()=>[],send:async phase=>{if(phase==='identity')return [];calls++;return [];}});
 await run();assert.equal(calls,0);
 correctIdentity(r,{start:0,end:90,state:'user',evidence:'Watched all of this range.'});await run();assert.equal(calls,1);
 correctIdentity(r,{start:0,end:90,state:'spectator',evidence:'Corrected after reviewing HUD.'});await run();assert.equal(calls,1);
});

test('targeted transition probes are bounded, timestamped, cancellable and never expand user coverage',async()=>{
 const r=makeReview(90),frames=reviewTimestamps(90);let probes=0,requests=0;
 const observations=frames.filter((_,i)=>i%4===0).map((f,i)=>({...own,signals:['death'],start:f.at,end:frames[i*4+3].at}));
 assert.equal(transitionProbes(observations,{start:0,end:90}).length,2);
 await analyzeIdentityWindow({frames,section:{start:0,end:90},review:r,captureProbe:async times=>{probes++;assert.equal(times.length,4);return times;},send:async phase=>{requests++;assert.equal(phase,'identity');return requests===1?observations:[];}});
 assert.equal(probes,2);assert.equal(requests,3);assert.equal(confirmedUserAt(r,0,90),false);
 const controller=new AbortController();controller.abort();
 await assert.rejects(()=>analyzeIdentityWindow({frames,section:{start:0,end:90},review:r,signal:controller.signal,send:()=>assert.fail('No request after cancellation')}),{name:'AbortError'});
});

test('30-minute processing uses configurable sequential windows and one persistent identity',async()=>{
 for(const seconds of [30,60,90])assert.equal([...videoWindows(0,1800,seconds)].length,1800/seconds);
 assert.throws(()=>[...videoWindows(0,1800,100)]);
 const r=makeReview(),result=await analyzeVideo({start:0,end:1800,windowSeconds:60,capture:async section=>reviewTimestamps(60,section.start),analyze:async(frames,section)=>{
  ingestIdentity(r,[{...own,start:frames[0].at,end:frames[3].at}],section);return [];
 }});
 assert.equal(result.coverage.completedBatches,30);assert.equal(result.coverage.complete,true);assert.equal(r.automatic.length,30);
 assert.equal(identityTimeline(r).filter(i=>i.state==='user').length,30);assert.equal(r.identity.displayName,'Example');
});

test('identity extraction parser rejects mixed, missing, duplicate and invalid evidence',()=>{
 const frames=reviewTimestamps(90),observation={...own,frames:[1,2,3,4]};
 assert.equal(extractor.parse({observations:[observation]},frames)[0].start,frames[0].at);
 for(const invalid of [{...observation,frames:[1,2,3,5]},{...observation,frames:[1,2,3,30]},{...observation,frames:[1,2,2,4]},{...observation,signals:['invented']},{...observation,evidence:''}])assert.throws(()=>extractor.parse({observations:[invalid]},frames));
 assert.throws(()=>extractor.parse({observations:[observation,observation]},frames));
});

test('identity endpoint returns validated evidence and supports four-frame gated coaching',async()=>{
 const origin='http://127.0.0.1:4174',seen=[];
 const server=createServer(endpoint.makeClipEndpoint({origin,env:{CLUTCHUP_ANALYSIS_API_KEY:'fixture'},fetchImpl:async(url,options)=>{
  const body=JSON.parse(options.body);seen.push(body);
  const output=body.text.format.name==='perspective_evidence'?{observations:[{...own,frames:[1,2,3,4]}]}:{findings:[]};
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]});
 }}));server.listen(0,'127.0.0.1');await once(server,'listening');
 try {
  const url='http://127.0.0.1:'+server.address().port,frames=reviewTimestamps(90).slice(0,4).map(f=>({...f,image:'data:image/jpeg;base64,/9j/AAAB'}));
  const post=phase=>fetch(url,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({authorized:true,phase,frames,section:{start:0,end:90}})});
  const response=await post('identity');assert.equal(response.status,200);const result=await response.json();assert.equal(result.observations[0].end,frames[3].at);
  assert.equal((await post('performance')).status,200);assert.equal((await post('bad')).status,400);
  assert.equal(seen.length,2);assert.equal(seen[0].input[0].content.filter(i=>i.type==='input_image').length,4);
  assert.ok(!JSON.stringify(seen).includes(identity.riotName));
 }finally{server.close();await once(server,'close');}
});
