import test from 'node:test';
import assert from 'node:assert/strict';
import {reduceGameplay,sampleGameplayWindow,GAME_STATES} from '../dist/valorant-temporal.js';
import {hasAbilityBars,hasAbilityIcons} from '../dist/valorant-hud.js';
import {verifyLocalCoachingGroups} from '../dist/identity-pipeline.js';
import {confirmedUserAt,userFrameGroups} from '../dist/player-identity.js';

const identity={displayName:'Recorder',confirmed:true};
const at=(time,fields={})=>({at:time,...fields});
const buy=(time,round)=>at(time,{buy:true,shop:true,round});
const play=(time,clockSeconds)=>at(time,{playerHud:true,clockSeconds});
const analyze=(samples,previous=null,start=0,end=90)=>reduceGameplay(previous,samples,identity,{start,end});

test('observed death is counted once, while spectator switches and the win remain independent',()=>{
 const samples=[buy(0,1),buy(3,1),play(6,97),play(9,94),at(12,{death:true}),
   at(15,{death:true,spectating:true,spectatorName:'One'}),at(18,{death:true,spectating:true,spectatorName:'Two'}),at(20,{death:true,spectating:true,spectatorName:'Two'}),
   at(21,{death:true,spectating:true,spectatorName:'Two',result:'won'}),at(24,{result:'won',death:true}),
   buy(27,2),buy(30,2),play(33,100),play(36,97)];
 const result=analyze(samples);
 assert.equal(result.events.filter(e=>e.type==='death').length,1);
 assert.equal(result.events.find(e=>e.type==='spectator_switch').visibleName,'Two');
 const end=result.events.find(e=>e.type==='round_end');
 assert.deepEqual([end.result,end.life,end.spectating,end.earliest,end.at],['won','dead',true,20,21]);
 assert.equal(result.events.filter(e=>e.type==='round_start').length,2);
 assert.equal(result.state.phase,GAME_STATES.USER_PLAYING);
 assert.ok(result.automatic.some(r=>r.state==='user'&&r.start===33));
 assert.ok(!result.automatic.some(r=>r.state==='user'&&r.start>9&&r.end<33));
});

test('death survives window boundaries and a missing or delayed round transition',()=>{
 const before=analyze([buy(0,1),play(3,95),play(6,92),at(9,{death:true})],null,0,10);
 const after=analyze([play(10,88),play(13,85),at(16,{result:'lost',spectating:true}),
   play(19,98),play(22,95),buy(25,1),play(28,90),buy(31,2),play(34,100),play(37,97)],before.state,10,40);
 assert.equal(after.events.find(e=>e.type==='round_end').life,'dead');
 assert.ok(!after.automatic.some(r=>r.state==='user'&&r.start<34));
 assert.equal(after.state.life,'alive');
});

test('missing HUD, score jump, replay-like timer jump, and non-local camera do not credit gameplay',()=>{
 const result=analyze([buy(0,1),play(3,95),play(6,92),at(9,{scoreboard:true,playerHud:true}),
   at(12),play(15,85),play(18,99),play(21,96),at(24,{spectating:true}),
   at(27,{spectating:true,spectatorName:'Recorder'}),play(30,87)]);
 const review={start:0,end:90,automatic:result.automatic,corrections:[]};
 assert.ok(confirmedUserAt(review,3.1,5.9));
 assert.equal(confirmedUserAt(review,8,14),false);
 assert.equal(confirmedUserAt(review,21,30),false);
 assert.equal(result.state.phase,GAME_STATES.UNKNOWN);
 assert.ok(result.events.some(e=>e.type==='hud_discontinuity'));
 assert.equal(userFrameGroups([4,4.2,4.4,4.6,24,24.2,24.4,24.6].map((t,i)=>({at:t,group:Math.floor(i/4)})),review).length,4);
 assert.equal(analyze([play(3,95),play(6,92)]).state.phase,GAME_STATES.UNKNOWN);
});

test('coarse sampling brackets events, adds bounded probes, and honors abort',async()=>{
 const span={start:0,end:90};
 const points=await sampleGameplayWindow(span,async t=>at(t,{death:t>=4&&t<25,spectating:t>=8&&t<25,result:t>=25&&t<30?'lost':null}));
 assert.ok(points.length>31 && points.length<=37);
 assert.ok(points.some(p=>p.at===4));
 assert.ok(points.every((p,i)=>i===0||p.at>points[i-1].at));
 const controller=new AbortController();
 await assert.rejects(sampleGameplayWindow(span,async t=>{controller.abort();return at(t);},controller.signal),{name:'AbortError'});
});

test('an old report briefly visible during and after a new buy does not add a second death',()=>{
 const samples=[buy(0,1),play(30,100),play(33,97),at(36,{death:true}),
   at(39,{result:'lost',death:true}),buy(45,2),at(48,{death:true}),
   buy(51,2),at(54,{death:true,scoreboard:true}),buy(57,2),play(75,99),play(78,96)];
 const result=analyze(samples);
 assert.equal(result.events.filter(e=>e.type==='death').length,1);
 assert.equal(result.events.filter(e=>e.type==='round_start').length,2);
 assert.equal(result.state.phase,GAME_STATES.USER_PLAYING);
});

test('coaching double-checks each selected sequence and compacts group IDs after a veto',async()=>{
 const review={start:0,end:10,corrections:[],automatic:[{start:0,end:10,state:'user'}]};
 const frames=[1,1.1,1.2,1.3,4,4.1,4.2,4.3,8,8.1,8.2,8.3].map((at,i)=>({at,group:Math.floor(i/4)}));
 const result=await verifyLocalCoachingGroups(frames,review,async at=>({
   playerHud:at<2||at>=8,spectating:at===1.3
 }));
 assert.deepEqual(result.map(({at,group})=>[at,group]),[[8,0],[8.1,0],[8.2,0],[8.3,0]]);
});

test('ability bar geometry requires multiple short aligned runs',()=>{
 const width=100,height=8,data=new Uint8ClampedArray(width*height*4);
 for(let y=2;y<5;y++)for(const begin of [15,45,75])for(let x=begin;x<begin+12;x++)data.set([50,200,160,255],(y*width+x)*4);
 assert.equal(hasAbilityBars({width,height,data}),true);
 data.fill(0);
 assert.equal(hasAbilityBars({width,height,data}),false);
});

test('spent-charge HUD glyphs must occupy aligned slots with clear gaps',()=>{
 const width=310,height=92,data=new Uint8ClampedArray(width*height*4);
 for(const center of [58,135,212])for(let y=9;y<21;y++)for(let x=center-5;x<center+5;x++)data.set([230,230,230,255],(y*width+x)*4);
 assert.equal(hasAbilityIcons({data,width,height}),true);
 data.fill(255);
 assert.equal(hasAbilityIcons({data,width,height}),false);
});
