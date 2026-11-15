import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {harbor} from './world-fixture.mjs';
import Abilities from '../dist/tactical-match/src/game/abilities.js';
import {AbilityHUD} from '../dist/tactical-match/src/game/ability-hud.js';
import {AGENTS,SLOTS} from '../dist/tactical-match/src/game/agents.js';
import {EventBus} from '../dist/tactical-match/src/shared/events.js';
import {CONFIG} from '../dist/tactical-match/src/shared/config.js';
import Bots from '../dist/tactical-match/src/ai/bots.js';
import Combat from '../dist/tactical-match/src/combat/combat.js';
import GameSettings from '../dist/tactical-match/src/core/settings.js';

const v=(x,y=0,z=0)=>new THREE.Vector3(x,y,z);
const widget=()=>({hidden:false,dataset:{},style:{},classList:{toggle(){}},children:Array.from({length:4},()=>({textContent:''}))});
async function fixture(id) {
 const world=await harbor(),events=new EventBus(),settings=new GameSettings({coaching:{}},null);
 const player={team:'ct',alive:true,onGround:true,position:v(0,0,-25),radius:.35,moveSpeed2D:0,eyeHeight:1.62,velocity:v(0),health:100,
  takeDamage(amount){this.health-=amount;},eyePos(){return this.position.clone().add(v(0,1.62));}};
 const enemy={team:'t',name:'Opponent',slot:0,alive:true,onGround:true,pos:v(0,0,-17),yaw:0,radius:.35,height:1.83,blindUntil:-99,health:100,
  takeDamage(amount){this.health-=amount;}};
 const game={world,scene:world.game.scene,events,settings,config:CONFIG,player,state:{phase:'live',bomb:{}},input:{locked:true},hud:{buyOpen:false},camera:new THREE.PerspectiveCamera()};
 game.bots=Object.assign(Object.create(Bots.prototype),{game,all:[enemy],time:0,_cfg:CONFIG.BOT,_targetSite:{name:'A'}});
 game.combat=new Combat(game);
 const hud=Object.assign(Object.create(AbilityHUD.prototype),{game,selected:id,panel:widget(),buttons:SLOTS.map(widget),notice:{textContent:''}});
 const manager=Object.assign(Object.create(Abilities.prototype),{game,hud,time:0,effects:[],record:[],botKits:new Map(),reveals:new Map(),teamReady:{}});
 game.abilities=manager;manager.startRound(1);
 return {game,manager,enemy,player,world,hud,settings};
}

for(const [id,agent] of Object.entries(AGENTS)) for(const [slot,ability] of agent.kit.entries()) {
 test(`${agent.name} / ${ability.name}: activation, real effect, charge, HUD, expiry and round lifecycle`,async()=>{
  const {game,manager,enemy,player,world,hud,settings}=await fixture(id);
  const state=manager.playerState;
  assert.equal(settings.resolveInputKey('cqex'[slot]),'ability-'+(slot+1));
  assert.equal(settings.getLabel(SLOTS[slot]).toLowerCase(),'cqex'[slot]);
  const before=state.charges[slot],pos=player.position.clone(),baseScene=game.scene.children.length,baseColliders=world.colliders.length;
  const at=ability.type==='flash'?v(0,1.3,-20):v(0,0,-20);
  if(['zone','slow','trap'].includes(ability.type))enemy.pos.set(0,0,-19);
  assert.equal(manager.cast(player,state,slot,at,v(0,0,1)),true);
  assert.equal(state.charges[slot],before-1);assert.equal(manager.record.length,1);
  if(ability.cooldown)assert.equal(manager.cast(player,state,slot,at,v(0,0,1)),false,'cooldown or charges block immediate repeated cast');
  assert.equal(state.ready[slot],ability.cooldown);assert.equal(state.active[slot],ability.duration);
  hud.render(state,manager.time,'live',true);
  assert.ok(hud.buttons[slot].children[3].textContent.startsWith(String(before-1)));
  if(ability.type==='dash') {
   assert.ok(player.position.distanceTo(pos)>.4);assert.ok(manager.record[0].distance>.4);
   assert.equal(manager.effects.length,0);assert.equal(manager.record[0].observed,true);
  } else {
   assert.ok(manager.effects[0].mesh?.isMesh,'effect has a real renderable mesh');
   if(ability.type==='smoke')assert.equal(game.combat.losBlocked(player.eyePos(),enemy.pos.clone().add(v(0,1.6))),true);
   if(ability.type==='barrier') {
    assert.equal(world.colliders.length,baseColliders+1);
    assert.equal(world.utilitySegmentBlocked(player.position,enemy.pos),true);
    assert.equal(world._clearAt(0,.01,-20,.35,1.8),false);
   }
   if(ability.type==='slow')assert.equal(manager.moveScale(enemy,3),.52);
   const advance=ability.type==='flash'?ability.duration+.01:.01;
   game.bots.time+=advance;manager.update(advance);
   if(ability.type==='flash')assert.ok(enemy.blindUntil>game.bots.time);
   if(['recon','trap'].includes(ability.type))assert.ok(manager.getReveal('ct',enemy));
   if(ability.type==='zone')assert.ok(enemy.health<100);
   manager.update(ability.duration+3);game.bots.time=manager.time;
   assert.equal(manager.effects.length,0);assert.equal(game.combat.smokes.length,0);
   assert.equal(world.colliders.length,baseColliders);assert.equal(game.scene.children.length,baseScene);
   assert.equal(manager.getReveal('ct',enemy),null);
  }
  player.alive=false;assert.equal(manager.playerCast(slot),false);hud.render(state,manager.time,'live',false);
  assert.equal(hud.buttons[slot].disabled,true);
  manager.startRound(2);assert.equal(manager.effects.length,0);
  assert.equal(manager.playerState.charges[slot],ability.ultimate?0:ability.charges);
  manager.startRound(1);assert.equal(manager.playerState.charges[slot],ability.charges);
 });
}

test('ability failures consume no charge, reject airborne dash and blocked/occupied barrier placements',async()=>{
 const {manager,player}=await fixture('duelist');player.onGround=false;
 assert.equal(manager.cast(player,manager.playerState,0,v(0),v(0,0,1)),false);
 assert.equal(manager.playerState.charges[0],2);
 const {manager:wall,player:owner}=await fixture('sentinel');
 assert.equal(wall.cast(owner,wall.playerState,0,owner.position.clone(),v(0,0,1)),false);
 assert.equal(wall.playerState.charges[0],2);
});

test('a legal smoke opportunity can be measured against the single 1v1 opponent',async()=>{
 const {manager,game,player}=await fixture('controller');
 player.moveSpeed2D=3;
 game.camera.position.copy(player.eyePos());game.camera.lookAt(0,0,-20);game.camera.updateMatrixWorld(true);
 manager.time=1;manager.liveStarted=0;manager.checkOpportunity();
 assert.equal(manager.smokeOpportunity?.enemies,1);
 assert.equal(manager.smokeOpportunity?.ability,'Waypoint Smoke');
});
