import * as THREE from 'three';
import { acceleratedRaycast, MeshBVH, StaticGeometryGenerator } from '../../vendor/mesh-bvh.js';
import { GLTFLoader } from '../../vendor/loaders/GLTFLoader.js';

export async function loadImportedMap(id) {
  const [gltf, floors] = await Promise.all([
    new GLTFLoader().loadAsync(new URL('../../assets/' + id + '-b.glb', import.meta.url).href),
    fetch(new URL('../../assets/' + id + '-floors.json', import.meta.url)).then(response => {
      if (!response.ok) throw new Error('Missing map floor data');
      return response.json();
    })
  ]);
  const map = gltf.scene;
  const materials = new Set();
  map.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
  });
  for (const material of materials) {
    const cutout = /plant|foliage|leaves|grassblade|lanterncard/i.test(material.name);
    material.transparent = false;
    material.opacity = 1;
    material.alphaTest = cutout ? .4 : 0;
    material.depthWrite = true;
    material.side = THREE.DoubleSide;
    if (!material.emissiveMap) material.emissive?.set(0x000000);
    else material.emissiveIntensity = Math.min(.4, material.emissiveIntensity);
    if ('metalness' in material) material.metalness = Math.min(material.metalness, .35);
  }
  map.updateMatrixWorld(true);
  const generator = new StaticGeometryGenerator(map);
  generator.attributes = ['position'];
  generator.useGroups = false;
  const geometry = generator.generate();
  geometry.boundsTree = new MeshBVH(geometry, { maxLeafTris: 16 });
  const collider = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  collider.raycast = acceleratedRaycast;
  const positions = choosePositions(floors, collider);
  const underlay = new THREE.Mesh(new THREE.PlaneGeometry(110, 110),
    new THREE.MeshLambertMaterial({ color: id === 'summit' ? 0x646d70 : 0x79675a }));
  underlay.rotation.x = -Math.PI / 2;
  underlay.position.set(positions.spawn.x, Math.min(...floors.map(p => p[1])) - .12, positions.spawn.z);
  map.add(underlay);
  return { map, collider, positions };
}

function choosePositions(floors, collider) {
  const nodes = floors.map(p => new THREE.Vector3(...p));
  const key = (x, z) => Math.round(x * 100) + ',' + Math.round(z * 100);
  const grid = new Map(nodes.map(p => [key(p.x, p.z), p]));
  const unseen = new Set(nodes);
  const ray = new THREE.Raycaster();
  ray.firstHitOnly = true;
  const from = new THREE.Vector3(), delta = new THREE.Vector3();
  function clear(a, b, height) {
    from.copy(a);
    from.y += height;
    delta.subVectors(b, a);
    const distance = delta.length();
    ray.set(from, delta.normalize());
    ray.far = distance - .06;
    return ray.intersectObject(collider, false).length === 0;
  }
  let best = [];
  while (unseen.size) {
    const start = unseen.values().next().value;
    const group = [start];
    unseen.delete(start);
    for (const p of group) {
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const neighbor = grid.get(key(p.x + dx, p.z + dz));
        if (!unseen.has(neighbor) || Math.abs(p.y - neighbor.y) > .34 || !clear(p, neighbor, 1.3)) continue;
        unseen.delete(neighbor);
        group.push(neighbor);
      }
    }
    if (group.length > best.length) best = group;
  }
  if (best.length < 5) throw new Error('No walkable drill area found');
  let layout, top = -Infinity;
  for (const spawn of best.filter((_,i) => i % Math.max(1,Math.floor(best.length/35)) === 0)) {
    const sight = best.filter(p => p.distanceTo(spawn) > 4 && p.distanceTo(spawn) < 18 && clear(spawn, p, 1.6));
    if (!sight.length) continue;
    const first = sight.reduce((chosen,p) => Math.abs(p.distanceTo(spawn) - 9) < Math.abs(chosen.distanceTo(spawn) - 9) ? p : chosen);
    const bots = [first];
    while (bots.length < 4) {
      const next = best.filter(p => p.distanceTo(spawn) > 5 && p.distanceTo(spawn) < 27 && bots.every(b => b.distanceTo(p) > 3.5))
        .reduce((chosen,p) => {
          const score = q => Math.min(...bots.map(b => b.distanceTo(q))) - q.distanceTo(spawn) * .27;
          return !chosen || score(p) > score(chosen) ? p : chosen;
        }, null);
      if (!next) break;
      bots.push(next);
    }
    if (bots.length !== 4) continue;
    const visible = bots.filter(p => clear(spawn,p,1.6)).length;
    const score = -Math.abs(visible - 1) * 9 - Math.abs(first.distanceTo(spawn) - 9);
    if (score > top) { top = score; layout = { spawn, bots }; }
  }
  if (!layout) throw new Error('No four-target drill layout found');
  const first = layout.bots[0];
  layout.yaw = Math.atan2(layout.spawn.x - first.x, layout.spawn.z - first.z);
  return layout;
}

export function mapMovement(collider) {
  const ray = new THREE.Raycaster();
  ray.firstHitOnly = true;
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  function hit(x, y, z, dx, dy, dz, distance) {
    origin.set(x, y, z);
    direction.set(dx, dy, dz);
    ray.set(origin, direction);
    ray.far = distance;
    return ray.intersectObject(collider, false)[0];
  }
  return function move(pos, vel, dt, air, floor) {
    const radius = .27;
    const feet = floor + air;
    for (const axis of ['x', 'z']) {
      const delta = vel[axis] * dt;
      if (!delta) continue;
      const sign = Math.sign(delta);
      const dx = axis === 'x' ? sign : 0;
      const dz = axis === 'z' ? sign : 0;
      const wall = [0, -radius * .75, radius * .75].some(offset =>
        [feet + .45, Math.max(feet + .52, pos.y - .09)].some(y =>
          hit(pos.x + dz * offset, y, pos.z + dx * offset, dx, 0, dz, Math.abs(delta) + radius)));
      if (wall) { vel[axis] = 0; continue; }
      const x = pos.x + (axis === 'x' ? delta : 0);
      const z = pos.z + (axis === 'z' ? delta : 0);
      const ground = hit(x, feet + .34, z, 0, -1, 0, air + 1.08);
      if (ground && ground.face.normal.y > .45 && ground.point.y <= floor + .36) {
        pos[axis] += delta;
        floor = ground.point.y;
      } else vel[axis] = 0;
    }
    return floor;
  };
}
