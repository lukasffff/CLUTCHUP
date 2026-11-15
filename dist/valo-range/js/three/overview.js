import * as THREE from 'three';
import { STLLoader } from '../../vendor/loaders/STLLoader.js';
import { OrbitControls } from '../../vendor/OrbitControls.js';

const status = document.getElementById('status');

async function start() {
  const geometry = await new STLLoader().loadAsync(new URL('../../assets/ascent-overview.stl', import.meta.url));
  geometry.rotateX(-Math.PI / 2);
  geometry.center();
  const renderer = new THREE.WebGLRenderer({canvas: document.getElementById('map'), antialias: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x181c28);
  const camera = new THREE.PerspectiveCamera(39, 1, .2, 1500);
  camera.position.set(10, 310, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 36;
  controls.maxDistance = 650;
  const model = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({color: 0x79d0bf, flatShading: true, side: THREE.DoubleSide}));
  scene.add(model, new THREE.HemisphereLight(0xe3e6ff,0x4c4665, 2));
  const sun = new THREE.DirectionalLight(0xffd0a0, 2.6);
  sun.position.set(28, 115, 64);
  scene.add(sun);
  function resize(){
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight,false);
  }
  addEventListener('resize', resize);
  resize();
  status.textContent = 'Ascent STL relief';
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene,camera); });
}
start().catch(error => { status.textContent = 'The map could not be displayed.'; console.error(error); });
