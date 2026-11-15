import test from 'node:test';
import assert from 'node:assert/strict';
import { HabitsTracker, summarizeHabits, chooseOpponentTactic } from '../dist/player-habits.js';
import { BENCHMARK_RULES, BENCHMARK_TRIALS, compareBenchmarks, runStats } from '../dist/benchmark.js';
import { launchSpec, next } from '../dist/coach-model.js';
import { TacticalCoach } from '../dist/tactical-match/src/game/coach.js';
import { Vector3 } from 'three';

const player = (x,z,speed=3) => ({position:{x,y:0,z},moveSpeed2D:speed,onGround:true,crouching:false});

test('records continuous route progression without rewarding a contest-lane spawn or teleport', () => {
  const tracker = new HabitsTracker();
  for (let z=10;z>=7;z-=.5) tracker.sample(player(0,z),.2,false,true,false);
  assert.equal(tracker.report().approach,null);
  for (let z=20;z>=14;z-=.5) tracker.sample(player(-37,z),.2,false,true,false);
  assert.equal(tracker.report().approach,'west');
  assert.ok(tracker.report().distance > 5 && tracker.report().distance < 12);
  tracker.sample(player(-37,13.5),.2,true,false,true);
  assert.equal(tracker.report().peeks[0].unready,1);
  for (let i=0;i<12;i++) tracker.sample(player(-37,13.5,0),.2,true,true,false);
  assert.equal(tracker.report().overexposures,1);
});

test('three comparable rounds can change the bot route or defensive lane, with the evidence in its reason', () => {
  const row = approach => ({duel:true,map:'harbor',playerKey:'local',side:'ct',lesson:'peek',
    habits:{version:1,approach,peeks:[],unready:0,overexposures:0}});
  const east = [row('east'),row('east'),row('middle')];
  const routes = [{name:'quayside'},{name:'customs flank'}];
  const areas = [{name:'quayside'},{name:'customs hall'}];
  const select = data => chooseOpponentTactic(summarizeHabits(data,'local','ct','peek'),'ct','A',routes,areas);
  assert.equal(select(east.slice(0,2)),null);
  const sameRows = summarizeHabits(east,'local','ct','peek');
  assert.equal(select(east).choice,'quayside');
  assert.equal(select([row('west'),row('west'),row('middle')]).choice,'customs flank');
  assert.match(select(east).reason,/2 of 3/);
  assert.equal(chooseOpponentTactic(sameRows,'t','A',routes,areas).type,'hold-lane');
  assert.equal(summarizeHabits(east,'some-other-profile').observed,0);
});

test('assessment compares only complete matched protocols from the same player', () => {
  const run = (kind, offset) => BENCHMARK_TRIALS.map((trial,i)=>({playerKey:'local',protocol:BENCHMARK_RULES,
    run:kind,benchmark:kind,trial,round:i+1,created:offset+i,won:i<2,data:{hits:i+1,shots:4}}));
  const before=run('before',1), after=run('after',5);
  const pairs=compareBenchmarks([...before,...after],'local');
  assert.equal(pairs.after.rounds.length,3);
  assert.equal(runStats(pairs.before).hits,6);
  assert.equal(compareBenchmarks([...before,...after.slice(1)],'local').after,undefined);
  assert.equal(compareBenchmarks([...before,...after],'other').before,undefined);
  for (const phase of ['assessment','reassessment','training','practice']) assert.equal(launchSpec('?coach='+phase).duel,true);
  assert.equal(launchSpec('?coach=training&lesson=cover').lesson,'duelcover');
});

test('the next lesson uses evidence from all three trials even when the first has no shots', () => {
  const assessment = BENCHMARK_TRIALS.map((trial, index) => ({
    id: 'round-' + index, playerKey: 'local', protocol: BENCHMARK_RULES, source: 'tactical',
    phase: 'assessment', run: 'baseline', benchmark: 'before', trial,
    round: index + 1, evaluated: index === 0, created: index,
    data: { shots: index ? 5 : 0, movingShots: index ? 4 : 0 }
  })).reverse();
  assert.equal(next(assessment).lesson, 'movement');
  assert.equal(next(assessment.slice(1)).phase, 'assessment');
});

test('a new sound cancels a repeated-peek watch without keeping its navigation order', () => {
  const point = new Vector3(0, 0, -23);
  const bot = { goal: point.clone(), path: [point], hasGoal: true, state: 'move', pos: new Vector3(0, 0, -26),
    blindUntil: -1, heardTime: 10, damageTime: -99, target: null };
  const coach = Object.assign(Object.create(TacticalCoach.prototype), {
    game: { state: { phase: 'live', timer: 56 }, bots: { time: 10 } },
    plan: {}, data: {}, adaptations: [], peekWatch: { bot, point, until: 15 }
  });
  assert.equal(coach.watchRepeatedPeek(bot), false);
  assert.equal(coach.peekWatch.done, true);
  assert.equal(bot.hasGoal, false);
  assert.equal(bot.path, null);
  assert.equal(coach.adaptations[0].reason, 'The opponent heard a new sound cue.');
});

test('an expired repeated-peek watch leaves a replacement goal intact', () => {
  const point = new Vector3(0, 0, -23);
  const replacement = new Vector3(4, 0, -27);
  const bot = { goal: replacement, path: [replacement], hasGoal: true, state: 'move', pos: new Vector3(),
    blindUntil: -1, heardTime: -99, damageTime: -99, target: null };
  const coach = Object.assign(Object.create(TacticalCoach.prototype), {
    game: { state: { phase: 'live', timer: 56 }, bots: { time: 15 } },
    plan: {}, data: {}, peekWatch: { bot, point, until: 15 }
  });
  assert.equal(coach.watchRepeatedPeek(bot), false);
  assert.equal(bot.hasGoal, true);
  assert.deepEqual(bot.path, [replacement]);
});
