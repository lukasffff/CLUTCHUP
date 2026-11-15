export const SLOTS = ['ability1', 'ability2', 'signature', 'ultimate'];

const ability = (name, icon, type, charges, range, duration, details, extra = {}) =>
  Object.freeze({ name, icon, type, charges, range, duration, details, cooldown: 0, ...extra });

export const AGENTS = Object.freeze({
  duelist: {
    name: 'Kestrel', role: 'Duelist', summary: 'Break the first angle and reach cover before defenders reset.',
    kit: [
      ability('Slipstream', '»', 'dash', 2, 4.5, 0, 'Grounded dash in your movement direction. Stops at walls and ledges.', { cooldown: 4 }),
      ability('Glint', '✦', 'flash', 1, 15, .5, 'Aim at a surface and look away before the flash bursts. Walls and smoke shield contacts.'),
      ability('Veil Step', '●', 'smoke', 2, 12, 5, 'Place a small smoke screen for a close crossing.', { radius: 2, cooldown: 3 }),
      ability('Overtake', '»', 'dash', 1, 9, 0, 'One longer grounded dash for a committed entry.', { ultimate: true })
    ]
  },
  controller: {
    name: 'Morrow', role: 'Controller', summary: 'Cut distant sightlines and deny a route while your team crosses.',
    kit: [
      ability('Waypoint Smoke', '●', 'smoke', 2, 25, 12, 'Place an opaque smoke on a surface that you can reach with your aim.', { radius: 3.2, cooldown: 4 }),
      ability('Ember Field', '△', 'zone', 1, 18, 7, 'Damage anyone who stands on the marked floor. Allies can be hurt.', { radius: 3, damage: 8 }),
      ability('Crosswall', '▰', 'barrier', 1, 14, 10, 'Place solid cover perpendicular to your aim. It blocks everyone, including your team.', { width: 4 }),
      ability('Nightfall', '◉', 'smoke', 1, 28, 17, 'Cover the entrance and neighboring sightlines with a larger smoke.', { radius: 5, ultimate: true })
    ]
  },
  initiator: {
    name: 'Relay', role: 'Initiator', summary: 'Locate defenders from new angles and disrupt their response.',
    kit: [
      ability('Survey Node', '◎', 'recon', 2, 18, 6, 'Detect enemies in a clear line from the node. Sightings are shared on the radar.', { radius: 13, cooldown: 4 }),
      ability('Corner Burst', '✦', 'flash', 2, 18, .6, 'Flash around an entrance from a placed burst. Turn away from the pop.', { cooldown: 3 }),
      ability('Static Patch', '⌁', 'slow', 1, 19, 6, 'Slow movement on the marked floor. Cast in a defender’s escape route.', { radius: 3.4 }),
      ability('Wide Sweep', '◉', 'recon', 1, 25, 10, 'A wider reconnaissance pulse. Walls and smoke still block detection.', { radius: 20, ultimate: true })
    ]
  },
  sentinel: {
    name: 'Bastion', role: 'Sentinel', summary: 'Make a doorway expensive to cross and spot a flank early.',
    kit: [
      ability('Gatepost', '▰', 'barrier', 2, 11, 14, 'Block a lane with a narrow solid barricade.', { width: 3.2, cooldown: 5 }),
      ability('Frost Mesh', '⌁', 'slow', 2, 13, 8, 'Slow movement on an approach or around the objective.', { radius: 4, cooldown: 4 }),
      ability('Trip Beacon', '◇', 'trap', 2, 11, 30, 'A floor sensor reveals the first exposed enemy who steps within range.', { radius: 2.3, cooldown: 4 }),
      ability('Last Line', '△', 'zone', 1, 15, 12, 'Hold a wide section of floor with an extended hazard field.', { radius: 4.5, damage: 10, ultimate: true })
    ]
  }
});

export const agentId = value => Object.hasOwn(AGENTS, value) ? value : 'controller';

// Serverless alternate for users who disable browser storage.
export function preferredAgent() {
  try { return agentId(localStorage.getItem('clutchiq.agent')); } catch { return 'controller'; }
}

export function rememberAgent(id) {
  try { localStorage.setItem('clutchiq.agent', agentId(id)); } catch { /* Match selection still applies. */ }
}

export function segmentNearPoint(a, b, point, radius) {
  const abX = b.x-a.x, abY = b.y-a.y, abZ = b.z-a.z;
  const lengthSq = abX**2 + abY**2 + abZ**2;
  const offsetX = point.x-a.x, offsetY = point.y-a.y, offsetZ = point.z-a.z;
  const t = lengthSq ? Math.max(0, Math.min(1, (offsetX*abX + offsetY*abY + offsetZ*abZ)/lengthSq)) : 0;
  return (offsetX-t*abX)**2 + (offsetY-t*abY)**2 + (offsetZ-t*abZ)**2 < radius**2;
}
