/* Project 04 — Automatic plant watering, four zones on Blynk.

   Kept deliberately simple: four planting beds, a soil-moisture probe in
   each, a relay board, and a nozzle per zone. What scrolls past is the
   automatic mode doing its job — moisture in a zone falls through its
   threshold, that zone's relay closes, its nozzle runs, and the reading
   climbs back into band. Each zone is independent, which is the whole
   point of having four of them. */

const ZONES = 4;
const LOW = 32;            // % — the min threshold that triggers a zone
const HIGH = 68;           // % — where watering stops
const BED = { w: 96, d: 72, h: 22 };
const PITCH = 118;

/* phase table — [name, duration in story-seconds] */
const PHASES = [
  ["MONITORING", 3.0],
  ["ZONE 3 LOW", 1.6],
  ["WATERING",   3.2],
  ["ZONE 1 LOW", 1.4],
  ["WATERING",   2.6],
  ["ALL IN BAND", 1.8]
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

export function buildWaterWorld(scene, THREE) {
  const P = (h, r, m = 0) => new THREE.MeshStandardMaterial({ color: h, roughness: r, metalness: m });
  const SOIL  = P(0x4a3626, 0.95);
  const WOOD  = P(0x8a6039, 0.82);
  const LEAF  = P(0x5aa83c, 0.75);
  const ALU   = P(0xb9c1cc, 0.32, 0.85);
  const DARK  = P(0x23272e, 0.6, 0.2);
  const PVC   = P(0xdfe4ea, 0.55, 0.02);
  const BOARD = P(0x11406e, 0.58, 0.1);

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r, h, s = 16) => new THREE.CylinderGeometry(r, r, h, s);
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
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(180, 320, 200);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { near: 40, far: 900, left: -320, right: 320, top: 320, bottom: -320 });
  key.shadow.bias = -0.0012;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x86c8ff, 1.0);
  rim.position.set(-200, 120, -180);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x0a0d13, 0.6));

  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600),
    new THREE.ShadowMaterial({ opacity: 0.3 }));
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);

  /* ----------------------------------------------------------- four beds */
  const beds = [];
  for (let i = 0; i < ZONES; i++) {
    const x = (i - (ZONES - 1) / 2) * PITCH;
    const g = new THREE.Group();
    g.position.set(x, 0, 0);
    root.add(g);

    for (const sz of [-1, 1]) add(g, box(BED.w, BED.h, 5), WOOD, 0, BED.h / 2, sz * BED.d / 2);
    for (const sx of [-1, 1]) add(g, box(5, BED.h, BED.d), WOOD, sx * BED.w / 2, BED.h / 2, 0);
    // Its own material instance so this bed can darken as it takes water.
    const soil = add(g, box(BED.w - 6, 3, BED.d - 6), SOIL.clone(), 0, BED.h - 3, 0);

    // Leafy heads rather than blobs: a short stem with six leaves fanned
    // around it, so a droop actually looks like a droop.
    const leaves = [];
    const leafGeo = new THREE.SphereGeometry(6.4, 7, 5);
    leafGeo.scale(1, 0.32, 1.5);
    for (let p = 0; p < 6; p++) {
      const px = (p % 3 - 1) * 26, pz = ((p / 3 | 0) - 0.5) * 30;
      add(g, cyl(1.1, 10, 8), P(0x3f7a2c, 0.8), px, BED.h + 4, pz);
      const head = new THREE.Group();
      head.position.set(px, BED.h + 9, pz);
      head.rotation.y = Math.random() * 6.28;
      g.add(head);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const leaf = add(head, leafGeo, LEAF, Math.sin(a) * 4.6, 1.5, Math.cos(a) * 4.6);
        leaf.rotation.set(0, a, 0);
        leaf.userData.tilt = a;
      }
      add(head, new THREE.IcosahedronGeometry(3.6, 0), P(0x76c94c, 0.7), 0, 3.4, 0);
      leaves.push(head);
    }

    // Soil-moisture probe: two prongs and a small head, sitting in the bed.
    const probe = new THREE.Group();
    probe.position.set(BED.w / 2 - 14, BED.h, BED.d / 2 - 12);
    g.add(probe);
    for (const sx of [-1, 1]) add(probe, box(2, 14, 1), ALU, sx * 3, -4, 0);
    add(probe, box(10, 16, 3), P(0x1e6b3a, 0.6), 0, 10, 0);
    const probeLed = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x7dff8a }));
    probeLed.position.set(0, 18, 2);
    probe.add(probeLed);

    // Riser, solenoid valve, and the nozzle it feeds. The valve is what the
    // relay is actually switching, so it belongs in the picture.
    const RX = -BED.w / 2 + 12, RZ = -BED.d / 2 + 10;
    add(g, cyl(2.4, 46, 12), PVC, RX, 23, RZ);
    const solenoid = add(g, box(11, 13, 9), P(0x27313d, 0.45, 0.4), RX + 7, 16, RZ);
    add(g, cyl(3.6, 5, 12), P(0x2f63c4, 0.45, 0.3), RX + 7, 24, RZ);
    add(g, cyl(3.4, 6, 12), DARK, RX, 48, RZ);
    // Sprinkler head: a hub with four short arms, angled outward.
    const head = new THREE.Group();
    head.position.set(RX, 51, RZ);
    g.add(head);
    add(head, cyl(2.2, 3, 10), ALU, 0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const arm = add(head, box(1.6, 1.6, 7), ALU, Math.sin(a) * 3.6, 0, Math.cos(a) * 3.6);
      arm.rotation.y = a;
    }

    /* Droplets thrown from the head on ballistic arcs, rather than a cone
       standing in for water. Each one carries its own launch angle and
       speed and simply falls. */
    const DROPS = 26;
    const dropGeo = new THREE.SphereGeometry(1.15, 6, 5);
    const dropMat = new THREE.MeshBasicMaterial({
      color: 0x9fe6f5, transparent: true, opacity: 0
    });
    const drops = new THREE.InstancedMesh(dropGeo, dropMat, DROPS);
    drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    drops.frustumCulled = false;
    g.add(drops);
    const dropSeed = [];
    for (let k = 0; k < DROPS; k++) {
      dropSeed.push({
        a: Math.random() * Math.PI * 2,
        v: 26 + Math.random() * 16,
        up: 20 + Math.random() * 10,
        t0: Math.random()
      });
    }

    // Where the water lands, the soil goes dark first.
    const patch = add(g, new THREE.CircleGeometry(30, 28), P(0x2a1c12, 0.95),
      RX + 22, BED.h - 1.2, RZ + 16);
    patch.rotation.x = -Math.PI / 2;
    patch.material.transparent = true;
    patch.material.opacity = 0;

    beds.push({ g, soil, leaves, probeLed, solenoid, head, drops, dropSeed,
                patch, RX, RZ, x });
  }

  // Supply main with a tee dropping into each riser.
  add(root, cyl(3.4, PITCH * ZONES, 14), PVC, 0, 4, -BED.d / 2 + 10).rotation.z = Math.PI / 2;
  beds.forEach((b) => {
    add(root, cyl(4.4, 7, 12), PVC, b.x + b.RX, 4, -BED.d / 2 + 10).rotation.z = Math.PI / 2;
  });

  // Scratch objects for placing droplet instances each frame.
  const M = new THREE.Matrix4();
  const V = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  const S = new THREE.Vector3(1, 1, 1);

  /* ------------------------------------------------- controller + relays */
  const ctrl = new THREE.Group();
  ctrl.position.set(-(ZONES / 2) * PITCH - 34, 0, 40);
  ctrl.rotation.y = 0.5;
  root.add(ctrl);
  add(ctrl, box(8, 54, 8), DARK, 0, 27, 0);                       // post
  add(ctrl, box(74, 52, 16), P(0xd7dce3, 0.45, 0.3), 0, 78, 0);   // enclosure
  add(ctrl, box(22, 12, 1.4), BOARD, -22, 92, 8.4);               // Wi-Fi MCU
  const relayLeds = [];
  for (let i = 0; i < ZONES; i++) {
    add(ctrl, box(13, 16, 1.6), P(0x2b3038, 0.55), 4 + (i % 2) * 16, 92 - (i / 2 | 0) * 20, 8.4);
    const l = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 0.8),
      new THREE.MeshBasicMaterial({ color: 0x3a2a10 }));
    l.position.set(4 + (i % 2) * 16, 98 - (i / 2 | 0) * 20, 9.3);
    ctrl.add(l);
    relayLeds.push(l);
  }

  /* ------------------------------------------------- the Blynk dashboard */
  const cv = document.createElement("canvas");
  cv.width = 200; cv.height = 380;
  const cx = cv.getContext("2d");
  const tex = new THREE.CanvasTexture(cv);
  const phone = new THREE.Group();
  phone.position.set((ZONES / 2) * PITCH + 6, 0, 54);
  phone.rotation.set(-0.42, -0.55, 0.08);
  root.add(phone);
  add(phone, cyl(1.8, 46, 12), ALU, 0, 23, 0);
  add(phone, box(34, 66, 3), P(0x15181d, 0.4), 0, 74, 0);
  const screen = new THREE.Mesh(box(30, 60, 0.4), new THREE.MeshBasicMaterial({ map: tex }));
  screen.position.set(0, 74, 1.9);
  phone.add(screen);

  let uiAcc = 0;
  function drawApp(state, m) {
    cx.fillStyle = "#0d1117"; cx.fillRect(0, 0, 200, 380);
    cx.fillStyle = "#1c7a3e"; cx.fillRect(0, 0, 200, 48);
    cx.fillStyle = "#eaf7ee"; cx.font = "bold 16px ui-monospace, Consolas, monospace";
    cx.fillText("Blynk · AUTO", 14, 31);
    cx.fillStyle = "#8ea3bf"; cx.font = "600 11px ui-monospace, Consolas, monospace";
    cx.fillText(state, 14, 68);
    m.forEach((v, i) => {
      const y = 92 + i * 68;
      const on = v.on;
      cx.fillStyle = "#161c24"; cx.fillRect(12, y, 176, 56);
      cx.fillStyle = on ? "#7dff8a" : "#5d708c";
      cx.font = "bold 12px ui-monospace, Consolas, monospace";
      cx.fillText("ZONE " + (i + 1), 22, y + 20);
      cx.fillStyle = on ? "#7dff8a" : "#3a4553";
      cx.fillRect(150, y + 10, 30, 12);
      // moisture bar against the min threshold
      cx.fillStyle = "#22303f"; cx.fillRect(22, y + 32, 156, 10);
      const k = Math.min(Math.max(v.pct / 100, 0), 1);
      cx.fillStyle = v.pct < LOW ? "#e0793c" : "#4da3ff";
      cx.fillRect(22, y + 32, 156 * k, 10);
      cx.fillStyle = "#dfe5ee"; cx.font = "600 11px ui-monospace, Consolas, monospace";
      cx.fillText(Math.round(v.pct) + "%", 22, y + 54);
      cx.strokeStyle = "#8ea3bf";
      cx.beginPath(); cx.moveTo(22 + 156 * LOW / 100, y + 30); cx.lineTo(22 + 156 * LOW / 100, y + 44); cx.stroke();
    });
    tex.needsUpdate = true;
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
    // Every zone drifts down on its own clock; two of them cross the
    // threshold during the run, and each is handled independently.
    const drift = [0.55, 0.30, 1.00, 0.42];
    const m = [];
    let state = PHASES[0][0], lead = 2;

    for (let i = 0; i < ZONES; i++) {
      const base = [58, 74, 52, 63][i];
      let pct = base - smooth(0, at(2), mt) * drift[i] * 34;
      let on = false;
      if (i === 2) {
        // Zone 3 is the first to go dry and the first to be watered.
        if (mt >= at(2) && mt < at(3)) { on = true; pct = lerp(LOW - 2, HIGH, smooth(at(2), at(3), mt)); }
        else if (mt >= at(3)) pct = HIGH - smooth(at(3), MISSION, mt) * 6;
      }
      if (i === 0) {
        if (mt >= at(3) && mt < at(4)) pct = lerp(pct, LOW - 1, smooth(at(3), at(4), mt));
        else if (mt >= at(4) && mt < at(5)) { on = true; pct = lerp(LOW - 1, HIGH, smooth(at(4), at(5), mt)); }
        else if (mt >= at(5)) pct = HIGH - 3;
      }
      m.push({ pct, on });
      if (on) lead = i;
    }

    if (mt < at(1)) state = "MONITORING";
    else if (mt < at(2)) state = "ZONE 3 LOW";
    else if (mt < at(3)) state = "WATERING Z3";
    else if (mt < at(4)) state = "ZONE 1 LOW";
    else if (mt < at(5)) state = "WATERING Z1";
    else state = "ALL IN BAND";

    beds.forEach((b, i) => {
      const v = m[i];
      const wet = Math.min(Math.max((v.pct - 20) / 60, 0), 1);
      // Wet soil is darker; a dry bed reads dry before you check the number.
      b.soil.material.color.setRGB(lerp(0.42, 0.19, wet), lerp(0.31, 0.13, wet), lerp(0.22, 0.09, wet));
      b.probeLed.material.color.setHex(v.pct < LOW ? 0xff7a2f : 0x7dff8a);
      b.solenoid.material.color.setHex(v.on ? 0x3a5a7a : 0x27313d);
      b.patch.material.opacity = v.on ? 0.55 : Math.max(wet - 0.55, 0) * 0.5;

      // Droplets: launch from the head, fly a ballistic arc, land, repeat.
      if (v.on) {
        b.head.rotation.y = t * 5.5;
        for (let k = 0; k < b.dropSeed.length; k++) {
          const d = b.dropSeed[k];
          const k01 = ((t * 1.15 + d.t0) % 1);
          const tt = k01 * 1.5;
          const px = b.RX + Math.sin(d.a) * d.v * tt;
          const pz = b.RZ + Math.cos(d.a) * d.v * tt;
          const py = 51 + d.up * tt - 38 * tt * tt;
          S.set(1, 1, 1);
          V.set(px, Math.max(py, BED.h), pz);
          M.compose(V, Q.identity(), S);
          b.drops.setMatrixAt(k, M);
        }
        b.drops.instanceMatrix.needsUpdate = true;
        b.drops.material.opacity = 0.85;
      } else if (b.drops.material.opacity !== 0) {
        b.drops.material.opacity = 0;
      }

      // Dry plants droop and shrink; watered ones open back up.
      b.leaves.forEach((h, j) => {
        const s = 0.74 + wet * 0.40;
        h.scale.setScalar(s);
        h.position.y = BED.h + 9 + wet * 2 + Math.sin(t * 0.8 + j) * 0.35;
        h.children.forEach((leaf) => {
          if (leaf.userData.tilt === undefined) return;
          // Turgid leaves lift; a thirsty plant lets them hang.
          leaf.rotation.x = lerp(0.5, -0.12, wet) + Math.sin(t * 1.1 + leaf.userData.tilt) * 0.04;
        });
      });
    });

    // Per-bed soil tint needs its own material instance, so colour the
    // frame instead: the relay LEDs carry the state clearly enough.
    relayLeds.forEach((l, i) => l.material.color.setHex(m[i].on ? 0x7dff8a : 0x3a2a10));

    focus.set(beds[lead].x, 26, 0);

    uiAcc += dt;
    if (uiAcc > 0.14) { uiAcc = 0; drawApp(state, m); }
    if (hudA) hudA.textContent = state;
    if (hudB) hudB.textContent = m.map((v) => Math.round(v.pct)).join(" · ") + " %";
    if (hudC) hudC.textContent = "min " + LOW + "% · max " + HIGH + "%";
  }

  function theme(dark) {
    key.intensity = dark ? 2.2 : 2.8;
    rim.intensity = dark ? 1.0 : 0.6;
    shadowFloor.material.opacity = dark ? 0.3 : 0.17;
  }

  return { fit: 780, focusY: 44, focus, update, theme };
}
