export function frameStats(samples) {
 const values=samples.map(row=>row.wall).filter(ms=>Number.isFinite(ms)&&ms>0).sort((a,b)=>a-b);
 if(!values.length)return null;
 const mean=list=>list.reduce((a,b)=>a+b,0)/list.length;
 const average=mean(values), slowest=values.slice(-Math.max(1,Math.ceil(values.length*.01)));
 return {frames:values.length,averageMs:average,fps:1000/average,
  low1:1000/mean(slowest),p95Ms:values[Math.min(values.length-1,Math.ceil(values.length*.95)-1)],
  p99Ms:values[Math.min(values.length-1,Math.ceil(values.length*.99)-1)],
  maxMs:values.at(-1),spikes33:values.filter(ms=>ms>33.333).length,spikes50:values.filter(ms=>ms>50).length};
}
