export const HABITS_VERSION = 1;
export const LANES = { west: 'Container lane (west)', middle: 'Customs (mid)', east: 'Quayside (east)' };

export function profileKey(profile) {
  return String(profile?.riot || '').trim().toLowerCase() || 'local';
}

function laneAt(x) {
  return x < -16 ? 'west' : x > 16 ? 'east' : 'middle';
}

export class HabitsTracker {
  constructor() {
    this.route = [];
    this.laneSeconds = { west: 0, middle: 0, east: 0 };
    this.seconds = { still: 0, walk: 0, run: 0, crouch: 0, airborne: 0 };
    this.peeks = {};
    this.distance = 0;
    this.overexposures = 0;
    this.unready = 0;
    this.jumps = 0;
  }

  sample(player, dt, exposed, aimed, openedByPlayer) {
    const point = player.position;
    const speed = player.moveSpeed2D;
    const previous = this.previous;
    const moved = previous ? Math.hypot(point.x - previous.x, point.z - previous.z) : 0;
    // Teleports and instantaneous ability moves are not route samples.
    const continuous = moved <= Math.max(.7, dt * 7.5);
    if (continuous) this.distance += moved;
    const mode = !player.onGround ? 'airborne' : speed < .65 ? 'still' : player.crouching ? 'crouch' : speed < 2.65 ? 'walk' : 'run';
    this.seconds[mode] += dt;
    if (previous?.onGround && !player.onGround) this.jumps++;

    // A route starts outside the contested band. A lesson spawn inside the
    // band should never count as the player's route preference by itself.
    const outside = point.z < -14 || point.z > 18;
    if (outside) this.enteredFromOutside = true;
    if (this.enteredFromOutside && previous && continuous && moved > .12 && !outside) {
      const lane = laneAt(point.x);
      this.laneSeconds[lane] += dt;
      if (lane !== this.candidate) { this.candidate = lane; this.candidateTime = 0; }
      this.candidateTime += dt;
      if (this.candidateTime >= .75 && this.route.at(-1) !== lane && this.route.length < 12) this.route.push(lane);
    } else {
      this.candidate = null;
      this.candidateTime = 0;
    }

    if (continuous && exposed && openedByPlayer && previous && !this.exposed) {
      const x = Math.round(point.x / 4), z = Math.round(point.z / 4);
      const key = x + ',' + z;
      if (!this.peeks[key] && Object.keys(this.peeks).length < 24) this.peeks[key] = { x: x * 4, z: z * 4, count: 0, unready: 0 };
      if (this.peeks[key]) {
        this.peeks[key].count++;
        if (!aimed) this.peeks[key].unready++;
      }
      if (!aimed) this.unready++;
    }
    this.exposedTime = exposed ? (this.exposedTime || 0) + dt : 0;
    if (!exposed) this.exposureCounted = false;
    if (this.exposedTime >= 2 && speed < .65 && !this.exposureCounted) {
      this.overexposures++;
      this.exposureCounted = true;
    }
    this.exposed = exposed;
    this.previous = { x: point.x, y: point.y, z: point.z, onGround: player.onGround };
  }

  report() {
    const round = value => +value.toFixed(2);
    return {
      version: HABITS_VERSION,
      route: this.route.slice(),
      approach: this.route[0] || null,
      distance: round(this.distance),
      seconds: Object.fromEntries(Object.entries(this.seconds).map(([key, value]) => [key, round(value)])),
      laneSeconds: Object.fromEntries(Object.entries(this.laneSeconds).map(([key, value]) => [key, round(value)])),
      peeks: Object.values(this.peeks),
      unready: this.unready,
      overexposures: this.overexposures,
      jumps: this.jumps
    };
  }
}

export function summarizeHabits(history, playerKey, side, lesson) {
  const rows = history.filter(row => row.duel && !row.benchmark && row.map === 'harbor' &&
    row.playerKey === playerKey && (!side || row.side === side) &&
    (lesson === undefined || row.lesson === lesson) && row.habits?.version === HABITS_VERSION).slice(0, 12);
  const failures = {};
  for (const row of rows) if (row.won && row.botRoute) failures[row.botRoute] = (failures[row.botRoute] || 0) + 1;
  const votes = { west: 0, middle: 0, east: 0 };
  const cells = new Map();
  for (const row of rows) {
    const { approach, peeks } = row.habits;
    if (Object.hasOwn(votes, approach)) votes[approach]++;
    for (const peek of peeks) {
      const key = peek.x + ',' + peek.z;
      const total = cells.get(key) || { x: peek.x, z: peek.z, count: 0, unready: 0, rounds: 0 };
      total.count += peek.count;
      total.unready += peek.unready;
      total.rounds++;
      cells.set(key, total);
    }
  }
  const [lane, count] = Object.entries(votes).sort((a,b) => b[1] - a[1])[0];
  const observed = Object.values(votes).reduce((a,b) => a+b, 0);
  const repeat = [...cells.values()].filter(cell => cell.rounds >= 2 && cell.count >= 3).sort((a,b) => b.rounds - a.rounds || b.count - a.count)[0];
  const exposedRounds = rows.filter(row => row.habits.overexposures > 0).length;
  return { rounds: rows.length, failures, votes, observed, exposedRounds, preferred: observed >= 3 && count >= 2 && count / observed >= 2/3 ? { lane, count } : null,
    repeat: repeat || null, unready: rows.reduce((sum,row) => sum + row.habits.unready, 0), overexposures: rows.reduce((sum,row) => sum + row.habits.overexposures, 0) };
}

export function chooseOpponentTactic(summary, playerSide, site, routes, areas) {
  if (playerSide === 'ct') {
    const failed = Object.entries(summary.failures || {}).find(([,count]) => count >= 2);
    const alternative = failed && routes.find(route => route.name !== failed[0]);
    if (alternative) return {type:'attack-route',choice:alternative.name,
      reason:'The opponent lost '+failed[1]+' comparable attempts on '+failed[0]+'. Trying another authored route.',
      evidence:{failedRoute:failed[0],losses:failed[1]}};
  }
  const preferred = summary.preferred;
  if (!preferred) return null;
  const evidence = { lane: preferred.lane, count: preferred.count, observed: summary.observed };
  const reason = LANES[preferred.lane] + ' was the first committed approach in ' +
    preferred.count + ' of ' + summary.observed + ' observed rounds for this setup.';
  if (playerSide === 't') {
    const waitInCover = summary.exposedRounds >= 3;
    const names = waitInCover ? { west: 'B cargo pier', east: 'A dry dock', middle: 'north cross' }
      : { west: 'container lane', east: 'quayside', middle: 'customs hall' };
    const area = areas.find(candidate => candidate.name === names[preferred.lane]);
    const exposure = waitInCover ? ' Moved the patrol back toward the site because '+summary.exposedRounds+
      ' comparable rounds contained a sustained stationary exposure.' : '';
    return area ? { type: 'hold-lane', choice: area.name, reason: reason + exposure,
      evidence: {...evidence, exposedRounds:summary.exposedRounds} } : null;
  }
  const wanted = preferred.lane === 'middle' ? (site === 'A' ? 'quayside' : 'container yard')
    : preferred.lane === 'east' && site === 'A' ? 'quayside'
    : preferred.lane === 'west' && site === 'B' ? 'container yard' : 'customs flank';
  const route = routes.find(candidate => candidate.name === wanted);
  return route ? { type: 'attack-route', choice: route.name, reason, evidence } : null;
}
