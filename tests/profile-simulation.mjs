import Weapons from '../dist/tactical-match/src/weapons/weapons.js';
import {WEAPONS} from '../dist/tactical-match/src/weapons/data.js';
import {simulationSteps} from '../dist/tactical-match/src/core/timing.js';
const rows=[];
for(const fps of [20,30,50,60,75,120,144,165]) {
 const counts=[];
 for(const legacy of [true,false]) {
  const w=Object.assign(Object.create(Weapons.prototype),{_now:0,_nextFireAt:0,ammo:{ak47:{mag:1000}},shots:0,_fireShot(){this.shots++;}});
  for(let f=0;f<fps*10;f++) {
   const {count,dt}=simulationSteps(1/fps);
   for(let step=0;step<count;step++) {
    w._now+=dt;
    if(legacy) {if(w._now>=w._nextFireAt){w.shots++;w._nextFireAt=w._now+60/WEAPONS.ak47.rpm;}}
    else w._tryFire(WEAPONS.ak47,{});
   }
  }
  counts.push(w.shots);
 }
 rows.push({renderFPS:fps,legacyShots:counts[0],updatedShots:counts[1],simulationSeconds:10});
}
console.log(JSON.stringify({kind:'synthetic timing replay; not a human performance result',rows},null,2));
