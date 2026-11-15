import { frameStats } from './frame-stats.js';
// Opt-in, bounded CPU telemetry. Render submission time is not GPU time.
export class FrameProfiler {
  constructor(game) {
    this.game = game;
    this.samples = [];
    game.renderer.info.autoReset = false;
    this.pending = {};
    this.el = document.createElement('pre');
    this.el.id = 'performance-report';
    this.el.style.cssText = 'position:fixed;right:8px;top:65px;z-index:200;background:#101d24ee;color:#afffd2;padding:10px;font:12px monospace;pointer-events:none;max-width:92vw;white-space:pre-wrap';
    document.body.append(this.el);
    const controls = document.createElement('div');
    controls.style.cssText='position:fixed;right:8px;top:35px;z-index:201';
    for (const [label,action] of [['Reset capture',()=>{this.samples=[];this.summary=null;this.pending={};}],['Export profile',()=>this.export()]]) {
      const button=document.createElement('button');button.textContent=label;button.onclick=action;controls.append(button);
    }
    document.body.append(controls);
    for (const name of ['raycast', 'resolveMovement', 'findPath']) {
      const original = game.world[name].bind(game.world);
      game.world[name] = (...args) => {
        const start = performance.now();
        const result = original(...args);
        this.pending[name] = (this.pending[name] || 0) + performance.now() - start;
        this.pending[name+'Calls'] = (this.pending[name+'Calls'] || 0) + 1;
        return result;
      };
    }
  }
  time(name, fn) {
    const start = performance.now(); fn();
    this.pending[name] = (this.pending[name] || 0) + performance.now() - start;
  }
  export() {
    if (!this.summary) return;
    const url=URL.createObjectURL(new Blob([JSON.stringify({summary:this.summary,samples:this.samples},null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='clutchiq-performance.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  frame(wall) {
    this.samples.push({ wall: wall * 1000, ...this.pending });
    this.pending = {};
    if (this.samples.length > 1800) this.samples.shift();
    if ((this.tick = (this.tick || 0) + 1) % 60) return;
    const rows = this.samples;
    const mean = key => rows.reduce((sum, row) => sum + (row[key] || 0), 0) / rows.length;
    const summary = frameStats(rows);
    if (!summary) return;
    this.summary = {phase:this.game.state.phase,quality:this.game.gfxQuality,
      viewport:{width:innerWidth,height:innerHeight,pixelRatio:this.game.renderer.getPixelRatio()},
      ...summary,drawCalls:this.game.renderer.info.render.calls,triangles:this.game.renderer.info.render.triangles,
      geometry:this.game.renderer.info.memory.geometries,textures:this.game.renderer.info.memory.textures,
      cpu:Object.fromEntries(['render','bots','player','coach','raycast','resolveMovement','findPath'].map(key=>[key,mean(key)]))};
    this.el.textContent = `CPU profile - ${this.game.state.phase} - ${rows.length} frames\nFPS ${summary.fps.toFixed(1)} - average ${summary.averageMs.toFixed(2)} ms\n1% low ${summary.low1.toFixed(1)} FPS - p95 ${summary.p95Ms.toFixed(2)} ms\np99 ${summary.p99Ms.toFixed(2)} ms - max ${summary.maxMs.toFixed(2)} ms\nSpikes >33ms: ${summary.spikes33} - >50ms: ${summary.spikes50}\nDraws ${this.summary.drawCalls} - triangles ${this.summary.triangles}\n` +
      ['render','bots','player','coach','raycast','resolveMovement','findPath'].map(key => `${key}: ${mean(key).toFixed(3)} ms`).join('\n') +
      `\nraycasts/frame: ${mean('raycastCalls').toFixed(1)} · geometry ${this.game.renderer.info.memory.geometries}` +
      (performance.memory ? `\nJS heap: ${(performance.memory.usedJSHeapSize/1048576).toFixed(1)} MB` : '\nJS heap: unavailable in this browser');
  }
}
