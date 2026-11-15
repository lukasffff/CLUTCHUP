import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { harbor } from './world-fixture.mjs';
import { next, recurringFindings, STORE, read, launchSpec } from '../dist/coach-model.js';
import { coachingReport } from '../dist/coaching-report.js';
import { compareBenchmarks } from '../dist/benchmark.js';
import { TacticalCoach } from '../dist/tactical-match/src/game/coach.js';
import { CoachDemonstration, DEMO_LESSONS, DEMO_TIME } from '../dist/tactical-match/src/game/demonstration.js';
import { simulationSteps } from '../dist/tactical-match/src/core/timing.js';

test('bounds-filtered rays preserve full mesh hits, surfaces, ignored barriers and map changes', async () => {
 const world=await harbor(), rc=new THREE.Raycaster();
 const check=(a,b,ignored)=>{
  const direction=b.clone().sub(a), distance=direction.length(); direction.normalize();
  rc.set(a,direction); rc.far=distance;
  const expected=rc.intersectObjects(world.solids.children,false).find(hit=>hit.object!==ignored);
  const actual=world.raycast(a,direction,distance,ignored);
  assert.equal(actual?.mesh,expected?.object);
  if(expected) assert.ok(Math.abs(actual.distance-expected.distance)<1e-7);
 };
 for(const a of world.waypoints.nodes) for(const b of world.waypoints.nodes)
  check(a.pos.clone().add(new THREE.Vector3(0,1.6,0)),b.pos.clone().add(new THREE.Vector3(0,1.6,0)));
 const barrier=new THREE.Mesh(new THREE.BoxGeometry(2,3,.3),new THREE.MeshBasicMaterial());
 barrier.position.set(0,1.5,-24); world.solids.add(barrier); barrier.updateMatrixWorld(true);
 const from=new THREE.Vector3(0,1.6,-26),to=new THREE.Vector3(0,1.6,-22);
 check(from,to); check(from,to,barrier); barrier.removeFromParent(); check(from,to);
 world.loadMap('frostline'); check(from,to);
});

test('all lesson demonstrations move through Harbor collision and restore the actor and temporary effects', async () => {
 const world=await harbor();
 for(const lesson of Object.keys(DEMO_LESSONS)) {
  const start=new THREE.Vector3(0,0,27);
  const bot={alive:true,pos:start.clone(),yaw:.5,aimPitch:.1,moveSpeed:0,radius:.35,mesh:new THREE.Group()};
  let casts=0,clears=0; const captions=[];
  const game={world,coaching:{lesson},bots:{all:[bot],_animateBot(){}},scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),
   abilities:{activate(){casts++;},clear(){clears++;}}};
  const demo=new CoachDemonstration(game,(title,text)=>captions.push(text));
  assert.equal(demo.start(lesson),true);
  let travelled=0;const previous=bot.pos.clone();const reached=new Set();
  for(let tick=0;tick<DEMO_TIME*60;tick++) {
   demo.update(1/60);travelled+=previous.distanceTo(bot.pos);previous.copy(bot.pos);
   assert.ok(world._clearAt(bot.pos.x,bot.pos.y+.01,bot.pos.z,.34,1.8),'demo cannot clip through cover');
   if(bot.pos.distanceTo(demo.points[demo.stage])<.6)reached.add(demo.stage);
  }
  assert.equal(captions.length,['utility','objective'].includes(lesson)?5:4);assert.ok(travelled>5,lesson+' is a moving demonstration');
  assert.equal(reached.size,4,lesson+' reaches each staged position');
  assert.equal(casts,['utility','objective'].includes(lesson)?1:0);
  demo.stop();assert.deepEqual(bot.pos,start);assert.equal(bot.yaw,.5);assert.equal(game.scene.children.length,0);assert.equal(clears,1);
 }
});

test('simulation preserves one second at 10/20/30/60/144 FPS, with bounded collision steps and suspend recovery', () => {
 for(const fps of [10,20,30,60,144]) {
  let elapsed=0,position=0,cooldown=1;
  for(let frame=0;frame<fps;frame++) {
   const {count,dt}=simulationSteps(1/fps);assert.ok(dt<=1/60+1e-9);
   for(let step=0;step<count;step++){elapsed+=dt;position+=4.6*dt;cooldown-=dt;}
  }
  assert.ok(Math.abs(elapsed-1)<1e-9);assert.ok(Math.abs(position-4.6)<1e-9);assert.ok(Math.abs(cooldown)<1e-9);
 }
 const gap=simulationSteps(10);assert.equal(gap.count,15);assert.equal(gap.count*gap.dt,.25);
});

test('a weakness needs independent measured attempts; other profiles cannot supply evidence', () => {
 const row={source:'tactical',data:{shots:10,movingShots:9},playerKey:'one'};
 assert.equal(recurringFindings([row]).length,0);
 assert.equal(recurringFindings([row,{...row,data:{shots:2,movingShots:2}}]).length,0);
 assert.equal(recurringFindings([row,{...row}])[0].id,'movement');
 assert.equal(next([row,{...row,playerKey:'two'}]).phase,'assessment');
});

test('complete synthetic learning cycle uses real shot telemetry, persistence, support, challenge and comparable reassessment', () => {
 const values=new Map();globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 const originalNow=Date.now;let now=1000;Date.now=()=>++now;
 try {
  const history=()=>read(STORE,[]);
  function session(spec,moving) {
   const plan=launchSpec('?'+new URLSearchParams({coach:spec.phase,lesson:spec.lesson||'',...(spec.support?{support:'1'}:{}),...(spec.challenge?{challenge:'1'}:{})}));
   plan.demo=false;
   const game={coaching:plan,state:{phase:'live'},player:{alive:true,onGround:true,moveSpeed2D:moving?3:0},
    abilities:{record:[],playerState:{id:'controller'}},bots:{all:[],_targetSite:{name:'A'}}};
   const coach=Object.assign(Object.create(TacticalCoach.prototype),{game,plan,playerKey:'local',count:0,link:{},display(){}});
   for(let round=1;round<=(plan.benchmark?3:1);round++) {
    game.benchmarkTrial=['aim','peek','duelcover'][round-1];coach.start(round);
    for(let shot=0;shot<10;shot++)coach.shot();
    coach.finish({winner:'ct',reason:'elimination'});
   }
   return coach;
  }
  session({phase:'assessment'},true);
  assert.equal(compareBenchmarks(history(),'local').before.rounds.length,3);
  let recommendation=next(history());assert.equal(recommendation.lesson,'movement');
  assert.match(coachingReport(history()[0],history()).observations[0].why,/spread/);
  session(recommendation,true);recommendation=next(history());assert.equal(recommendation.support,true);
  session(recommendation,false);recommendation=next(history());assert.ok(!recommendation.support);
  session(recommendation,false);session(next(history()),false);
  recommendation=next(history());assert.equal(recommendation.challenge,true);
  const coach=session(recommendation,false);recommendation=next(history());assert.equal(recommendation.phase,'reassessment');
  assert.match(coach.link.href,/coach=reassessment/);
  session(recommendation,false);
  const pair=compareBenchmarks(history(),'local');assert.equal(pair.after.rounds.length,3);
  assert.match(coachingReport(history()[0],history()).improvement,/improved/);
  assert.equal(next(history()).phase,'training');assert.equal(next(history()).lesson,'utility');
 } finally {Date.now=originalNow;delete globalThis.localStorage;}
});


test('cover maneuver uses observed memory, reacts to new damage/noise, and leaves assessments unchanged', () => {
 let goals=0;
 const bot={name:'Opponent',team:'t',state:'engage',target:{},targetVisible:true,health:35,damageTime:9.9,
  trackTime:1,lastSeenPos:new THREE.Vector3(5,0,5),blindUntil:-99,heardTime:-99,mag:6};
 const coach=Object.assign(Object.create(TacticalCoach.prototype),{
  plan:{side:'ct'},game:{state:{phase:'live'},bots:{time:10,_setGoal(){goals++;bot.hasGoal=true;return true;}}},
  coverFor:()=>new THREE.Vector3(2,0,1),log(){}
 });
 assert.equal(coach.chooseManeuver(bot),true);assert.equal(goals,1);
 assert.deepEqual(bot.coachManeuver.threat,new THREE.Vector3(5,0,5));
 coach.game.bots.time=10.1;assert.equal(coach.maneuver(bot),true,'initial damage must not cancel its own retreat');
 bot.heardTime=10.05;assert.equal(coach.maneuver(bot),false,'new noise interrupts the authored maneuver');
 coach.plan.benchmark='before';bot.target={};bot.targetVisible=true;bot.coachCoverCooldown=0;
 assert.equal(coach.chooseManeuver(bot),false);assert.equal(goals,1);
});
