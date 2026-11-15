import {profileKey} from './player-habits.js';

const IDENTITY_STORE='clutchup.player-identities.v1';
export const IDENTITY_STATES=['user','spectator','unknown','excluded'];
const normalize=value=>String(value||'').normalize('NFKC').trim().toLowerCase();
export function identityKey(identity) {
 return normalize(identity?.riotName)+'#'+normalize(identity?.tagline)+'|'+normalize(identity?.displayName);
}
function localKey(storage) {
 try{return profileKey(JSON.parse(storage.getItem('clutchup.profile')));}catch{return 'local';}
}
export function readPlayerIdentity(storage=globalThis.localStorage) {
 try{return JSON.parse(storage.getItem(IDENTITY_STORE))?.[localKey(storage)] || null;}catch{return null;}
}
export function savePlayerIdentity(identity,storage=globalThis.localStorage) {
 const riotName=String(identity.riotName||'').trim(),tagline=String(identity.tagline||'').trim(),displayName=String(identity.displayName||'').trim();
 if(!riotName || !tagline || !displayName || riotName.length>64 || tagline.length>16 || displayName.length>64 || !identity.confirmed)
  throw Error('Enter your Riot name, tagline and confirmed in-game display name. No Riot account connection is required.');
 const saved={riotName,tagline,displayName,confirmed:true};
 try{const all=JSON.parse(storage.getItem(IDENTITY_STORE))||{};all[localKey(storage)]=saved;storage.setItem(IDENTITY_STORE,JSON.stringify(all));return saved;}
 catch{throw Error('Could not save the identity in browser storage.');}
}
export function deletePlayerIdentity(storage=globalThis.localStorage) {
 try{const all=JSON.parse(storage.getItem(IDENTITY_STORE))||{};delete all[localKey(storage)];storage.setItem(IDENTITY_STORE,JSON.stringify(all));return true;}catch{return false;}
}
export function createIdentityReview(identity,file,start,end) {
 return {version:1,matchId:crypto.randomUUID(),identity:{...identity},file:{...file},start,end,automatic:[],events:[],corrections:[],processed:[],revision:0};
}

// A visible name in a scoreboard/kill feed is not perspective proof.
export function classifyPerspective(observation,identity) {
 const signals=observation.signals||[],name=normalize(observation.visibleName),selected=normalize(identity?.displayName);
 const conflict=['death','camera_change','spectator_transition','hud_change','round_start','round_end','scoreboard','missing_hud','unreadable_name'].some(signal=>signals.includes(signal));
 let state='unknown';
 if(identity?.confirmed && !conflict && !observation.ambiguous && observation.confidence==='high' && name && selected) {
  if(observation.mode==='self' && name===selected && signals.includes('self_identity') && signals.includes('first_person_hud') && !signals.includes('spectator_hud') && !signals.includes('switch_prompt'))state='user';
  if(observation.mode==='spectator' && name!==selected && (signals.includes('spectator_hud') || signals.includes('switch_prompt')) && !signals.includes('self_identity'))state='spectator';
 }
 return {state,confidence:state==='unknown'?'unknown':observation.confidence,evidence:observation.evidence||'Insufficient perspective evidence.',visibleName:observation.visibleName||'',signals,source:'automatic'};
}

export function ingestIdentity(review,observations,section) {
 for(const item of observations) {
  if(!(Number.isFinite(item.start)&&Number.isFinite(item.end)&&item.start>=section.start&&item.end<=section.end&&item.end>item.start))continue;
  const record={...classifyPerspective(item,review.identity),start:item.start,end:item.end,id:item.start.toFixed(6)+':'+item.end.toFixed(6)};
  review.automatic=review.automatic.filter(old=>old.id!==record.id);review.automatic.push(record);
  for(const type of item.signals||[])if(['death','camera_change','spectator_transition','hud_change','round_start','round_end','own_perspective_return'].includes(type)) {
   if(!review.events.some(e=>e.type===type&&e.at===item.start))review.events.push({at:item.start,end:item.end,type,evidence:record.evidence,confidence:item.confidence,source:'automatic'});
  }
 }
}

export function correctIdentity(review,{start,end,state,evidence}) {
 if(!IDENTITY_STATES.includes(state)||!Number.isFinite(start)||!Number.isFinite(end)||start<review.start||end>review.end||end<=start||!String(evidence||'').trim())throw Error('Choose a valid timeline range, classification and evidence for your correction.');
 const correction={id:crypto.randomUUID(),start,end,state,evidence:String(evidence).trim().slice(0,1000),source:'manual',confidence:'user-confirmed'};
 review.corrections.push(correction);review.revision++;return correction;
}

export function identityTimeline(review) {
 const records=[...review.automatic,...review.corrections];
 const boundaries=[...new Set([review.start,review.end,...records.flatMap(r=>[Math.max(review.start,r.start),Math.min(review.end,r.end)])])].filter(t=>t>=review.start&&t<=review.end).sort((a,b)=>a-b);
 const result=[];
 for(let i=1;i<boundaries.length;i++) {
  const start=boundaries[i-1],end=boundaries[i],middle=(start+end)/2;
  if(end<=start)continue;
  const manual=review.corrections.findLast(r=>r.start<=middle&&r.end>=middle);
  const automatic=review.automatic.filter(r=>r.start<=middle&&r.end>=middle);
  let record=manual;
  if(!record && automatic.length)record=automatic.every(r=>r.state===automatic[0].state)?automatic.at(-1):{state:'unknown',confidence:'unknown',source:'automatic',evidence:'Conflicting sampled perspective evidence.'};
  record=record||{state:'unknown',confidence:'unknown',source:'unsampled',evidence:'No continuous identity evidence. Review this interval before attributing actions.'};
  const previous=result.at(-1);
  if(previous && previous.state===record.state && previous.source===record.source && previous.evidence===record.evidence && previous.visibleName===record.visibleName)previous.end=end;
  else result.push({...record,start,end});
 }
 return result;
}

export function confirmedUserAt(review,start,end=start) {
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<review.start||end>review.end||end<start)return false;
 const timeline=identityTimeline(review);let covered=start;
 for(const segment of timeline) {
  if(segment.end<=covered || segment.start>end)continue;
  if(segment.start>covered || segment.state!=='user')return false;
  if(segment.end>=end)return true;
  covered=segment.end;
 }
 return false;
}
export function personalFindings(findings,review,{includeDismissed=false}={}) {
 return findings.filter(f=>(includeDismissed||!f.dismissed) && Array.isArray(f.timestamps)&&f.timestamps.length && confirmedUserAt(review,Math.min(...f.timestamps),Math.max(...f.timestamps)));
}
export function userFrameGroups(frames,review) {
 const groups=new Map();for(const frame of frames){if(!groups.has(frame.group))groups.set(frame.group,[]);groups.get(frame.group).push(frame);}
 return [...groups.values()].filter(group=>group.length===4 && confirmedUserAt(review,group[0].at,group.at(-1).at))
  .flatMap((group,index)=>group.map(frame=>({...frame,group:index})));
}
export function identityMemory(reports,identity) {
 const matches=reports.filter(r=>r.identityReview && identityKey(r.identityReview.identity)===identityKey(identity));
 const topics=new Map();
 for(const report of matches)for(const finding of personalFindings(report.findings||[],report.identityReview)) {
  if(finding.strength || finding.confidence!=='medium')continue;
  if(!topics.has(finding.topic))topics.set(finding.topic,new Map());
  const file=report.identityReview.file;
  const recording=file?.name&&Number.isFinite(file.size)&&Number.isFinite(file.lastModified)?JSON.stringify([file.name,file.size,file.lastModified]):report.identityReview.matchId;
  const sequence=Number.isFinite(finding.sequenceStart)?finding.sequenceStart.toFixed(3):finding.group;
  topics.get(finding.topic).set(recording+':'+sequence,{matchId:report.identityReview.matchId,recording,at:finding.at,evidence:finding.evidence});
 }
 const history=matches.map(report=>({matchId:report.identityReview.matchId,created:report.created,observations:personalFindings(report.findings||[],report.identityReview).map(({topic,strength,confidence,at,evidence})=>({topic,strength,confidence,at,evidence}))}));
 return {matches:matches.length,history,weaknesses:[...topics].filter(([,evidence])=>new Set([...evidence.values()].map(e=>e.recording)).size>=2).map(([topic,evidence])=>({topic,evidence:[...evidence.values()]})),comparison:'No comparable quantitative performance measurements are inferred from sampled video findings.'};
}

export function classificationMetrics(fixtures) {
 let tp=0,fp=0,fn=0,unknown=0,spectatorFalsePositive=0,nonSpectators=0;
 for(const {expected,actual} of fixtures) {
  if(actual==='unknown')unknown++;
  if(expected==='user'&&actual==='user')tp++;
  if(expected!=='user'&&actual==='user')fp++;
  if(expected==='user'&&actual!=='user')fn++;
  if(expected!=='spectator'){nonSpectators++;if(actual==='spectator')spectatorFalsePositive++;}
 }
 return {samples:fixtures.length,userPrecision:tp+fp?tp/(tp+fp):null,userRecall:tp+fn?tp/(tp+fn):null,spectatorFalsePositiveRate:nonSpectators?spectatorFalsePositive/nonSpectators:null,unknownRate:fixtures.length?unknown/fixtures.length:null};
}
