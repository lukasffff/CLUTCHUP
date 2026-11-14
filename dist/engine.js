"use strict";
(function (root) {
  const width = 900;
  const height = 510;
  const cover = [
    { x: 371, y: 219, w: 158, h: 170, label: "CENTRAL COVER" },
    { x: 165, y: 252, w: 94, h: 57, label: "WEST COVER" },
    { x: 641, y: 252, w: 94, h: 57, label: "EAST COVER" },
    { x: 300, y: 79, w: 52, h: 71 },
    { x: 548, y: 79, w: 52, h: 71 }
  ];
  const spawn = { x: 450, y: 451 };
  const exit = { x: 450, y: 64 };
  const seconds = 45;
  const anchor = (side, x, y) => ({ side, x, y, alive: true, lock: 0, hp: 100, hurtAt: -1 });
  const policies = {
    fixed: { name: "Fixed hold", reaction: 1.35, variation: 0 },
    guided: { name: "Staggered hold", reaction: 2.05, variation: 0 },
    stagger: { name: "Staggered hold", reaction: 1.65, variation: 0 },
    vary: { name: "Variable peeks", reaction: 1.35, variation: 1 },
    standard: { name: "Standard assessment", reaction: 1.65, variation: 0 },
    spray: { name: "Spray practice", reaction: Infinity, variation: 0 }
  };
  function choosePolicy(mode, rounds, beginner) {
    if (mode === "fixed") return { id: "fixed", reason: "The baseline repeats its west and east holds with identical timing." };
    const recent = rounds.slice(-2);
    if (recent.length === 2 && recent.every(round => round.success && round.exposure <= 1)) {
      return { id: "vary", reason: "Two clean extractions with at most 1 s of double exposure unlocked moving peeks." };
    }
    if (recent.some(round => round.exposure > 1.5 || !round.success)) {
      return { id: "guided", reason: "A missed extraction or over 1.5 s of double exposure triggered slower reactions and a delayed second threat." };
    }
    return beginner
      ? { id: "guided", reason: "Beginner lesson starts with extra time between threats." }
      : { id: "stagger", reason: "The east threat activates after the west threat to give you time to isolate the first angle." };
  }
  function createRound(id, index = 0) {
    const offset = id === "standard" ? [0, 30, -25][index % 3] : 0;
    return {
      id, index, player: { ...spawn, health: 3, eye: 39 },
      aim: { x: 450, y: 204 }, headshots: 0, damage: 0,
      bots: id === "spray" ? [] : [anchor("west", 212 + offset, 170), anchor("east", 688 + offset, 170)],
      elapsed: 0, exposure: 0, shots: 0, hits: 0, isolated: 0, cooldown: 0,
      result: null, flash: null
    };
  }
  function obstructed(a, b) {
    let directionX = b.x - a.x;
    let directionY = b.y - a.y;
    return cover.some(wall => {
      if ((!directionX && (a.x < wall.x || a.x > wall.x + wall.w)) ||
          (!directionY && (a.y < wall.y || a.y > wall.y + wall.h))) return false;
      const x0 = directionX ? (wall.x - a.x) / directionX : -Infinity;
      const x1 = directionX ? (wall.x + wall.w - a.x) / directionX : Infinity;
      const y0 = directionY ? (wall.y - a.y) / directionY : -Infinity;
      const y1 = directionY ? (wall.y + wall.h - a.y) / directionY : Infinity;
      return Math.max(0, Math.min(x0, x1), Math.min(y0, y1)) <= Math.min(1, Math.max(x0, x1), Math.max(y0, y1));
    });
  }
  function activeBots(round) {
    return round.bots.filter(bot => bot.alive && (bot.side === "west" || !["guided", "stagger"].includes(round.id) ||
      !round.bots[0].alive || round.elapsed >= (round.id === "guided" ? 8 : 4)));
  }
  function visibleBots(round) {
    return activeBots(round).filter(bot => !obstructed(round.player, bot));
  }
  function allowed(x, y) {
    return x >= 25 && x <= width - 25 && y >= 38 && y <= height - 24 &&
      !cover.some(wall => x > wall.x - 13 && x < wall.x + wall.w + 13 && y > wall.y - 13 && y < wall.y + wall.h + 13);
  }
  function update(round, dt, moveX, moveY) {
    if (round.result) return;
    round.elapsed += dt;
    round.cooldown = Math.max(0, round.cooldown - dt);
    const { player } = round;
    const magnitude = Math.hypot(moveX, moveY);
    if (magnitude) {
      const speed = Math.min(magnitude, 1) * 230;
      const x = player.x + moveX / magnitude * speed * dt;
      const y = player.y + moveY / magnitude * speed * dt;
      if (allowed(x, player.y)) player.x = x;
      if (allowed(player.x, y)) player.y = y;
    }
    if (policies[round.id].variation) {
      const phase = Math.floor(round.elapsed / 2.5);
      const sweep = phase % 2 ? 1 : -1;
      const local = (round.elapsed % 2.5) / 2.5;
      const shift = 49 * Math.sin(local * Math.PI) * sweep;
      round.bots[0].x = 212 + shift;
      round.bots[1].x = 688 - shift;
    }
    const visible = visibleBots(round);
    if (visible.length === 2) round.exposure += dt;
    for (const bot of round.bots) {
      bot.lock = visible.includes(bot) ? bot.lock + dt : 0;
      if (bot.lock >= policies[round.id].reaction) {
        bot.lock = 0;
        player.health -= 1;
        round.flash = { from: { x: bot.x, y: bot.y }, to: { x: player.x, y: player.y }, until: round.elapsed + .17, enemy: true };
      }
    }
    if (round.id === "spray") return;
    if (player.health <= 0) finish(round, "Eliminated");
    else if (round.bots.every(bot => !bot.alive) && Math.hypot(player.x - exit.x, player.y - exit.y) < 35) finish(round, "Extracted");
    else if (round.elapsed >= seconds) finish(round, "Time expired");
  }
  const eyeHeight = 39;
  function rayTarget(round, yaw, pitch, eye = eyeHeight) {
    const direction = { x: Math.sin(yaw), y: -Math.cos(yaw) };
    let nearest = Infinity;
    let target;
    for (const bot of visibleBots(round)) {
      const dx = bot.x - round.player.x;
      const dy = bot.y - round.player.y;
      const distance = dx * direction.x + dy * direction.y;
      if (distance <= 0 || distance >= nearest) continue;
      const side = Math.abs(dx * direction.y - dy * direction.x);
      const height = eye + distance * Math.tan(pitch);
      const head = height >= 34 && height <= 47 && side <= 7;
      const body = height >= 6 && height < 34 && side <= 12;
      const impact = { x: round.player.x + direction.x * distance, y: round.player.y + direction.y * distance };
      if ((head || body) && !obstructed(round.player, impact)) {
        nearest = distance;
        target = { bot, distance, region: head ? 0 : height >= 17 ? 1 : 2 };
      }
    }
    return target;
  }
  function fire(round, view) {
    if (round.result || round.cooldown > 0) return;
    round.cooldown = .2;
    round.shots += 1;
    const visible = visibleBots(round);
    const ray = view && rayTarget(round, view.yaw, view.pitch, view.height);
    const target = view ? ray?.bot : visible.find(bot => Math.hypot(bot.x - round.aim.x, bot.y - round.aim.y) <= 24);
    if (target) {
      round.hits += 1;
      const damage = view?.damage ? view.damage[ray.region] * (ray.distance > 420 ? view.falloff : 1) : 100;
      target.hp -= damage;
      target.hurtAt = round.elapsed;
      round.damage += Math.ceil(damage);
      if (ray?.region === 0) round.headshots += 1;
      if (target.hp <= 0) {
        target.alive = false;
        if (visible.length === 1) round.isolated += 1;
      }
    }
    round.flash = { from: { ...round.player }, to: { ...(target || round.aim) }, until: round.elapsed + .13, enemy: false, hit: Boolean(target), head: ray?.region === 0, killed: Boolean(target && !target.alive) };
    if (view) round.cooldown = 0;
    return round.flash;
  }
  function finish(round, outcome) {
    if (round.result) return;
    round.result = {
      success: outcome === "Extracted", outcome, elapsed: round.elapsed, exposure: round.exposure,
      shots: round.shots, hits: round.hits, isolated: round.isolated, policy: round.id,
      headshots: round.headshots, damage: round.damage
    };
  }
  function sampleAt(time) {
    const round = createRound("fixed");
    const t = Math.min(time, 7);
    const path = [[0, 450, 451], [1, 550, 449], [2.6, 558, 396], [4.25, 565, 202], [5.3, 459, 183], [7, 453, 118]];
    const end = path.findIndex(point => point[0] > t);
    if (end === -1) {
      round.player.x = path.at(-1)[1];
      round.player.y = path.at(-1)[2];
    } else {
      const [a, b] = [path[end - 1], path[end]];
      const ratio = (t - a[0]) / (b[0] - a[0]);
      round.player.x = a[1] + (b[1] - a[1]) * ratio;
      round.player.y = a[2] + (b[2] - a[2]) * ratio;
    }
    round.aim = { x: 688, y: 170 };
    round.elapsed = t;
    return round;
  }
  function sampleFinding() {
    const matches = [];
    for (let i = 0; i <= 140; i++) {
      const t = i / 20;
      if (visibleBots(sampleAt(t)).length === 2) matches.push(t);
    }
    return { timestamp: matches[0], duration: matches.length / 20 };
  }
  root.Clutch = { width, height, cover, spawn, exit, seconds, eyeHeight, policies, choosePolicy, createRound, obstructed, activeBots, visibleBots, update, fire, finish, sampleAt, sampleFinding };
})(typeof module === "undefined" ? window : module.exports);
