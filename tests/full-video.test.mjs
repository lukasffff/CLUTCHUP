import test from 'node:test';
import assert from 'node:assert/strict';
import {videoWindows,analyzeVideo} from '../dist/full-video-analysis.js';
import {reviewTimestamps,validVideoSection,validSection,validateClip,parseTime} from '../dist/review-model.js';

test('full local recordings accept multi-gigabyte files and ranges beyond 90 seconds or 15 minutes',()=>{
 assert.doesNotThrow(()=>validateClip({name:'recording.mp4',type:'video/mp4',size:4_185_836_242}));
 for(const size of [100_000_001, 2_000_000_000, 4_000_000_001])
  assert.doesNotThrow(()=>validateClip({name:'recording.mp4',type:'video/mp4',size}));
 const browserDuration=2079.8613333333333;
 assert.equal(validVideoSection(0,parseTime(String(browserDuration)),browserDuration).end,browserDuration);
 assert.deepEqual(validVideoSection(0,7200,7200),{start:0,end:7200});
 assert.throws(()=>validVideoSection(0,7201,7200),/fit/);
 assert.throws(()=>validVideoSection(0,Infinity,Infinity));
 assert.throws(()=>validSection(0,100,100),/90 seconds/,'manual YouTube section policy remains separate');
 for(const size of [0,-1,NaN,Infinity])assert.throws(()=>validateClip({name:'video.mp4',size}));
});

test('pause finishes the current part without marking a long recording complete',async()=>{
 const duration=1380.00000001;
 const captured=[];
 let pause=false;
 const result=await analyzeVideo({start:0,end:duration,
  capture:async section=>{captured.push(section.start);return reviewTimestamps(section.end-section.start,section.start);},
  analyze:async frames=>{pause=true;return [{at:frames[0].at,group:0}];},
  shouldPause:()=>pause});
 assert.deepEqual(captured,[0]);
 assert.equal(result.paused,true);
 assert.equal(result.coverage.complete,false);
 assert.equal(result.coverage.analyzedUntil,90);
 assert.equal(result.findings.length,1);
});

test('windows cover the entire selected timeline without gaps, truncation, or oversized requests',()=>{
 for(const [start,end] of [[0,7200],[123.4,9123.56],[0,90.1],[0,.1]]) {
  const parts=[...videoWindows(start,end)];assert.equal(parts[0].start,start);assert.equal(parts.at(-1).end,end);
  for(const [index,part] of parts.entries()) {
   if(index)assert.equal(part.start,parts[index-1].end);
   assert.ok(part.end-part.start<=90+1e-7);
   const frames=reviewTimestamps(part.end-part.start,part.start);assert.equal(frames.length,16);
   assert.ok(frames.every((frame,i)=>frame.at>=part.start&&frame.at<=part.end&&(!i||frame.at>frames[i-1].at)));
   for(let i=3;i<16;i+=4)assert.ok(frames[i].at-frames[i-3].at<=1.7);
  }
 }
});

test('long analysis is sequential and merges absolute timestamps with independent evidence groups',async()=>{
 let outstanding=0,maxOutstanding=0,captures=0,requests=0;const progress=[];
 const result=await analyzeVideo({start:1500,end:2401,
  capture:async section=>{captures++;assert.equal(outstanding,0);outstanding++;maxOutstanding=Math.max(maxOutstanding,outstanding);return reviewTimestamps(section.end-section.start,section.start);},
  analyze:async(frames,section)=>{requests++;assert.equal(frames.length,16);outstanding--;return [{at:frames[0].at,group:0,topic:'aim'}];},
  onProgress:entry=>progress.push(entry)});
 assert.equal(captures,11);assert.equal(requests,11);assert.equal(maxOutstanding,1);
 assert.equal(result.coverage.complete,true);assert.equal(result.coverage.analyzedUntil,2401);
 assert.equal(result.findings.length,11);assert.equal(new Set(result.findings.map(f=>f.group)).size,11);
 assert.ok(result.findings.every(f=>f.at>=1500&&f.at<=2401));assert.equal(progress.length,22);
 assert.ok(!JSON.stringify(result).includes('image'));
});

test('provider failure or cancellation preserves completed findings and never labels partial work complete',async()=>{
 for(const cancel of [false,true]) {
  const controller=new AbortController();let calls=0;
  const result=await analyzeVideo({start:0,end:3600,signal:controller.signal,
   capture:async section=>reviewTimestamps(section.end-section.start,section.start),
   analyze:async frames=>{calls++;if(calls===2){if(cancel){controller.abort();controller.signal.throwIfAborted();}throw Error('Provider unavailable');}return [{at:frames[0].at,group:1}];}});
  assert.equal(calls,2);assert.equal(result.coverage.complete,false);assert.equal(result.coverage.completedBatches,1);
  assert.equal(result.coverage.analyzedUntil,90);assert.equal(result.findings.length,1);assert.equal(result.cancelled,cancel);
 }
 const stop=new AbortController();stop.abort();let captured=false;
 const result=await analyzeVideo({start:0,end:10,signal:stop.signal,capture:async()=>{captured=true;},analyze:async()=>[]});
 assert.equal(captured,false);assert.equal(result.coverage.completedBatches,0);assert.equal(result.cancelled,true);
});
