"use strict";
window.createClutchRange = function (canvas, engine) {
  const T = window.THREE;
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.23;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.fog = new T.FogExp2("#c4a59d", .00128);
  const camera = new T.PerspectiveCamera(73, 1, .13, 2100);
  camera.rotation.order = "YXZ";
  const weaponScene = new T.Scene();
  const weaponCamera = new T.PerspectiveCamera(54, 1, .025, 12);
  const material = (color, settings = {}) => new T.MeshStandardMaterial({ color, roughness: .86, ...settings });
  const sand = material("#c88b71");
  const plaster = material("#e4ac88");
  const clay = material("#aa625b");
  const trim = material("#553f4c");
  const metal = material("#354751", { metalness: .35 });
  const dark = material("#1c2931");
  const teal = material("#55bcae");
  const warm = material("#e6b179", { emissive: "#f99a34", emissiveIntensity: .66 });
  const aqua = material("#6ff0d5", { emissive: "#33d8b1", emissiveIntensity: 1.25 });
  const red = material("#fd6577", { emissive: "#ff304b", emissiveIntensity: .82 });
  const impactMaterial = new T.MeshBasicMaterial({ color: "#2b1b1c", side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 });
  const boxGeometry = new T.BoxGeometry();
  const sphereGeometry = new T.SphereGeometry(1, 13, 9);
  function mesh(parent, geometry, mat, x, y, z, sx, sy, sz, shadow = true) {
    const model = new T.Mesh(geometry, mat);
    model.position.set(x, y, z);
    model.scale.set(sx, sy, sz);
    model.castShadow = shadow;
    model.receiveShadow = true;
    parent.add(model);
    return model;
  }
  function box(parent, mat, x, y, z, w, h, d, shadow) {
    return mesh(parent, boxGeometry, mat, x, y, z, w, h, d, shadow);
  }
  function ball(parent, mat, x, y, z, w, h, d, shadow) {
    return mesh(parent, sphereGeometry, mat, x, y, z, w, h, d, shadow);
  }
  const hemi = new T.HemisphereLight("#e4e7ff", "#8b6664", 2.05);
  scene.add(hemi);
  const sun = new T.DirectionalLight("#ffe2c1", 3.0);
  sun.position.set(-230, 480, 20);
  sun.target.position.set(430, 0, 215);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -540, right: 540, top: 470, bottom: -450, near: 25, far: 1400 });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 1.3;
  scene.add(sun, sun.target);

  const sky = new T.Mesh(new T.SphereGeometry(1, 36, 20), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 ray; void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec3 ray; void main(){vec3 d=normalize(ray);float h=max(d.y,0.);vec3 sky=mix(vec3(.98,.67,.51),vec3(.27,.44,.65),pow(h,.58));vec3 s=normalize(vec3(-.53,.29,-.80));float k=max(0.,dot(s,d));sky+=vec3(1.,.63,.36)*(pow(k,12.)*.25+pow(k,750.)*.9);float cloud=sin(46.*d.x+7.*sin(30.*d.z))*sin(35.*d.z+24.*d.y);sky=mix(sky,vec3(1.,.82,.70),smoothstep(.5,.95,cloud)*smoothstep(.09,.27,h)*.24);gl_FragColor=vec4(sky,1.);}'
  }));
  sky.scale.setScalar(1750);
  scene.add(sky);

  let seed = 874;
  function next() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const floorCanvas = document.createElement("canvas");
  floorCanvas.width = floorCanvas.height = 512;
  const ctx = floorCanvas.getContext("2d");
  ctx.fillStyle = "#998681";
  ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const tint = Math.floor(next() * 18);
    ctx.fillStyle = 'rgb(' + (150+tint) + ',' + (135+tint) + ',' + (134+tint) + ')';
    ctx.fillRect(x*128+2, y*128+2, 124, 124);
    ctx.strokeStyle = "#bbb0a555";
    ctx.strokeRect(x*128+6, y*128+6, 115, 115);
  }
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = next() < .5 ? "#493f4528" : "#fff2d81b";
    ctx.fillRect(next()*512, next()*512, 1+next()*3, 1+next()*2);
  }
  const floorTexture = new T.CanvasTexture(floorCanvas);
  floorTexture.colorSpace = T.SRGBColorSpace;
  floorTexture.wrapS = floorTexture.wrapT = T.RepeatWrapping;
  floorTexture.repeat.set(5, 3);
  floorTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  box(scene, material("#f3ddd6", { map: floorTexture }), 450, -3, 255, 980, 6, 558, false);

  function sign(label, x, y, z, w, color = "#b8f4e5") {
    const surface = document.createElement("canvas");
    surface.width = 512;
    surface.height = 128;
    const draw = surface.getContext("2d");
    draw.fillStyle = "#172430";
    draw.fillRect(0, 0, 512, 128);
    draw.fillStyle = color;
    draw.fillRect(20, 110, 472, 3);
    draw.font = "700 51px sans-serif";
    draw.textAlign = "center";
    draw.fillText(label, 256, 79);
    const map = new T.CanvasTexture(surface);
    map.colorSpace = T.SRGBColorSpace;
    const plate = new T.Mesh(new T.PlaneGeometry(w, w / 4), new T.MeshBasicMaterial({ map, side: T.DoubleSide }));
    plate.position.set(x,y,z);
    scene.add(plate);
  }

  for (const wall of engine.cover) {
    const x = wall.x + wall.w / 2;
    const z = wall.y + wall.h / 2;
    const h = wall.w > 130 ? 84 : 65;
    box(scene, sand, x, h/2, z, wall.w, h, wall.h);
    box(scene, plaster, x, h-2, z, wall.w+4, 5, wall.h+4);
    box(scene, trim, x, 7, z, wall.w+.05, 13, wall.h+.05, false);
    box(scene, clay, x, h*.42, z, wall.w+.1, 9, wall.h+.1, false);
    for (const side of [-1, 1]) {
      box(scene, dark, x + side*(wall.w/2-9), h*.54, z+wall.h/2+.3, 7, h*.67, 1);
      box(scene, aqua, x + side*(wall.w/2-9), h*.75, z+wall.h/2+1, 3, 9, 1);
    }
    if (wall.w > 130) {
      sign("COVER  /  01", x, 56, z+wall.h/2+.92, 92);
      box(scene, metal, x, 17, z+wall.h/2+.15, 87, 20, .3, false);
    }
  }
  // Recessed perimeter facades sit outside every navigable lane.
  for (const edge of [8, 892]) {
    box(scene, clay, edge, 53, 257, 20, 106, 535);
    for (let i=0; i<8; i++) {
      const z = 45+i*64;
      box(scene, plaster, edge, 62, z, 24, 126, 7);
      box(scene, trim, edge===8?19:881, 60, z+25, 2, 28, 23, false);
      box(scene, warm, edge===8?21:879, 59, z+25, 2, 4, 14, false);
    }
  }
  box(scene, sand, 450, 59, 18, 895, 119, 18);
  box(scene, trim, 450, 113, 21, 895, 10, 20);
  for (const x of [210,355,545,690]) {
    box(scene, plaster, x, 73, 31, 35, 145, 12);
    box(scene, trim, x, 114, 38, 24, 9, 1, false);
  }
  box(scene, dark, 450, 35, 30, 98, 70, 4);
  box(scene, teal, 450, 34, 35, 76, 65, 3);
  sign("NORTH TERMINAL", 450, 85, 36, 169);
  for (const x of [399, 501]) box(scene, aqua, x, 32, 38, 4, 61, 4);
  const exitRing = mesh(scene, new T.TorusGeometry(31, 1.45, 8, 52), aqua, engine.exit.x, .6, engine.exit.y, 1,1,1,false);
  exitRing.rotation.x = -Math.PI/2;
  for (let i=0; i<18; i++) {
    const x = 325+i*14;
    box(scene, i%2 ? trim : warm, x, .16, 419, 8, .25, 3, false);
  }
  for (let i=0; i<12; i++) {
    const x = -145+i*108;
    const h = 85+next()*120;
    box(scene, i%3===0 ? clay : sand, x, h/2, -115-next()*145, 45+next()*50, h, 50+next()*75);
    if (i%3===0) box(scene, dark, x,h+15,-128, 5,33,5);
  }
  for (const x of [71, 826]) {
    box(scene, trim, x, 48, 255, 5, 96, 5);
    box(scene, warm, x, 95, 255, 16, 4, 9);
    box(scene, trim, x, 97, 255, 24, 2, 12);
  }
  // Architectural details stay within the footprint of the adjacent wall.
  for (const x of [382, 518]) {
    box(scene, trim, x, 101, 305, 7, 34, 9);
    box(scene, teal, x, 122, 305, 15, 8, 16);
    box(scene, warm, x, 125, 310, 5, 2, 3);
  }
  for (const x of [264,636]) {
    for (let i=0;i<13;i++) box(scene, i%4===0?warm:plaster, x, .16, 90+i*26, 2.5,.18,12,false);
  }

  function sentinel() {
    const group = new T.Group();
    scene.add(group);
    const armor = material("#32384f", { metalness: .46, roughness: .49 });
    const shell = material("#ed8592", { metalness: .29, roughness: .47 });
    for (const side of [-1,1]) {
      box(group, armor, side*4.5, 7, .3, 6, 14, 7);
      box(group, shell, side*4.5, 1.5, 2, 7, 3, 10);
      const arm = box(group, shell, side*10, 24, 2.6, 5, 12, 6);
      arm.rotation.z = side * .22;
      box(group, red, side*9.6, 31.4, 1.5, 5, 3, 5);
    }
    box(group, armor, 0, 15, 0, 13, 5, 8);
    const chest = mesh(group, new T.CylinderGeometry(1,.66,1,6), shell, 0, 24, 0, 11, 14, 7.5);
    chest.rotation.y = Math.PI/6;
    box(group, armor, 0, 25, 7, 11, 9, 3);
    box(group, red, 0, 26, 8.7, 6, 2, 1);
    ball(group, armor, 0, 39.5, 0, 7, 7.5, 7);
    box(group, red, 0, 39, 6.3, 11, 3, 2);
    box(group, dark, 4.4, 26, 10, 5, 4, 16);
    return group;
  }
  const enemies = [sentinel(), sentinel()];
  const dust = new T.BufferGeometry();
  const dustCoords = [];
  for (let i=0; i<235; i++) dustCoords.push(next()*900, 15+next()*155, next()*490);
  dust.setAttribute("position", new T.Float32BufferAttribute(dustCoords, 3));
  const flecks = new T.Points(dust, new T.PointsMaterial({color:"#ffe2ba",size:.61,transparent:true,opacity:.48}));
  scene.add(flecks);
  const collisionSurfaces = engine.cover.map(wall => new T.Box3(
    new T.Vector3(wall.x,0,wall.y), new T.Vector3(wall.x+wall.w,wall.w>130?84:65,wall.y+wall.h)));
  collisionSurfaces.push(
    new T.Box3(new T.Vector3(20,-1,32),new T.Vector3(880,0,486)),
    new T.Box3(new T.Vector3(19,0,23),new T.Vector3(881,118,36)),
    new T.Box3(new T.Vector3(7,0,32),new T.Vector3(19,106,486)),
    new T.Box3(new T.Vector3(881,0,32),new T.Vector3(894,106,486))
  );
  const holes = Array.from({length:80}, () => {
    const hole = mesh(scene, new T.CircleGeometry(.83, 9), impactMaterial, 0,0,0,1,1,1,false);
    hole.visible = false;
    return hole;
  });
  const tracerPositions = new Float32Array(6);
  const tracerGeometry = new T.BufferGeometry();
  tracerGeometry.setAttribute("position",new T.BufferAttribute(tracerPositions,3));
  const tracer = new T.Line(tracerGeometry,new T.LineBasicMaterial({color:"#ffd494",transparent:true,opacity:.78}));
  tracer.frustumCulled = false;
  scene.add(tracer);
  let index = 0;
  let tracerUntil = -1;
  const hitPoint = new T.Vector3();
  const normal = new T.Vector3();
  function reset() {
    for (const hole of holes) hole.visible = false;
    index = 0;
    tracerUntil = -1;
  }
  function bullet(round, view, shot) {
    const start = new T.Vector3(round.player.x, view.height, round.player.y);
    const c = Math.cos(view.pitch);
    const direction = new T.Vector3(Math.sin(view.yaw)*c,Math.sin(view.pitch),-Math.cos(view.yaw)*c);
    const ray = new T.Ray(start,direction);
    let distance = shot.hit ? Math.hypot(shot.to.x-start.x,shot.to.y-start.z) : 900;
    let surface;
    for (const bounds of collisionSurfaces) {
      if (!ray.intersectBox(bounds, hitPoint)) continue;
      const length = hitPoint.distanceTo(start);
      if (length >= distance) continue;
      distance = length;
      surface = bounds;
    }
    ray.at(distance,hitPoint);
    if (surface) {
      const hole = holes[index++ % holes.length];
      const { min, max } = surface;
      normal.set(Number(Math.abs(hitPoint.x-max.x)<.001)-Number(Math.abs(hitPoint.x-min.x)<.001),
        Number(Math.abs(hitPoint.y-max.y)<.001)-Number(Math.abs(hitPoint.y-min.y)<.001),
        Number(Math.abs(hitPoint.z-max.z)<.001)-Number(Math.abs(hitPoint.z-min.z)<.001));
      hole.position.copy(hitPoint).addScaledVector(normal,.36);
      hole.lookAt(hole.position.clone().add(normal));
      hole.visible = true;
    }
    const muzzle = start.clone().addScaledVector(direction,8);
    muzzle.y -= 3;
    tracerPositions.set([muzzle.x,muzzle.y,muzzle.z,hitPoint.x,hitPoint.y,hitPoint.z]);
    tracerGeometry.attributes.position.needsUpdate = true;
    tracerUntil = round.elapsed + .045;
  }

  weaponScene.add(new T.HemisphereLight("#f3edff", "#8b6c69", 2.25));
  const gunLight = new T.DirectionalLight("#f8d9ae", 2.65);
  gunLight.position.set(-2, 4, 2);
  weaponScene.add(gunLight);
  const frame = new T.Group();
  weaponScene.add(frame);
  const gunBody = material("#2f3445", { metalness: .52, roughness: .45 });
  const gunShell = material("#5a6978", { metalness: .46, roughness: .45 });
  const polymer = material("#1d212f", { roughness: .65 });
  const grip = material("#424153");
  const skin = material("#724734");
  let magazine;
  let flash;
  const coats = { strike:"#b8b5ab", veil:"#497d82", marshal:"#786ca2" };
  function setWeapon(id) {
    frame.clear();
    const rifle = id !== "marshal";
    const rail = material(coats[id], { metalness:.37, roughness:.48 });
    const accent = id === "marshal" ? red : aqua;
    const length = rifle ? .82 : .46;
    box(frame, gunBody, 0,0,-.04, .22,.2,length,false);
    box(frame, gunShell, 0,.063,-.11, .235,.08,length*.9,false);
    box(frame, rail, .114,.006,-.11, .015,.15,length*.79,false);
    box(frame, rail, -.114,.006,-.11, .015,.15,length*.79,false);
    box(frame, polymer, 0,-.083,.22,.17,.16,.2,false);
    box(frame, polymer, 0,-.155,.17,.115,.22,.11,false).rotation.x = -.23;
    if (rifle) {
      box(frame, gunBody, 0,-.037,.45,.13,.19,.39,false);
      box(frame, grip, 0,-.032,.64,.145,.22,.07,false);
      magazine = box(frame, gunBody, 0,-.198,-.085,.147,.253,.185,false);
      magazine.rotation.x = -.22;
      for (let i=0;i<7;i++) box(frame, dark, 0,.119,-.39+i*.063,.15,.021,.026,false);
      const muzzle = id==="veil" ? .28 : .19;
      box(frame, polymer,0,.008,-.57,.072,.072,.34,false);
      box(frame, gunBody,0,.008,-.77,.116,.116,muzzle,false);
      box(frame, dark,0,.139,-.52,.084,.054,.041,false);
    } else {
      magazine = box(frame, gunShell,0,-.236,.169,.12,.08,.09,false);
      box(frame, dark,0,.114,-.251,.045,.035,.024,false);
    }
    box(frame, accent,0,.138,.175,.021,.025,.025,false);
    box(frame, accent,.115,.04,-.235,.013,.023,.086,false);
    ball(frame, grip,.034,-.18,.28,.10,.125,.12,false);
    ball(frame, skin,.053,-.122,.19,.077,.091,.081,false);
    ball(frame, grip,-.018,-.16,-.28,.1,.085,.155,false);
    const sleeve = box(frame, polymer,.16,-.263,.40,.185,.19,.37,false);
    sleeve.rotation.y=-.38;
    box(frame, polymer,-.08,-.239,-.126,.17,.13,.34,false).rotation.y=.45;
    flash = ball(frame, new T.MeshBasicMaterial({color:"#ffb65e"}), 0,.017,rifle?-.9:-.315,.06,.058,.141,false);
  }
  let currentGun;
  let w = 0;
  let h = 0;
  function render(round, view, weapon, options) {
    const width=canvas.clientWidth, height=canvas.clientHeight;
    if (!width || !height) return;
    if (width!==w || height!==h) {
      w=width; h=height;
      renderer.setSize(w,h,false);
      camera.aspect=weaponCamera.aspect=w/h;
      weaponCamera.updateProjectionMatrix();
    }
    const t=round.elapsed;
    const bob=options.running ? Math.sin(t*13)*options.speed : 0;
    camera.fov = options.ads ? 55 : 73;
    camera.updateProjectionMatrix();
    camera.position.set(round.player.x, view.height + bob*.45, round.player.y);
    camera.rotation.set(view.pitch + weapon.kick, -(view.yaw + weapon.yawKick),0,"YXZ");
    sky.position.copy(camera.position);
    const active = engine.activeBots(round);
    for (let i=0;i<enemies.length;i++) {
      const b=round.bots[i];
      const bot=enemies[i];
      bot.visible=active.includes(b);
      if (!b) continue;
      bot.position.set(b.x, 0, b.y);
      bot.rotation.y=Math.atan2(round.player.x-b.x, round.player.y-b.y);
      bot.scale.y=1 + Math.sin(t*3.7+i)*.012;
    }
    if (weapon.id !== currentGun) { setWeapon(weapon.id); currentGun=weapon.id; }
    exitRing.visible=round.id !== "spray" && round.bots.every(bot=>!bot.alive);
    const recoil=Math.max(0,1-(t-weapon.firedAt)*14);
    const reload=weapon.reloadEnd ? Math.sin(Math.PI*Math.min(1,Math.max(0,(weapon.reloadEnd-t)/weapon.spec.reload))) : 0;
    frame.position.set(options.ads ? .005 : .30+bob*.014, (options.ads ? -.137 : -.27)-Math.abs(bob*.014)-reload*.16, -.77+recoil*.083);
    frame.rotation.set(weapon.kick*.82+recoil*.11-reload*.39, options.ads ? 0 : -.035+reload*.24, -.07-reload*.5+bob*.012);
    magazine.position.y = (weapon.id === "marshal" ? -.236 : -.198) - reload*.24;
    flash.visible=t-weapon.firedAt < .037;
    tracer.visible=options.running && t < tracerUntil;
    flash.rotation.z=t*30;
    flecks.position.z=(t*.8)%12;
    renderer.autoClear=true;
    renderer.render(scene,camera);
    renderer.autoClear=false;
    renderer.clearDepth();
    renderer.render(weaponScene,weaponCamera);
  }
  return { render, bullet, reset };
};
