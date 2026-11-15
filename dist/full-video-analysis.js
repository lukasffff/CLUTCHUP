import {validVideoSection,MAX_SECTION,CLIP_FRAMES} from './review-model.js';

export function* videoWindows(start,end,windowSeconds=MAX_SECTION) {
 validVideoSection(start,end,end);
 if(![30,60,90].includes(windowSeconds))throw Error('Choose 30, 60 or 90 seconds per processing window.');
 for(let at=start;at<end;) {
  const next=Math.min(end,at+windowSeconds);
  yield {start:at,end:next};at=next;
 }
}

// Capture and send one bounded window at a time. Raw video bytes never enter
// this pipeline; only a batch's sampled frames are retained during its request.
export async function analyzeVideo({start,end,capture,analyze,signal,windowSeconds=MAX_SECTION,onProgress=()=>{},shouldPause=()=>false}) {
 validVideoSection(start,end,end);
 const total=Math.ceil((end-start)/windowSeconds);
 const result={findings:[],coverage:{start,end,totalBatches:total,completedBatches:0,framesPerBatch:CLIP_FRAMES,analyzedUntil:start,complete:false},cancelled:false};
 try {
  for(const section of videoWindows(start,end,windowSeconds)) {
   signal?.throwIfAborted();
   const index=result.coverage.completedBatches;
   onProgress({index,total,section,stage:'sampling'});
   const frames=await capture(section,signal);
   signal?.throwIfAborted();
   onProgress({index,total,section,stage:'analyzing'});
   const findings=await analyze(frames,section,signal);
   if(!Array.isArray(findings))throw Error('The analysis server returned invalid findings.');
   for(const finding of findings)result.findings.push({...finding,group:typeof finding.group==='string'?index+':'+finding.group:index*4+finding.group,batch:index});
   result.coverage.completedBatches++;
   result.coverage.analyzedUntil=section.end;
   if(section.end<end && shouldPause()) {
    result.paused=true;
    return result;
   }
  }
  result.coverage.complete=true;
 } catch(error) {
  result.cancelled=signal?.aborted || error?.name==='AbortError';
  result.error=result.cancelled?'Analysis stopped.':error.message || 'Analysis could not finish.';
 }
 return result;
}
