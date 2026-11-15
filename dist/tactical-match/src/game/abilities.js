import * as THREE from 'three';
import { AGENTS, agentId, segmentNearPoint } from './agents.js';
import { AbilityHUD } from './ability-hud.js';

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const ACTIVE_PHASES = new Set(['live', 'planted']);
export const ABILITY_KEYS = ['ability-1', 'ability-2', 'ability-3', 'ability-4'];
const effectsColor = { smoke: 0x53546d, flash: 0xffeabc, zone: 0xea7337, slow: 0x6ec7fd, recon: 0x75eac8, trap: 0xc5a6ff };
const position = actor => actor.position || actor.pos;
const horizontalDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const stateFor = (id, ultimate = true) => ({
  id,
  charges: AGENTS[id].kit.map(ability => ability.ultimate && !ultimate ? 0 : ability.charges),
  ready: [0, 0, 0, 0],
  active: [0, 0, 0, 0]
});

export default class Abilities {
  constructor(game, preset) {
    this.game = game;
    this.time = 0;
    this.effects = [];
    this.record = [];
    this.botKits = new Map();
    this.reveals = new Map();
    this.teamReady = {};
    this.hud = new AbilityHUD(game, slot => this.playerCast(slot), preset);
    game.events.on('round:start', ({ round }) => this.startRound(round));
    game.events.on('round:end', () => this.clear());
    game.events.on('input:keydown', ({ key }) => {
      const slot = ABILITY_KEYS.indexOf(key);
      if (slot >= 0) this.playerCast(slot);
    });
    game.events.on('settings:changed', () => this.hud.preview());
  }

  startRound(round) {
    this.clear();
    this.record = [];
    this.liveStarted = null;
    this.smokeOpportunity = null;
    this.nextOpportunity = 0;
    this.noticeUntil = 0;
    this.teamReady = {};
    const roster = ['controller', 'initiator', 'sentinel', 'duelist'];
    for (const [index, bot] of this.game.bots.all.entries()) {
      const id = roster[(bot.slot + (bot.team === 'ct' ? 1 : 0)) % roster.length] || roster[index % roster.length];
      const previous = this.botKits.get(bot);
      this.botKits.set(bot, stateFor(id, round === 1 || previous?.charges[3] > 0));
    }
    this.playerState = stateFor(this.hud.selected, round === 1 || this.playerState?.charges[3] > 0);
    if (this.game.coaching?.benchmark) this.playerState.charges.fill(0);
    this.hud.notice.textContent = '';
  }

  clear() {
    for (const effect of this.effects) this.remove(effect);
    this.effects.length = 0;
    this.reveals.clear();
  }

  playerCast(slot) {
    const { input, hud, player, camera } = this.game;
    if (!input.locked || hud.buyOpen || !player.alive || !ACTIVE_PHASES.has(this.game.state.phase)) return false;
    const state = this.playerState;
    if (!state?.charges[slot] || state.ready[slot] > this.time) return false;
    const direction = camera.getWorldDirection(new THREE.Vector3());
    const ability = AGENTS[state.id].kit[slot];
    const origin = this.eye(player);
    const at = ability.type === 'dash' ? origin : this.aimPoint(origin, direction, ability);
    const used = at && this.cast(player, state, slot, at, direction);
    if (!used) this.notice(ability.type === 'dash' ? 'Dash needs clear ground ahead.' : 'Aim at clear ground or a reachable surface.');
    else if (ability.type === 'flash') this.notice('Flash armed. Look away or break line of sight.');
    return !!used;
  }

  eye(actor) {
    const point = position(actor).clone();
    point.y += actor.eyeHeight ?? (actor.crouching ? 1.09 : 1.62);
    return point;
  }

  clearSight(a, b, ignoreSmoke = false) {
    const direction = b.clone().sub(a);
    const distance = direction.length();
    if (distance < .06) return true;
    if (!ignoreSmoke && this.game.combat.losBlocked(a, b)) return false;
    return !this.game.world.raycast(a, direction.multiplyScalar(1 / distance), distance - .05);
  }

  aimPoint(origin, direction, ability) {
    const world = this.game.world;
    const hit = world.raycast(origin, direction, ability.range);
    const point = hit ? hit.point.clone().addScaledVector(direction, -.45)
      : origin.clone().addScaledVector(direction, ability.range - .5);
    if (ability.type === 'flash') return point;
    return this.floor(point);
  }

  floor(point) {
    const at = point.clone().addScaledVector(UP, .15);
    const hit = this.game.world.raycast(at, DOWN, 4.8);
    if (!hit || hit.normal.y < .62) return null;
    return hit.point.clone();
  }

  context(actor) {
    if (this.game.state.bomb.planted) return actor.team === 'ct' ? 'retake' : 'protect planted device';
    return actor.team === 'ct' ? 'defend approaches' : 'approach a site';
  }

  cast(actor, state, slot, at, direction, reason = this.context(actor)) {
    if (!actor.alive || !ACTIVE_PHASES.has(this.game.state.phase)) return false;
    const ability = AGENTS[state.id].kit[slot];
    if (!state.charges[slot] || state.ready[slot] > this.time) return false;
    if (ability.type !== 'dash' && (this.eye(actor).distanceTo(at) > ability.range + .08 ||
        !this.clearSight(this.eye(actor), at.clone().addScaledVector(UP, .07), true))) return false;
    const entry = { name: ability.name, type: ability.type, side: actor.team, objective: reason,
      at: this.roundElapsed(), site: this.game.state.bomb.site || this.game.bots._targetSite?.name || null, location: at.toArray().map(n => +n.toFixed(1)),
      enemies: [], allies: [], observed: false };
    const size = this.effects.length;
    if (!this.activate(ability, actor, at, direction, entry)) return false;
    if (this.effects.length === size) entry.observed = true;
    state.charges[slot]--;
    state.ready[slot] = this.time + ability.cooldown;
    state.active[slot] = this.time + ability.duration;
    if (actor === this.game.player) {
      this.record.push(entry);
      this.game.events.emit('utility:cast', entry);
    }
    return true;
  }

  activate(ability, owner, at, direction, entry) {
    if (ability.type === 'dash') return this.dash(owner, ability, direction, entry);
    const effect = { ability, owner, point: at.clone(), entry, end: this.time + ability.duration, next: this.time, mesh: null };
    if (ability.type === 'barrier') {
      if (!this.barrier(effect, direction)) return false;
    } else if (ability.type === 'smoke') {
      const center = at.clone().addScaledVector(UP, 1.6);
      effect.smoke = { pos: center, radius: ability.radius, until: Infinity };
      this.game.combat.smokes.push(effect.smoke);
      effect.mesh = this.mesh(new THREE.SphereGeometry(ability.radius, 26, 16), 0x53546d, center, { side: THREE.DoubleSide });
      if (owner === this.game.player) this.smokeEvidence(effect);
    } else if (ability.type === 'flash' || ability.type === 'recon' || ability.type === 'trap') {
      if (ability.type !== 'flash') effect.point.y += ability.type === 'recon' ? 1.05 : .32;
      effect.mesh = this.mesh(new THREE.IcosahedronGeometry(ability.type === 'flash' ? .16 : .26, 1),
        effectsColor[ability.type], effect.point);
    } else {
      effect.mesh = this.mesh(new THREE.CircleGeometry(ability.radius, 40), effectsColor[ability.type],
        at.clone().addScaledVector(UP, .055), { transparent: true, opacity: .48, depthWrite: false });
      effect.mesh.rotation.x = -Math.PI / 2;
    }
    this.effects.push(effect);
    return true;
  }

  mesh(geometry, color, point, extra = {}) {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, ...extra }));
    mesh.position.copy(point);
    this.game.scene.add(mesh);
    return mesh;
  }

  dash(actor, ability, view, entry) {
    if (!actor.onGround) return false;
    const world = this.game.world;
    const start = position(actor).clone();
    const velocity = actor.velocity;
    const direction = velocity && Math.hypot(velocity.x, velocity.z) > .65 ? velocity.clone() : view.clone();
    direction.y = 0;
    if (direction.lengthSq() < .01) return false;
    direction.normalize();
    const delta = direction.multiplyScalar(.20);
    const destination = start.clone();
    for (let travelled = 0; travelled + .20 <= ability.range; travelled += .20) {
      const result = world.resolveMovement(destination, delta, actor.radius, actor._heightCur || actor.height || 1.83);
      const moved = horizontalDistance(destination, result.pos);
      if (!result.onGround || moved < .12 || Math.abs(result.pos.y - destination.y) > .35) break;
      destination.copy(result.pos);
    }
    const distance = horizontalDistance(start, destination);
    if (distance < .4) return false;
    entry.distance = +distance.toFixed(1);
    entry.contactBefore = this.exposedEnemies(actor, start).length;
    entry.contactAfter = this.exposedEnemies(actor, destination).length;
    position(actor).copy(destination);
    if (velocity) velocity.set(0, 0, 0);
    this.game.events.emit('player:footstep', { pos: destination.clone() });
    return true;
  }

  barrier(effect, direction) {
    const world = this.game.world;
    const { ability, point } = effect;
    const center = point.clone().addScaledVector(UP, 1.15);
    const widthX = Math.abs(direction.z) >= Math.abs(direction.x);
    const half = new THREE.Vector3(widthX ? ability.width / 2 : .28, 1.15, widthX ? .28 : ability.width / 2);
    const box = new THREE.Box3(center.clone().sub(half), center.clone().add(half));
    // Avoid overlapping map solids or locking actors inside the barrier.
    const inset = box.clone().expandByScalar(-.045);
    if (world.colliders.some(other => other.intersectsBox(inset))) return false;
    for (const actor of this.actors()) {
      if (!actor.alive) continue;
      const feet = position(actor);
      if (box.distanceToPoint(feet.clone().addScaledVector(UP, .6)) < .65) return false;
    }
    for (const axis of [-1, 1]) {
      const foot = point.clone().addScaledVector(widthX ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1), axis * (ability.width / 2 - .1));
      const ground = this.floor(foot);
      if (!ground || Math.abs(ground.y - point.y) > .24) return false;
    }
    const mesh = this.mesh(new THREE.BoxGeometry(2 * half.x, 2 * half.y, 2 * half.z), 0x3f9e91, center);
    mesh.userData.surface = 'concrete';
    world.solids.add(mesh);
    mesh.updateMatrixWorld(true);
    world.colliders.push(box);
    (world.utilityBarriers ||= []).push(box);
    world.utilityRevision = (world.utilityRevision || 0) + 1;
    effect.box = box;
    effect.mesh = mesh;
    return true;
  }

  actors() { return [this.game.player, ...this.game.bots.all]; }

  roundElapsed() { return +Math.max(0, this.time - (this.liveStarted ?? this.time)).toFixed(1); }

  addContact(entry, actor, owner) {
    const list = actor.team === owner.team ? entry.allies : entry.enemies;
    const name = actor === this.game.player ? 'Player' : actor.name;
    if (!list.includes(name)) list.push(name);
  }

  flash(effect) {
    const bots = this.game.bots;
    const position = effect.point;
    const before = bots.all.map(bot => bot.blindUntil);
    this.game.events.emit('fx:flash', { pos: position.clone() });
    bots.applyFlash(position, true);
    bots.all.forEach((bot, index) => {
      if (bot.blindUntil > before[index]) this.addContact(effect.entry, bot, effect.owner);
    });
    if (this.game.combat._flashLocalPlayer(position, true)) this.addContact(effect.entry, this.game.player, effect.owner);
  }

  getReveal(team, actor) {
    const record = this.reveals.get(team)?.get(actor);
    return record?.until > this.time && actor.alive ? record : null;
  }

  pulse(effect) {
    const { ability, point, owner, entry } = effect;
    let revealed = this.reveals.get(owner.team);
    if (!revealed) this.reveals.set(owner.team, revealed = new Map());
    for (const target of this.actors()) {
      if (!target.alive || target.team === owner.team || point.distanceTo(this.eye(target)) > ability.radius ||
          !this.clearSight(point, this.eye(target))) continue;
      const snapshot = position(target).clone();
      revealed.set(target, { position: snapshot, until: this.time + (ability.type === 'trap' ? 2.6 : 1.4) });
      this.addContact(entry, target, owner);
      for (const bot of this.game.bots.all) {
        if (bot.team !== owner.team || !bot.alive || bot.targetVisible || horizontalDistance(bot.pos, snapshot) > 25) continue;
        bot.utilityContact = { position: snapshot, until: this.game.bots.time + 2.4 };
      }
      if (ability.type === 'trap') {
        effect.end = this.time;
        return;
      }
    }
  }

  inField(actor, effect, at = position(actor)) {
    return Math.abs(at.y - effect.point.y) < 1 &&
      horizontalDistance(at, effect.point) <= effect.ability.radius &&
      this.clearSight(effect.point.clone().addScaledVector(UP, .55), at.clone().addScaledVector(UP, .55), true);
  }

  moveScale(actor, requestedSpeed = 0) {
    if (!actor.onGround) return 1;
    for (const effect of this.effects) {
      if (effect.ability.type !== 'slow' || !this.inField(actor, effect)) continue;
      if (requestedSpeed > .35) this.addContact(effect.entry, actor, effect.owner);
      return .52;
    }
    return 1;
  }

  dangerDirection(bot) {
    const hazard = this.effects.find(effect => effect.ability.type === 'zone' && this.inField(bot, effect));
    if (!hazard) return null;
    const away = bot.pos.clone().sub(hazard.point).setY(0);
    if (away.lengthSq() < .05) away.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    return away.normalize();
  }

  exposedEnemies(actor, feet = position(actor)) {
    const eye = feet.clone().addScaledVector(UP, actor.eyeHeight || 1.62);
    return this.actors().filter(other => other.alive && other.team !== actor.team &&
      horizontalDistance(position(other), feet) <= 45 && this.clearSight(eye, this.eye(other)));
  }

  smokeEvidence(effect) {
    for (const ally of this.actors()) {
      if (!ally.alive || ally.team !== effect.owner.team) continue;
      const eye = this.eye(ally);
      for (const enemy of this.actors()) {
        if (!enemy.alive || enemy.team === ally.team || horizontalDistance(position(ally), position(enemy)) > 45) continue;
        const target = this.eye(enemy);
        if (!segmentNearPoint(eye, target, effect.smoke.pos, effect.smoke.radius) ||
            !this.clearSight(eye, target, true) ||
            this.game.combat.losBlocked(eye, target, effect.smoke)) continue;
        this.addContact(effect.entry, enemy, effect.owner);
        this.addContact(effect.entry, ally, effect.owner);
      }
    }
  }

  barrierEvidence(effect) {
    // Credit a briefly exposed line blocked by this wall only, using the world
    // ray's mesh identity. Other geometry must not already block that segment.
    for (const ally of this.actors()) {
      if (!ally.alive || ally.team !== effect.owner.team) continue;
      const eye = this.eye(ally);
      for (const enemy of this.actors()) {
        if (!enemy.alive || enemy.team === ally.team) continue;
        const target = this.eye(enemy);
        const direction = target.clone().sub(eye);
        const distance = direction.length();
        if (distance > 45 || this.game.combat.losBlocked(eye, target)) continue;
        if (this.game.world.raycast(eye, direction.normalize(), distance - .05)?.mesh !== effect.mesh) continue;
        if (this.game.world.raycast(eye, direction, distance - .05, effect.mesh)) continue;
        this.addContact(effect.entry, enemy, effect.owner);
        this.addContact(effect.entry, ally, effect.owner);
      }
    }
  }

  notice(message) {
    this.hud.notice.textContent = message;
    this.noticeUntil = this.time + 2.5;
  }

  checkOpportunity() {
    const player = this.game.player;
    if (!player.alive || !this.game.input.locked || this.smokeOpportunity || player.moveSpeed2D < 1.1) return;
    const kit = this.playerState;
    const slot = AGENTS[kit.id].kit.findIndex(ability => ability.type === 'smoke' && !ability.ultimate);
    if (slot < 0 || !kit.charges[slot] || kit.ready[slot] > this.time) return;
    const ability = AGENTS[kit.id].kit[slot];
    const eye = this.eye(player);
    const threats = this.exposedEnemies(player);
    if (threats.length < 2) return;
    const aim = this.game.camera.getWorldDirection(new THREE.Vector3());
    const spot = this.aimPoint(eye, aim, ability);
    if (!spot || spot.distanceTo(eye) > ability.range || spot.distanceTo(eye) < 3 ||
        !this.clearSight(eye, spot.clone().addScaledVector(UP, .07), true)) return;
    const center = spot.clone().addScaledVector(UP, 1.6);
    const count = threats.filter(enemy => segmentNearPoint(eye, this.eye(enemy), center, ability.radius)).length;
    if (count) this.smokeOpportunity = { at: this.roundElapsed(), enemies: count, objective: this.context(player), ability: ability.name,
      site: this.game.state.bomb.site || this.game.bots._targetSite?.name || null,
      location: spot.toArray().map(n => +n.toFixed(1)) };
  }

  botThink(bot) {
    if (bot.blindUntil > this.game.bots.time || bot.state === 'plant' || bot.state === 'defuse') return;
    const contact = bot.utilityContact;
    if (!bot.target && contact?.until > this.game.bots.time &&
        this.game.bots._setGoal(bot, contact.position)) {
      bot.utilityContact = null;
      bot.state = 'investigate';
      return true;
    }
    const bomb = this.game.state.bomb;
    const objective = bomb.planted ? bomb.pos : this.game.bots._targetSite?.center;
    if (!objective || (this.teamReady[bot.team] || 0) > this.time || horizontalDistance(bot.pos, objective) > 18) return;
    const state = this.botKits.get(bot);
    if (!state) return;
    const enemy = bot.targetVisible && this.game.bots._canSee(bot, bot.targetIsPlayer ? bot.targetHuman : bot.targetBot, bot.targetIsPlayer) ? bot.lastSeenPos : null;
    const slot = state.id === 'controller' ? (enemy ? 0 : -1)
      : state.id === 'initiator' ? (enemy ? 1 : 0)
      : state.id === 'sentinel' && bomb.planted && bot.team === 't' && enemy ? 1 : -1;
    if (slot < 0 || !state.charges[slot] || state.ready[slot] > this.time) return;
    const aim = (enemy || objective).clone();
    const ability = AGENTS[state.id].kit[slot];
    const eye = this.eye(bot);
    // Use known contact or objective positions. Do not query unseen opponents.
    if (enemy && ability.type === 'smoke') aim.lerp(bot.pos, .32);
    if (ability.type === 'flash') aim.lerp(bot.pos, .18).addScaledVector(UP, 1.45);
    if (ability.type === 'slow') aim.lerp(bot.pos, .25);
    const at = ability.type === 'flash' ? aim : this.floor(aim);
    if (at && this.cast(bot, state, slot, at, aim.clone().sub(eye).normalize(), this.context(bot))) {
      this.teamReady[bot.team] = this.time + 8;
      this.game.events.emit('utility:bot', { name: bot.name, ability: ability.name, reason: this.context(bot) });
    } else {
      state.ready[slot] = this.time + 1;
    }
  }

  update(dt) {
    this.time += dt;
    const phase = this.game.state.phase;
    this.hud.render(this.playerState, this.time, phase, this.game.player.alive);
    if (!ACTIVE_PHASES.has(phase)) {
      this.liveStarted = null;
      return;
    }
    this.liveStarted ??= this.time;
    if (this.noticeUntil < this.time && this.hud.notice.textContent) this.hud.notice.textContent = '';
    if (!this.playerState) return;
    for (let index = this.effects.length - 1; index >= 0; index--) {
      const effect = this.effects[index];
      const type = effect.ability.type;
      if (type === 'flash' && this.time >= effect.end) this.flash(effect);
      if (this.time >= effect.end) {
        effect.entry.observed = true;
        this.remove(effect);
        this.effects.splice(index, 1);
        continue;
      }
      if (type === 'flash' || this.time < effect.next) continue;
      effect.next = this.time + (type === 'zone' ? .5 : .6);
      if (type === 'recon' || type === 'trap') this.pulse(effect);
      if (type === 'smoke' && effect.owner === this.game.player) this.smokeEvidence(effect);
      if (type === 'barrier' && effect.owner === this.game.player) this.barrierEvidence(effect);
      if (type === 'zone') for (const actor of this.actors()) {
        if (!actor.alive || !actor.onGround || !this.inField(actor, effect)) continue;
        const previousHealth = actor.health;
        // Damage reports the hazard origin to bot perception, not its remote caster's position.
        actor.takeDamage(effect.ability.damage, { from: effect.owner, sourcePosition: effect.point, weapon: 'utility' });
        if (actor.health < previousHealth) this.addContact(effect.entry, actor, effect.owner);
      }
    }
    if (this.time >= this.nextOpportunity) {
      this.nextOpportunity = this.time + .24;
      this.checkOpportunity();
    }
  }

  remove(effect) {
    const world = this.game.world;
    effect.mesh?.removeFromParent();
    effect.mesh?.geometry.dispose();
    effect.mesh?.material.dispose();
    if (effect.smoke) {
      const index = this.game.combat.smokes.indexOf(effect.smoke);
      if (index >= 0) this.game.combat.smokes.splice(index, 1);
    }
    if (effect.box) {
      const collision = world.colliders.indexOf(effect.box);
      const navigation = world.utilityBarriers?.indexOf(effect.box);
      if (collision >= 0) world.colliders.splice(collision, 1);
      if (navigation >= 0) world.utilityBarriers.splice(navigation, 1);
      world.utilityRevision++;
    }
  }
}