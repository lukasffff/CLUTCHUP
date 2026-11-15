import test from 'node:test';
import assert from 'node:assert/strict';
import { next, findings, passed, metrics, launchSpec, save, read, STORE } from '../dist/coach-model.js';
const sample = { shots:10,hits:3,head:1,movingShots:8,aliveSeconds:20,multiSeconds:1,aimSamples:6,belowHead:2,planters:0,plants:0 };
const assessment = { source:'tactical', phase:'assessment', evaluated:true, data:sample };
test('low sample counts never trigger a weakness',()=>{
  assert.deepEqual(findings({ ...sample, shots:3, movingShots:3, aliveSeconds:1, aimSamples:0 }),[]);
  assert.equal(metrics({ shots:0, hits:0 }).accuracy,null);
});
test('observed moving shots select a specific lesson; failed attempt gets support and then retest',()=>{
  const chosen=next([assessment]);
  assert.equal(chosen.lesson,'movement');
  const trial={...assessment,phase:'training',lesson:'movement'};
  assert.equal(next([trial,assessment]).support,true);
  assert.equal(next([{...trial,support:true},assessment]).phase,'reassessment');
  assert.equal(next([{...trial,data:{...sample,movingShots:1}},assessment]).phase,'reassessment');
  assert.equal(launchSpec('?coach=training&lesson=movement&support=1').reactionDelay,.60);
  assert.equal(launchSpec('?coach=reassessment&support=1').reactionDelay,0);
});
test('objective completion requires a recorded local plant',()=>{
  assert.equal(launchSpec('?coach=training&lesson=objective').side,'t');
  assert.equal(passed('objective',{ ...sample, planters:1 }),false);
  assert.equal(passed('objective',{ ...sample, planters:1, plants:1 }),true);
});
test('shared session store deduplicates rows, ignores range data for match coaching and survives a storage error',()=>{
  const target = { value: '{}', getItem() { return this.value; }, setItem(_k,v) { this.value=v; } };
  target.value='[]';
  save({ ...assessment,id:'1' },target);
  save({ source:'range',id:'2',data:{} },target);
  save({ source:'range',id:'2',data:{} },target);
  const rows = read(STORE,[],target);
  assert.equal(rows.length,2);
  assert.equal(next(rows).lesson,'movement');
  assert.equal(save({}, {getItem(){throw Error();},setItem(){throw Error();}}),false);
});