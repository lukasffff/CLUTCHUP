import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { parseYouTubeLink, validSection, parseTime, drillFor, saveReview, readReviews, youtubeError, readReports, saveReport, removeSaved, REPORTS, updateNote, validateClip, reviewTimestamps } from '../dist/review-model.js';
import { launchSpec, sessionURL, next, comparableDuel } from '../dist/coach-model.js';
import endpoint from '../clip-analysis.cjs';

const id = 'M7lc1UVf-VE';
const canonical = 'https://www.youtube.com/watch?v=' + id;

test('allows watch, short, Shorts and live links from exact YouTube hosts', () => {
  for (const url of [canonical + '&t=20s', 'youtu.be/' + id, 'https://m.youtube.com/shorts/' + id, 'https://youtube.com/live/' + id]) {
    assert.equal(parseYouTubeLink(url).id, id);
    assert.equal(parseYouTubeLink(url).url, canonical);
  }
  for (const bad of ['https://youtube.com.bad.site/watch?v=' + id, 'https://youtube.com@bad.site/watch?v=' + id,
    'https://www.youtube.com/playlist?list=123', 'https://youtu.be/' + id + '/other', 'https://youtube.com/watch?v=bad!',
    canonical + '&v=' + id, 'javascript:alert(1)', 'https://youtube.com:444/watch?v=' + id]) {
    assert.throws(() => parseYouTubeLink(bad), Error, bad);
  }
  assert.equal(parseYouTubeLink(canonical+'&t=1m5s').startAt,65);
  assert.equal(parseYouTubeLink('youtu.be/'+id+'#t=32').startAt,32);
  assert.equal(parseYouTubeLink(canonical+'&t=-1').startAt,null);
  assert.match(youtubeError(100), /private or deleted/);
  assert.match(youtubeError(150), /disabled embedded/);
  assert.match(youtubeError(5), /could not play/);
});

test('range validation caps at 90 seconds and rejects malformed timestamps', () => {
  assert.deepEqual(validSection(parseTime('1:05.2'),parseTime('2:35.2'),200),{start:65.2,end:155.2});
  assert.throws(()=>validSection(20,20,120),/later end/);
  assert.throws(()=>validSection(0,90.01,120),/90 seconds/);
  assert.throws(()=>validSection(10,20,16),/fit/);
  assert.ok(Number.isNaN(parseTime('1:70')));
});

test('manual evidence remains manual and selects a real 1v1 lesson', () => {
  const storage = {
    getItem() { return this.value ?? null; },
    setItem(_key, value) { this.value = value; }
  };
  const review = { id, videoId:id, url:canonical, start:15, end:55, notes:[] };
  assert.equal(saveReview(review,storage),true);
  for (const [topic, drill] of [['aim','aim'], ['peek','peek'], ['cover','duelcover'], ['utility','utility']]) {
    review.notes.push({ at: 19, topic, source:'manual', evidence:'Crosshair is at floor height near the corner.' });
    const plan = drillFor(review.notes.at(-1));
    const actual = launchSpec(sessionURL(plan).split('?')[1]);
    assert.equal(actual.duel,true);
    assert.equal(actual.lesson,drill);
  }
  saveReview(review,storage);
  assert.deepEqual(readReviews(storage),[{...review,playerKey:'local'}]);
  assert.equal(drillFor({topic:'aim',at:19,evidence:''}),null);
});

test('edits and deletes notes, and persists only report metadata and findings', () => {
  const records = new Map(), storage = { getItem: key => records.get(key), setItem: (key,value) => records.set(key,value) };
  const section = {start:0,end:30};
  const note = {at:2,topic:'teamwork',evidence:'Teammate entered the lane first.'};
  let notes = updateNote([],null,note,section);
  assert.equal(drillFor(notes[0]),null);
  notes = updateNote(notes,0,{ ...note, topic:'movement' },section);
  assert.equal(drillFor(notes[0]).lesson,'movement');
  assert.throws(() => updateNote(notes,0,{ ...note, at:40 },section),/within/);
  assert.deepEqual(updateNote(notes,0,null),[]);
  const report = {id:'report',file:{name:'scrim.mp4'},findings:[{at:12,topic:'aim',confidence:'low',evidence:'Visible comparison.',correctionByPlayer:'Revised observation.'}]};
  assert.equal(saveReport(report,storage),true);
  assert.deepEqual(readReports(storage),[{...report,playerKey:'local'}]);
  assert.ok(!records.get(REPORTS).includes('base64'));
  assert.equal(removeSaved('report',REPORTS,storage),true);
  assert.deepEqual(readReports(storage),[]);
});

test('validates local media and produces three distinct bounded motion sequences', () => {
  assert.doesNotThrow(() => validateClip({name:'Match.MP4',type:'video/mp4',size:234}));
  assert.throws(() => validateClip({name:'story.txt',type:'text/plain',size:12}),/MP4/);
  assert.doesNotThrow(() => validateClip({name:'recording.mp4',type:'video/mp4',size:4185836242}));
  const frames = reviewTimestamps(45);
  assert.equal(frames.length,16);
  assert.ok(frames.every((frame,i) => (i===0 || frame.at>frames[i-1].at) && frame.at<45));
  assert.ok(frames[3].at-frames[0].at<1.7 && frames[4].group===1 && frames[8].group===2 && frames[12].group===3);
  assert.equal(reviewTimestamps(3600).length,16);
});

test('1v1 repeats comparable conditions before increasing challenge', () => {
  const pass = { source:'tactical', phase:'training', duel:true, lesson:'peek', map:'harbor', agent:'controller',
    side:'ct', site:'A', round:1, evaluated:true, data:{peeks:2,unreadyPeeks:0} };
  assert.equal(next([{...pass,data:{peeks:1,unreadyPeeks:1}}]).support,true);
  assert.ok(!next([pass]).challenge);
  assert.equal(comparableDuel(pass,{...pass,support:true}),false);
  assert.equal(next([pass,{...pass}]).challenge,true);
  assert.equal(next([{...pass,challenge:true}]).phase,'reassessment');
});

test('analysis endpoint requires authorization and credentials and reports only completed provider findings', async () => {
  let calls = 0;
  let provider = 'success';
  let started, cancelled;
  const providerStarted = new Promise(resolve=>{started=resolve;});
  const providerCancelled = new Promise(resolve=>{cancelled=resolve;});
  const fakeProvider = async (url, options) => {
    calls++;
    assert.equal(url,'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.store,false);
    assert.equal(body.input[0].content.filter(item=>item.type==='input_image').length,16);
    if (provider === 'abortable') {started();return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{cancelled();reject(new DOMException('Aborted','AbortError'));},{once:true}));}
    if (provider === 'http-error') return Response.json({error:'unit-test-placeholder-secret'}, {status:401});
    if (provider === 'invalid-json') return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'not json'}]}]});
    if (provider === 'empty') return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({findings:[]})}]}]});
    if (provider === 'timeout') throw new DOMException('Timed out','TimeoutError');
    if (provider === 'refusal') return Response.json({status:'completed',output:[{content:[{type:'refusal'}]}]});
    return Response.json({status:'completed',output:[{content:[
      {type:'output_text',text:JSON.stringify({findings:[{frames:[2],topic:'aim',strength:false,confidence:'medium',evidence:'Crosshair is below the visible head.',meaning:'Aim correction may be needed.',correction:'Keep the crosshair at head height.'},
      {frames:[2,5],topic:'movement',strength:false,confidence:'low',evidence:'Frames separated by a gap.',meaning:'',correction:''}]})}
    ]}]});
  };
  const env = {};
  const origin = 'http://127.0.0.1:4174';
  const server = createServer(endpoint.makeClipEndpoint({origin,env,fetchImpl:fakeProvider}));
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const url = 'http://127.0.0.1:' + server.address().port;
  const post = (body, from=origin) => fetch(url, {method:'POST',headers:{origin:from,'Content-Type':'application/json'},body:JSON.stringify(body)});
  try {
    assert.deepEqual(await fetch(url).then(r=>r.json()),{enabled:false});
    assert.equal((await post({authorized:true})).status,503);
    env.CLUTCHIQ_ANALYSIS_API_KEY='unit-test-placeholder';
    assert.equal((await post({},'https://unrelated.example')).status,403);
    assert.equal((await post({authorized:false})).status,400);
    assert.equal((await post({authorized:true,section:{start:0,end:20},frames:Array(16).fill(null)})).status,400);
    assert.equal(calls,0);
    const frames = reviewTimestamps(20).map(frame => ({...frame,image:'data:image/jpeg;base64,/9j/AAAB'}));
    const report = await post({authorized:true,frames,section:{start:0,end:20}});
    assert.equal(report.status,200);
    const result = await report.json();
    assert.equal(result.findings.length,1);
    assert.equal(result.findings[0].at,reviewTimestamps(20)[1].at);
    assert.equal(result.findings[0].confidence,'medium');
    const laterFrames=reviewTimestamps(90,1800).map(frame=>({...frame,image:'data:image/jpeg;base64,/9j/AAAB'}));
    const later=await post({authorized:true,frames:laterFrames,section:{start:1800,end:1890}});
    assert.equal(later.status,200);
    assert.ok((await later.json()).findings[0].at>1800);
    assert.equal((await post({authorized:true,frames:laterFrames,section:{start:1800,end:2000}})).status,400);
    provider='empty';
    assert.deepEqual(await post({authorized:true,frames,section:{start:0,end:20}}).then(r=>r.json()),{findings:[]});
    for (const failure of ['http-error','invalid-json']) {
      provider=failure;const failed=await post({authorized:true,frames,section:{start:0,end:20}});
      assert.equal(failed.status,502);assert.ok(!(await failed.text()).includes('unit-test-placeholder-secret'));
    }
    provider='refusal';
    assert.equal((await post({authorized:true,frames,section:{start:0,end:20}})).status,502);
    provider='timeout';
    assert.equal((await post({authorized:true,frames,section:{start:0,end:20}})).status,504);
    provider='abortable';
    const controller=new AbortController();
    const pending=fetch(url,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({authorized:true,frames,section:{start:0,end:20}}),signal:controller.signal}).catch(error=>error);
    const deadline=AbortSignal.timeout(2000);
    const timedOut=new Promise((_,reject)=>deadline.addEventListener('abort',()=>reject(Error('Provider cancellation did not complete')),{once:true}));
    await Promise.race([providerStarted,timedOut]);controller.abort();
    await Promise.race([providerCancelled,timedOut]);await pending;
  } finally { server.close(); await once(server,'close'); }
});
