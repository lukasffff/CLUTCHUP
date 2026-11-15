export const BENCHMARK_RULES = 'Harbor v1 · aim / customs / cover';
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

export function compareBenchmarks(history, playerKey) {
  const runs = completeRuns(history, playerKey);
  const after = runs.find(run => run.kind === 'after');
  const before = runs.find(run => run.kind === 'before' && (!after || run.ended < after.ended));
  return { before, after: before ? after : undefined };
}

export function runStats(run) {
  const totals = { wins:0, shots:0, hits:0, movingShots:0, aimSamples:0, belowHead:0, peeks:0, unreadyPeeks:0, coverResets:0, damageTaken:0 };
  for (const round of run.rounds) {
    if (round.won) totals.wins++;
    for (const key of Object.keys(totals)) if (key !== 'wins') totals[key] += round.data[key] || 0;
  }
  return totals;
}
