import * as THREE from 'three';
import { AGENTS } from './agents.js';

const gameAgent = game => game.abilities?.playerState?.id || 'controller';

export const DEMO_TIME = 24;
// Authored waypoints, traversed through the production navigation/collision APIs.
export const DEMO_LESSONS = {
  aim: { nodes:['a1','a0','a1','a3'], targets:['e4','e4','a_ramp','e4'], captions:[
    'Explanation - Set the aim line at head height before opening the lane.',
    'Watch - Keep the marker at head height while moving along cover.',
    'Watch - Stop to fire a short burst; movement reduces accuracy.',
    'Watch - Break contact and aim at the next entrance before returning.'] },
  movement: { nodes:['a1','a0','a1','a3'], targets:['e4','e4','e4','a_ramp'], captions:[
    'Explanation - Move between cover, release movement, then fire.',
    'Watch - The bot stops at the angle before the aim line pulses.',
    'Watch - Return behind cover before taking the next burst.',
    'Watch - Reposition instead of repeating the same exposed burst.'] },
  peek: { nodes:['ct_gate_n','m5','ct_gate_n','m5'], targets:['m4','m3','ae','m4'], captions:[
    'Explanation - Pre-aim the near edge from hard cover.',
    'Watch - Walk out slowly and clear the first customs angle.',
    'Watch - Turn to the second entrance before crossing to a new position.',
    'Watch - Return to cover; avoid exposing both entrances together.'] },
  duelcover: { nodes:['b2','b1','bw','b1'], targets:['w4','w4','m5','b0'], captions:[
    'Explanation - Keep hard cover and an escape route beside the engagement.',
    'Watch - Open the cargo lane with the aim line at head height.',
    'Watch - Break contact and rotate to a different piece of cover.',
    'Watch - Clear the new angle instead of returning to the same spot.'] },
  utility: { nodes:['b1','b1','b0','b1'], targets:['w4','b_ramp','w4','w4'], captions:[
    'Explanation - Check the lane and choose utility before committing.',
    'Watch - Prepare the entrance with utility while still behind cover.',
    'Watch - Move only after the ability is active; retain an exit.',
    'Watch - Reset behind cover before the ability expires.'] },
  objective: { nodes:['b1','b1','b0','b1'], targets:['w4','b_ramp','w4','w4'], captions:[
    'Explanation - Clear the approach before committing to the objective.',
    'Watch - Screen the approach before the exposed crossing.',
    'Watch - Move to a defended position while the screen is active.',
    'Watch - Hold the approach from cover instead of chasing an unseen enemy.'] }
};

export class CoachDemonstration {
  constructor(game, say) { this.game = game; this.say = say; }
  start(lesson = 'peek') {
    this.stop();
    const bot = this.game.bots.all.find(actor => actor.alive);
    if (!bot) return false;
    this.clip = DEMO_LESSONS[lesson] || DEMO_LESSONS.peek;
    const node = key => this.game.world.waypoints.nodes.find(n => n.key === key)?.pos;
    this.points = this.clip.nodes.map(node);
    this.targets = this.clip.targets.map(node);
    if ([...this.points,...this.targets].some(point => !point)) return false;
    globalThis.document?.body?.classList.add('coach-demonstration');
    this.actor = bot; this.elapsed = 0; this.stage = -1;
    this.original = { pos:bot.pos.clone(), yaw:bot.yaw, aimPitch:bot.aimPitch, moveSpeed:bot.moveSpeed };
    bot.pos.copy(this.points[0]);
    this.marker = new THREE.Mesh(new THREE.SphereGeometry(.12,12,8), new THREE.MeshBasicMaterial({color:0xffd488}));
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]), new THREE.LineBasicMaterial({color:0x9affd2}));
    this.line.frustumCulled = false;
    this.eye = new THREE.Vector3(); this.head = new THREE.Vector3(); this.delta = new THREE.Vector3();
    this.utility = AGENTS[gameAgent(this.game)]?.kit.find(ability => ['smoke','recon','slow'].includes(ability.type)) || AGENTS.controller.kit[0];
    this.game.scene.add(this.marker, this.line);
    return true;
  }
  update(dt) {
    if (!this.actor) return;
    const game = this.game, bot = this.actor;
    this.elapsed = Math.min(DEMO_TIME-.001, this.elapsed+dt);
    const stage = Math.floor(this.elapsed / 6);
    if (stage !== this.stage) {
      this.stage = stage; this.pathIndex = 0;
      this.path = game.world.findPath(bot.pos, this.points[stage]);
      this.say('Demonstration - '+(stage+1)+'/4', this.clip.captions[stage]);
      if (stage === 1 && ['utility','objective'].includes(game.coaching.lesson)) {
        // Demonstration effect only: no player measurements, charges or damage.
        this.say('Demonstration - ability timing', this.utility.name+' before crossing. '+this.utility.details);
        game.abilities.activate(this.utility, bot, this.targets[stage], new THREE.Vector3(0,0,1), {enemies:[],allies:[]});
      }
    }
    const target = this.path?.[this.pathIndex];
    bot.moveSpeed = 0;
    if (target) {
      this.delta.copy(target).sub(bot.pos); this.delta.y = 0;
      const distance = this.delta.length();
      if (distance < .25 && Math.abs(target.y-bot.pos.y)<.9) this.pathIndex++;
      else {
        this.delta.multiplyScalar(Math.min(distance, 2.3*dt)/Math.max(distance,.001)); this.delta.y = -.05;
        const beforeX = bot.pos.x, beforeZ = bot.pos.z;
        const move = game.world.resolveMovement(bot.pos,this.delta,bot.radius,1.83);
        bot.pos.copy(move.pos);
        bot.moveSpeed = Math.hypot(bot.pos.x-beforeX,bot.pos.z-beforeZ)/Math.max(dt,.001);
      }
    }
    this.head.copy(this.targets[stage]); this.head.y += 1.56;
    this.marker.position.copy(this.head);
    this.eye.copy(bot.pos); this.eye.y += 1.62;
    bot.yaw = Math.atan2(bot.pos.x-this.head.x,bot.pos.z-this.head.z);
    bot.aimPitch = Math.atan2(this.head.y-this.eye.y,Math.hypot(this.head.x-this.eye.x,this.head.z-this.eye.z));
    this.delta.copy(this.head).sub(this.eye);
    const distance = this.delta.length();
    const hit = game.world.raycast(this.eye,this.delta.normalize(),distance);
    const end = hit?.point || this.head;
    const coords = this.line.geometry.attributes.position;
    coords.setXYZ(0,this.eye.x,this.eye.y,this.eye.z); coords.setXYZ(1,end.x,end.y,end.z); coords.needsUpdate = true;
    this.line.material.color.setHex(bot.moveSpeed < .1 && this.elapsed%1 < .2 ? 0xffd488 : 0x9affd2);
    game.bots._animateBot(bot,dt);
    game.camera.position.set(bot.pos.x+9,bot.pos.y+8,bot.pos.z+8);
    game.camera.lookAt(bot.pos.x,bot.pos.y+1,bot.pos.z-3); game.camera.updateMatrixWorld(true);
  }
  stop() {
    if (!this.actor) return;
    const {pos,...pose} = this.original;
    this.actor.pos.copy(pos); this.actor.mesh?.position.copy(pos); Object.assign(this.actor,pose);
    for (const mesh of [this.marker,this.line]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); }
    this.game.abilities.clear(); this.actor = null;
    globalThis.document?.body?.classList.remove('coach-demonstration');
  }
}
