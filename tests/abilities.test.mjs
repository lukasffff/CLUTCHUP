import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import Abilities from '../dist/tactical-match/src/game/abilities.js';
import GameSettings from '../dist/tactical-match/src/core/settings.js';
import { AGENTS, segmentNearPoint } from '../dist/tactical-match/src/game/agents.js';
import Rounds from '../dist/tactical-match/src/game/rounds.js';
import World from '../dist/tactical-match/src/world/map.js';
import { launchSpec, next, utilityAdvice, passed } from '../dist/coach-model.js';

const v = (x, y=0, z=0) => new THREE.Vector3(x,y,z);

test('Harbor ability defaults coexist with the objective and last weapon, and remap without duplicates', () => {
  const settings = new GameSettings({ coaching: {} }, null);
  assert.deepEqual('cqexfv'.split('').map(key => settings.resolveInputKey(key)), [
    'ability-1','ability-2','ability-3','ability-4','e','q'
  ]);
  assert.equal(settings.rebind('signature','f').swappedActionId,'use');
  assert.equal(settings.resolveInputKey('f'),'ability-3');
  assert.equal(settings.resolveInputKey('e'),'e');
  assert.equal(new GameSettings(null,null).resolveInputKey('e'),'e');
  assert.equal(Object.values(AGENTS).length,4);
  assert.equal(new Set(Object.values(AGENTS).flatMap(agent => agent.kit.map(a => a.name))).size,16);
});

test('barrier-aware routing rejects the intersecting edge and frees it after expiry', () => {
  const world = Object.create(World.prototype);
  world.waypoints = { nodes: [v(-3),v(3),v(-3,0,3),v(3,0,3)].map((pos,id)=>({id,pos})) };
  const edge = (id,cost) => ({id,cost});
  world._adjacency = [[edge(1,6),edge(2,3)], [edge(0,6),edge(3,3)], [edge(0,3),edge(3,6)], [edge(2,6),edge(1,3)]];
  world._pathCache = new Map();
  const from = world.waypoints.nodes[0].pos;
  const to = world.waypoints.nodes[1].pos;
  assert.equal(world.findPath(from,to).length,3);
  world.utilityBarriers = [new THREE.Box3(v(-.3,0,-1),v(.3,2,1))];
  assert.equal(world.utilitySegmentBlocked(from,to),true);
  const detour = world.findPath(from,to);
  assert.ok(detour.some(point=>point.z===3));
  assert.ok(detour.slice(1).every((point,index)=>!world.utilitySegmentBlocked(detour[index],point)));
  world.utilityBarriers.length=0;
  assert.equal(world.findPath(from,to).length,3);
});

test('recon uses device-to-contact visibility, shares a fixed snapshot, and expires', () => {
  const owner = { team:'ct',alive:true,position:v(-2) };
  const enemy = { name:'Contact',team:'t',alive:true,pos:v(3) };
  const occluded = { name:'Occluded',team:'t',alive:true,pos:v(4) };
  const ally = { name:'Ally',team:'ct',alive:true,pos:v(-1) };
  const manager = Object.assign(Object.create(Abilities.prototype), {
    game:{player:owner,bots:{all:[enemy,occluded,ally],time:3}},
    time:3,reveals:new Map(),clearSight:(_,to)=>to.x !== 4
  });
  const entry={enemies:[],allies:[]};
  manager.pulse({ability:AGENTS.initiator.kit[0],owner,point:v(0,1),entry});
  assert.deepEqual(entry.enemies,['Contact']);
  assert.equal(ally.utilityContact.position.x,3);
  enemy.pos.x=15;
  assert.equal(manager.getReveal('ct',enemy).position.x,3);
  assert.equal(manager.getReveal('t',enemy),null);
  manager.time=5;
  assert.equal(manager.getReveal('ct',enemy),null);
});

test('the round-end event includes local defuse credit before the report is saved', () => {
  const results = [];
  const rounds = Object.assign(Object.create(Rounds.prototype), {
    game: {
      state: { phase:'planted', round:1, scores:{ct:0,t:0}, bomb:{} },
      config: { MATCH: { ROUND_END_TIME:4, WIN_ROUNDS:3, MAX_ROUNDS:5 } },
      events: { emit(name,result) { if (name === 'round:end') results.push(result); } }
    },
    _setBombDefusedVisual() {},
    _applyRoundEconomy() {}
  });
  rounds._onBombDefused({by:'player'});
  assert.deepEqual(results,[{winner:'ct',reason:'defuse',localDefuse:true}]);
  rounds.game.state.phase='planted';
  rounds._onBombDefused({by:{name:'Ally'}});
  assert.equal(results[1].localDefuse,false);
});

test('coaching recommends utility from evidence and excludes unfinished effects from repeat advice', () => {
  const casts = [{name:'Survey Node',type:'recon',observed:true,enemies:[]},{name:'Survey Node',type:'recon',observed:false,enemies:[]}];
  assert.equal(utilityAdvice({utilityCasts:casts}),null);
  const missed = { at:12.3,enemies:1,ability:'Waypoint Smoke' };
  const row = {phase:'assessment',agent:'controller',side:'ct',source:'tactical',data:{utilityCasts:[],smokeOpportunity:missed}};
  assert.match(next([row]).explanation,/12\.3 s/);
  assert.equal(next([row]).agent,'controller');
  assert.equal(launchSpec('?coach=training&lesson=utility&agent=initiator').agent,'initiator');
  assert.equal(passed('utility',{utilityCasts:[{type:'dash',contactBefore:2,contactAfter:1}]}),true);
  assert.equal(segmentNearPoint(v(0,1),v(6,1),v(3,1),1),true);
  assert.equal(segmentNearPoint(v(0,1),v(6,1),v(3,3),1),false);
});