/* Project 03 — Midori Wolffia, automated duckweed farming.

   Built from primitives, in centimetres. The rig is the real one: a
   cultivation tank, an overflow weir, a cheesecloth-lined channel, a
   collection tub and a return line, with a PLC + ESP32 panel driving it.

   The harvest here is the real mechanism and nothing else. There is no
   arm and no scoop — the water level goes from 10 cm to 13 cm and the
   crop floats out over the lip by itself, and 20 % is always left
   behind as seed stock. */

/* ------------------------------------------------------------- the rig */
const GROW = 10;      // cm — normal cultivation level
const HARVEST = 13;   // cm — level that pushes the crop over the weir
const KEEP = 0.20;    // fraction held back as seed stock, every cycle

const TANK = { w: 92, d: 62, h: 20, wall: 1.6 };
const WEIR_X = TANK.w / 2;
const GRAINS = 620;

/* phase table — [name, duration in story-seconds] */
const PHASES = [
  ["GROWING",   3.0],
  ["FILLING",   1.8],
  ["HARVEST",   3.4],
  ["FILTERING", 2.0],
  ["DRAINING",  1.8],
  ["SEEDSTOCK", 1.6]
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

export function buildWolffiaWorld(scene, THREE) {
  const P = (h, r, m = 0) => new THREE.MeshStandardMaterial({ color: h, roughness: r, metalness: m });
  const ALU    = P(0xb9c1cc, 0.32, 0.85);
  const DARK   = P(0x22262d, 0.62, 0.15);
  const GREY   = P(0x6d7681, 0.55, 0.25);
  const PVC    = P(0xdfe4ea, 0.55, 0.02);
  const CAB    = P(0xd7dce3, 0.42, 0.35);
  const GREEN  = P(0x74c23e, 0.72, 0.02);

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
  // The rig runs left-to-right; centre the middle of it on the origin,
  // which is where the shared stage aims.
  root.position.x = -22;
  scene.add(root);

  /* =============================================================== lights */
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(120, 220, 140);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { near: 40, far: 800, left: -220, right: 220, top: 220, bottom: -220 });
  key.shadow.bias = -0.0012;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x86c8ff, 1.0);
  rim.position.set(-160, 90, -140);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xbfe0ff, 0x0a0d13, 0.55));

  const shadowFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.ShadowMaterial({ opacity: 0.32 })
  );
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);

  // Grow lamps, close over the water — they are what makes this a farm.
  const growLight = new THREE.PointLight(0xff8fd8, 0, 240, 2);
  growLight.position.set(0, 44, 0);
  root.add(growLight);

  /* ================================================================ bench */
  const bench = add(root, box(300, 4, 92), DARK, 40, 34, 0);
  bench.receiveShadow = true;
  for (const sx of [-120, 160]) for (const sz of [-36, 36]) {
    add(root, box(5, 34, 5), GREY, 40 + sx, 17, sz);
  }

  /* ================================================================= tank */
  const tank = new THREE.Group();
  tank.position.set(0, 36, 0);
  root.add(tank);

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xdff0f4, roughness: 0.08, metalness: 0, transparent: true,
    opacity: 0.20, transmission: 0.85, thickness: 2, side: THREE.DoubleSide
  });
  const { w, d, h, wall } = TANK;
  add(tank, box(w, wall, d), P(0xe8eef2, 0.5), 0, wall / 2, 0);       // floor
  add(tank, box(wall, h, d), glass, -w / 2, h / 2, 0);                 // back wall
  for (const sz of [-1, 1]) add(tank, box(w, h, wall), glass, 0, h / 2, sz * d / 2);
  // The overflow side is deliberately short: its lip is the weir, and it
  // sits between the two levels so 10 cm stays in and 13 cm spills.
  add(tank, box(wall, 12.5, d), glass, WEIR_X, 12.5 / 2, 0);
  add(tank, box(2.6, 0.8, d), ALU, WEIR_X, 12.6, 0);                   // weir lip

  const water = new THREE.Mesh(box(w - wall, 1, d - wall), new THREE.MeshPhysicalMaterial({
    color: 0x1d7f86, roughness: 0.12, metalness: 0, transparent: true,
    opacity: 0.72, transmission: 0.5, thickness: 6
  }));
  tank.add(water);

  // Float switch — the sensor the fill logic actually closes the loop on.
  add(tank, cyl(0.5, 20, 10), ALU, -w / 2 + 9, 10, d / 2 - 9);
  const floatBall = add(tank, new THREE.SphereGeometry(2.2, 14, 12), P(0xff8c2b, 0.6), -w / 2 + 9, GROW, d / 2 - 9);

  /* ============================================================== channel */
  // Sloping channel with the cheesecloth stretched across it.
  const chan = new THREE.Group();
  chan.position.set(WEIR_X + 26, 36, 0);
  chan.rotation.z = -0.16;
  root.add(chan);
  add(chan, box(56, 1.2, 44), P(0xe8eef2, 0.5), 0, 8, 0);
  for (const sz of [-1, 1]) add(chan, box(56, 7, 1.2), glass, 0, 11.5, sz * 22);
  const cloth = add(chan, box(46, 0.4, 38), new THREE.MeshStandardMaterial({
    color: 0xf2f5f1, roughness: 0.95, transparent: true, opacity: 0.55, side: THREE.DoubleSide
  }), 4, 10.4, 0);

  /* ============================================================ collection */
  const tub = new THREE.Group();
  tub.position.set(WEIR_X + 82, 0, 0);
  root.add(tub);
  add(tub, cyl(19, 30, 26), P(0xd3dae1, 0.45, 0.05), 0, 15, 0);
  add(tub, cyl(19.6, 1.6, 26), ALU, 0, 30, 0);
  const tubWater = add(tub, cyl(17.6, 1, 24), P(0x1d7f86, 0.15), 0, 4, 0);
  tubWater.material.transparent = true;
  tubWater.material.opacity = 0.75;

  /* =========================================================== water works */
  // Return line: tub → pump → valve → back over the tank. Every drop is
  // recycled, which is the point of the closed loop.
  const pump = add(root, box(14, 11, 10), P(0x2a6fb0, 0.45, 0.4), WEIR_X + 82, 5.5, -30);
  add(root, cyl(4, 9, 16), ALU, WEIR_X + 82, 12, -30);
  const pipePts = [
    [WEIR_X + 82, 10, -20], [WEIR_X + 82, 10, -30], [WEIR_X + 60, 14, -38],
    [WEIR_X + 10, 30, -40], [-10, 56, -34], [-24, 54, -12], [-24, 48, 0]
  ].map((p) => new THREE.Vector3(...p));
  add(root, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pipePts), 70, 1.9, 10), PVC, 0, 0, 0);
  const valve = new THREE.Group();
  valve.position.set(WEIR_X + 24, 24, -39);
  root.add(valve);
  add(valve, cyl(3.4, 6, 14), P(0x2a6fb0, 0.45, 0.4), 0, 0, 0);
  const valveHandle = add(valve, box(1.4, 1.4, 11), P(0xd43b2f, 0.5), 0, 4, 0);

  // Water leaving the return line, only while the pump runs.
  const jet = new THREE.Mesh(cyl(1.1, 14, 10), new THREE.MeshBasicMaterial({
    color: 0x7fd8e6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  jet.position.set(-24, 42, 0);
  root.add(jet);

  /* ============================================================ grow frame */
  for (const sx of [-1, 1]) add(root, box(4, 40, 4), GREY, sx * (w / 2 - 3), 56, -d / 2 + 3);
  add(root, box(w, 4, 4), GREY, 0, 74, -d / 2 + 3);
  const lamps = [-14, 14].map((z) => {
    const bar = add(root, box(w - 14, 3, 7), P(0x2b3038, 0.5), 0, 70, z);
    const tube = new THREE.Mesh(box(w - 20, 1.2, 4.6), new THREE.MeshBasicMaterial({ color: 0xff8fd8 }));
    tube.position.set(0, 68.3, z);
    root.add(tube);
    add(root, box(2, 6, 5), GREY, 0, 73, z);
    return tube.material;
  });

  // Temperature / humidity sensor hanging off the frame.
  const sens = new THREE.Group();
  sens.position.set(w / 2 - 12, 62, -d / 2 + 6);
  root.add(sens);
  add(sens, box(6, 9, 3), P(0xf2f4f7, 0.6), 0, 0, 0);
  add(sens, box(4.4, 4.4, 0.6), P(0x2b3038, 0.7), 0, 1, 1.7);

  /* ============================================================== control */
  const panel = new THREE.Group();
  panel.position.set(-w / 2 - 52, 36, -6);
  panel.rotation.y = 0.42;
  root.add(panel);
  add(panel, box(44, 56, 16), CAB, 0, 28, 0);                        // enclosure
  add(panel, box(40, 52, 0.6), P(0xeef1f5, 0.5), 0, 28, 8.3);        // door
  add(panel, box(14, 20, 1.4), P(0x2c6a3c, 0.55), -9, 36, 9.2);      // PLC
  add(panel, box(9, 13, 1.4), P(0x1d3f6b, 0.55), 6, 34, 9.2);        // ESP32
  for (let i = 0; i < 4; i++) add(panel, box(4, 5, 1.2), P(0x2b3038, 0.6), -14 + i * 5, 20, 9.2);
  const plcLed = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.6),
    new THREE.MeshBasicMaterial({ color: 0x7dff8a }));
  plcLed.position.set(-9, 45, 9.5);
  panel.add(plcLed);

  // HMI on the cabinet door, and the phone running the Thunkable app.
  const mkScreen = (wpx, hpx) => {
    const cv = document.createElement("canvas");
    cv.width = wpx; cv.height = hpx;
    const tex = new THREE.CanvasTexture(cv);
    return { cv, cx: cv.getContext("2d"), tex };
  };
  const hmi = mkScreen(256, 192);
  const hmiMesh = new THREE.Mesh(box(20, 15, 0.3), new THREE.MeshBasicMaterial({ map: hmi.tex }));
  hmiMesh.position.set(0, 11, 9.4);
  panel.add(hmiMesh);

  const phone = new THREE.Group();
  phone.position.set(-w / 2 - 16, 36, 26);
  phone.rotation.set(-0.5, 0.5, 0.1);
  root.add(phone);
  add(phone, box(15, 30, 1.4), P(0x15181d, 0.4), 0, 8, 0);
  const app = mkScreen(180, 360);
  const appMesh = new THREE.Mesh(box(13.4, 28, 0.2), new THREE.MeshBasicMaterial({ map: app.tex }));
  appMesh.position.set(0, 8, 0.85);
  phone.add(appMesh);
  add(phone, cyl(1.6, 24, 12), ALU, 0, -12, 0).rotation.x = Math.PI / 2;

  // Modbus TCP link between the PLC and the ESP32 — drawn as packets so
  // the two halves of the control system read as one system.
  const packets = [];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), new THREE.MeshBasicMaterial({
      color: 0x4da3ff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    root.add(p);
    packets.push(p);
  }
  const linkA = new THREE.Vector3(-w / 2 - 52, 74, 2);
  const linkB = new THREE.Vector3(-w / 2 - 16, 50, 26);

  /* =============================================================== wolffia */
  // Each grain owns a slot in [0,1). The lowest KEEP of that range never
  // leaves — that is the 20 % seed stock, held back every single cycle.
  const grain = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.62, 6, 5), GREEN, GRAINS);
  grain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  grain.castShadow = true;
  root.add(grain);

  const seed = [];
  for (let i = 0; i < GRAINS; i++) {
    seed.push({
      x: (Math.random() - 0.5) * (w - 8),
      z: (Math.random() - 0.5) * (d - 8),
      // Grains nearer the weir leave first, with a little noise so the
      // outflow looks like a drift and not a sorted sweep.
      o: KEEP + (1 - KEEP) * Math.min(Math.max((0.5 + ((Math.random() - 0.5) * (w - 8)) / w) * 0.8 + Math.random() * 0.2, 0), 0.999),
      s: 0.55 + Math.random() * 0.9,
      w: Math.random() * 6.28
    });
  }
  // Re-rank so `o` spreads evenly across (KEEP, 1]; the seed stock keeps
  // the bottom slice of the range and simply never gets an exit.
  seed.slice().sort((a, b) => a.o - b.o).forEach((g, i) => { g.o = i / GRAINS; });

  const M = new THREE.Matrix4();
  const V = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  const S = new THREE.Vector3();

  const CH = { x: WEIR_X + 26, y: 46.4, drop: -0.16 };   // channel surface
  const TUB = { x: WEIR_X + 82, y: 34 };

  /* ---------------------------------------------------------- HMI drawing */
  let uiAcc = 0;
  function drawUI(state, level, cropPct, pumpOn, lampOn) {
    const { cx: a } = hmi;
    a.fillStyle = "#0b1a16"; a.fillRect(0, 0, 256, 192);
    a.strokeStyle = "#2f6b4f"; a.lineWidth = 2; a.strokeRect(6, 6, 244, 180);
    a.fillStyle = "#8fd94f"; a.font = "bold 19px ui-monospace, Consolas, monospace";
    a.fillText("MIDORI WOLFFIA", 18, 32);
    a.fillStyle = "#cfe8d6"; a.font = "600 15px ui-monospace, Consolas, monospace";
    a.fillText(state, 18, 60);
    a.fillStyle = "#7fa892"; a.font = "600 13px ui-monospace, Consolas, monospace";
    a.fillText("LEVEL", 18, 92); a.fillText("CROP", 18, 114);
    a.fillText("PUMP", 18, 136); a.fillText("LAMP", 18, 158);
    a.fillStyle = "#e8f5ec";
    a.fillText(level.toFixed(1) + " cm", 96, 92);
    a.fillText(Math.round(cropPct) + " %", 96, 114);
    a.fillStyle = pumpOn ? "#7dff8a" : "#5a6b62"; a.fillText(pumpOn ? "RUN" : "OFF", 96, 136);
    a.fillStyle = lampOn ? "#ff8fd8" : "#5a6b62"; a.fillText(lampOn ? "ON" : "OFF", 96, 158);
    // level bar
    a.strokeStyle = "#2f6b4f"; a.strokeRect(178, 78, 56, 92);
    a.fillStyle = "#1d7f86";
    const bh = (level / HARVEST) * 84;
    a.fillRect(182, 166 - bh, 48, bh);
    hmi.tex.needsUpdate = true;

    const { cx: b } = app;
    b.fillStyle = "#0f1512"; b.fillRect(0, 0, 180, 360);
    b.fillStyle = "#1c7a3e"; b.fillRect(0, 0, 180, 46);
    b.fillStyle = "#eaf7ee"; b.font = "bold 15px ui-monospace, Consolas, monospace";
    b.fillText("Overview", 14, 30);
    const rows = [["TEMP", "27.4 °C"], ["HUMID", "68 %"], ["LEVEL", level.toFixed(1) + " cm"],
                  ["LAMP", lampOn ? "ON" : "OFF"], ["PUMP", pumpOn ? "ON" : "OFF"],
                  ["VALVE", pumpOn ? "OPEN" : "SHUT"]];
    rows.forEach(([k, v], i) => {
      const y = 76 + i * 34;
      b.fillStyle = "#182420"; b.fillRect(12, y - 18, 156, 26);
      b.fillStyle = "#7fa892"; b.font = "600 11px ui-monospace, Consolas, monospace";
      b.fillText(k, 20, y);
      b.fillStyle = "#e8f5ec"; b.font = "bold 12px ui-monospace, Consolas, monospace";
      b.fillText(v, 104, y);
    });
    b.fillStyle = "#1c7a3e"; b.fillRect(12, 292, 156, 30);
    b.fillStyle = "#eaf7ee"; b.font = "bold 13px ui-monospace, Consolas, monospace";
    b.fillText("HARVEST", 56, 312);
    app.tex.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ HUD */
  const hudA = document.getElementById("hud-a");
  const hudB = document.getElementById("hud-b");
  const hudC = document.getElementById("hud-c");

  const MARKS = [0, at(1), at(2) + 1.4, at(4), MISSION];
  function missionTime(cur) {
    const c = Math.min(Math.max(cur, 0), MARKS.length - 1);
    const i = Math.min(Math.floor(c), MARKS.length - 2);
    return MARKS[i] + (MARKS[i + 1] - MARKS[i]) * (c - i);
  }

  const focus = new THREE.Vector3();

  function update(dt, t, ctx) {
    const mt = missionTime(ctx.cur);

    let level = GROW, state = "GROWING", out = 0, pumpOn = false, drainT = 0;
    if (mt < at(1)) {
      state = "GROWING";
    } else if (mt < at(2)) {
      level = lerp(GROW, HARVEST, smooth(at(1), at(2), mt));
      state = "FILLING"; pumpOn = true;
    } else if (mt < at(3)) {
      level = HARVEST; state = "HARVEST";
      out = smooth(at(2), at(3), mt);
    } else if (mt < at(4)) {
      level = HARVEST; state = "FILTERING"; out = 1;
    } else if (mt < at(5)) {
      out = 1; state = "DRAINING";
      drainT = smooth(at(4), at(5), mt);
      level = lerp(HARVEST, GROW, drainT);
    } else {
      out = 1; level = GROW; state = "SEEDSTOCK"; drainT = 1;
    }

    /* ---- water ---- */
    water.scale.y = Math.max(level, 0.01);
    water.position.y = level / 2 + TANK.wall;
    floatBall.position.y = level;
    tubWater.scale.y = 1 + out * 9;
    tubWater.position.y = 4 + out * 4.5;

    /* ---- lamps and pump ---- */
    const lampOn = state === "GROWING" || state === "SEEDSTOCK";
    const lampK = lampOn ? 1 : 0.25;
    lamps.forEach((m) => m.color.setRGB(1 * lampK, 0.56 * lampK, 0.85 * lampK));
    growLight.intensity = lampOn ? 22000 : 4000;
    plcLed.material.color.setHex(pumpOn ? 0xffc247 : 0x7dff8a);
    jet.material.opacity = pumpOn ? 0.5 + Math.sin(t * 14) * 0.12 : 0;
    valveHandle.rotation.y = pumpOn ? Math.PI / 2 : 0;
    pump.position.y = 5.5 + (pumpOn ? Math.sin(t * 40) * 0.12 : 0);

    /* ---- the crop ---- */
    let inTank = 0, sumX = 0, sumZ = 0;
    for (let i = 0; i < GRAINS; i++) {
      const g = seed[i];
      // A grain only ever leaves if its slot is above the seed-stock cut.
      const leaves = g.o >= KEEP;
      const k = leaves ? Math.min(Math.max((out - (g.o - KEEP) * 0.85) / 0.32, 0), 1) : 0;
      let x, y, z, sc = g.s;

      if (k <= 0) {
        // Floating: drifting on the surface, packed toward the weir as the
        // level rises.
        const push = smooth(GROW, HARVEST, level) * 6;
        x = g.x + push + Math.sin(t * 0.5 + g.w) * 1.4;
        z = g.z + Math.cos(t * 0.42 + g.w) * 1.4;
        y = 36 + TANK.wall + level + 0.3;
        inTank++;
      } else if (k < 0.34) {
        // Over the lip.
        const u = k / 0.34;
        x = lerp(g.x + 6, WEIR_X + 6, u);
        z = lerp(g.z, g.z * 0.72, u);
        y = lerp(36 + TANK.wall + level + 0.3, CH.y + 3, u);
      } else if (k < 0.72) {
        // Down the sloping channel, onto the cheesecloth.
        const u = (k - 0.34) / 0.38;
        x = lerp(WEIR_X + 6, CH.x + 16, u);
        z = lerp(g.z * 0.72, g.z * 0.5, u);
        y = lerp(CH.y + 3, CH.y - 2.4, u) + Math.sin(u * 6.2 + g.w) * 0.5;
      } else {
        // Caught by the cloth and gathered — the water goes on without it.
        const u = (k - 0.72) / 0.28;
        x = lerp(CH.x + 16, CH.x + 20, u);
        z = lerp(g.z * 0.5, g.z * 0.34, u);
        y = CH.y - 2.4;
        sc = g.s * (1 + u * 0.25);
      }

      sumX += x; sumZ += z;
      V.set(x, y, z);
      S.set(sc, sc * 0.7, sc);
      Q.setFromAxisAngle({ x: 0, y: 1, z: 0 }, g.w);
      M.compose(V, Q, S);
      grain.setMatrixAt(i, M);
    }
    grain.instanceMatrix.needsUpdate = true;

    /* ---- modbus packets ---- */
    packets.forEach((p, i) => {
      const k = (t * 0.55 + i / packets.length) % 1;
      p.position.lerpVectors(linkA, linkB, k);
      p.position.y += Math.sin(k * Math.PI) * 9;
      p.material.opacity = 0.9 * Math.sin(k * Math.PI);
    });

    /* ---- readouts ---- */
    const cropPct = (inTank / GRAINS) * 100;
    // Follow the crop's own centre of mass, so a close shot drifts from the
    // tank out along the channel exactly as fast as the harvest does.
    focus.set(root.position.x + sumX / GRAINS, 46, root.position.z + sumZ / GRAINS);

    uiAcc += dt;
    if (uiAcc > 0.14) {
      uiAcc = 0;
      drawUI(state, level, cropPct, pumpOn, lampOn);
    }
    if (hudA) hudA.textContent = state;
    if (hudB) hudB.textContent = level.toFixed(1) + " cm";
    if (hudC) hudC.textContent = Math.round(cropPct) + " % " + (state === "SEEDSTOCK" ? "seed stock" : "in tank");
  }

  function theme(dark) {
    key.intensity = dark ? 2.0 : 2.7;
    rim.intensity = dark ? 1.0 : 0.65;
    shadowFloor.material.opacity = dark ? 0.32 : 0.18;
  }

  return { fit: 470, focusY: 48, focus, update, theme };
}
