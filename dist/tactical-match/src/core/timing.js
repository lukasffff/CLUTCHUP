// Preserve elapsed play time at 20–144+ FPS without large collision steps.
// Suspend gaps are capped to avoid a catch-up spiral after tab switching.
export function simulationSteps(wallSeconds) {
  const elapsed = Math.max(0, Math.min(Number(wallSeconds) || 0, .25));
  const count = Math.max(1, Math.ceil(elapsed / (1/60)));
  return { count, dt: elapsed / count };
}
