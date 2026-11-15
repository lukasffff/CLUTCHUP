import assert from 'node:assert/strict';
import * as THREE from 'three';
const gradient = { addColorStop() {} };
const context = new Proxy({}, {
  get(target, key) {
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
    if (!(key in target)) target[key] = () => {};
    return target[key];
  },
  set(target, key, value) { target[key] = value; return true; },
});
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas');
    return { width: 0, height: 0, getContext: () => context };
  },
};


export async function harbor() {
 const {default:World}=await import('../dist/tactical-match/src/world/map.js');
 return new World({selectedMapId:'harbor',scene:new THREE.Scene(),config:{PLAYER:{STEP_HEIGHT:.62}},state:{phase:'menu'},events:{on(){},emit(){}}});
}
