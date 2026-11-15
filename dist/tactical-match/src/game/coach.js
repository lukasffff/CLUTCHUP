import {EVALUATION_RULES} from '../../../evaluation.js';
import * as THREE from 'three';
import { AGENTS, SLOTS } from './agents.js';
import { lessons, findings, passed, save, read, STORE, PROFILE, next, sessionURL } from '../../../coach-model.js';

import { CoachDemonstration, DEMO_TIME } from './demonstration.js';
import { BENCHMARK_RULES } from '../../../benchmark.js';
import { HabitsTracker, profileKey, summarizeHabits, chooseOpponentTactic } from '../../../player-habits.js';

const eye = new THREE.Vector3(), foe = new THREE.Vector3(), ray = new THREE.Vector3(), view = new THREE.Vector3();
const label = { assessment: 'Live assessment', training: 'Coached exercise', reassessment: 'Reassessment', practice: 'Custom practice' };
const nav = 'harbor';
export class TacticalCoach {
  constructor(game) {
    this.game = game;
    this.plan = game.coaching;
    this.count = 0;
    this.playerKey = profileKey(read(PROFILE, {}));
    this.demonstration = new CoachDemonstration(game, (title, text) => this.display(title, text, false));
    this.el = document.createElement('aside');
    this.el.id = 'coach-field';
    this.el.setAttribute('aria-label', 'ClutchIQ field coach');
    this.title = document.createElement('strong');
    this.copy = document.createElement('span');
    this.link = document.createElement('a');
    this.link.href = '../#training';
    this.link.textContent = 'Back to coaching →';
    this.el.append(this.title, this.copy, this.link);
    document.body.append(this.el);
    document.body.classList.add('coach-mode');
    const style = document.createElement('style');
    style.textContent = '.coach-demonstration #hud-pause,.coach-demonstration #hud-msg,.coach-demonstration #ability-hud{display:none!important}#coach-field{position:fixed;z-index:100;left:16px;bottom:78px;max-width:min(385px,64vw);display:grid;gap:5px;padding:12px 14px;background:#101d24eb;border:1px solid #3c726a;border-radius:8px;color:#e4f8f1;font:13px/1.3 system-ui;pointer-events:none}#coach-field strong{color:#8bf1c0}#coach-field a{color:#a7ffd4;pointer-events:auto;width:max-content;padding:2px 0}.coach-mode #hud #mp-panel,.coach-mode #hud #hud-map-select,.coach-mode #hud #hud-map-picker,.coach-mode #hud .mn-map-carousel{display:none!important}#coach-guide{position:fixed;z-index:48;width:11px;height:11px;transform:translate(-50%,-50%);border:1px solid #7cfddd;border-radius:50%;pointer-events:none;box-shadow:0 0 9px #59ffba}';
    document.head.append(style);
    this.guide = document.createElement('div');
    this.guide.id = 'coach-guide';
    this.guide.hidden = true;
    document.body.append(this.guide);
    const heading = this.plan.evaluation ? 'Controlled comparison - '+this.plan.evaluation : this.plan.duel ? 'Harbor 1v1 · ' + (lessons[this.plan.lesson]?.title || label[this.plan.phase]) : label[this.plan.phase];
    this.display(heading, 'Choose an agent, then click Play vs Bots. Controls are in Settings.', true);
    const on = (event, fn) => game.events.on(event, fn);
    on('round:start', e => this.start(e.round));
    on('round:phase', e => {
      if (e.phase === 'live') this.demonstration.stop();
      if (e.phase === 'live') this.display(this.plan.phase === 'training' ? 'Practice - ' + (lessons[this.plan.lesson]?.title || 'Training') : lessons[this.plan.lesson]?.title || label[this.plan.phase],
        this.plan.lesson === 'utility' ? this.utilityHint() : this.plan.side === 't' ? 'Carry the device to A or B. Stop and hold ' + game.settings.getLabel('use') + ' to plant.' : (lessons[this.plan.lesson]?.focus || 'Defend the sites. If the device is planted, hold ' + game.settings.getLabel('use') + ' next to it.'), false);
      if (e.phase === 'planted' && this.plan.side === 't') this.display('Device armed', 'Find cover and protect the site until the timer runs out.', false);
    });
    on('coach:shot', () => this.shot());
    on('coach:hit', e => {
      if (!this.data) return;
      this.data.hits++;
      if (e.part === 'head') this.data.head++;
      if (e.part === 'legs') this.data.legs++;
    });
    on('player:damage', e => { if (this.data) { this.data.damageTaken += e.amount || 0; this.damageAt = this.data.aliveSeconds; } });
    on('player:death', () => { if (this.data) this.data.died = true; });
    on('kill', e => { if (this.data && e.killerIsLocal && e.killerTeam !== e.victimTeam) this.data.kills++; });
    on('utility:bot', entry => this.log(entry.name + ' used ' + entry.ability + ' to ' + entry.reason + '.'));
    on('utility:cast', entry => {
      if (!this.data || this.plan.lesson !== 'utility') return;
      this.display(entry.name + ' deployed', 'Use the opening while the ability is active. Check your report for its measured effect.', false);
    });
    on('grenade:throw', e => { if (this.data && e?.byPlayer !== false && !e?.bot && !e?.isBot) this.data.utility++; });
    on('bomb:planted', e => { if (this.data && e.by === game.player) this.data.plants++; });
    on('coach:bot-tactic', e => this.log(e.name + ': ' + e.reason));
    on('coach:bot-cover', e => this.log(e.name + ' took cover after taking damage and finding a reachable covered waypoint.'));
    on('round:end', e => this.finish(e));
  }
  utilityHint() {
    const agent = AGENTS[this.game.abilities?.playerState?.id];
    if (!agent) return lessons.utility.focus;
    const [first, second] = agent.kit;
    const key = slot => this.game.settings.getLabel(SLOTS[slot]);
    const follow = {
      Controller: 'Screen a defender’s sightline before you or a teammate crosses.',
      Duelist: 'Use cover to get close. Dash toward the next piece of cover, or flash a corner and move after the burst.',
      Initiator: 'Scan the lane before your team crosses. Use a radar contact to pick the next angle.',
      Sentinel: 'Set up on an approach enemies can reach. Leave an exit open for teammates rotating back.'
    };
    const site = this.plan.site ? ' Work the approach to site ' + this.plan.site + '.' : '';
    return key(0) + ' · ' + first.name + '  /  ' + key(1) + ' · ' + second.name + '. ' + follow[agent.role] + site;
  }

  display(title, copy, link) {
    this.title.textContent = title; this.copy.textContent = copy; this.link.hidden = !link;
  }
  start(round) {
    this.data = { shots:0,hits:0,head:0,legs:0,kills:0,movingShots:0,aimSamples:0,belowHead:0,aboveHead:0,coveredSeconds:0,exposedSeconds:0,engagements:0,damageResets:0,
      aliveSeconds:0,multiSeconds:0,damageTaken:0,died:false,plants:0,defuses:0,utility:0,
      planters: this.plan.side === 't' ? 1 : 0 };
    this.clock = 0;
    this.damageAt = -99;
    this.previouslyExposed = null;
    this.duelPlayerSample = null;
    this.botStates = {};
    this.habits = new HabitsTracker();
    this.peekWatch = null;
    this.peekSearchTried = false;
    this.adaptations = [];
    if (this.game.roundTactic) this.logTactic(this.game.roundTactic);
    if (this.plan.challenge) this.log('Challenge: normal bot reactions. The aim guide is off.');
    if (this.plan.reactionDelay) this.log('Enemy first-shot delay increased by ' + this.plan.reactionDelay.toFixed(2) + ' s for the '+(this.plan.support ? 'supported retry' : 'standard guided lesson')+'.');
    this.round = round;
    if (this.plan.benchmark && round === 1) this.benchmarkRun = crypto.randomUUID();
    this.count++;
    if (this.plan.duel) Object.assign(this.data, { peeks: 0, unreadyPeeks: 0, coverResets: 0 });
    if (this.plan.demo && round === 1) {
      this.game.state.timer = DEMO_TIME + .2;
      this.demonstration.start(this.plan.lesson);
    }
    if (this.plan.benchmark) {
      this.display('Assessment · ' + round + '/3', 'Follow the same approach and conditions before and after training. Fixed pistols; utility and buying are disabled.', false);
    } else if (!this.game.roundTactic) {
      this.display(lessons[this.plan.lesson]?.title || label[this.plan.phase], lessons[this.plan.lesson]?.goal || 'Buy gear with B. A live round will start shortly.', false);
    }
  }
  log(message) {
    if (this.adaptations && this.adaptations.length < 16) this.adaptations.push({ at: +(this.data?.aliveSeconds || 0).toFixed(1), message });
  }
  logTactic(tactic) {
    const verb = tactic.type === 'hold-lane' ? 'Set the defensive patrol to ' :
      tactic.type === 'watch-peek' ? 'Started moving to a position to watch the repeated peek at ' : 'Assigned the attack route ';
    const entry = { ...tactic, at: +(this.data?.aliveSeconds || 0).toFixed(1), message: verb + tactic.choice + '. ' + tactic.reason + (tactic.previous ? ' Previous assignment: '+tactic.previous+'.' : '') };
    this.adaptations.push(entry);
    this.display('Opponent adjusted its plan', entry.message, false);
  }

  applyHistoryTactics(attackers, routes, defenders, areas) {
    if (!this.plan.duel || this.plan.benchmark || this.plan.evaluation === 'fixed') return;
    this.history = summarizeHabits(read(STORE, []), this.playerKey, this.plan.side, this.plan.lesson);
    const bots = this.game.bots;
    const tactic = chooseOpponentTactic(this.history, this.plan.side, bots._targetSite?.name, routes, areas);
    if (!tactic) return;
    if (tactic.type === 'hold-lane' && defenders[0]) {
      const bot = defenders[0], area = areas.find(candidate => candidate.name === tactic.choice);
      tactic.previous = bot.patrolArea || null;
      if (tactic.previous === tactic.choice) return;
      bot.anchor.copy(area.anchor);
      bot.patrolArea = area.name;
      bot.patrolPoints = area.points;
    } else if (tactic.type === 'attack-route' && attackers[0]) {
      const bot = attackers[0];
      tactic.previous = bot.routeName || null;
      if (tactic.previous === tactic.choice) {
        const alternative = routes.find(candidate => candidate.name !== tactic.previous);
        if (!alternative) return;
        tactic.choice = alternative.name;
        tactic.reason += ' The counter-route was already assigned; switching the approach to open a different angle.';
      }
      bots._assignRoute(bot, routes.find(candidate => candidate.name === tactic.choice));
    } else return;
    this.game.roundTactic = tactic;
  }

  watchRepeatedPeek(bot) {
    const now = this.game.bots.time;
    if (this.plan.benchmark || this.plan.evaluation === 'fixed' || !this.data) return false;
    const stopReason =
      this.game.state.phase !== 'live' ? 'The objective state changed.' :
      this.game.state.timer < 30 ? 'The round clock fell below 30 seconds.' :
      bot.target ? 'The opponent acquired a live target.' :
      bot.blindUntil > now ? 'The opponent was blinded.' :
      bot === this.game.bots.bombCarrier ? 'The opponent needed to carry the objective.' :
      now - bot.heardTime < 3 ? 'The opponent heard a new sound cue.' :
      now - bot.damageTime < 2 ? 'The opponent took damage.' : null;
    if (this.peekWatch) {
      if (this.peekWatch.done || this.peekWatch.bot !== bot) return false;
      if (stopReason || now >= this.peekWatch.until) {
        this.peekWatch.done = true;
        if (bot.goal.distanceToSquared(this.peekWatch.point) < .01) {
          bot.hasGoal = false;
          bot.path = null;
        }
        if (bot.state === 'hold') bot.holdTimer = 0;
        const reason = stopReason || 'The five-second watch window ended.';
        this.adaptations?.push({
          type: 'watch-peek-ended',
          at: +(this.data.aliveSeconds || 0).toFixed(1),
          reason,
          message: 'Ended the repeated-peek watch. ' + reason
        });
        return false;
      }
      if (bot.pos.distanceToSquared(this.peekWatch.point) < 1 && bot.state !== 'hold') {
        bot.hasGoal = false;
        bot.path = null;
        bot.yaw = this.peekWatch.yaw;
        bot.state = 'hold';
      }
      return true;
    }
    if (stopReason) return false;
    const habit = this.history?.repeat;
    if (!habit || this.data.aliveSeconds < 3 || this.peekSearchTried) return false;
    this.peekSearchTried = true;
    const world = this.game.world;
    const target = new THREE.Vector3(habit.x, 1.62, habit.z);
    const reachable = world.waypoints.nodes.filter(node => {
      const range = node.pos.distanceTo(target), travel = node.pos.distanceTo(bot.pos);
      const origin = node.pos.clone(); origin.y += 1.62;
      return range >= 4 && range <= 13 && travel <= 12 && this.clear(origin, target);
    }).sort((a,b) => a.pos.distanceToSquared(bot.pos) - b.pos.distanceToSquared(bot.pos));
    const point = reachable.find(node => world.findPath(bot.pos, node.pos).length > 0);
    if (!point || !this.game.bots._setGoal(bot, point.pos)) return false;
    this.peekWatch = { bot, point: point.pos, yaw: Math.atan2(point.pos.x-target.x,point.pos.z-target.z), until: now+5 };
    bot.state = 'move';
    this.logTactic({ type:'watch-peek', choice:point.key, reason:habit.count+' player-opened peeks near this angle across '+habit.rounds+
      ' previous rounds. No current contact, recent enemy noise, or damage was detected.', evidence:habit });
    return true;
  }

  clear(a, b) {
    ray.copy(b).sub(a);
    const distance = ray.length();
    return distance > .02 && !this.game.combat.losBlocked(a,b) && !this.game.world.raycast(a, ray.multiplyScalar(1/distance), distance-.08);
  }
  nearestContact(aimOnly) {
    const p = this.game.player;
    eye.copy(p.position); eye.y += p.eyeHeight;
    this.game.camera.getWorldDirection(view);
    let closest = null, dotBest = .94, lines = 0;
    for (const b of this.game.bots.all) {
      if (!b.alive || b.team === p.team) continue;
      foe.copy(b.pos); foe.y += b.crouching ? 1.04 : 1.56;
      if (eye.distanceTo(foe) > 45 || !this.clear(eye, foe)) continue;
      lines++;
      const dx = foe.x-eye.x, dz = foe.z-eye.z;
      const dot = (view.x*dx + view.z*dz) / (Math.hypot(dx,dz)*Math.hypot(view.x,view.z));
      if (dot > dotBest) {
        dotBest = dot;
        closest = { pos: foe.clone(), heightError: eye.y + view.y * Math.hypot(dx,dz) / Math.hypot(view.x,view.z) - foe.y };
      }
    }
    return aimOnly ? closest : lines;
  }
  shot() {
    if (!this.data || !this.game.player.alive || !['live','planted'].includes(this.game.state.phase)) return;
    this.data.shots++;
    if (this.game.player.moveSpeed2D > .65 || !this.game.player.onGround) this.data.movingShots++;
  }
  sampleAim() {
    const sample = this.nearestContact(true);
    if (!sample) return;
    this.data.aimSamples++;
    if (sample.heightError < -.24) this.data.belowHead++;
    if (sample.heightError > .24) this.data.aboveHead++;
  }

  chooseManeuver(bot) {
    const now = this.game.bots.time;
    if (this.plan.benchmark || bot.team === this.plan.side || !bot.targetVisible || !bot.target ||
        bot.blindUntil > now || bot.coachCoverCooldown > now || ['plant','defuse'].includes(bot.state)) return false;
    const hurt = bot.health < 58 && now-bot.damageTime < 2;
    const reload = bot.reloadTimer > 0 || bot.mag === 0;
    const discovered = bot.trackTime > 2.5;
    if (!hurt && !reload && !discovered) return false;
    bot.coachCoverCooldown = now+8;
    const point = this.coverFor(bot);
    if (!point || !this.game.bots._setGoal(bot,point)) return false;
    bot.coachManeuver = { stage:'cover', started:now, until:now+4.5, threat:bot.lastSeenPos.clone(), retreat:hurt || reload };
    bot.target = bot.targetBot = bot.targetHuman = null;
    bot.targetVisible = bot.targetIsPlayer = false;
    bot.state = 'move';
    this.log(bot.name + (hurt ? ' withdrew after damage' : reload ? ' sought cover to reload' : ' changed position after sustained visible contact') +
      '. A reachable waypoint blocked the last observed contact; no unseen player position was used.');
    return true;
  }
  maneuver(bot) {
    const action = bot.coachManeuver, now = this.game.bots.time;
    if (!action) return false;
    if (!['live','planted'].includes(this.game.state.phase) || now > action.until ||
        bot.blindUntil > now || bot.damageTime > action.started || bot.heardTime > action.started || this.game.state.phase === 'planted') {
      bot.coachManeuver = null; bot.sneak = false; return false;
    }
    // The movement system still handles collision and ability hazards.
    if (bot.hasGoal) return true;
    if (action.stage === 'cover') {
      action.stage = 'hold'; action.holdUntil = now+(action.retreat ? 1.1 : .5);
      bot.state = 'hold'; bot.holdTimer = 1.2; return true;
    }
    if (action.stage === 'hold' && now < action.holdUntil) return true;
    if (action.stage === 'hold') {
      const target = action.threat.clone(); target.y += 1.56;
      const point = this.game.world.waypoints.nodes.find(node => {
        const distance = node.pos.distanceToSquared(bot.pos);
        const eye = node.pos.clone(); eye.y += 1.62;
        return distance > .5 && distance < 25 && this.clear(eye,target) && this.game.world.findPath(bot.pos,node.pos).length;
      });
      if (point && this.game.bots._setGoal(bot,point.pos)) {
        action.stage = 'peek'; bot.state = 'move'; bot.sneak = true;
        this.log(bot.name+' slowly cleared a new angle toward the last observed contact after using cover.');
        return true;
      }
    }
    bot.coachManeuver = null; bot.sneak = false;
    return false;
  }
  coverFor(bot) {
    const threat = new THREE.Vector3().copy(bot.lastSeenPos);
    threat.y += 1.5;
    const world = this.game.world;
    const nearby = world.waypoints.nodes.filter(n => {
      const d = bot.pos.distanceToSquared(n.pos);
      return d >= 4 && d < 12*12 && world._clearAt(n.pos.x,n.pos.y,n.pos.z,bot.radius,bot.height);
    }).sort((a,b) => bot.pos.distanceToSquared(a.pos)-bot.pos.distanceToSquared(b.pos));
    for (const n of nearby) {
      foe.copy(n.pos); foe.y += 1.6;
      if (!this.clear(foe, threat) && world.findPath(bot.pos,n.pos).length) return n.pos;
    }
    return null;
  }
  update(dt) {
    this.guide.hidden = true;
    if (this.game.state.phase === 'freeze' && this.demonstration.actor) { this.demonstration.update(dt); return; }
    if (!this.data || !['live','planted'].includes(this.game.state.phase)) return;
    const game = this.game;
    this.clock += dt;
    if (this.clock >= .20) {
      const delta = this.clock;
      this.clock = 0;
      for (const b of game.bots.all) if (b.alive && b.team !== game.player.team) {
        const state = b.coachCoverUntil > game.bots.time && b.hasGoal ? 'take cover' : b.state;
        this.botStates[state] = (this.botStates[state] || 0) + 1;
      }
      if (game.player.alive) {
        this.data.aliveSeconds += delta;
        const sightlines = this.nearestContact(false);
        this.sampleAim();
        const p = game.player.position;
        const covered = game.world.colliders.some(box => box.max.y > p.y+.65 && box.min.y < p.y+1.6 &&
          Math.hypot(Math.max(box.min.x-p.x,0,p.x-box.max.x),Math.max(box.min.z-p.z,0,p.z-box.max.z)) < 1.4);
        if (covered) this.data.coveredSeconds += delta;
        if (sightlines) this.data.exposedSeconds += delta;
        if (sightlines >= 2) this.data.multiSeconds += delta;
        if (this.plan.duel) this.recordDuelContact(sightlines > 0, delta);
      }
    }
    if (game.player.alive && game.input.locked && this.plan.lesson === 'aim' && !this.plan.challenge) {
      const contact = this.nearestContact(true);
      if (contact) {
        view.copy(contact.pos).project(game.camera);
        if (Math.abs(view.x) < 1 && Math.abs(view.y) < 1 && view.z < 1) {
          const r = game.canvas.getBoundingClientRect();
          this.guide.style.left = (r.left+(view.x+1)*r.width/2)+'px';
          this.guide.style.top = (r.top+(1-view.y)*r.height/2)+'px';
          this.guide.hidden = false;
        }
      }
    }
  }
  recordDuelContact(exposed, delta) {
    const data = this.data;
    const enemy = this.game.bots.all.find(bot => bot.alive && bot.team !== this.game.player.team);
    if (!enemy) return;
    let aimed = true, openedByPlayer = false;
    if (exposed && this.previouslyExposed === false) {
      const p = this.game.player;
      const direction = foe.copy(enemy.pos).sub(p.position).setY(0).normalize();
      this.game.camera.getWorldDirection(view).setY(0).normalize();
      aimed = view.dot(direction) >= Math.cos(Math.PI / 9);
      const previousEye = this.duelPlayerSample?.clone();
      if (previousEye && previousEye.distanceToSquared(p.position) > .025) {
        previousEye.y += p.eyeHeight;
        const targetEye = enemy.pos.clone(); targetEye.y += enemy.crouching ? 1.04 : 1.56;
        openedByPlayer = !this.clear(previousEye, targetEye);
      }
    }
    if (exposed && this.previouslyExposed === false) data.engagements++;
    if (openedByPlayer) {
      data.peeks++;
      if (!aimed) data.unreadyPeeks++;
    }
    const playerPosition = this.game.player.position;
    const moved = this.duelPlayerSample && playerPosition.distanceToSquared(this.duelPlayerSample) > .025;
    if (!exposed && this.previouslyExposed === true && moved && playerPosition.distanceToSquared(enemy.pos) < 42 ** 2) {
      data.coverResets++;
      if (data.aliveSeconds-this.damageAt < 3) { data.damageResets++; this.damageAt = -99; }
    }
    this.habits.sample(this.game.player, delta, exposed, aimed, openedByPlayer);
    this.duelPlayerSample = playerPosition.clone();
    this.previouslyExposed = exposed;
  }

  finish(e) {
    if (!this.data) return;
    const data = this.data;
    const abilities = this.game.abilities;
    data.utilityCasts = abilities?.record.slice() || [];
    data.smokeOpportunity = abilities?.smokeOpportunity || null;
    if (e.localDefuse) data.defuses++;
    this.data = null;
    for (const key of ['aliveSeconds','multiSeconds','damageTaken','coveredSeconds','exposedSeconds']) data[key] = +data[key].toFixed(2);
    const record = { id: crypto.randomUUID(), created: Date.now(), source: 'tactical', version: 3,
      map: nav, site: this.game.bots._targetSite?.name || this.plan.site, agent: abilities?.playerState?.id, phase: this.plan.phase, lesson: this.plan.lesson, support: this.plan.support, side: this.plan.side,
      evaluation: this.plan.evaluation, evaluationProtocol: this.plan.evaluation ? EVALUATION_RULES : undefined, benchmark: this.plan.benchmark, run: this.benchmarkRun, trial: this.game.benchmarkTrial, protocol: this.plan.benchmark ? BENCHMARK_RULES : undefined,
      duel: this.plan.duel, challenge: this.plan.challenge, evaluated: this.round === 1, round: this.round, won: e.winner === this.plan.side, outcome: e.reason,
      playerKey: this.playerKey, botRoute: this.game.bots.all.find(bot => bot.team !== this.plan.side)?.roundRouteName, habits: this.habits.report(),
      data, botStates: this.botStates, adaptations: this.adaptations };
    const saved = save(record);
    if (saved) {
      const recommendation = next(read(STORE, []).filter(row => row.playerKey === this.playerKey));
      const waiting = this.plan.benchmark && this.round < 3;
      this.link.href = waiting ? '../#progress' : sessionURL({...recommendation,quality:this.game.gfxQuality}).replace('./tactical-match/', './');
      this.link.textContent = waiting ? 'View trials (assessment continues) ?' :
        recommendation.phase === 'reassessment' ? 'Continue to comparable reassessment ?' :
        'Continue ? ' + (lessons[recommendation.lesson]?.title || 'Assessment') + ' ?';
    }
    const weakness = findings(data)[0];
    const result = this.plan.lesson ? (passed(this.plan.lesson,data) ? 'Exercise target met.' : 'Exercise target not met.') :
      (weakness ? 'Focus: ' + lessons[weakness.id].title + '.' : 'Review your recorded round on the dashboard.');
    this.display(saved ? 'Feedback - round saved' : 'Round ended · storage unavailable', result + ' ' + data.hits + ' hits / ' + data.shots + ' shots.', true);
  }
}
