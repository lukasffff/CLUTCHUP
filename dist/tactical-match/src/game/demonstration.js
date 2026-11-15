import * as THREE from 'three';
import { AGENTS } from './agents.js';

export const DEMO_TIME = 10;
const clips = [
  { end:2.0, x:4.6, caption:'Head height · Align with the target marker before moving.' },
  { end:4.0, x:2.1, caption:'Peeking · Move sideways just far enough to open the near edge.' },
  { end:5.8, x:.65, caption:'Angle clearing · Clear the narrow opening before moving farther across.' },
  { end:7.5, x:4.6, caption:'Cover · Break the sightline and reset before taking another fight.' },
  { end:10, x:2.1, caption:'Utility · Screen the doorway first, then move while the smoke is active.' }
];
const start = new THREE.Vector3(4.6, 0, -16.7);
const head = new THREE.Vector3(0, 1.56, -7);
const smokePoint = new THREE.Vector3(0, 0, -12.5);

export class CoachDemonstration {
  constructor(game, say) {
    this.game = game;
    this.say = say;
  }

  start() {
    const bot = this.game.bots.all[0];
    if (!bot) return;
    this.actor = bot;
    this.elapsed = 0;
    this.stage = -1;
    this.original = { pos: bot.pos.clone(), yaw:bot.yaw, aimPitch:bot.aimPitch, moveSpeed:bot.moveSpeed };
    bot.pos.copy(start);
    bot.mesh?.position.copy(start);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(.12,12,8), new THREE.MeshBasicMaterial({color:0xffd488}));
    marker.position.copy(head);
    this.line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([start.clone(),head]),
      new THREE.LineBasicMaterial({color:0x9affd2,transparent:true,opacity:.84})
    );
    this.marker = marker;
    this.game.scene.add(marker, this.line);
  }

  update(dt) {
    if (!this.actor) return;
    const game = this.game;
    const bot = this.actor;
    this.elapsed = Math.min(DEMO_TIME - .005, this.elapsed + dt);
    const index = clips.findIndex(clip => this.elapsed < clip.end);
    const step = clips[index];
    if (index !== this.stage) {
      this.stage = index;
      this.say('Watch the bot · ' + (index + 1) + ' / ' + clips.length, step.caption);
      if (index === 4) {
        const ability = AGENTS.controller.kit[0];
        game.abilities.activate(ability, bot, smokePoint, new THREE.Vector3(0, 0, 1), { enemies:[], allies:[] });
      }
    }
    const dx = THREE.MathUtils.clamp(step.x-bot.pos.x, -2.3*dt, 2.3*dt);
    const previous = bot.pos.x;
    const move = game.world.resolveMovement(bot.pos, new THREE.Vector3(dx, -.03, 0), bot.radius, 1.83);
    bot.pos.copy(move.pos);
    bot.moveSpeed = Math.abs(bot.pos.x-previous)/Math.max(dt,.0001);
    bot.yaw = Math.atan2(bot.pos.x-head.x, bot.pos.z-head.z);
    const eye = bot.pos.clone().add(new THREE.Vector3(0,1.62,0));
    bot.aimPitch = Math.atan2(head.y-eye.y,Math.hypot(head.x-eye.x,head.z-eye.z));
    const heading = head.clone().sub(eye);
    const distance = heading.length();
    const blocked = game.world.raycast(eye,heading.normalize(),distance);
    const end = blocked?.point || head;
    const coords = this.line.geometry.attributes.position;
    coords.setXYZ(0,eye.x,eye.y,eye.z);
    coords.setXYZ(1,end.x,end.y,end.z);
    coords.needsUpdate = true;
    this.line.frustumCulled = false;
    this.line.visible = !game.combat.losBlocked(eye,head);
    game.bots._animateBot(bot, dt);
    // Show the actual bot and cover from a local overhead camera until live play begins.
    game.camera.position.set(8.5, 7.8, -24);
    game.camera.lookAt(.5, 1.3, -14);
    game.camera.updateMatrixWorld(true);
  }

  stop() {
    const bot = this.actor;
    if (!bot) return;
    const { pos, yaw, aimPitch, moveSpeed } = this.original;
    bot.pos.copy(pos);
    bot.mesh?.position.copy(pos);
    Object.assign(bot,{yaw,aimPitch,moveSpeed});
    for (const mesh of [this.marker,this.line]) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.game.abilities.clear();
    this.actor = null;
  }
}
