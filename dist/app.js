"use strict";
const E = window.Clutch;
const $ = id => document.getElementById(id);
const storage = {
  read(key, fallback) {
    try { return JSON.parse(localStorage.getItem("clutchup." + key)) ?? fallback; }
    catch { return fallback; }
  },
  write(key, value) {
    try { localStorage.setItem("clutchup." + key, JSON.stringify(value)); }
    catch { /* Keep this session usable with storage disabled. */ }
  }
};
const canvas = $("arena-canvas");
const W = window.ClutchWeapons;
const arsenal = Object.keys(W.rifles);
let range;
try { range = window.createClutchRange(canvas, E); }
catch { canvas.classList.add("no-webgl"); }
const map = $("minimap");
let inventory = Object.fromEntries(arsenal.map(id => [id, W.create(id)]));
let gun = "strike";
const view = { yaw: 0, pitch: 0, height: E.eyeHeight };
const velocity = { x: 0, y: 0 };
const motion = { speed: 0, ads: false, crouched: false, airborne: false };
let zoom = false;
let trigger = false;
let pull = false;
let jumpAt = -1;
let touch = null;
let feedbackUntil = 0;
let hurtUntil = 0;
let audioContext;
let noiseBuffer;
const formatTime = time => Math.floor(time / 60) + ":" + (time % 60).toFixed(1).padStart(4, "0");
const percent = value => Math.round(value * 100) + "%";
let profile = storage.read("profile", { path: "experienced", riot: "" });
let history = storage.read("history", []);
let evaluations = storage.read("evaluations", []);
let policy = "adaptive";
let activePage = "arena";
let practice = [];
let entries = [];
let evaluation = null;
let sprayMode = false;
let round = E.createRound("stagger");
let running = false;
let goal;
let autoMove = false;
let overlayTitle = "Ready to train?";
let overlayCopy = "Stay near cover. Clear one angle, then reach the extraction zone.";
let clipSource = "sample";
let clipUrl;
let pendingClipUrl;
let clipRequest = 0;
let clipObservation = null;
let replayPlaying = false;
let replayTime = 0;
let lastTime = null;
const keys = new Set();

function make(tag, value, className) {
  const node = document.createElement(tag);
  if (value) node.textContent = value;
  if (className) node.className = className;
  return node;
}
function updateProfile() {
  $("profile-name").textContent = profile.riot || (profile.path === "beginner" ? "Beginner player" : "Demo player");
  $("profile-button").querySelector(".avatar").textContent = (profile.riot || (profile.path === "beginner" ? "B" : "D"))[0].toUpperCase();
  $("focus-copy").textContent = profile.path === "beginner"
    ? "Start with movement and cover. A barrier blocks incoming shots. When you see one hostile, aim at it and fire before moving through."
    : "Use the central cover to block one sightline while you clear the other. Reach extraction after both threats are down.";
}
function route() {
  const next = location.hash.slice(1);
  const page = ["arena", "play", "review", "progress"].includes(next) ? next : "arena";
  if (activePage === "arena" && page !== "arena" && running) pause();
  if (page !== "review") {
    replayPlaying = false;
    $("video").pause();
    renderReplay();
  }
  activePage = page;
  document.querySelectorAll("[data-page]").forEach(section => section.hidden = section.id !== page);
  document.querySelectorAll("[data-nav]").forEach(link => {
    if (link.dataset.nav === page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (page === "progress") renderProgress();
}

function rounded(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function line(ctx, a, b, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.lineWidth = 1;
}
function textAt(ctx, x, y, value, color, size = 10, align = "center") {
  ctx.fillStyle = color;
  ctx.font = "600 " + size + "px IBM Plex Mono, monospace";
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}
function ring(ctx, x, y, radius, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function drawMap(target, state, replay = false) {
  const ctx = target.getContext("2d");
  const { width, height, cover, spawn, exit } = E;
  ctx.clearRect(0, 0, width, height);
  const floor = ctx.createLinearGradient(0, 0, width, height);
  floor.addColorStop(0, "#1d1b31");
  floor.addColorStop(.5, "#121722");
  floor.addColorStop(1, "#202035");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, width, height);
  for (let x = 0; x < width; x += 24) line(ctx, {x,y:0}, {x,y:height}, x % 96 === 0 ? "#303047" : "#232638");
  for (let y = 0; y < height; y += 24) line(ctx, {x:0,y}, {x:width,y}, y % 96 === 0 ? "#303047" : "#232638");
  rounded(ctx, 24, 32, 852, 454, 13, null, "#44435a");
  ctx.setLineDash([5, 7]);
  line(ctx, {x:90,y:195}, {x:810,y:195}, "#3a3852");
  line(ctx, {x:90,y:417}, {x:810,y:417}, "#3a3852");
  ctx.setLineDash([]);
  const cleared = state.bots.every(bot => !bot.alive);
  rounded(ctx, 392, 43, 116, 57, 7, cleared ? "#214e47" : "#183532", "#4b8f85");
  rounded(ctx, 398, 49, 104, 45, 5, null, "#31746b");
  textAt(ctx, exit.x, 69, "EXTRACTION", "#94dfc7", 13);
  textAt(ctx, exit.x, 85, cleared ? "OPEN" : "CLEAR BOTH THREATS", "#82b7aa", 8);
  rounded(ctx, 388, 429, 124, 46, 7, "#322749", "#665590");
  textAt(ctx, spawn.x, 469, "OPERATOR SPAWN", "#beafd8", 8);
  textAt(ctx, 110, 205, "WEST LANE", "#827b9f", 10);
  textAt(ctx, 790, 205, "EAST LANE", "#827b9f", 10);
  for (const wall of cover) {
    rounded(ctx, wall.x, wall.y + 6, wall.w, wall.h, 6, "#0d1019", "#11121b");
    rounded(ctx, wall.x, wall.y, wall.w, wall.h, 6, "#2d3041", "#51506b");
    rounded(ctx, wall.x + 5, wall.y + 5, wall.w - 10, wall.h - 10, 3, "#252a3a", "#3b3d54");
    for (let x = wall.x + 10; x < wall.x + wall.w - 7; x += 12)
      line(ctx, {x,y:wall.y + 9}, {x:x + 5,y:wall.y + 14}, "#66607d");
    if (wall.label) textAt(ctx, wall.x + wall.w / 2, wall.y + wall.h / 2 + 4, wall.label, "#a4a0bb", 9);
  }
  const active = E.activeBots(state);
  const exposed = E.visibleBots(state);
  const multiple = exposed.length === 2;
  for (const bot of active) {
    const seen = exposed.includes(bot);
    if (seen) {
      ctx.setLineDash([4, 7]);
      line(ctx, bot, state.player, multiple ? "#ff7c8f" : "#b15567");
      ctx.setLineDash([]);
    }
    ring(ctx, bot.x, bot.y, 20, seen ? "#683247" : "#3f2639", "#a25167");
    ring(ctx, bot.x, bot.y, 10, "#ee8299", "#ffbcc8");
    textAt(ctx, bot.x, bot.y + 34, bot.side.toUpperCase(), "#f0a5b4", 8);
  }
  const { player, aim, flash } = state;
  if (flash && state.elapsed < flash.until) line(ctx, flash.from, flash.to, flash.enemy ? "#ff728a" : "#e6daff", 2);
  ring(ctx, player.x, player.y, 22, "#694ca969", "#9771e5");
  ring(ctx, player.x, player.y, 12, "#b89aff", "#e7d9ff");
  const angle = Math.atan2(aim.y - player.y, aim.x - player.x);
  line(ctx, player, { x:player.x + Math.cos(angle) * 27, y:player.y + Math.sin(angle) * 27 }, "#e4d5ff", 3);
  if (target === canvas && running) {
    line(ctx, {x:aim.x - 8,y:aim.y}, {x:aim.x + 8,y:aim.y}, "#ede4ff");
    line(ctx, {x:aim.x,y:aim.y - 8}, {x:aim.x,y:aim.y + 8}, "#ede4ff");
    if (goal) ring(ctx, goal.x, goal.y, 8, null, "#c4affe");
  }
  rounded(ctx, 35, 44, 132, 30, 5, "#181a28", "#3e3954");
  textAt(ctx, 47, 63, replay ? "TRAINING REPLAY" : "OPERATOR  " + "◆".repeat(Math.max(0,player.health)) + "◇".repeat(3 - Math.max(0,player.health)), "#cdb8fa", 10, "left");
  rounded(ctx, 752, 44, 111, 30, 5, multiple ? "#522739" : "#181a28", multiple ? "#8a4c65" : "#3e3954");
  textAt(ctx, 807, 63, multiple ? "DOUBLE EXPOSURE" : replay ? formatTime(state.elapsed) : Math.ceil(E.seconds - state.elapsed) + " s", multiple ? "#ffb4c1" : "#d2c4ee", 9);
}

function stage() {
  if (!evaluation || evaluation.done) return "practice";
  if (evaluation.rounds.length < 3) return "before";
  if (evaluation.rounds.length < 7) return "training";
  return "after";
}
const stageName = { practice: "Practice", before: "Baseline assessment", training: "Evaluation practice", after: "Repeat assessment" };
function plan() {
  const phase = stage();
  if (phase === "before" || phase === "after") {
    return { id: "standard", reason: "The assessment repeats the same three layouts and bot timing in both phases." };
  }
  const prior = phase === "training" ? evaluation.rounds.filter(row => row.stage === "training") : practice;
  return E.choosePolicy(policy, prior, profile.path === "beginner");
}
function logDecision(decision, index) {
  entries.unshift({ title: "R" + String(index + 1).padStart(2, "0") + " · " + E.policies[decision.id].name, reason: decision.reason });
  renderLog();
}
function renderLog() {
  const list = $("decision-log");
  list.replaceChildren();
  for (const entry of entries.slice(0, 8)) {
    const item = make("li");
    item.append(make("b", entry.title), entry.reason);
    list.append(item);
  }
  if (!entries.length) {
    const next = plan();
    const item = make("li");
    item.append(make("b", E.policies[next.id].name), next.reason);
    list.append(item);
  }
}
function toggleControls() {
  for (const id of ["adaptive", "fixed"]) {
    $(id).setAttribute("aria-pressed", id === policy);
    $(id).disabled = sprayMode || running || Boolean(evaluation && !evaluation.done) || Boolean(round.elapsed && !round.result);
  }
  const assessment = ["before", "after"].includes(stage());
  document.querySelectorAll("[data-gun]").forEach(button => button.disabled = assessment);
}
function renderHUD() {
  $("metric-cleared").replaceChildren(String(round.bots.filter(bot => !bot.alive).length) + " ", make("small", "/ 2"));
  $("metric-exposure").replaceChildren(round.exposure.toFixed(1), make("small", "s"));
  $("metric-accuracy").textContent = round.shots ? percent(round.hits / round.shots) : "—";
}
function resetLoadout() {
  inventory = Object.fromEntries(arsenal.map(id => [id, W.create(id)]));
  Object.assign(view, { yaw: 0, pitch: 0, height: E.eyeHeight });
  Object.assign(velocity, { x: 0, y: 0 });
  Object.assign(motion, { speed: 0, ads: false, crouched: false, airborne: false });
  zoom = trigger = pull = false;
  jumpAt = -1;
  feedbackUntil = hurtUntil = -1;
  range?.reset();
}
function renderCombat() {
  const weapon = inventory[gun];
  const remaining = Math.max(0, Math.ceil(E.seconds - round.elapsed));
  const cleared = round.bots.every(bot => !bot.alive);
  $("combat-clock").textContent = sprayMode ? "FREE PRACTICE" : "0:" + String(remaining).padStart(2, "0");
  $("combat-objective").textContent = sprayMode ? "FIRE AT THE COVER WALL" : cleared ? "EXTRACTION OPEN" : E.visibleBots(round).length === 2 ? "DOUBLE EXPOSURE" : "CLEAR TWO THREATS";
  $("combat-health").textContent = [0, 34, 67, 100][Math.max(0, round.player.health)];
  $("combat-weapon").textContent = weapon.reloadEnd ? "RELOADING" : weapon.spec.label;
  $("combat-ammo").replaceChildren(String(weapon.ammo) + " ", make("em", "/ " + weapon.reserve));
  const bloom = Math.min(24, 4 + W.error(weapon, motion, round.elapsed - weapon.firedAt > .38 ? 0 : weapon.streak) * 2.2);
  $("reticle").style.setProperty("--spread", bloom + "px");
  $("combat-feedback").hidden = round.elapsed >= feedbackUntil;
  $("damage-flash").classList.toggle("active", round.elapsed < hurtUntil);
  if (!range) {
    drawMap(canvas, round);
    return;
  }
  range.render(round, view, weapon, { running, ads: zoom, speed: motion.speed });
  const ctx = map.getContext("2d");
  ctx.clearRect(0, 0, 180, 102);
  ctx.save();
  ctx.scale(.2, .2);
  rounded(ctx, 25, 32, 850, 454, 12, "#132330e0", "#6a869b");
  for (const wall of E.cover) rounded(ctx, wall.x, wall.y, wall.w, wall.h, 4, "#647382");
  ring(ctx, E.exit.x, E.exit.y, 20, cleared ? "#77f6d4" : "#477267");
  for (const bot of E.visibleBots(round)) ring(ctx, bot.x, bot.y, 14, "#fa7e89");
  ring(ctx, round.player.x, round.player.y, 17, "#faf0db");
  line(ctx, round.player, {x:round.player.x+Math.sin(view.yaw)*44,y:round.player.y-Math.cos(view.yaw)*44}, "#fff8e9", 5);
  ctx.restore();
}
function renderArena() {
  const nextStage = stage();
  $("stage-label").textContent = sprayMode ? "Spray practice" : evaluation?.done ? "Evaluation complete" : stageName[nextStage];
  $("round-label").textContent = running ? "ROUND LIVE" : round.result ? round.result.outcome.toUpperCase() : round.elapsed ? "PAUSED" : "READY";
  $("game-overlay").hidden = running;
  $("overlay-title").textContent = overlayTitle;
  $("overlay-copy").textContent = overlayCopy;
  const buttonLabel = evaluation?.done ? "View results" : round.result ? "Next round" : round.elapsed ? "Resume round" : "Start round";
  $("start-round").replaceChildren(buttonLabel + " ", make("span", "→"));
  toggleControls();
  renderHUD();
  renderLog();
  renderCombat();
}
function releaseControls() {
  keys.clear();
  zoom = trigger = pull = false;
  touch = null;
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
function pause() {
  if (!running) return;
  running = false;
  releaseControls();
  goal = null;
  autoMove = false;
  overlayTitle = "Round paused";
  overlayCopy = "Resume when you’re ready. The round timer is paused.";
  renderArena();
}
function startRound() {
  if (evaluation?.done) {
    location.hash = "progress";
    return;
  }
  if (round.result || round.elapsed === 0) {
    const next = plan();
    const phase = stage();
    const index = evaluation ? evaluation.rounds.filter(row => row.stage === phase).length : practice.length;
    round = E.createRound(sprayMode ? "spray" : next.id, index);
    if (phase === "before" || phase === "after") equip("strike");
    resetLoadout();
    round.decision = next.reason;
    if (!sprayMode) logDecision(next, evaluation ? evaluation.rounds.length : index);
  }
  running = true;
  lastTime = null;
  renderArena();
  canvas.focus({ preventScroll: true });
  activateAudio();
  if (range && canvas.requestPointerLock && !matchMedia("(pointer: coarse)").matches) {
    try { canvas.requestPointerLock()?.catch(() => {}); } catch {}
  }
}
function recordRound() {
  running = false;
  goal = null;
  autoMove = false;
  releaseControls();
  const data = { ...round.result, reason: round.decision, stage: stage(), practicePolicy: policy, date: new Date().toISOString() };
  history = [data, ...history].slice(0, 150);
  storage.write("history", history);
  if (evaluation) {
    evaluation.rounds.push(data);
    if (evaluation.rounds.length === 10) {
      evaluation.done = true;
      evaluations = [evaluation, ...evaluations].slice(0, 40);
      storage.write("evaluations", evaluations);
    }
  } else {
    practice.push(data);
  }
  overlayTitle = evaluation?.done ? "Evaluation complete" : data.outcome;
  overlayCopy = evaluation?.done ? "Your baseline and repeat assessment are ready to compare." :
    data.isolated + "/2 threats cleared in isolation · " + data.exposure.toFixed(1) + " s double exposure.";
  renderArena();
}
function resetSession() {
  const unfinished = evaluation && !evaluation.done && evaluation.rounds.length;
  if (unfinished && !confirm("Restart this evaluation from the baseline? Its recorded rounds will remain in your history.")) return;
  if (evaluation?.done) evaluation = null;
  if (evaluation) evaluation.rounds = [];
  cleanArena();
}
function cleanArena() {
  running = false;
  practice = [];
  entries = [];
  releaseControls();
  goal = null;
  autoMove = false;
  round = E.createRound(sprayMode ? "spray" : plan().id);
  $("spray-mode").setAttribute("aria-pressed", sprayMode);
  $("spray-mode").textContent = sprayMode ? "Back to cover drill" : "Spray practice";
  if (["before", "after"].includes(stage())) equip("strike");
  resetLoadout();
  overlayTitle = sprayMode ? "Practice your spray" : "Ready to train?";
  overlayCopy = evaluation ? "Complete each round under the indicated assessment or practice conditions." :
    sprayMode ? "Fire into the cover wall. Compare taps and bursts, then pull down to control a full spray." :
    "Stay near cover. Clear one angle, then reach the extraction zone.";
  renderArena();
}
function point(event) {
  const bounds = canvas.getBoundingClientRect();
  return { x: (event.clientX - bounds.left) / bounds.width * E.width, y: (event.clientY - bounds.top) / bounds.height * E.height };
}
const movement = ["w","a","s","d","arrowup","arrowleft","arrowdown","arrowright"];
const actions = [...movement, "i","j","k","l"," ", "r", "q", "c", "shift", "1", "2", "3"];
const sensitivity = $("sensitivity");
sensitivity.value = storage.read("sensitivity", 1);
sensitivity.addEventListener("input", () => storage.write("sensitivity", Number(sensitivity.value)));
function equip(id) {
  gun = id;
  document.querySelectorAll("[data-gun]").forEach(btn => btn.setAttribute("aria-pressed", btn.dataset.gun === id));
}
function selectGun(id) {
  if (["before", "after"].includes(stage())) return;
  equip(id);
  if (!running) renderCombat();
}
document.querySelectorAll("[data-gun]").forEach(btn => btn.addEventListener("click", () => selectGun(btn.dataset.gun)));
function activateAudio() {
  if (!window.AudioContext) return;
  try {
    if (!audioContext) {
      audioContext = new AudioContext();
      noiseBuffer = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate*.17), audioContext.sampleRate);
      const samples = noiseBuffer.getChannelData(0);
      for (let i=0;i<samples.length;i++) samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (samples.length*.15));
    }
    audioContext.resume().catch(() => {});
  } catch {}
}
function playShot(id) {
  if (!audioContext || audioContext.state !== "running") return;
  const t = audioContext.currentTime;
  const noise = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  filter.type = "lowpass";
  filter.frequency.value = id === "veil" ? 850 : 2400;
  gain.gain.value = id === "veil" ? .21 : .32;
  noise.buffer = noiseBuffer;
  noise.connect(filter).connect(gain).connect(audioContext.destination);
  noise.start(t);
  const thump = audioContext.createOscillator();
  const volume = audioContext.createGain();
  thump.frequency.setValueAtTime(119,t);
  thump.frequency.exponentialRampToValueAtTime(41,t+.065);
  volume.gain.setValueAtTime(.09,t);
  volume.gain.exponentialRampToValueAtTime(.001,t+.09);
  thump.connect(volume).connect(audioContext.destination);
  thump.start(t);
  thump.stop(t+.10);
}
function aim(dx, dy) {
  const gain = Number(sensitivity.value) * (zoom ? .00145 : .0026);
  view.yaw += dx * gain;
  view.pitch = Math.max(-1.42, Math.min(1.42, view.pitch - dy * gain));
}
function fireCurrent() {
  const weapon = inventory[gun];
  if (sprayMode && !weapon.reserve) weapon.reserve = weapon.spec.reserve;
  if (!weapon.ammo) { W.reload(weapon, round.elapsed); return; }
  const ray = W.shot(weapon, round.elapsed, motion, view);
  if (!ray) return;
  const shot = E.fire(round, range ? ray : undefined);
  if (!shot && !range) return;
  range?.bullet(round, ray, shot);
  playShot(gun);
  if (shot?.hit) {
    $("combat-feedback").textContent = shot.head ? "HEADSHOT" : shot.killed ? "THREAT CLEARED" : "HIT";
    feedbackUntil = round.elapsed + .36;
  }
}
window.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  if (key === "escape" && running) { pause(); return; }
  if (!running || $("profile-dialog").open || !actions.includes(key) || ["BUTTON","A","SELECT","INPUT"].includes(document.activeElement.tagName)) return;
  event.preventDefault();
  keys.add(key);
  if (movement.includes(key)) goal = null;
  if (event.repeat) return;
  if (key === " ") { trigger = pull = true; }
  if (key === "r") W.reload(inventory[gun], round.elapsed);
  if (key === "q" && jumpAt < 0) jumpAt = round.elapsed;
  if (["1", "2", "3"].includes(key)) selectGun(arsenal[Number(key)-1]);
});
window.addEventListener("keyup", event => {
  const key = event.key.toLowerCase();
  keys.delete(key);
  if (key === " ") trigger = false;
});
window.addEventListener("blur", () => { keys.clear(); trigger = zoom = false; });
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== canvas && running) pause();
});
document.addEventListener("mousemove", event => {
  if (running && range && document.pointerLockElement === canvas) aim(event.movementX, event.movementY);
});
canvas.tabIndex = 0;
canvas.addEventListener("contextmenu", event => { if (running) event.preventDefault(); });
canvas.addEventListener("pointermove", event => {
  if (!running) return;
  if (!range && event.pointerType !== "touch") round.aim = point(event);
  if (!range || document.pointerLockElement === canvas) return;
  if (touch && touch.id === event.pointerId) {
    const dx = event.clientX - touch.x;
    const dy = event.clientY - touch.y;
    touch.x = event.clientX;
    touch.y = event.clientY;
    touch.travel += Math.abs(dx) + Math.abs(dy);
    if (touch.right) aim(dx * 2, dy * 2);
    else {
      touch.strafe = Math.max(-1, Math.min(1, (event.clientX-touch.originX)/36));
      touch.forward = Math.max(-1, Math.min(1, (touch.originY-event.clientY)/36));
    }
  } else if (event.pointerType === "mouse" && event.movementX !== undefined) aim(event.movementX, event.movementY);
});
canvas.addEventListener("pointerdown", event => {
  if (!running || ![0,2].includes(event.button)) return;
  canvas.focus({ preventScroll: true });
  activateAudio();
  if (event.button === 2) { zoom = true; return; }
  if (event.pointerType === "touch" && range) {
    if (touch) return;
    canvas.setPointerCapture(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    touch = { id:event.pointerId, x:event.clientX, y:event.clientY, originX:event.clientX, originY:event.clientY,
      right:event.clientX>rect.left+rect.width/2, travel:0, strafe:0, forward:0 };
    return;
  }
  if (!range) {
    round.aim = point(event);
    if (event.pointerType === "touch") {
      const target = E.visibleBots(round).some(bot => Math.hypot(bot.x - round.aim.x, bot.y - round.aim.y) < 29);
      if (target) E.fire(round);
      else { goal = round.aim; autoMove = true; }
      return;
    }
  }
  trigger = pull = true;
});
window.addEventListener("pointerup", event => {
  if (event.pointerType === "touch" && touch?.id === event.pointerId) {
    if (touch.right && touch.travel < 12) pull = true;
    touch = null;
  }
  if (event.button === 2) zoom = false;
  if (event.button === 0) trigger = false;
});
canvas.addEventListener("pointercancel", () => { touch = null; trigger = zoom = false; });
function signed(positive, negative) { return Number(positive) - Number(negative); }
function simulate(dt) {
  let x = signed(keys.has("d") || keys.has("arrowright"), keys.has("a") || keys.has("arrowleft"));
  let y = signed(keys.has("w") || keys.has("arrowup"), keys.has("s") || keys.has("arrowdown"));
  const health = round.player.health;
  if (range) {
    if (touch && !touch.right) { x = touch.strafe; y = touch.forward; }
    view.yaw += signed(keys.has("l"), keys.has("j")) * dt * 1.6;
    view.pitch = Math.max(-1.42,Math.min(1.42,view.pitch + signed(keys.has("i"), keys.has("k")) * dt * 1.2));
    const crouched = keys.has("c");
    const limit = crouched ? .34 : keys.has("shift") || zoom ? .49 : .82;
    const norm = Math.max(1,Math.hypot(x,y));
    const worldX = (Math.cos(view.yaw)*x + Math.sin(view.yaw)*y) * limit / norm;
    const worldY = (Math.sin(view.yaw)*x - Math.cos(view.yaw)*y) * limit / norm;
    velocity.x = W.damp(velocity.x,worldX, worldX ? 20 : 30,dt);
    velocity.y = W.damp(velocity.y,worldY, worldY ? 20 : 30,dt);
    const jumpProgress = jumpAt < 0 ? 1 : (round.elapsed-jumpAt)/.65;
    let jump = 0;
    if (jumpProgress < 1) jump = Math.sin(jumpProgress*Math.PI)*16;
    else jumpAt = -1;
    view.height = W.damp(view.height, (crouched ? 27 : E.eyeHeight) + jump, 26, dt);
    round.player.eye = view.height;
    motion.speed = Math.hypot(velocity.x,velocity.y) / .82;
    motion.crouched = crouched;
    motion.airborne = jumpAt >= 0;
    motion.ads = zoom;
    E.update(round, dt, velocity.x, velocity.y);
  } else {
    if (goal && autoMove) {
      x = goal.x - round.player.x;
      y = round.player.y - goal.y;
      if (Math.hypot(x, y) < 7 || E.cover.some(wall => goal.x>wall.x && goal.x<wall.x+wall.w && goal.y>wall.y && goal.y<wall.y+wall.h)) {
        goal = null;
        x = y = 0;
      }
    }
    round.aim.x = Math.min(E.width, Math.max(0, round.aim.x + signed(keys.has("l"),keys.has("j"))*dt*420));
    round.aim.y = Math.min(E.height, Math.max(0, round.aim.y + signed(keys.has("k"),keys.has("i"))*dt*420));
    E.update(round, dt, x, -y);
  }
  if (round.player.health < health) hurtUntil = round.elapsed + .21;
  for (const weapon of Object.values(inventory)) W.update(weapon, round.elapsed, dt);
  if (!round.result && (pull || trigger && !inventory[gun].spec.semi)) fireCurrent();
  pull = false;
}
function tick(now) {
  const dt = lastTime === null ? 0 : Math.min(.05, (now - lastTime) / 1000);
  lastTime = now;
  if (running) {
    simulate(dt);
    if (round.result) recordRound();
    else {
      renderHUD();
      renderCombat();
    }
  }
  if (replayPlaying && activePage === "review") {
    replayTime = Math.min(7, replayTime + dt);
    if (replayTime >= 7) replayPlaying = false;
    renderReplay();
  }
  requestAnimationFrame(tick);
}
function renderReplay() {
  if (clipSource !== "sample") return;
  $("scrub").value = replayTime;
  $("replay-time").textContent = formatTime(replayTime);
  $("replay-play").textContent = replayPlaying ? "❚❚" : "▶";
  $("replay-play").setAttribute("aria-label", replayPlaying ? "Pause replay" : "Play replay");
  drawMap($("replay"), E.sampleAt(replayTime), true);
}
function findingContent(tag, title, body, instruction) {
  const div = document.createDocumentFragment();
  div.append(make("span", tag, "tag"), make("h3", title), make("p", body), make("p", instruction));
  return div;
}
function seekButton(time) {
  const button = make("button", "Jump to " + formatTime(time), "button ghost");
  button.addEventListener("click", () => {
    if (clipSource === "sample") {
      replayPlaying = false;
      replayTime = time;
      renderReplay();
    } else {
      $("video").currentTime = time;
    }
  });
  return button;
}
function renderReport() {
  const body = $("report-body");
  if (clipSource === "sample") {
    const finding = E.sampleFinding();
    body.replaceChildren(findingContent(
      "HIGH CONFIDENCE · SIMULATOR",
      "Two threat lanes visible",
      "At " + formatTime(finding.timestamp) + ", the operator has a clear line of sight to both active threats. The replay geometry shows about " + finding.duration.toFixed(1) + " seconds of double exposure.",
      "Use the central barrier to block the far threat while you clear the near angle."
    ), seekButton(finding.timestamp));
  } else if (clipObservation) {
    const phrase = clipObservation.issue === "exposure"
      ? "You marked two visible threat lanes. Check whether moving behind nearby cover would block one lane before you cross."
      : "You marked a corner crossing. Review whether checking the near sightline earlier would give you more time to react.";
    const revise = make("button", "Edit finding", "button ghost");
    revise.addEventListener("click", () => { clipObservation = null; renderReport(); });
    body.replaceChildren(findingContent("NEEDS CONTEXT · PLAYER TAG", "Observation at " + formatTime(clipObservation.timestamp),
      phrase, "Check teammate calls, timing and available cover before interpreting the decision."),
      seekButton(clipObservation.timestamp), revise);
  } else {
    const select = make("select");
    select.id = "issue-type";
    const exposure = make("option", "Two visible threat lanes");
    exposure.value = "exposure";
    const corner = make("option", "Crossing an uncleared corner");
    corner.value = "corner";
    select.append(exposure, corner);
    const label = make("label", "What do you see?", "field");
    label.append(select);
    const mark = make("button", "Mark current moment", "button ghost");
    mark.addEventListener("click", () => {
      clipObservation = { issue: select.value, timestamp: $("video").currentTime };
      renderReport();
    });
    body.replaceChildren(make("p", "Pause at a useful moment and tag what you can see. CLUTCHUP will turn your annotation into a timestamped coaching finding."), label, mark);
  }
  $("assign").disabled = clipSource !== "sample" && !clipObservation;
}
function discardVideo() {
  $("video").pause();
  $("video").removeAttribute("src");
  $("video").load();
  if (clipUrl) URL.revokeObjectURL(clipUrl);
  clipUrl = undefined;
}
function cancelPendingClip() {
  clipRequest += 1;
  if (pendingClipUrl) URL.revokeObjectURL(pendingClipUrl);
  pendingClipUrl = undefined;
}
function loadSample() {
  cancelPendingClip();
  discardVideo();
  clipSource = "sample";
  clipObservation = null;
  replayTime = 0;
  replayPlaying = false;
  $("video").hidden = true;
  $("replay").hidden = false;
  $("replay-controls").hidden = false;
  $("clip-title").textContent = "Simulator replay";
  $("clip-type").textContent = "Built-in training footage";
  $("clip-status").textContent = "Choose an MP4, WebM or MOV clip up to 90 seconds and 100 MB. Video stays in your browser.";
  renderReplay();
  renderReport();
}
function uploadClip(file) {
  cancelPendingClip();
  if (!/\.(mp4|webm|mov)$/i.test(file.name) || file.size > 100 * 1024 * 1024 || !file.size) {
    $("clip-status").textContent = "Choose a nonempty MP4, WebM or MOV file up to 100 MB.";
    return;
  }
  const token = clipRequest;
  const url = URL.createObjectURL(file);
  pendingClipUrl = url;
  const probe = document.createElement("video");
  probe.preload = "metadata";
  $("clip-status").textContent = "Reading clip metadata…";
  probe.onloadedmetadata = () => {
    if (token !== clipRequest) return;
    if (!Number.isFinite(probe.duration) || probe.duration <= 0 || probe.duration > 90 || !probe.videoWidth) {
      cancelPendingClip();
      $("clip-status").textContent = "Choose a video with a readable duration of 90 seconds or less.";
      return;
    }
    discardVideo();
    clipSource = "upload";
    clipObservation = null;
    replayPlaying = false;
    clipUrl = url;
    pendingClipUrl = undefined;
    $("video").src = url;
    $("video").hidden = false;
    $("replay").hidden = true;
    $("replay-controls").hidden = true;
    $("clip-title").textContent = file.name;
    $("clip-type").textContent = "Uploaded clip · " + formatTime(probe.duration);
    $("clip-status").textContent = "Clip ready for local review. Tag a moment using the coaching panel.";
    renderReport();
  };
  probe.onerror = () => {
    if (token !== clipRequest) return;
    cancelPendingClip();
    $("clip-status").textContent = "Your browser could not decode this clip. Try an H.264 MP4 or a VP8 WebM.";
  };
  probe.src = url;
}

function averages(rows) {
  const sum = (field) => rows.reduce((total, row) => total + Number(row[field]), 0);
  return { rate: sum("isolated") / (rows.length * 2), exposure: sum("exposure") / rows.length, extraction: sum("success") / rows.length };
}
function addRow(parent, label, value) {
  const row = make("div", undefined, "row");
  row.append(make("b", label), make("span", value));
  parent.append(row);
}
function renderProgress() {
  const comparison = $("comparison-data");
  const list = $("history");
  comparison.replaceChildren();
  for (const mode of ["fixed", "adaptive"]) {
    const runs = evaluations.filter(run => run.policy === mode);
    comparison.append(make("h3", (mode === "fixed" ? "Fixed bot" : "Adaptive bot") + " · " + runs.length + " " + (runs.length === 1 ? "run" : "runs")));
    if (!runs.length) {
      comparison.append(make("p", "Complete an evaluation to add measured results.", "small"));
      continue;
    }
    const rounds = runs.flatMap(run => run.rounds);
    const before = averages(rounds.filter(row => row.stage === "before"));
    const after = averages(rounds.filter(row => row.stage === "after"));
    addRow(comparison, "Isolated clears", percent(before.rate) + " → " + percent(after.rate));
    addRow(comparison, "Mean double exposure", before.exposure.toFixed(1) + " s → " + after.exposure.toFixed(1) + " s");
    addRow(comparison, "Extraction rate", percent(before.extraction) + " → " + percent(after.extraction));
  }
  list.replaceChildren();
  if (!history.length) list.append(make("p", "Your completed rounds will appear here.", "small"));
  const recent = make("div", undefined, "history-table");
  for (const row of history.slice(0, 12)) {
    addRow(recent, stageName[row.stage] + " · " + E.policies[row.policy].name,
      row.outcome + " · " + row.isolated + "/2 isolated · " + row.exposure.toFixed(1) + " s");
  }
  list.append(recent);
  const drills = readRangeSessions();
  const rangeHistory = $("range-history");
  rangeHistory.replaceChildren();
  for (const drill of drills.slice(-5).reverse()) {
    addRow(rangeHistory, rangeModes[drill.m], drill.score + " score · " + drill.acc + "% accuracy");
  }
  if (!drills.length) rangeHistory.append(make("p", "Finish a VALOTRAINER drill to save a result here.", "small"));
  $("export").disabled = history.length === 0 && drills.length === 0;
}
const rangeModes = { gridshot: "Gridshot", flick: "Flick Shot", tracking: "Tracking", bots: "Range Bots", ascent: "Ascent B Study", corrode: "Corrode B", summit: "Summit B" };
function readRangeSessions() {
  try {
    const sessions = JSON.parse(localStorage.getItem("vlt_history_v1"));
    return Array.isArray(sessions) ? sessions.filter(run => run && Object.hasOwn(rangeModes, run.m) &&
      Number.isFinite(run.score) && Number.isFinite(run.acc)) : [];
  } catch {
    return [];
  }
}
function startEvaluation() {
  if (evaluation && !evaluation.done) { location.hash = "arena"; return; }
  policy = $("evaluation-policy").value;
  sprayMode = false;
  $("spray-mode").setAttribute("aria-pressed", "false");
  evaluation = { policy, rounds: [], done: false, startedAt: new Date().toISOString() };
  cleanArena();
  location.hash = "arena";
}
$("export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ schema: 1, evaluations, rounds: history, rangeSessions: readRangeSessions() }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = make("a");
  link.href = url;
  link.download = "clutchup-results.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("profile-button").addEventListener("click", () => {
  pause();
  $("profile-path").value = profile.path;
  $("riot-id").value = profile.riot;
  $("profile-dialog").showModal();
});
$("close-profile").addEventListener("click", () => $("profile-dialog").close());
$("profile-form").addEventListener("submit", event => {
  event.preventDefault();
  profile = { path: $("profile-path").value, riot: $("riot-id").value.trim() };
  storage.write("profile", profile);
  $("profile-dialog").close();
  updateProfile();
  if (!round.elapsed && !evaluation) cleanArena();
});
for (const mode of ["adaptive", "fixed"]) $(mode).addEventListener("click", () => {
  if (mode === policy) return;
  if (evaluation?.done) evaluation = null;
  policy = mode;
  cleanArena();
});
$("video").addEventListener("error", () => {
  if (clipSource === "upload") $("clip-status").textContent = "Playback failed with this codec. Try an H.264 MP4 or a VP8 WebM.";
});
$("sample").addEventListener("click", loadSample);
$("upload").addEventListener("change", event => {
  const file = event.target.files[0];
  if (file) uploadClip(file);
  event.target.value = "";
});
$("replay-play").addEventListener("click", () => {
  if (replayTime >= 7) replayTime = 0;
  replayPlaying = !replayPlaying;
  renderReplay();
});
$("scrub").addEventListener("input", event => {
  replayTime = Number(event.target.value);
  renderReplay();
});
$("assign").addEventListener("click", () => {
  if (sprayMode) {
    sprayMode = false;
    $("spray-mode").setAttribute("aria-pressed","false");
    cleanArena();
  }
  if (evaluation?.done) { evaluation = null; cleanArena(); }
  location.hash = "arena";
});
$("start-round").addEventListener("click", startRound);
$("reset").addEventListener("click", resetSession);
$("spray-mode").addEventListener("click", () => {
  if (evaluation && !evaluation.done) {
    if (!confirm("End this evaluation and open spray practice? Completed rounds remain in your history.")) return;
  }
  evaluation = null;
  sprayMode = !sprayMode;
  cleanArena();
});
$("evaluate").addEventListener("click", startEvaluation);
window.addEventListener("hashchange", route);
updateProfile();
loadSample();
cleanArena();
route();
requestAnimationFrame(tick);
