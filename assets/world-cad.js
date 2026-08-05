/* Project 06 — Reverse engineering in Onshape.

   The subject is a machine vise, because it carries the whole story in one
   object: you measure a real one, rebuild it parametrically, and then the
   mates have to actually work. Scrolling walks that — dimension lines over a
   wireframe, the solid resolving out of it, and finally the jaw running in
   and out on its lead screw the way a slider mate should. */

const PHASES = [
  ["MEASURING",  3.0],
  ["MODELLING",  2.4],
  ["MATES",      2.2],
  ["JAW OPEN",   2.6],
  ["JAW CLOSED", 2.6],
  ["ASSEMBLY",   1.8]
];
const START = [];
let acc = 0;
for (const [, d] of PHASES) { START.push(acc); acc += d; }
const MISSION = acc;
const at = (i) => START[i];

const smooth = (a, b, x) => {
  const k = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return k * k * (3 - 2 * k);
};
const lerp = (a, b, k) => a + (b - a) * k;

const TRAVEL = 52;   // mm the moving jaw runs

export function buildCadWorld(scene, THREE) {
  const P = (h, r, m = 0) => new THREE.MeshStandardMaterial({ color: h, roughness: r, metalness: m });
  const CAST  = P(0x39414c, 0.62, 0.35);   // cast-iron body
  const STEEL = P(0xc2c9d3, 0.28, 0.90);
  const BRASS = P(0xc9a44a, 0.35, 0.85);
  const BENCH = P(0x6b4c30, 0.85);
  const DARK  = P(0x23272e, 0.6, 0.2);

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r, h, s = 20) => new THREE.CylinderGeometry(r, r, h, s);
  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  const root = new THREE.Group();
  scene.add(root);

  /* --------------------------------------------------------------- lights */
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(160, 300, 180);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { near: 40, far: 900, left: -280, right: 280, top: 280, bottom: -280 });
  key.shadow.bias = -0.0012;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x86c8ff, 1.05);
  rim.position.set(-180, 120, -160);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x0a0d13, 0.55));

  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600),
    new THREE.ShadowMaterial({ opacity: 0.32 }));
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);

  /* ---------------------------------------------------------------- bench */
  add(root, box(400, 8, 220), BENCH, 0, 56, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(root, box(10, 56, 10), DARK, sx * 180, 28, sz * 95);
  }

  /* ----------------------------------------------------------------- vise */
  const vise = new THREE.Group();
  vise.position.set(0, 60, 0);
  root.add(vise);

  const solid = new THREE.Group();      // everything that fades in as "solid"
  vise.add(solid);

  add(solid, box(210, 16, 86), CAST, 0, 8, 0);                    // base
  add(solid, box(150, 12, 46), CAST, -10, 20, 0);                 // slide bed
  add(solid, box(46, 44, 80), CAST, -78, 36, 0);                  // fixed jaw body
  add(solid, box(10, 34, 74), STEEL, -53, 33, 0);                 // fixed jaw face
  for (const sz of [-1, 1]) add(solid, box(26, 10, 16), CAST, 88, 9, sz * 30);   // mounting ears
  for (const sz of [-1, 1]) add(solid, cyl(5, 12, 14), STEEL, 88, 12, sz * 30);  // bolts

  // The moving jaw — one group, so the slider mate is a single translation.
  const jaw = new THREE.Group();
  solid.add(jaw);
  add(jaw, box(44, 42, 80), CAST, 0, 35, 0);
  add(jaw, box(10, 34, 74), STEEL, -23, 33, 0);
  add(jaw, box(120, 14, 40), CAST, 62, 20, 0);                    // slide block

  // Lead screw and handle: the revolute mate that drives the slider.
  const screw = new THREE.Group();
  screw.position.set(0, 34, 0);
  solid.add(screw);
  const shaft = add(screw, cyl(7, 200, 18), BRASS, 46, 0, 0);
  shaft.rotation.z = Math.PI / 2;
  for (let i = 0; i < 26; i++) {                                   // thread ridges
    const t = add(screw, cyl(9, 3, 14), BRASS, -34 + i * 8, 0, 0);
    t.rotation.z = Math.PI / 2;
  }
  const handle = new THREE.Group();
  handle.position.set(148, 0, 0);
  screw.add(handle);
  add(handle, cyl(9, 14, 16), STEEL, 0, 0, 0).rotation.z = Math.PI / 2;
  add(handle, cyl(4, 84, 12), STEEL, 8, 0, 0);
  for (const sy of [-1, 1]) add(handle, new THREE.SphereGeometry(7, 12, 12), STEEL, 8, sy * 42, 0);

  /* ------------------------------------------------- measurement overlay */
  /* The wireframe and the dimension lines are what you actually start from:
     a real part and a caliper, before any of it is a model. */
  const wire = new THREE.Group();
  vise.add(wire);
  const wireMat = new THREE.LineBasicMaterial({ color: 0x4da3ff, transparent: true, opacity: 0 });
  solid.traverse((o) => {
    if (!o.isMesh) return;
    const w = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 25), wireMat);
    o.updateMatrixWorld(true);
    w.position.copy(o.position);
    w.quaternion.copy(o.quaternion);
    // Nested under jaw/screw groups, so carry their offsets too.
    let p = o.parent;
    while (p && p !== solid) { w.position.add(p.position); p = p.parent; }
    wire.add(w);
  });

  const dimMat = new THREE.LineBasicMaterial({ color: 0xff7a2f, transparent: true, opacity: 0 });
  const dims = new THREE.Group();
  vise.add(dims);
  [[[-105, 4, 60], [105, 4, 60]],          // overall length
   [[-105, 4, 60], [-105, 52, 60]],        // jaw height
   [[-53, 60, -40], [-53, 60, 40]],        // jaw width
   [[24, 74, 0], [76, 74, 0]]              // travel
  ].forEach(([a, b]) => {
    const g = new THREE.BufferGeometry().setAttribute("position",
      new THREE.Float32BufferAttribute([...a, ...b], 3));
    dims.add(new THREE.Line(g, dimMat));
    [a, b].forEach((p) => {
      const t = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff7a2f, transparent: true, opacity: 0 }));
      t.position.set(p[0], p[1], p[2]);
      dims.add(t);
    });
  });

  /* ------------------------------------------------ the rest of the parts */
  /* A toggle clamp on its jig, standing in for the other assemblies in the
     set — it only appears once the vise story has been told. */
  const clamp = new THREE.Group();
  clamp.position.set(160, 60, -66);
  clamp.rotation.y = -0.4;
  root.add(clamp);
  add(clamp, box(70, 8, 52), CAST, 0, 4, 0);
  add(clamp, box(14, 34, 14), CAST, -18, 21, 0);
  const arm = new THREE.Group();
  arm.position.set(-18, 38, 0);
  clamp.add(arm);
  add(arm, box(58, 8, 10), STEEL, 22, 0, 0);
  add(arm, cyl(3.4, 22, 10), STEEL, 44, -9, 0);
  add(arm, box(14, 5, 14), P(0x1b1e24, 0.8), 44, -21, 0);
  add(clamp, box(40, 6, 8), P(0xc4201f, 0.5), -40, 30, 0);        // red handle

  /* ------------------------------------------------------------------ HUD */
  const hudA = document.getElementById("hud-a");
  const hudB = document.getElementById("hud-b");
  const hudC = document.getElementById("hud-c");

  // Scene 3 is the one about mates, so it has to land while the jaw is
  // actually travelling — not on the beat after it has already closed.
  const MARKS = [0, at(1), at(2), at(3) + 1.3, MISSION];
  function missionTime(cur) {
    const c = Math.min(Math.max(cur, 0), MARKS.length - 1);
    const i = Math.min(Math.floor(c), MARKS.length - 2);
    return MARKS[i] + (MARKS[i + 1] - MARKS[i]) * (c - i);
  }

  const focus = new THREE.Vector3(0, 90, 0);
  const solidMats = [];
  solid.traverse((o) => { if (o.isMesh && !solidMats.includes(o.material)) solidMats.push(o.material); });
  solidMats.forEach((m) => { m.transparent = true; });

  function update(dt, t, ctx) {
    const mt = missionTime(ctx.cur);

    // Wireframe first, solid resolving out of it, then the mates run.
    const wireOn = 1 - smooth(at(1) + 0.6, at(2), mt);
    const dimOn = smooth(0.4, 1.6, mt) * (1 - smooth(at(1), at(1) + 1.2, mt));
    const solidOn = smooth(at(1), at(1) + 1.4, mt);

    wireMat.opacity = wireOn * 0.75;
    dimMat.opacity = dimOn * 0.9;
    dims.children.forEach((c) => { if (c.isMesh) c.material.opacity = dimOn * 0.9; });
    solidMats.forEach((m) => { m.opacity = Math.max(solidOn, 0.001); });

    // Jaw travel: open through one scene, closed through the next.
    let open = 0, state = "MEASURING";
    if (mt < at(1)) state = "MEASURING";
    else if (mt < at(2)) state = "MODELLING";
    else if (mt < at(3)) { state = "MATES"; open = smooth(at(2), at(3), mt) * 0.25; }
    else if (mt < at(4)) { state = "JAW OPEN"; open = lerp(0.25, 1, smooth(at(3), at(4), mt)); }
    else if (mt < at(5)) { state = "JAW CLOSED"; open = lerp(1, 0.06, smooth(at(4), at(5), mt)); }
    else { state = "ASSEMBLY"; open = 0.06; }

    jaw.position.x = 8 + open * TRAVEL;
    // A slider driven by a lead screw turns as it travels — that is the mate.
    screw.rotation.x = -open * TRAVEL * 0.34;

    // The toggle clamp arrives with the rest of the set at the end.
    const setOn = smooth(at(5) - 0.6, MISSION, mt);
    clamp.scale.setScalar(0.02 + setOn * 0.98);
    clamp.visible = setOn > 0.02;
    if (setOn > 0.02) arm.rotation.z = -0.5 + Math.sin(t * 1.6) * 0.35;

    if (hudA) hudA.textContent = state;
    if (hudB) hudB.textContent = Math.round(open * TRAVEL) + " mm";
    if (hudC) hudC.textContent = mt < at(2) ? "sketch" : "slider + revolute";
  }

  function theme(dark) {
    key.intensity = dark ? 2.3 : 2.9;
    rim.intensity = dark ? 1.05 : 0.6;
    shadowFloor.material.opacity = dark ? 0.32 : 0.18;
  }

  return { fit: 620, focusY: 62, focus, update, theme };
}
