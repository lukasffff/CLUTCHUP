import { agentId } from './tactical-match/src/game/agents.js';
import { compareBenchmarks, completeRuns, runStats } from './benchmark.js';

export const STORE = 'clutchiq.session.v2';
export const PROFILE = 'clutchiq.profile';
export const lessons = {
  movement: { title: 'Stop, then shoot', focus: 'Release movement before your first shot. Fire a short burst from cover, then move again.', metric: 'moving', min: 5, threshold: .30, goal: 'Fire at least five shots, with no more than 30% while moving.' },
  cover: { title: 'Fight one angle at a time', focus: 'Stay near a wall or crate. Edge out until you can see one approach, then fall back before opening the next angle.', metric: 'exposure', min: 8, threshold: .20, goal: 'Play at least eight seconds alive, with no more than 20% in two or more clear enemy sightlines.' },
  peek: { title: 'Clear the next angle', focus: 'Start behind cover and pre-aim the doorway. Expose only enough to see the next angle, then reset.', metric: 'unreadyPeeks', min: 2, threshold: .50, goal: 'Open at least two sightlines and have your aim within roughly 20° of the opposing angle on at least half of those openings.' },
  duelcover: { title: 'Break contact with cover', focus: 'Work from the edge of hard cover. After exposing yourself to the opponent, move back to break the line of sight while the opponent is still alive.', metric: 'coverReset', min: 1, threshold: 0, goal: 'Break the opponent’s sightline at least once after making contact.' },
  aim: { title: 'Hold head height', focus: 'Aim where the next opponent’s head could appear. Keep that height as you move past a doorway. Use short bursts.', metric: 'lowAim', min: 5, threshold: .40, goal: 'Take at least five crosshair samples; 40% or fewer should fall outside head height near the target’s head.' },
  utility: { title: 'Use utility with a purpose', focus: 'Aim at a contested approach from cover. Deploy a smoke, barrier, flash, or sensor before you or a teammate moves. For a dash, aim for cover that breaks a sightline.', metric: 'utility', min: 1, threshold: 0, goal: 'Record one enemy affected, one sightline screened, or a dash that ends with fewer exposed sightlines.' },
  objective: { title: 'Play the objective', focus: 'Use the minimap, clear cover, then hold the objective key (F by default) in the marked site to plant. Buy smoke or flash with B if you need a safer approach.', metric: 'plant', min: 1, threshold: 0, goal: 'Plant once yourself on either site as the attacker.' }
};
const own = (object, key) => Object.hasOwn(object, key);
export function read(key, fallback, storage) {
  try { return JSON.parse((storage ?? globalThis.localStorage).getItem(key)) ?? fallback; } catch { return fallback; }
}
export function save(record, storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const history = read(STORE, [], target);
    target.setItem(STORE, JSON.stringify([record, ...history.filter(r => r.id !== record.id)].slice(0, 300)));
    return true;
  } catch { return false; }
}
export function launchSpec(search) {
  const q = new URLSearchParams(search);
  const phase = q.get('coach');
  if (!['assessment', 'training', 'reassessment', 'practice'].includes(phase)) return null;
  const selected = own(lessons, q.get('lesson')) ? q.get('lesson') : null;
  const lesson = selected === 'cover' ? 'duelcover' : selected;
  const benchmark = phase === 'assessment' ? 'before' : phase === 'reassessment' ? 'after' : null;
  const support = phase === 'training' && q.get('support') === '1';
  const duel = true;
  const challenge = duel && !support && q.get('challenge') === '1';
  return { phase, lesson, support, side: !benchmark && (q.get('side') === 't' || (phase === 'training' && lesson === 'objective')) ? 't' : 'ct',
    duel, challenge, benchmark,
    demo: phase === 'training' && !challenge && q.get('demo') !== '0',
    agent: benchmark ? 'controller' : q.has('agent') ? agentId(q.get('agent')) : null,
    site: (duel || lesson === 'utility') && ['A','B'].includes(q.get('site')) ? q.get('site') : duel ? (['duelcover','utility'].includes(lesson) ? 'B' : 'A') : null,
    reactionDelay: phase === 'training' ? (support ? .60 : challenge ? 0 : .24) : 0 };
}
const ratio = (a, b) => b > 0 ? a / b : null;
export function metrics(m) {
  return {
    accuracy: ratio(m.hits, m.shots), headshots: ratio(m.head, m.hits),
    moving: ratio(m.movingShots, m.shots), exposure: ratio(m.multiSeconds, m.aliveSeconds),
    lowAim: ratio((m.belowHead || 0) + (m.aboveHead || 0), m.aimSamples), plant: m.plants > 0 ? 0 : 1,
    utility: m.utilityCasts?.some(utilityEffective) ? 0 : 1,
    unreadyPeeks: ratio(m.unreadyPeeks, m.peeks), coverReset: m.coverResets > 0 ? 0 : 1
  };
}
function countFor(lesson, m) {
  return ({moving: m.shots, exposure: m.aliveSeconds, lowAim: m.aimSamples, plant: m.planters, utility: m.utilityCasts?.length, unreadyPeeks: m.peeks, coverReset: Math.max(m.peeks || 0, m.coverResets || 0)})[lesson.metric] || 0;
}
export function findings(m) {
  const ratios = metrics(m);
  return Object.entries(lessons).flatMap(([id, lesson]) => {
    if (id === 'objective' || id === 'utility' || id === 'duelcover' || countFor(lesson, m) < lesson.min) return [];
    const value = ratios[lesson.metric];
    return value > lesson.threshold ? [{ id, value, excess: (value - lesson.threshold) / (1 - lesson.threshold) }] : [];
  }).sort((a,b) => b.excess - a.excess);
}
// Only independent attempts establish a recurring weakness. Each attempt must
// itself have enough observations; a single long round cannot supply the votes.
export function recurringFindings(rows) {
  const eligible = rows.filter(row => row.source === 'tactical' && row.phase !== 'practice');
  const results = new Map();
  for (const row of eligible.slice(0, 12)) for (const finding of findings(row.data)) {
    const entry = results.get(finding.id) || { ...finding, attempts: 0, excess: 0 };
    entry.attempts++; entry.excess += finding.excess;
    results.set(finding.id, entry);
  }
  return [...results.values()].filter(item => item.attempts >= 2)
    .map(item => ({...item, excess: item.excess / item.attempts}))
    .sort((a,b) => b.excess - a.excess);
}

export function passed(id, m) {
  if (!id || !lessons[id]) return false;
  const lesson = lessons[id];
  return countFor(lesson, m) >= lesson.min && metrics(m)[lesson.metric] <= lesson.threshold;
}
export function next(history) {
  const rows = history.filter(x => x.source === 'tactical' && x.phase !== 'practice' && x.evaluated !== false);
  const latest = rows[0];
  if (!latest) return { phase: 'assessment', explanation: 'Play a live round so the coach can observe your movement, aim and use of cover.' };
  if (latest.benchmark) return nextFromAssessment(latest, history);
  if (latest.phase === 'training' && latest.duel) return nextDuel(latest, rows);
  if (latest.phase === 'training') {
    if (!passed(latest.lesson, latest.data) && !latest.support) return { phase: 'training', lesson: latest.lesson, support: true, duel: latest.duel, agent: latest.agent, side: latest.side, site: latest.site,
      explanation: 'Repeat the same exercise. Opponents wait longer after they spot you so you have more time to apply the technique.' };
    return { phase: 'reassessment', explanation: 'Return to the original bot reaction settings and compare with your baseline.' };
  }
  const utility = utilityAdvice(latest.data);
  if (utility) return { phase: 'training', lesson: 'utility', agent: latest.agent, side: latest.side, site: latest.data.smokeOpportunity?.site || latest.site, explanation: utility };
  const weakness = recurringFindings(rows.filter(row => row.playerKey === latest.playerKey && row.side === latest.side))[0];
  const hasEvidence = Object.entries(lessons).some(([id, l]) => id !== 'objective' && id !== 'utility' && countFor(l, latest.data) >= l.min);
  if (!hasEvidence) return { phase: 'assessment', explanation: 'There were too few observations. Stay in the fight and take a few shots so the coach can measure your play.' };
  if (!weakness) return { phase: 'assessment', explanation: 'One attempt is an observation, not a recurring weakness. Complete the three assessment trials to establish a pattern.' };
  const id = weakness.id;
  return { phase: 'training', lesson: id, explanation: weakness ? lessons[id].focus : 'The observed metrics did not cross a lesson threshold. Practice the attacking objective next.' };
}

function nextFromAssessment(latest, history) {
  const run = completeRuns(history, latest.playerKey).find(candidate => candidate.id === latest.run);
  if (!run) {
    return { phase: latest.phase, explanation: 'Finish all three assessment trials so the coach can use a complete set of observations.' };
  }
  const data = runStats(run);
  const paired = latest.benchmark === 'after' ? compareBenchmarks(history, latest.playerKey) : null;
  const changed = paired?.before && paired?.after ? 'Comparable reassessment saved. ' : '';
  const weakness = recurringFindings(run.rounds)[0];
  if (weakness) {
    return { phase: 'training', duel: true, lesson: weakness.id,
      explanation: changed + 'This skill crossed its coaching threshold in '+weakness.attempts+' independent assessment trials. '+lessons[weakness.id].focus };
  }
  const exposedTrials = run.rounds.filter(row => (row.data.peeks > 0 && !row.data.coverResets) || row.habits?.overexposures > 0);
  if (exposedTrials.length >= 2) {
    return { phase: 'training', duel: true, lesson: 'duelcover',
      explanation: 'In '+exposedTrials.length+' independent trials, the assessment recorded an opening without a cover reset or prolonged stationary exposure. Practice retreating behind cover.' };
  }
  if (data.shots < lessons.movement.min && data.aimSamples < lessons.aim.min && data.peeks === 0) {
    return { phase: latest.phase, explanation: 'The three trials gave too few aim or movement observations. Take more engagements in a repeat assessment.' };
  }
  return { phase: 'training', duel: true, lesson: 'utility',
    explanation: 'None of the observed aim, peeking or movement metrics crossed a coaching threshold. Practice utility in a live 1v1 next.' };
}
function nextDuel(latest, rows) {
  const plan = { phase:'training', duel:true, lesson:latest.lesson, side:latest.side, site:latest.site, agent:latest.agent };
  const targetMet = passed(latest.lesson, latest.data);
  if (!targetMet) {
    return { ...plan, support: !latest.challenge, explanation: latest.challenge ?
      'Return to the guided version of the same 1v1. The opponent gives you more time and the aim lesson restores its visual guide.' :
      'Repeat the same 1v1. The opponent waits longer before its first shot so you can practice the technique.' };
  }
  if (latest.support) return { ...plan, explanation: 'You reached the target with assistance. Repeat under standard 1v1 conditions.' };
  if (!latest.challenge) {
    const prior = rows.slice(1).find(row => comparableDuel(row, latest));
    if (!prior || !passed(latest.lesson, prior.data)) return { ...plan, explanation: 'You reached the target. Repeat with the same agent, approach and opponent settings before increasing difficulty.' };
    return { ...plan, challenge:true, explanation: 'You reached the target in consecutive comparable attempts. Try normal bot reactions. The aim guide is removed.' };
  }
  return { phase: 'reassessment', lesson: latest.lesson, duel: true,
    explanation: 'Challenge target met. Replay the original three fixed trials to compare with your baseline, then choose the next lesson from the new evidence.' };
}

export function comparableDuel(a, b) {
  return a.duel && b.duel && a.playerKey === b.playerKey && a.map === b.map && a.lesson === b.lesson && a.agent === b.agent &&
    a.side === b.side && a.site === b.site && !!a.support === !!b.support && !!a.challenge === !!b.challenge &&
    a.round === b.round && a.evaluated !== false && b.evaluated !== false;
}

export function utilityEffective(cast) {
  return cast.enemies?.length > 0 || (cast.type === 'dash' && cast.contactAfter < cast.contactBefore);
}

export function utilityAdvice(data) {
  const casts = data.utilityCasts || [];
  const missed = data.smokeOpportunity;
  if (missed && !casts.some(cast => cast.type === 'smoke' && utilityEffective(cast))) {
    return 'At ' + missed.at.toFixed(1) + ' s you moved into multiple clear enemy sightlines with ' + missed.ability +
      ' available. A legal placement from your aim would have blocked ' + missed.enemies +
      ' of those lines. In the next Harbor round, place smoke before crossing.';
  }
  const unobserved = casts.filter(cast => cast.observed && !utilityEffective(cast) && ['smoke', 'recon', 'flash'].includes(cast.type));
  const repeated = unobserved.find(cast => unobserved.filter(other => other.name === cast.name).length >= 2);
  if (repeated) return repeated.name + ' had no recorded enemy effect in multiple completed uses. Try it on a confirmed approach while you or a teammate can act. The game does not measure deterrence.';
  return null;
}

export function sessionURL(spec) {
  const q = new URLSearchParams({ coach: spec.phase, map: 'harbor' });
  if (spec.lesson && own(lessons, spec.lesson)) q.set('lesson', spec.lesson);
  if (spec.support) q.set('support', '1');
  if (spec.duel) q.set('duel', '1');
  if (spec.demo === false) q.set('demo', '0');
  if (spec.challenge) q.set('challenge', '1');
  if (spec.agent) q.set('agent', agentId(spec.agent));
  if (['A','B'].includes(spec.site)) q.set('site', spec.site);
  if (spec.side === 't') q.set('side', 't');
  if (spec.low) q.set('quality', 'low');
  return './tactical-match/?' + q;
}
