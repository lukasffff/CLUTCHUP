import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {harbor} from './world-fixture.mjs';
import {EventBus} from '../dist/tactical-match/src/shared/events.js';
import {CONFIG} from '../dist/tactical-match/src/shared/config.js';
import {BENCHMARK_RULES,BENCHMARK_TRIALS,compareBenchmarks} from '../dist/benchmark.js';
import {coachingReport} from '../dist/coaching-report.js';
import {comparePolicies,EVALUATION_RULES} from '../dist/evaluation.js';
import {STORE,read,launchSpec,sessionURL} from '../dist/coach-model.js';
import {saveReview,readReviews,saveReport,readReports,removeSaved,REPORTS} from '../dist/review-model.js';
import {graphicsRatio,GRAPHICS_PRESETS,graphicsQuality} from '../dist/tactical-match/src/core/graphics.js';
import {frameStats} from '../dist/tactical-match/src/core/frame-stats.js';
import {simulationSteps} from '../dist/tactical-match/src/core/timing.js';
import Weapons from '../dist/tactical-match/src/weapons/weapons.js';
import Player from '../dist/tactical-match/src/player/player.js';
import Rounds from '../dist/tactical-match/src/game/rounds.js';
import Bots from '../dist/tactical-match/src/ai/bots.js';
import {TacticalCoach} from '../dist/tactical-match/src/game/coach.js';
import {WEAPONS} from '../dist/tactical-match/src/weapons/data.js';

const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};};
const run=(id,kind,start,moving=0)=>BENCHMARK_TRIALS.map((trial,index)=>({id:id+index,run:id,benchmark:kind,protocol:BENCHMARK_RULES,
 source:'tactical',playerKey:'local',phase:kind==='before'?'assessment':'reassessment',side:'ct',trial,round:index+1,created:start+index,
 data:{shots:10,hits:5,movingShots:moving,aimSamples:10,belowHead:0}}));

test('new baselines reset comparisons; historical retests never borrow newer measurements',()=>{
 const first=run('b1','before',1,8),after=run('a1','after',10,2),second=run('b2','before',20,0),after2=run('a2','after',30,7);
 const history=[...first,...after,...second,...after2];
 assert.equal(compareBenchmarks(history,'local').before.id,'b2');
 assert.equal(compareBenchmarks(history,'local','a1').before.id,'b1');
 assert.equal(compareBenchmarks([...first,...after,...second],'local').after,undefined);
 assert.match(coachingReport(after[2],history).improvement,/improved/);
 assert.ok(!coachingReport(after[2],history).improvement.includes('increased'));
});

test('video profile isolation survives reloads and deleting one report preserves unrelated progress',()=>{
 const store=memory(),review={id:'same',notes:[]},report={id:'same',findings:[]};
 store.setItem(STORE,JSON.stringify([{id:'match',source:'tactical',data:{shots:1}}]));
 saveReview(review,store);saveReport(report,store);
 store.setItem('clutchup.profile',JSON.stringify({riot:'Other#001'}));
 assert.deepEqual(readReviews(store),[]);assert.deepEqual(readReports(store),[]);
 saveReport({...report,file:{name:'other.webm'}},store);removeSaved('same',REPORTS,store);
 assert.deepEqual(readReports(store),[]);
 store.setItem('clutchup.profile',JSON.stringify({riot:''}));
 assert.equal(readReports(store).length,1);assert.equal(readReviews(store).length,1);
 assert.equal(read(STORE,[],store)[0].id,'match');
 store.setItem(STORE,'{}');assert.deepEqual(read(STORE,[],store),[]);
 store.setItem(STORE,'[null,4,{}, {"data":null}]');assert.deepEqual(read(STORE,[],store),[]);
 assert.equal(saveReport(report,{getItem(){throw Error();},setItem(){throw Error();}}),false);
});

test('graphics presets change resolution, shadows, texture budget and effects while launch URLs preserve selection',()=>{
 assert.deepEqual(['low','medium','high'].map(q=>graphicsRatio(q,2)),[.75,1.25,2]);
 assert.ok(GRAPHICS_PRESETS.low.shadow<GRAPHICS_PRESETS.medium.shadow);
 assert.ok(GRAPHICS_PRESETS.medium.shadow<GRAPHICS_PRESETS.high.shadow);
 assert.equal(GRAPHICS_PRESETS.medium.ssao,false);assert.equal(GRAPHICS_PRESETS.high.ssao,true);
 assert.equal(graphicsQuality('invalid'),'high');
 assert.match(sessionURL({phase:'assessment',quality:'medium'}),/quality=medium/);
});

test('profiler calculates average, slowest-one-percent FPS, quantiles and spikes from measured frame intervals',()=>{
 const stats=frameStats([...Array.from({length:99},()=>({wall:10})),{wall:100}]);
 assert.equal(stats.averageMs,10.9);assert.equal(stats.low1,10);assert.equal(stats.p95Ms,10);
 assert.equal(stats.p99Ms,10);assert.equal(stats.spikes33,1);assert.equal(stats.maxMs,100);
 assert.equal(frameStats([]),null);
});

test('actual firearm scheduling retains its rate across render FPS without firing a catch-up burst after a pause',()=>{
 const counts=[];
 for(const fps of [20,30,50,60,75,120,144,165]) {
  const weapon=Object.assign(Object.create(Weapons.prototype),{_now:0,_nextFireAt:0,ammo:{ak47:{mag:1000,reserve:0}},_fireShot(){this.shots++;},shots:0});
  for(let frame=0;frame<fps*10;frame++) {
   const {count,dt}=simulationSteps(1/fps);
   for(let step=0;step<count;step++){weapon._now+=dt;weapon._tryFire(WEAPONS.ak47,{});}
  }
  counts.push(weapon.shots);
  weapon._now+=5;weapon._tryFire(WEAPONS.ak47,{});const total=weapon.shots;
  weapon._now+=.001;weapon._tryFire(WEAPONS.ak47,{});assert.equal(weapon.shots,total);
 }
 assert.ok(Math.max(...counts)-Math.min(...counts)<=1,JSON.stringify(counts));
});

test('player controller applies look, walking, crouching, jumping, collision and damage under elapsed-time updates',async()=>{
 const world=await harbor(),keys=new Set(),events=new EventBus();let look={dx:40,dy:10};
 const game={world,config:CONFIG,events,state:{phase:'live'},camera:new THREE.PerspectiveCamera(),profile:{name:'QA',characterId:'vanguard'},
  input:{isDown:key=>keys.has(key),consumeLook(){const value=look;look=null;return value;}},bots:{all:[]}};
 const player=new Player(game);game.player=player;player.resetForRound({pos:new THREE.Vector3(0,0,8),yaw:0});look={dx:40,dy:10};
 player.update(1/60);assert.ok(player.yaw<0);assert.ok(player.pitch<0);
 keys.add('w');for(let i=0;i<30;i++)player.update(1/60);const running=player.moveSpeed2D;assert.ok(running>2);
 keys.add('shift');for(let i=0;i<30;i++)player.update(1/60);assert.ok(player.moveSpeed2D<running);
 keys.add('control');for(let i=0;i<30;i++)player.update(1/60);assert.equal(player.crouching,true);
 keys.clear();for(let i=0;i<30;i++)player.update(1/60);
 events.emit('input:keydown',{key:' '});player.update(1/60);assert.equal(player.onGround,false);
 player.takeDamage(200);assert.equal(player.alive,false);
});

test('local plant/defuse input advances only when stationary and can complete either objective',async()=>{
 const world=await harbor(),events=new EventBus(),planted=[],defused=[];
 events.on('bomb:planted',entry=>planted.push(entry));events.on('bomb:defused',entry=>defused.push(entry));
 const player={team:'t',alive:true,onGround:true,position:world.bombSites[0].center.clone(),moveSpeed2D:0};
 const game={world,events,config:CONFIG,coaching:{side:'t'},player,input:{isDown:key=>key==='e'},bots:{},state:{phase:'live',bomb:{defuseProgress:0}}};
 const rounds=Object.assign(Object.create(Rounds.prototype),{game,_plantProgress:0,_defuseEmitted:false,_setBombDefusedVisual(){}});
 player.moveSpeed2D=3;rounds._updateHumanPlant(1);assert.equal(game.state.bomb.plantProgress,0);
 player.moveSpeed2D=0;for(let i=0;i<CONFIG.MATCH.PLANT_TIME*60+1;i++)rounds._updateHumanPlant(1/60);
 assert.equal(planted.length,1);assert.equal(planted[0].by,player);
 player.team='ct';game.state.phase='planted';rounds._bombPos=player.position.clone();
 for(let i=0;i<CONFIG.MATCH.DEFUSE_TIME*60+1;i++)rounds._updateHumanDefuse(1/60);
 assert.equal(defused.length,1);assert.equal(defused[0].by,'player');
});

test('repeated approaches change actual queued route geometry and decision logs; fixed comparison keeps the original plan',async()=>{
 const world=await harbor(),store=memory();globalThis.localStorage=store;
 try {
  const history=Array.from({length:3},(_,i)=>({id:'r'+i,source:'tactical',data:{shots:2},duel:true,map:'harbor',playerKey:'local',side:'ct',lesson:'peek',
   habits:{version:1,approach:'middle',peeks:[],unready:0,overexposures:0}}));
  store.setItem(STORE,JSON.stringify(history));
  const routes=world.botTactics.attackRoutes.A,bot={routeQueue:[],routeName:null};
  const brain=Object.assign(Object.create(Bots.prototype),{_targetSite:{name:'A'}});brain._assignRoute(bot,routes[0]);
  const original=bot.routeQueue.map(p=>p.toArray());
  const coach=Object.assign(Object.create(TacticalCoach.prototype),{plan:{duel:true,side:'ct',lesson:'peek'},playerKey:'local',game:{bots:brain}});
  coach.applyHistoryTactics([bot],routes,[],[]);
  assert.notEqual(bot.routeName,routes[0].name);assert.notDeepEqual(bot.routeQueue.map(p=>p.toArray()),original);
  assert.equal(coach.game.roundTactic.evidence.observed,3);assert.match(coach.game.roundTactic.reason,/3 of 3/);
  const queued=bot.routeName;coach.plan.evaluation='fixed';coach.applyHistoryTactics([bot],routes,[],[]);assert.equal(bot.routeName,queued);
  brain._clearRoute(bot);assert.equal(bot.roundRouteName,queued,'completed approach stays available for round reporting');
 } finally {delete globalThis.localStorage;}
});

test('controlled fixed/adaptive launches match setup and comparisons require actual observations in both conditions',()=>{
 const fixed=launchSpec('?coach=practice&evaluation=fixed'),adaptive=launchSpec('?coach=practice&evaluation=adaptive');
 for(const key of ['agent','lesson','side','site','reactionDelay','demo','duel'])assert.equal(fixed[key],adaptive[key]);
 assert.equal(comparePolicies([],'local').fixed,null);
 const row={evaluationProtocol:EVALUATION_RULES,source:'tactical',phase:'practice',map:'harbor',side:'ct',site:'A',agent:'controller',lesson:'peek',playerKey:'local',data:{shots:10,movingShots:2,peeks:2,unreadyPeeks:1},habits:{overexposures:0}};
 const result=comparePolicies(['fixed','adaptive'].flatMap(evaluation=>[1,2].map(n=>({...row,id:evaluation+n,evaluation}))),'local');
 assert.equal(result.ready,true);assert.equal(result.fixed.correctOpenings,2);assert.equal(result.adaptive.shots,20);
 assert.equal(comparePolicies([row],'other').adaptive,null);
});

test('roster rebuild disposes owned character resources and produces exactly the requested solo opponent',()=>{
 let disposed=0;const root=new THREE.Group();
 const brain=Object.assign(Object.create(Bots.prototype),{_root:root,all:[{ownedVisualMaterials:[{dispose(){disposed++;}}]}],_createBot(name,team,slot){return {name,team,slot};}});
 brain.configureRoster(0,1);assert.equal(disposed,1);assert.equal(brain.all.length,1);assert.equal(brain.all[0].team,'t');
 brain.configureRoster(1,0);assert.equal(brain.all.length,1);assert.equal(brain.all[0].team,'ct');
});

test('dashboard settings persist all graphics presets and the comparison page renders empty evidence honestly',async()=>{
 const previous={document:globalThis.document,window:globalThis.window,location:globalThis.location,localStorage:globalThis.localStorage};
 const store=memory(),fields={'#quality':{value:'medium'},'#riot':{value:'QA#001'},'#saved':{},form:{},'#export':{}};
 const page={innerHTML:'',querySelector:selector=>fields[selector]};let render;
 globalThis.localStorage=store;globalThis.location={hash:'#settings'};
 globalThis.document={querySelector:selector=>selector==='#page'?page:null,querySelectorAll:()=>[]};
 globalThis.window={addEventListener(event,fn){if(event==='hashchange')render=fn;}};
 try {
  await import('../dist/coach-dashboard.js?qa-audit');
  assert.match(page.innerHTML,/value="medium"/);assert.match(page.innerHTML,/value="low"/);assert.match(page.innerHTML,/value="high"/);
  fields.form.onsubmit({preventDefault(){}});assert.equal(JSON.parse(store.getItem('clutchup.quality')),'medium');
  globalThis.location.hash='#progress';render();
  assert.match(page.innerHTML,/Fixed versus adaptive/);assert.match(page.innerHTML,/no recorded comparison rounds/);
  globalThis.location.hash='#home';render();assert.match(page.innerHTML,/quality=medium/);
 } finally {Object.assign(globalThis,previous);}
});
