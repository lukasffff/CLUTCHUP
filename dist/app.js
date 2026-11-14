"use strict";
const E = window.Clutch;
const $ = id => document.getElementById(id);
const storage = {
  read(key, fallback) {
    try { return JSON.parse(localStorage.getItem("clutchiq." + key)) ?? fallback; }
    catch { return fallback; }
  },
  write(key, value) {
    try { localStorage.setItem("clutchiq." + key, JSON.stringify(value)); }
    catch { /* Keep this session usable with storage disabled. */ }
  }
};
const canvas = $("arena-canvas");
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
  const page = ["arena", "review", "progress"].includes(next) ? next : "arena";
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
    $(id).disabled = running || Boolean(evaluation && !evaluation.done) || Boolean(round.elapsed && !round.result);
  }
}
function renderHUD() {
  $("metric-cleared").replaceChildren(String(round.hits) + " ", make("small", "/ 2"));
  $("metric-exposure").replaceChildren(round.exposure.toFixed(1), make("small", "s"));
  $("metric-accuracy").textContent = round.shots ? percent(round.hits / round.shots) : "—";
}
function renderArena() {
  const nextStage = stage();
  $("stage-label").textContent = evaluation?.done ? "Evaluation complete" : stageName[nextStage];
  $("round-label").textContent = running ? "ROUND LIVE" : round.result ? round.result.outcome.toUpperCase() : round.elapsed ? "PAUSED" : "READY";
  $("game-overlay").hidden = running;
  $("overlay-title").textContent = overlayTitle;
  $("overlay-copy").textContent = overlayCopy;
  const buttonLabel = evaluation?.done ? "View results" : round.result ? "Next round" : round.elapsed ? "Resume round" : "Start round";
  $("play").replaceChildren(buttonLabel + " ", make("span", "→"));
  toggleControls();
  renderHUD();
  renderLog();
  drawMap(canvas, round);
}
function pause() {
  if (!running) return;
  running = false;
  keys.clear();
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
    round = E.createRound(next.id, index);
    round.decision = next.reason;
    logDecision(next, evaluation ? evaluation.rounds.length : index);
  }
  running = true;
  lastTime = null;
  renderArena();
  canvas.focus({ preventScroll: true });
}
function recordRound() {
  running = false;
  goal = null;
  autoMove = false;
  keys.clear();
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
  keys.clear();
  goal = null;
  autoMove = false;
  round = E.createRound(plan().id);
  overlayTitle = "Ready to train?";
  overlayCopy = evaluation ? "Complete each round under the indicated assessment or practice conditions." :
    "Stay near cover. Clear one angle, then reach the extraction zone.";
  renderArena();
}
function point(event) {
  const bounds = canvas.getBoundingClientRect();
  return { x: (event.clientX - bounds.left) / bounds.width * E.width, y: (event.clientY - bounds.top) / bounds.height * E.height };
}
const movement = ["w","a","s","d","arrowup","arrowleft","arrowdown","arrowright"];
const actions = [...movement, "i","j","k","l"," "];
window.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  if (!running || $("profile-dialog").open || !actions.includes(key) || ["BUTTON","A","SELECT","INPUT"].includes(document.activeElement.tagName)) return;
  event.preventDefault();
  keys.add(key);
  if (movement.includes(key)) goal = null;
  if (key === " " && !event.repeat) E.fire(round);
});
window.addEventListener("keyup", event => keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
canvas.tabIndex = 0;
canvas.addEventListener("pointermove", event => {
  if (running && event.pointerType !== "touch") round.aim = point(event);
});
canvas.addEventListener("pointerdown", event => {
  if (!running || event.button !== 0) return;
  canvas.focus({ preventScroll: true });
  round.aim = point(event);
  if (event.pointerType === "touch") {
    const target = E.visibleBots(round).some(bot => Math.hypot(bot.x - round.aim.x, bot.y - round.aim.y) < 29);
    if (target) { E.fire(round); return; }
    goal = round.aim;
    autoMove = true;
    return;
  }
  E.fire(round);
});
function signed(positive, negative) { return Number(positive) - Number(negative); }
function tick(now) {
  const dt = lastTime === null ? 0 : Math.min(.04, (now - lastTime) / 1000);
  lastTime = now;
  if (running) {
    let x = signed(keys.has("d") || keys.has("arrowright"), keys.has("a") || keys.has("arrowleft"));
    let y = signed(keys.has("s") || keys.has("arrowdown"), keys.has("w") || keys.has("arrowup"));
    if (goal && autoMove) {
      x = goal.x - round.player.x;
      y = goal.y - round.player.y;
      if (Math.hypot(x, y) < 7 || !E.cover.every(wall => goal.x <= wall.x || goal.x >= wall.x + wall.w || goal.y <= wall.y || goal.y >= wall.y + wall.h)) {
        goal = null;
        x = 0;
        y = 0;
      }
    }
    round.aim.x = Math.min(E.width, Math.max(0, round.aim.x + signed(keys.has("l"), keys.has("j")) * dt * 420));
    round.aim.y = Math.min(E.height, Math.max(0, round.aim.y + signed(keys.has("k"), keys.has("i")) * dt * 420));
    E.update(round, dt, x, y);
    if (round.result) recordRound();
    else {
      renderHUD();
      drawMap(canvas, round);
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
    body.replaceChildren(make("p", "Pause at a useful moment and tag what you can see. ClutchIQ will turn your annotation into a timestamped coaching finding."), label, mark);
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
  $("export").disabled = history.length === 0;
}
function startEvaluation() {
  if (evaluation && !evaluation.done) { location.hash = "arena"; return; }
  policy = $("evaluation-policy").value;
  evaluation = { policy, rounds: [], done: false, startedAt: new Date().toISOString() };
  cleanArena();
  location.hash = "arena";
}
$("export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ schema: 1, evaluations, rounds: history }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = make("a");
  link.href = url;
  link.download = "clutchiq-results.json";
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
  if (evaluation?.done) { evaluation = null; cleanArena(); }
  location.hash = "arena";
});
$("play").addEventListener("click", startRound);
$("reset").addEventListener("click", resetSession);
$("evaluate").addEventListener("click", startEvaluation);
window.addEventListener("hashchange", route);
updateProfile();
loadSample();
cleanArena();
route();
requestAnimationFrame(tick);
