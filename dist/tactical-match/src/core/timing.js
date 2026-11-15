// Preserve elapsed play time at 20–144+ FPS without large collision steps.
// Suspend gaps are capped to avoid a catch-up spiral after tab switching.
export function simulationSteps(wallSeconds) {
  const elapsed = Math.max(0, Math.min(Number(wallSeconds) || 0, .25));
  const count = Math.max(1, Math.ceil(elapsed / (1/60)));
  return { count, dt: elapsed / count };
}

// Keep fractional fire intervals across frames, but never accumulate a burst
// backlog after a released trigger or a long interruption.
export function nextShotTime(now, previous, interval) {
 return previous <= 0 || previous < now-interval ? now+interval : (previous || 0)+interval;
}
