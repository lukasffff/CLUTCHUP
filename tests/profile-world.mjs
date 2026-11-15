import {harbor} from './world-fixture.mjs';
import {Vector3} from 'three';
function rawRaycast(origin, dir, maxDist, ignoredMesh) {
    const rc = this._raycaster;
    rc.ray.origin.copy(origin);
    rc.ray.direction.copy(dir).normalize();
    rc.near = 0;
    rc.far = maxDist;
    this._rayHits.length = 0;
    rc.intersectObjects(this.solids.children, false, this._rayHits);
    if (this._rayHits.length === 0) return null;
    const hit = ignoredMesh ? this._rayHits.find(candidate => candidate.object !== ignoredMesh) : this._rayHits[0];
    if (!hit) return null;
    const normal = hit.face
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      : new THREE.Vector3(0, 1, 0);
    return {
      point: hit.point,
      normal,
      distance: hit.distance,
      mesh: hit.object,
      surface: hit.object.userData.surface || 'concrete',
    };
  }
const world=await harbor();
const nodes=world.waypoints.nodes;
const rays=nodes.flatMap((a,i)=>nodes.filter((b,j)=>i!==j && j%4===0).map(b=>{
 const origin=a.pos.clone().add(new Vector3(0,1.6,0)), target=b.pos.clone().add(new Vector3(0,1.6,0));
 return {origin,dir:target.sub(origin).normalize(),distance:a.pos.distanceTo(b.pos)};
}));
function measure(fn) { for(let i=0;i<3;i++)fn(); const values=[]; for(let i=0;i<9;i++){const start=performance.now();fn();values.push(performance.now()-start);} return values.sort((a,b)=>a-b)[4]; }
const rayMs=measure(()=>{for(const r of rays)world.raycast(r.origin,r.dir,r.distance);});
const rawMs=measure(()=>{for(const r of rays)rawRaycast.call(world,r.origin,r.dir,r.distance);});
const pathMs=measure(()=>{for(const a of nodes)for(const b of nodes)world.findPath(a.pos,b.pos);});
const movementMs=measure(()=>{for(let repeat=0;repeat<20;repeat++)for(const n of nodes)world.resolveMovement(n.pos,new Vector3(.02,-.01,.03),.35,1.83);});
console.log(JSON.stringify({rays:rays.length,rayMedianMs:rayMs,originalRayMedianMs:rawMs,pathQueries:nodes.length**2,pathMedianMs:pathMs,movements:nodes.length*20,movementMedianMs:movementMs,solids:world.solids.children.length}));
