/* Project 05 — Prior Solution, R&D IoT for agriculture.

   Built from primitives, in centimetres, following the greenhouse layout
   and the control cabinet from the actual design renders: a grid of
   hydroponic benches with white trays and orchid side rails on black steel,
   blue service aisles, and an orange-floored plant room holding the
   nutrient tanks and the dosing skid.

   What scrolls past is one automatic fertiliser-dosing cycle. The crop
   draws the solution down, EC falls below setpoint, the A and B pumps
   inject, the loop mixes and settles, and the corrected solution goes
   back out to every bench. That is the labour this project removed. */

const EC_SET = 1.80;      // mS/cm — the setpoint the loop holds
const EC_LOW = 1.24;      // where the crop has drawn it down to
const EC_TOP = 2.02;      // overshoot straight after dosing
const PH_SET = 6.0;

const COLS = 4, ROWS = 3;
const BX = 210, BZ = 118;                 // bench pitch
const BENCH = { w: 176, d: 74, top: 72 };
const PLANTS_PER = 33;
const PLANTS = COLS * ROWS * PLANTS_PER;

/* phase table — [name, duration in story-seconds] */
const PHASES = [
  ["SENSING",  3.0],
  ["EC LOW",   1.6],
  ["DOSING",   2.6],
  ["MIXING",   2.0],
  ["FEEDING",  3.0],
  ["LOGGED",   1.8]
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

export function buildPriorWorld(scene, THREE) {
  const P = (h, r, m = 0) => new THREE.MeshStandardMaterial({ color: h, roughness: r, metalness: m });
  const TRAY   = P(0xe6e9ee, 0.55, 0.05);   // the white grow panels
  const RAIL   = P(0xb87ec8, 0.48, 0.10);   // orchid bench sides
  const STEEL  = P(0x1b1e24, 0.55, 0.35);   // black frame
  const FLOOR  = P(0xd9dee5, 0.85);
  const AISLE  = P(0x2b4fa8, 0.70);
  const PLANT  = P(0xd4622e, 0.80);         // plant-room floor
  const CONC   = P(0x8e949c, 0.85);
  const TANK   = P(0x9fd8e0, 0.35, 0.10);
  const CAB    = P(0x9aa0a8, 0.42, 0.45);
  const ALU    = P(0xb9c1cc, 0.32, 0.85);
  const PVC    = P(0xdfe4ea, 0.55, 0.02);

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r, h, s = 18) => new THREE.CylinderGeometry(r, r, h, s);
  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  const root = new THREE.Group();
  // The bench grid runs left, the plant room sits right; centre the pair.
  root.position.x = -170;
  scene.add(root);

  /* =============================================================== lights */
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(400, 800, 500);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { near: 100, far: 2400, left: -800, right: 800, top: 800, bottom: -800 });
  key.shadow.bias = -0.0011;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x86c8ff, 1.0);
  rim.position.set(-500, 300, -450);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x0a0d13, 0.6));

  const shadowFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.ShadowMaterial({ opacity: 0.28 })
  );
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);

  /* ================================================================ slabs */
  const gw = COLS * BX + 60, gd = ROWS * BZ + 90;
  add(root, box(gw, 4, gd), FLOOR, 0, 2, 0);
  // Service aisles between the bench rows.
  for (let r = 0; r < ROWS - 1; r++) {
    add(root, box(gw - 20, 1, 26), AISLE, 0, 4.4, (r - (ROWS - 2) / 2) * BZ);
  }
  const ROOM_X = gw / 2 + 160;
  add(root, box(300, 4, gd - 40), PLANT, ROOM_X, 2, 0);

  /* =============================================================== benches */
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const x = (c - (COLS - 1) / 2) * BX;
      const z = (r - (ROWS - 1) / 2) * BZ;
      const b = new THREE.Group();
      b.position.set(x, 0, z);
      root.add(b);
      add(b, box(BENCH.w, 5, BENCH.d), TRAY, 0, BENCH.top, 0);            // grow panel
      for (const sz of [-1, 1]) {
        add(b, box(BENCH.w, 11, 4), RAIL, 0, BENCH.top - 7, sz * BENCH.d / 2);
      }
      for (const sx of [-1, 1]) {
        add(b, box(4, 11, BENCH.d), RAIL, sx * BENCH.w / 2, BENCH.top - 7, 0);
      }
      // Steel frame and legs.
      for (const sz of [-1, 1]) add(b, box(BENCH.w, 4, 4), STEEL, 0, BENCH.top - 16, sz * (BENCH.d / 2 - 6));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        add(b, box(5, BENCH.top - 16, 5), STEEL, sx * (BENCH.w / 2 - 8), (BENCH.top - 16) / 2, sz * (BENCH.d / 2 - 8));
      }
      // Feed line running the length of the bench.
      add(b, cyl(2.2, BENCH.w, 12), PVC, 0, BENCH.top - 22, 0).rotation.z = Math.PI / 2;
    }
  }

  /* ============================================================ plant room */
  /* Laid out the way a fertigation room actually is: reservoirs at the back,
     a transfer pump, a buffer tank, the A/B dosing skid beside it, and a
     manifold on the bench-facing wall. Every pipe starts at a nozzle and
     ends at one. */
  const room = new THREE.Group();
  room.position.set(ROOM_X, 0, 0);
  root.add(room);

  const UPV = new THREE.Vector3(0, 1, 0);
  const DIR = new THREE.Vector3();

  // Pipe runs are straights plus elbows, not swept curves — PVC does not
  // bend, it gets cut and glued into fittings.
  function pipe(parent, pts, r, mat) {
    const v = pts.map((q) => new THREE.Vector3(q[0], q[1], q[2]));
    for (let i = 0; i < v.length - 1; i++) {
      const a = v[i], b = v[i + 1];
      const len = a.distanceTo(b);
      if (len < 0.5) continue;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat);
      m.position.copy(a).lerp(b, 0.5);
      m.quaternion.setFromUnitVectors(UPV, DIR.subVectors(b, a).normalize());
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
    }
    for (let i = 1; i < v.length - 1; i++) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(r * 1.25, 12, 10), mat);
      e.position.copy(v[i]);
      e.castShadow = true;
      parent.add(e);
    }
  }

  function valve(parent, x, y, z, r) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    add(g, cyl(r * 1.7, r * 2.4, 12), P(0x27313d, 0.45, 0.4), 0, 0, 0);
    add(g, cyl(r * 0.5, r * 2.2, 8), ALU, 0, r * 2.2, 0);
    add(g, box(r * 4.4, r * 0.7, r * 0.9), P(0xc4452f, 0.5), 0, r * 3.2, 0);
    return g;
  }

  /* ---- reservoir bank ------------------------------------------------- */
  const RES_X = 72;
  for (let j = 0; j < 3; j++) {
    const z = (j - 1) * 116;
    add(room, box(92, 46, 96), CONC, RES_X, 23, z);
    add(room, box(80, 3, 84), P(0x2a6f7a, 0.25), RES_X, 47, z);   // solution surface
    // Each cell drains into the shared suction header on its front face.
    pipe(room, [[RES_X - 46, 22, z], [RES_X - 62, 22, z]], 3.2, PVC);
  }
  pipe(room, [[RES_X - 62, 22, -116], [RES_X - 62, 22, 116]], 3.6, PVC);        // suction header
  pipe(room, [[RES_X - 62, 22, -58], [22, 22, -58], [22, 15, -58]], 3.6, PVC);  // down to the pump

  /* ---- transfer pump --------------------------------------------------- */
  const mainPump = add(room, box(30, 20, 20), P(0x27313d, 0.45, 0.4), 8, 14, -58);
  add(room, cyl(9, 16, 16), P(0x2f63c4, 0.45, 0.3), 8, 22, -58);
  for (const sx of [-1, 1]) add(room, box(4, 8, 24), STEEL, 8 + sx * 12, 4, -58);

  /* ---- buffer tank ----------------------------------------------------- */
  const BUF = { x: -62, z: -58, r: 32, h: 118 };
  add(room, cyl(BUF.r, BUF.h, 26), TANK, BUF.x, BUF.h / 2 + 8, BUF.z);
  add(room, cyl(BUF.r + 1.5, 5, 26), ALU, BUF.x, BUF.h + 10, BUF.z);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.78;
    add(room, box(6, 8, 6), STEEL, BUF.x + Math.sin(a) * 24, 4, BUF.z + Math.cos(a) * 24);
  }
  // The mixed solution sitting in it; the level tracks EC.
  const mixLiquid = add(room, cyl(BUF.r - 3, 1, 24), P(0x3f8f5a, 0.3), BUF.x, 20, BUF.z);
  mixLiquid.material.transparent = true;
  mixLiquid.material.opacity = 0.8;

  // Pump discharge climbing into the top of the tank, with an isolating valve.
  pipe(room, [[-6, 15, -58], [-16, 15, -58], [-16, 112, -58], [BUF.x + 18, 112, BUF.z],
              [BUF.x + 18, 126, BUF.z]], 3.6, PVC);
  valve(room, -16, 46, -58, 3.6);

  // EC and pH probes dipping through the tank lid.
  [[-11, 0x7dff8a], [11, 0xffc247]].forEach(([dz, c]) => {
    add(room, cyl(2, 40, 10), ALU, BUF.x, BUF.h - 6, BUF.z + dz);
    const t = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 10),
      new THREE.MeshBasicMaterial({ color: c }));
    t.position.set(BUF.x, BUF.h + 16, BUF.z + dz);
    room.add(t);
  });

  /* ---- A/B dosing skid -------------------------------------------------- */
  const skid = new THREE.Group();
  skid.position.set(-58, 0, 66);
  room.add(skid);
  add(skid, box(132, 6, 92), ALU, 0, 10, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(skid, box(7, 10, 7), STEEL, sx * 58, 5, sz * 40);
  }
  // Spill containment under the concentrate — required wherever you keep it.
  add(skid, box(120, 9, 78), P(0xd8b23a, 0.7), 0, 17, 0);
  for (const sz of [-1, 1]) add(skid, box(120, 12, 3), P(0xd8b23a, 0.7), 0, 20, sz * 39);
  for (const sx of [-1, 1]) add(skid, box(3, 12, 78), P(0xd8b23a, 0.7), sx * 60, 20, 0);

  const drumA = add(skid, cyl(21, 56, 22), P(0xc4452f, 0.5), -32, 50, 0);
  const drumB = add(skid, cyl(21, 56, 22), P(0x2f63c4, 0.5), 20, 50, 0);
  [[-32, 0xc4452f], [20, 0x2f63c4]].forEach(([x, c]) => {
    add(skid, cyl(22, 3, 22), P(c, 0.4), x, 79, 0);                // drum lid
    add(skid, cyl(2.2, 54, 10), ALU, x, 52, -9);                   // dip tube
  });

  // A dosing pump per drum, drawing off that drum's dip tube.
  const dosePumps = [-32, 20].map((x) => {
    const p = add(skid, box(22, 18, 16), P(0x27313d, 0.45, 0.4), x, 34, -40);
    add(skid, cyl(6, 12, 14), ALU, x, 45, -40);
    pipe(skid, [[x, 78, -9], [x, 86, -9], [x, 86, -40], [x, 46, -40]], 2.0, PVC);
    return p;
  });

  // Both discharges injecting into the riser, downstream of the transfer pump.
  [-32, 20].forEach((x, i) => {
    pipe(skid, [[x, 30, -46], [x, 30, -62], [x, 98 + i * 9, -62]], 2.0, PVC);
    pipe(room, [[-58 + x, 98 + i * 9, 4], [-16, 98 + i * 9, 4], [-16, 98 + i * 9, -50]], 2.0, PVC);
  });

  /* ---- manifold on the bench-facing wall -------------------------------- */
  const MAN_X = -132;
  pipe(room, [[BUF.x - BUF.r, 14, BUF.z], [MAN_X, 14, BUF.z]], 4.2, PVC);   // tank outlet
  pipe(room, [[MAN_X, 14, -122], [MAN_X, 14, 122]], 4.2, PVC);              // header
  for (const z of [-118, 0, 118]) valve(room, MAN_X, 14, z + 8, 4.2);

  /* ---- distribution out to the benches ----------------------------------- */
  /* Branch mains run at floor level down each service aisle, then a riser
     with a valve lifts into each bench's own feed line. Nothing hangs. */
  const BR_Y = 14, HEAD_X = ROOM_X + MAN_X;
  const FAR_X = -gw / 2 - 14;
  const BENCH_XS = [];
  for (let c = 0; c < COLS; c++) BENCH_XS.push((c - (COLS - 1) / 2) * BX);

  for (let r = 0; r < ROWS; r++) {
    const z = (r - (ROWS - 1) / 2) * BZ;
    pipe(root, [[HEAD_X, BR_Y, z], [FAR_X, BR_Y, z]], 4.2, PVC);
    for (let x = FAR_X + 70; x < HEAD_X - 60; x += 170) {
      add(root, box(14, 12, 16), P(0x9aa0a8, 0.7), x, 6, z);        // pipe saddle
    }
    BENCH_XS.forEach((bx) => {
      pipe(root, [[bx, BR_Y, z], [bx, BENCH.top - 22, z]], 3.0, PVC);
      valve(root, bx, 34, z, 3.0);
    });
  }

  // Drain-back from the far end of the house to the reservoir bank.
  pipe(root, [[FAR_X, 9, gd / 2 - 20], [FAR_X, 9, gd / 2 + 26], [ROOM_X + RES_X, 9, gd / 2 + 26],
              [ROOM_X + RES_X, 40, gd / 2 + 26], [ROOM_X + RES_X, 40, 160]], 4.2, PVC);

  // The path the flow markers travel: buffer tank out, along the header and
  // down the middle aisle to the far bench.
  const mainCurve = new THREE.CatmullRomCurve3([
    [ROOM_X + BUF.x - BUF.r, BR_Y, BUF.z], [HEAD_X, BR_Y, BUF.z],
    [HEAD_X, BR_Y, 0], [0, BR_Y, 0], [FAR_X, BR_Y, 0]
  ].map((q) => new THREE.Vector3(q[0], q[1], q[2])), false, "catmullrom", 0.1);

  /* ========================================================= control panel */
  const cab = new THREE.Group();
  cab.position.set(gw / 2 + 26, 0, gd / 2 - 70);
  cab.rotation.y = -0.72;
  root.add(cab);
  add(cab, box(4, 96, 8), STEEL, 0, 48, 0);                       // stand
  add(cab, box(96, 112, 40), CAB, 0, 150, 0);                     // enclosure
  add(cab, box(92, 108, 1.6), P(0x878d95, 0.4, 0.4), 0, 150, 20.5);
  add(cab, box(6, 16, 3), ALU, -40, 150, 21.5);                   // door lock

  const hmiCv = document.createElement("canvas");
  hmiCv.width = 320; hmiCv.height = 200;
  const hx = hmiCv.getContext("2d");
  const hmiTex = new THREE.CanvasTexture(hmiCv);
  add(cab, box(48, 30, 1.4), P(0x2b3038, 0.5), 4, 182, 21.4);     // bezel
  const hmiMesh = new THREE.Mesh(box(42, 25, 0.3),
    new THREE.MeshBasicMaterial({ map: hmiTex }));
  hmiMesh.position.set(4, 182, 22.3);
  cab.add(hmiMesh);

  // Selector, emergency stop, and the button grid off the render.
  add(cab, cyl(4, 4, 14), P(0x1b1e24, 0.5), -22, 160, 21.5).rotation.x = Math.PI / 2;
  add(cab, cyl(7, 3, 18), P(0xd8c528, 0.5), 14, 160, 21.5).rotation.x = Math.PI / 2;
  const estop = add(cab, cyl(6, 4, 18), P(0xc4201f, 0.45), 14, 160, 23);
  estop.rotation.x = Math.PI / 2;
  const buttons = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    const lit = r % 2 === 0;
    const m = add(cab, cyl(lit ? 5 : 4, 3.2, 14), P(lit ? 0x8e1f1f : 0x6a7078, 0.45, 0.2),
      -28 + c * 11.5, 146 - r * 12, 21.8);
    m.rotation.x = Math.PI / 2;
    if (lit) buttons.push(m);
  }

  /* =============================================================== the crop */
  const crop = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(5.2, 1),
    new THREE.MeshStandardMaterial({ color: 0x63b544, roughness: 0.78, flatShading: true }),
    PLANTS);
  crop.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  crop.castShadow = true;
  root.add(crop);

  const seed = [];
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    const bx = (c - (COLS - 1) / 2) * BX;
    const bz = (r - (ROWS - 1) / 2) * BZ;
    for (let i = 0; i < PLANTS_PER; i++) {
      const col = i % 11, row = (i / 11) | 0;
      seed.push({
        x: bx + (col - 5) * 15.4,
        z: bz + (row - 1) * 22,
        // Staggered so the house does not pop into growth all at once.
        lag: Math.random() * 0.45,
        s: 0.85 + Math.random() * 0.35,
        w: Math.random() * 6.28
      });
    }
  }

  const M = new THREE.Matrix4();
  const V = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  const S = new THREE.Vector3();
  const AXIS = new THREE.Vector3(0, 1, 0);

  /* -------------------------------------------- nutrient moving down the main */
  const flow = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(5, 10, 10), new THREE.MeshBasicMaterial({
      color: 0x7dff8a, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    root.add(m);
    flow.push(m);
  }

  /* ---------------------------------------------------------- HMI drawing */
  let uiAcc = 0;
  function drawHMI(state, ec, ph, dosing) {
    hx.fillStyle = "#04211f"; hx.fillRect(0, 0, 320, 200);
    hx.strokeStyle = "#1fa39c"; hx.lineWidth = 3; hx.strokeRect(5, 5, 310, 190);
    hx.fillStyle = "#4fe0d4"; hx.font = "bold 20px ui-monospace, Consolas, monospace";
    hx.fillText("NUTRIENT LOOP", 18, 36);
    hx.fillStyle = "#bfeeea"; hx.font = "600 16px ui-monospace, Consolas, monospace";
    hx.fillText(state, 18, 64);

    hx.fillStyle = "#5f9c98"; hx.font = "600 13px ui-monospace, Consolas, monospace";
    hx.fillText("EC", 18, 100); hx.fillText("pH", 18, 126); hx.fillText("DOSE", 18, 152);
    hx.fillStyle = "#e6fffb"; hx.font = "bold 15px ui-monospace, Consolas, monospace";
    hx.fillText(ec.toFixed(2) + " mS/cm", 70, 100);
    hx.fillText(ph.toFixed(1), 70, 126);
    hx.fillStyle = dosing ? "#ffc247" : "#4a6b68";
    hx.fillText(dosing ? "A + B  RUN" : "IDLE", 70, 152);

    // EC bar against its setpoint.
    hx.strokeStyle = "#1fa39c"; hx.strokeRect(200, 84, 100, 76);
    const k = Math.min(Math.max((ec - 0.8) / 1.4, 0), 1);
    hx.fillStyle = ec < EC_SET - 0.2 ? "#e0793c" : "#4fe0d4";
    hx.fillRect(203, 157 - k * 70, 94, k * 70);
    hx.strokeStyle = "#e6fffb";
    const sy = 157 - ((EC_SET - 0.8) / 1.4) * 70;
    hx.beginPath(); hx.moveTo(200, sy); hx.lineTo(300, sy); hx.stroke();
    hmiTex.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ HUD */
  const hudA = document.getElementById("hud-a");
  const hudB = document.getElementById("hud-b");
  const hudC = document.getElementById("hud-c");

  const MARKS = [0, at(1), at(2) + 1.2, at(4), MISSION];
  function missionTime(cur) {
    const c = Math.min(Math.max(cur, 0), MARKS.length - 1);
    const i = Math.min(Math.floor(c), MARKS.length - 2);
    return MARKS[i] + (MARKS[i + 1] - MARKS[i]) * (c - i);
  }

  const focus = new THREE.Vector3();

  function update(dt, t, ctx) {
    const mt = missionTime(ctx.cur);

    let state = "SENSING", ec = EC_SET, ph = PH_SET + 0.4, dosing = false, feed = 0;
    if (mt < at(1)) {
      // The crop is drawing the solution down; nobody has done anything yet.
      const k = smooth(0, at(1), mt);
      state = "SENSING"; ec = lerp(EC_SET, EC_LOW + 0.16, k); ph = PH_SET + 0.4 + k * 0.35;
    } else if (mt < at(2)) {
      const k = smooth(at(1), at(2), mt);
      state = "EC LOW"; ec = lerp(EC_LOW + 0.16, EC_LOW, k); ph = PH_SET + 0.75;
    } else if (mt < at(3)) {
      const k = smooth(at(2), at(3), mt);
      state = "DOSING"; dosing = true;
      ec = lerp(EC_LOW, EC_TOP, k); ph = lerp(PH_SET + 0.75, PH_SET - 0.1, k);
    } else if (mt < at(4)) {
      const k = smooth(at(3), at(4), mt);
      state = "MIXING"; ec = lerp(EC_TOP, EC_SET + 0.06, k); ph = lerp(PH_SET - 0.1, PH_SET, k);
    } else if (mt < at(5)) {
      state = "FEEDING"; ec = EC_SET + 0.04; ph = PH_SET;
      feed = smooth(at(4), at(5), mt);
    } else {
      state = "LOGGED"; ec = EC_SET + 0.02; ph = PH_SET; feed = 1;
    }
    // A live probe never sits perfectly still.
    ec += Math.sin(t * 1.7) * 0.012;
    ph += Math.sin(t * 1.1) * 0.02;

    /* ---- skid ---- */
    dosePumps.forEach((p, i) => {
      p.position.y = 34 + (dosing ? Math.sin(t * 30 + i * 2) * 0.5 : 0);
    });
    // The level sits on the tank floor, not floating inside it.
    const fill = 0.35 + (ec - 0.8) / 1.4 * 0.6;
    mixLiquid.scale.y = Math.max(fill * 96, 1);
    mixLiquid.position.y = 10 + mixLiquid.scale.y / 2;
    mixLiquid.material.color.setHex(dosing ? 0x5fc06e : 0x3f8f5a);
    drumA.scale.y = 1 - (dosing ? 0.04 : 0);
    drumB.scale.y = 1 - (dosing ? 0.04 : 0);

    /* ---- delivery ---- */
    flow.forEach((m, i) => {
      const k = (t * 0.34 + i / flow.length) % 1;
      mainCurve.getPointAt(k, m.position);
      m.material.opacity = feed * 0.85 * Math.sin(k * Math.PI);
    });

    /* ---- the crop ---- */
    // Growth is what the whole loop is for, so it tracks the cycle.
    const grow = smooth(0, MISSION, mt);
    for (let i = 0; i < PLANTS; i++) {
      const g = seed[i];
      const k = Math.min(Math.max((grow - g.lag) / (1 - g.lag), 0), 1);
      const sc = g.s * lerp(0.28, 1.0, k);
      V.set(g.x, BENCH.top + 3 + sc * 5, g.z);
      S.set(sc, sc * 0.82, sc);
      Q.setFromAxisAngle(AXIS, g.w + Math.sin(t * 0.4 + g.w) * 0.05);
      M.compose(V, Q, S);
      crop.setMatrixAt(i, M);
    }
    crop.instanceMatrix.needsUpdate = true;

    /* ---- panel ---- */
    buttons.forEach((b, i) => {
      const on = dosing ? (i % 3 === 0) : feed > 0.3 ? (i % 2 === 0) : i === 0;
      b.material.color.setHex(on ? 0xe03a2f : 0x8e1f1f);
    });

    // Early on the story is the loop; once it feeds, it is the whole house.
    const toSkid = 1 - smooth(at(3), at(5), mt);
    focus.set(
      root.position.x + lerp(0, ROOM_X - 96 + 20, toSkid),
      70,
      root.position.z + lerp(0, -118, toSkid)
    );

    uiAcc += dt;
    if (uiAcc > 0.14) { uiAcc = 0; drawHMI(state, ec, ph, dosing); }
    if (hudA) hudA.textContent = state;
    if (hudB) hudB.textContent = ec.toFixed(2) + " mS/cm";
    if (hudC) hudC.textContent = "pH " + ph.toFixed(1);
  }

  function theme(dark) {
    key.intensity = dark ? 2.1 : 2.8;
    rim.intensity = dark ? 1.0 : 0.6;
    shadowFloor.material.opacity = dark ? 0.28 : 0.16;
  }

  return { fit: 1750, focusY: 90, focus, update, theme };
}
