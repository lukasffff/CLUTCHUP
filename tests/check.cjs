"use strict";
const E = require("../dist/engine.js").Clutch;
const assert = require("node:assert/strict");

function playClean(policy, variant) {
  const round = E.createRound(policy, variant);
  function walk(x, y) {
    while (Math.hypot(x - round.player.x, y - round.player.y) > 2 && !round.result) {
      const dx = x - round.player.x;
      const dy = y - round.player.y;
      E.update(round, Math.min(.01, Math.hypot(dx, dy) / 230), dx, dy);
    }
  }
  function shoot(index) {
    round.aim = { ...round.bots[index] };
    E.fire(round);
  }
  walk(342, 447);
  walk(342, 340);
  shoot(0);
  walk(342, 415);
  walk(560, 415);
  walk(560, 310);
  shoot(1);
  walk(560, 194);
  walk(450, 66);
  return round.result;
}
for (let i = 0; i < 3; i++) {
  const result = playClean("standard", i);
  assert.equal(result.success, true);
  assert.equal(result.isolated, 2);
  assert.equal(result.exposure, 0);
}
const clean = playClean("stagger", 0);
assert.equal(E.choosePolicy("adaptive", [clean, clean], false).id, "vary");
assert.equal(E.choosePolicy("adaptive", [{ success: false, exposure: 2 }], false).id, "guided");
assert.equal(E.choosePolicy("fixed", [clean, clean], false).id, "fixed");
const varied = E.createRound("vary");
const fixed = E.createRound("fixed");
E.update(varied, .5, 0, 0);
E.update(fixed, .5, 0, 0);
assert.notEqual(varied.bots[0].x, fixed.bots[0].x);
assert.equal(E.activeBots(E.createRound("guided")).length, 1);
assert.equal(E.activeBots(fixed).length, 2);
assert.equal(E.sampleFinding().timestamp, 4.1);
assert.equal(E.visibleBots(E.sampleAt(4.1)).length, 2);
console.log("All three assessment layouts, adaptation branches, and the replay finding passed.");
