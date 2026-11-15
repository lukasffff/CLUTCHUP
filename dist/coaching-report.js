import {lessons, findings, passed, recurringFindings, comparableDuel, metrics, next} from './coach-model.js';
import {compareBenchmarks, runStats} from './benchmark.js';

const percent = n => Math.round(n*100)+'%';
const why = {
 movement:'Moving or airborne fire adds weapon spread and makes the opening burst less reliable.',
 aim:'A large height correction delays a head-level shot when an opponent appears.',
 peek:'Opening an angle while looking away gives the opponent time to shoot first.',
 cover:'Multiple clear enemy sightlines make it harder to isolate a fight.'
};
export function coachingReport(row, history) {
 const d=row.data, m=metrics(d);
 const same=history.filter(r=>r.playerKey===row.playerKey && r.side===row.side);
 const repeated=recurringFindings(same);
 const observations=findings(d).map(f=>({
  skill:f.id,
  text:(repeated.some(x=>x.id===f.id)?'Recurring observation: ':'This attempt: ')+lessons[f.id].title+' ('+percent(f.value)+').',
  why:why[f.id], action:lessons[f.id].focus
 }));
 const strengths=Object.entries(lessons).filter(([id])=>!(row.duel && id==='cover') && passed(id,d)).map(([,lesson])=>lesson.title);
 const evidence=[];
 if(d.shots) evidence.push(d.hits+'/'+d.shots+' hits; '+d.movingShots+'/'+d.shots+' moving or airborne shots.');
 if(d.hits) evidence.push((d.head||0)+'/'+d.hits+' hits were head hits.');
 if(d.aimSamples) evidence.push(((d.belowHead||0)+(d.aboveHead||0))+'/'+d.aimSamples+' crosshair samples outside head height.');
 if(d.coveredSeconds!=null) evidence.push(d.coveredSeconds+' s near hard cover; '+d.exposedSeconds+' s with a clear enemy sightline. Near-cover time alone does not prove protection.');
 if(d.engagements) evidence.push(d.engagements+' contact openings; '+d.coverResets+' sightline breaks; '+d.damageResets+' breaks within three seconds of damage. These are observable engagement choices, not an estimate of intent.');
 let improvement='No comparable prior attempt with enough measurements yet.';
 const prior=history.find(r=>r.created<row.created && comparableDuel(r,row));
 const pair=row.benchmark==='after' && compareBenchmarks(history,row.playerKey);
 const old=pair?.before && pair?.after ? runStats(pair.before) : prior?.data;
 const current=pair?.after ? runStats(pair.after) : d;
 if(old) {
  const before=metrics(old), after=metrics(current), changes=[];
  for(const [key,title,min,count] of [['moving','moving shots',5,'shots'],['lowAim','crosshair height errors',5,'aimSamples'],['unreadyPeeks','unready peeks',2,'peeks']]) {
   if(old[count]>=min && current[count]>=min && before[key]!=null && after[key]!=null)
    changes.push(title+' '+percent(before[key])+' - '+percent(after[key])+' ('+(after[key]<before[key]?'improved':after[key]>before[key]?'increased':'unchanged')+')');
  }
  if(changes.length) improvement=changes.join('; ')+'. Comparable settings; combat randomness and sample size still affect differences.';
 }
 return {strengths,observations,evidence,improvement,next:next(same),accuracy:m.accuracy};
}
