// Opt-in, bounded CPU telemetry. Render submission time is not GPU time.
export class FrameProfiler {
  constructor(game) {
    this.game = game;
    this.samples = [];
    this.pending = {};
    this.el = document.createElement('pre');
    this.el.id = 'performance-report';
    this.el.style.cssText = 'position:fixed;right:8px;top:65px;z-index:200;background:#101d24ee;color:#afffd2;padding:10px;font:12px monospace;pointer-events:none;max-width:92vw;white-space:pre-wrap';
    document.body.append(this.el);
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
  frame(wall) {
    this.samples.push({ wall: wall * 1000, ...this.pending });
    this.pending = {};
    if (this.samples.length > 600) this.samples.shift();
    if ((this.tick = (this.tick || 0) + 1) % 60) return;
    const rows = this.samples;
    const mean = key => rows.reduce((sum, row) => sum + (row[key] || 0), 0) / rows.length;
    const sorted = rows.map(row => row.wall).sort((a,b) => a-b);
    this.el.textContent = `CPU profile · ${this.game.state.phase} · ${rows.length} frames\nFPS ${(1000/mean('wall')).toFixed(1)} · p95 frame ${sorted[Math.floor(sorted.length*.95)].toFixed(2)} ms\n` +
      ['render','bots','player','coach','raycast','resolveMovement','findPath'].map(key => `${key}: ${mean(key).toFixed(3)} ms`).join('\n') +
      `\nraycasts/frame: ${mean('raycastCalls').toFixed(1)} · geometry ${this.game.renderer.info.memory.geometries}` +
      (performance.memory ? `\nJS heap: ${(performance.memory.usedJSHeapSize/1048576).toFixed(1)} MB` : '\nJS heap: unavailable in this browser');
  }
}
