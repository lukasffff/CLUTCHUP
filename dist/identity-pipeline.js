import {ingestIdentity,userFrameGroups} from './player-identity.js';

// Extra probes are bounded. They improve evidence near a suspected transition,
// but never establish continuous coverage between sampled sequences.
export function transitionProbes(observations,section) {
 const centers=[...new Set(observations.filter(o=>(o.signals||[]).some(s=>['death','camera_change','spectator_transition','hud_change','round_start','round_end','missing_hud'].includes(s))).map(o=>o.end+1))].slice(0,2);
 return centers.map(center=>Array.from({length:4},(_,i)=>({at:Math.max(section.start,Math.min(section.end-0.001,center))+(i-1.5)*0.35,group:0})))
  .filter(group=>group[0].at>=section.start&&group.at(-1).at<=section.end);
}

export async function verifyLocalCoachingGroups(frames,review,read,signal) {
 const candidates=userFrameGroups(frames,review);
 const eligible=[];
 for(let i=0;i<candidates.length;i+=4) {
  const group=candidates.slice(i,i+4),evidence=[];
  for(const frame of group) {
   signal?.throwIfAborted();
   evidence.push(await read(frame.at,signal));
  }
  const blocked=evidence.some(hud=>hud.buy||hud.result||hud.death||hud.spectating||hud.scoreboard);
  if(!blocked && evidence.filter(hud=>hud.playerHud).length>=2) {
   const groupId=eligible.length/4;
   eligible.push(...group.map(frame=>({...frame,group:groupId})));
  }
 }
 return eligible;
}

export async function analyzeIdentityWindow({frames,section,review,send,captureProbe,signal,onEvidence=()=>{}}) {
 const batches=[frames];
 signal?.throwIfAborted();
 const observations=await send('identity',frames,section,signal);
 ingestIdentity(review,observations,section);onEvidence(observations);
 for(const probe of transitionProbes(observations,section)) {
  signal?.throwIfAborted();
  const extra=await captureProbe(probe,signal);
  const evidence=await send('identity',extra,section,signal);
  ingestIdentity(review,evidence,section);onEvidence(evidence);batches.push(extra);
 }
 const findings=[];
 for(const batch of batches) {
  signal?.throwIfAborted();
  const eligible=userFrameGroups(batch,review);
  if(!eligible.length)continue;
  const supported=await send('performance',eligible,section,signal);
  // Globally distinct evidence sequences; repeated passes replace rather than
  // accumulate the same findings in the caller's metadata-only cache.
  for(const finding of supported) {
   const sequence=eligible.filter(f=>f.group===finding.group);
   if(sequence.length) findings.push({...finding,group:sequence[0].at.toFixed(6),sequenceStart:sequence[0].at});
  }
 }
 review.processed.push({start:section.start,end:section.end,revision:review.revision});
 return findings;
}
