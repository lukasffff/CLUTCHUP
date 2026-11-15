import {runStats} from './benchmark.js';
export const EVALUATION_RULES = 'Harbor comparison v1';
export function comparePolicies(history, playerKey) {
 const rows=history.filter(row=>row.playerKey===playerKey && row.source==='tactical' && row.phase==='practice' &&
  row.evaluationProtocol===EVALUATION_RULES && row.map==='harbor' && row.side==='ct' && row.lesson==='peek' && row.site==='A' && row.agent==='controller' &&
  ['fixed','adaptive'].includes(row.evaluation));
 const summarize=policy=>{
  const attempts=rows.filter(row=>row.evaluation===policy).slice(0,12);
  if(!attempts.length)return null;
  const totals=runStats({rounds:attempts});
  for(const key of ['exposedSeconds','plants','defuses'])totals[key]=attempts.reduce((sum,row)=>sum+(row.data[key]||0),0);
  return {attempts:attempts.length,...totals,correctOpenings:Math.max(0,totals.peeks-totals.unreadyPeeks),
   repeatedExposure:attempts.reduce((sum,row)=>sum+(row.habits?.overexposures||0),0),
   decisions:attempts.flatMap(row=>(row.adaptations||[]).filter(entry=>entry.evidence).map(entry=>entry.message))};
 };
 const fixed=summarize('fixed'),adaptive=summarize('adaptive');
 return {fixed,adaptive,ready:fixed?.attempts>=2 && adaptive?.attempts>=2};
}
