export const BENCHMARK_RULES = 'Harbor v3 · aim / customs / cover';
export const BENCHMARK_TRIALS = ['aim', 'peek', 'duelcover'];

export function completeRuns(history, playerKey) {
  const runs = new Map();
  for (const row of history) {
    if (row.playerKey !== playerKey || row.protocol !== BENCHMARK_RULES || !row.run || !row.benchmark ||
        BENCHMARK_TRIALS[row.round - 1] !== row.trial) continue;
    const run = runs.get(row.run) || { id: row.run, kind: row.benchmark, rounds: [] };
    if (!run.rounds.some(r => r.round === row.round) && run.kind === row.benchmark) run.rounds.push(row);
    runs.set(row.run, run);
  }
  return [...runs.values()].filter(run => run.rounds.length === BENCHMARK_TRIALS.length)
    .map(run => ({...run, rounds:run.rounds.sort((a,b)=>a.round-b.round),
      ended:Math.max(...run.rounds.map(row=>row.created))})).sort((a,b)=>b.ended-a.ended);
}

export function compareBenchmarks(history, playerKey, afterRun) {
  const runs = completeRuns(history, playerKey);
  const requested = afterRun ? runs.find(run => run.id === afterRun && run.kind === 'after') : null;
  if (afterRun && !requested) return {};
  // A new baseline starts a new comparison. Historical reports bind to their
  // own retest rather than borrowing the newest results in the profile.
  const before = runs.find(run => run.kind === 'before' && (!requested || run.ended < requested.ended));
  const after = before && (requested || runs.find(run => run.kind === 'after' && run.ended > before.ended));
  return { before, after: after || undefined };
}

export function runStats(run) {
  const totals = { wins:0, shots:0, hits:0, head:0, movingShots:0, aimSamples:0, belowHead:0, aboveHead:0, aliveSeconds:0, multiSeconds:0, peeks:0, unreadyPeeks:0, coverResets:0, damageTaken:0 };
  for (const round of run.rounds) {
    if (round.won) totals.wins++;
    for (const key of Object.keys(totals)) if (key !== 'wins') totals[key] += round.data[key] || 0;
  }
  return totals;
}
