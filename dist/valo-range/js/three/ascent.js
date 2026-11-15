import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/loaders/GLTFLoader.js';
import { loadImportedMap, mapMovement } from './imported-map.js';

export async function loadStudy(scene, id) {
  const imported = id === 'ascent' ? null : await loadImportedMap(id);
  const map = imported?.map ?? (await new GLTFLoader().loadAsync(new URL('../../assets/ascent_b_site_study.glb', import.meta.url).href)).scene;
  if (!imported) map.rotation.x = -Math.PI / 2;
  map.visible = false;
  scene.add(map);
  map.updateMatrixWorld(true);
  const occluders = [];
  const solids = [];
  const steps = [];
  if (imported) occluders.push(imported.collider);
  else map.traverse(mesh => {
    if (!mesh.isMesh) return;
    if (!mesh.geometry.hasAttribute('normal')) mesh.geometry.computeVertexNormals();
    occluders.push(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    if (/^market_(step_\d+|platform)$/.test(mesh.name)) steps.push(box);
    else if (/^(north_wall_(left|right)|north_shutter|west_wall|east_wall|crate_[0-3]|market_(back_wall|entrance)|stacked_logs_\d+)$/.test(mesh.name) && box.min.y < 1.45) solids.push(box);
  });
  const lights = new THREE.Group();
  lights.add(new THREE.AmbientLight(0xfff4e5, .85));
  lights.add(new THREE.HemisphereLight(0xfff1e4, 0x645d76, 2.1));
  const sun = new THREE.DirectionalLight(0xffe2bd, 2.4);
  sun.position.set(-12, 20, 9);
  lights.add(sun);
  lights.visible = false;
  scene.add(lights);

  const smoke = new THREE.Mesh(new THREE.SphereGeometry(2.6, 32, 20),
    new THREE.MeshBasicMaterial({color: 0x5c477b, side: THREE.DoubleSide}));
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12),
    new THREE.MeshBasicMaterial({color: 0x7fffea, wireframe: true, transparent: true, opacity: .65}));
  smoke.visible = pulse.visible = false;
  scene.add(smoke, pulse);

  const ray = new THREE.Raycaster();
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const flashOrigin = new THREE.Vector3();
  const markers = new Map();
  let flashUntil = 0, smokeUntil = 0, reconUntil = 0, flashDecay = 0;
  const utility = document.getElementById('ascent-utility');
  const glare = document.getElementById('ascent-flash');
  let charges;

  function reset() {
    charges = { smoke: 2, flash: 2, recon: 1 };
    flashUntil = smokeUntil = reconUntil = flashDecay = 0;
    smoke.visible = pulse.visible = false;
    glare.style.opacity = 0;
    for (const marker of markers.values()) scene.remove(marker);
    markers.clear();
    updateHud();
  }
  function updateHud() {
    utility.textContent = 'F Smoke ' + charges.smoke + '  ·  X Flash ' + charges.flash + '  ·  E Recon ' + charges.recon;
  }
  function visible(from, to, includeSmoke = true) {
    a.subVectors(to, from);
    const distance = a.length();
    if (distance < .001) return true;
    ray.set(from, a.normalize());
    ray.far = distance - .04;
    return ray.intersectObjects(smoke.visible && includeSmoke ? [...occluders, smoke] : occluders, false).length === 0;
  }
  function move(pos, vel, dt, air, floor) {
    const blocks = (x, z) => solids.some(box => pos.y - 1.15 < box.max.y &&
      x > box.min.x - .28 && x < box.max.x + .28 && z > box.min.z - .28 && z < box.max.z + .28);
    const x = Math.max(-11.15, Math.min(11.15, pos.x + vel.x * dt));
    const z = Math.max(-8.65, Math.min(9.65, pos.z + vel.z * dt));
    const support = (nx, nz) => steps.reduce((top, box) =>
      nx >= box.min.x && nx <= box.max.x && nz >= box.min.z && nz <= box.max.z ? Math.max(top, box.max.y) : top, 0);
    if (!blocks(x, pos.z) && support(x, pos.z) <= floor + Math.max(.34, air + .15)) pos.x = x;
    else vel.x = 0;
    if (!blocks(pos.x, z) && support(pos.x, z) <= floor + Math.max(.34, air + .15)) pos.z = z;
    else vel.z = 0;
    return support(pos.x, pos.z);
  }
  const casts = { KeyF: 'smoke', KeyX: 'flash', KeyE: 'recon' };
  function cast(key, camera, elapsed, targets) {
    const kind = casts[key];
    if (!kind || !charges[kind]) return;
    charges[kind]--;
    updateHud();
    camera.getWorldDirection(b);
    ray.set(camera.position, b);
    ray.far = 12;
    const hit = ray.intersectObjects(occluders, false)[0];
    const at = hit ? hit.point.clone().addScaledVector(b, -.2) : camera.position.clone().addScaledVector(b, 8);
    if (!imported) {
      at.x = THREE.MathUtils.clamp(at.x, -10.5, 10.5);
      at.z = THREE.MathUtils.clamp(at.z, -8.5, 8.5);
      at.y = 1.35;
    }
    if (kind === 'smoke') {
      smoke.position.copy(at);
      smoke.updateMatrixWorld(true);
      smoke.visible = true;
      smokeUntil = elapsed + 9;
    }
    if (kind === 'flash') {
      flashUntil = elapsed + .3;
      flashOrigin.copy(at);
    }
    if (kind === 'recon') {
      reconUntil = elapsed + 4;
      pulse.position.copy(at);
      for (const marker of markers.values()) scene.remove(marker);
      markers.clear();
      for (const actor of targets) detect(actor);
    }
  }
  const markerMaterial = new THREE.MeshBasicMaterial({color: 0x7fffea, depthTest: false, transparent: true, opacity: .9});
  const markerGeometry = new THREE.TorusGeometry(.32, .024, 6, 20);
  function detect(actor) {
    if (!actor.alive || markers.has(actor)) return;
    const head = actor.group.position.clone().add(new THREE.Vector3(0, 1.75, 0));
    if (head.distanceTo(pulse.position) > 10 || !visible(pulse.position, head, false)) return;
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.renderOrder = 20;
    scene.add(marker);
    markers.set(actor, marker);
  }
  function tick(elapsed, camera, targets) {
    if (elapsed >= smokeUntil) smoke.visible = false;
    if (flashUntil && elapsed >= flashUntil) {
      camera.getWorldDirection(b);
      const at = flashOrigin;
      const toward = at.clone().sub(camera.position).normalize();
      if (b.dot(toward) > .55 && camera.position.distanceTo(at) < 14 && visible(camera.position, at)) flashDecay = elapsed + 1.4;
      for (const target of targets) {
        if (target.alive && target.group.position.distanceTo(at) <= 8 &&
            visible(target.group.position.clone().add(new THREE.Vector3(0, 1.6, 0)), at)) target.blindUntil = elapsed + 2.4;
      }
      flashUntil = 0;
    }
    glare.style.opacity = Math.max(0, Math.min(1, (flashDecay - elapsed) * 1.6));
    for (const [actor, marker] of markers) {
      if (!actor.alive || elapsed >= reconUntil) {
        scene.remove(marker);
        markers.delete(actor);
      } else {
        marker.position.copy(actor.group.position);
        marker.position.y += 2.32;
        marker.quaternion.copy(camera.quaternion);
      }
    }
    pulse.visible = reconUntil > elapsed;
    if (pulse.visible) pulse.scale.setScalar(1 + (4 - (reconUntil - elapsed)) * .65);
  }
  return { map, lights, occluders, positions: imported?.positions, move: imported ? mapMovement(imported.collider) : move, reset, cast, tick, visible };
}
