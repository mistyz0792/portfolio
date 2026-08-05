/* Project 02 — Mobile Robot + K-LD7 Radar.

   The whole scene is built from primitives, no CAD import. Everything is
   in centimetres in the radar's own frame: +Z is the radar's forward
   (its 0°), +X is to its right, and headings are clockwise-positive —
   the same convention as `atan2(dx, dy)` in navigator.py.

   The mission the robot flies here is the real go-to-goal routine, with
   the real numbers: spin to acquire, 30 cm heading probe, plan, open-loop
   rotate, drive, re-check. The open-loop rotation overshoots on purpose,
   because that is what open-loop rotation does. */

const D2R = Math.PI / 180;

/* ------------------------------------------------------- the actual run */
const P0 = { x: -90, z: 90 };          // where the radar first sees it
const H0 = 20;                          // heading at that moment, degrees
const PROBE = 30;                       // cm — HEADING_PROBE_TRAVEL
const P1 = { x: P0.x + PROBE * Math.sin(H0 * D2R),
             z: P0.z + PROBE * Math.cos(H0 * D2R) };
const GOAL = { x: 110, z: 150 };
const LEG = Math.hypot(GOAL.x - P1.x, GOAL.z - P1.z);
const PLANNED = Math.atan2(GOAL.x - P1.x, GOAL.z - P1.z) / D2R;   // 80.5°
const TURN = PLANNED - H0;                                        // +60.5°
// Open-loop: the calibrated rate is never exactly right. 12 % long here.
const H1 = H0 + TURN * 1.124;
const P2 = { x: P1.x + LEG * Math.sin(H1 * D2R),
             z: P1.z + LEG * Math.cos(H1 * D2R) };
const MISS = Math.hypot(GOAL.x - P2.x, GOAL.z - P2.z);            // 25 cm
const ARRIVAL = 30;                                               // cm

/* phase table — [name, duration in story-seconds] */
const PHASES = [
  ["SPIN_TO_ACQUIRE", 3.0],
  ["LOCKED",          0.9],
  ["HEADING_PROBE",   1.6],
  ["PLANNING",        1.4],
  ["ROTATING",        1.5],
  ["DRIVING",         3.2],
  ["CHECKING",        1.6],
  ["ARRIVED",         1.8]
];
const START = [];
let acc = 0;
for (const [, d] of PHASES) { START.push(acc); acc += d; }
const MISSION = acc;
const at = (i) => START[i];

const BEAM_HALF = 40 * D2R;    // K-LD7 azimuth beam is about 80° wide
const RANGE = 250;             // cm of floor we draw

const smooth = (a, b, x) => {
  const k = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return k * k * (3 - 2 * k);
};

export function buildRadarWorld(scene, THREE) {
  const P = (h, r, m = 0) => new THREE.MeshStandardMaterial({ color: h, roughness: r, metalness: m });
  const BLUE   = P(0x1f5fa8, 0.34, 0.62);   // Makeblock anodised aluminium
  const ALU    = P(0xb9c1cc, 0.30, 0.85);
  const DARK   = P(0x24282f, 0.62, 0.15);
  const RUBBER = P(0x141619, 0.92, 0.00);
  const SILVER = P(0xc9ced7, 0.26, 0.90);
  const PCB    = P(0x10406e, 0.58, 0.10);
  const GOLD   = P(0xd8a83c, 0.35, 0.80);

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r, h, s = 20) => new THREE.CylinderGeometry(r, r, h, s);
  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // The stage always aims at the world origin, so the plot is pushed
  // back until the middle of the action sits there.
  const root = new THREE.Group();
  root.position.z = -110;
  scene.add(root);

  /* =============================================================== lights */
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(140, 260, 120);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { near: 40, far: 900, left: -300, right: 300, top: 300, bottom: -300 });
  key.shadow.bias = -0.0012;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x7fb2ff, 1.15);
  rim.position.set(-180, 90, -150);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x9dc4ff, 0x0a0d13, 0.5));

  const shadowFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.ShadowMaterial({ opacity: 0.34 })
  );
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);

  /* ========================================================= radar plot */
  const plot = new THREE.Group();
  root.add(plot);

  const flat = (geo) => { geo.rotateX(-Math.PI / 2); return geo; };
  const glow = (hex, o) => new THREE.MeshBasicMaterial({
    color: hex, transparent: true, opacity: o,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });

  // Range rings. 100 cm is the danger threshold, 200 cm the warning one —
  // both straight out of the ground station's zone sliders.
  const ringMats = [];
  [[50, 0x4da3ff, 0.22], [100, 0xff4d4d, 0.50], [150, 0x4da3ff, 0.22],
   [200, 0xffb020, 0.44], [250, 0x4da3ff, 0.18]].forEach(([r, c, o]) => {
    const m = new THREE.Mesh(flat(new THREE.RingGeometry(r - 0.5, r + 0.5, 128)), glow(c, o));
    m.position.y = 0.2;
    plot.add(m);
    ringMats.push(m.material);
  });

  // Radial spokes every 15°, only inside the beam.
  {
    const pts = [];
    for (let a = -BEAM_HALF; a <= BEAM_HALF + 1e-6; a += 15 * D2R) {
      pts.push(0, 0.2, 0, Math.sin(a) * RANGE, 0.2, Math.cos(a) * RANGE);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const spokes = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      color: 0x4da3ff, transparent: true, opacity: 0.24
    }));
    plot.add(spokes);
    ringMats.push(spokes.material);
  }

  // The beam itself: a fixed 80° wedge. The K-LD7 does not scan — it
  // stares — so nothing here sweeps.
  const wedge = new THREE.Mesh(
    flat(new THREE.CircleGeometry(RANGE, 96, -Math.PI / 2 - BEAM_HALF, BEAM_HALF * 2)),
    glow(0x4da3ff, 0.075)
  );
  wedge.position.y = 0.1;
  plot.add(wedge);

  // Doppler pings: wavefronts leaving the antenna, not a rotating sweep.
  const pings = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(
      flat(new THREE.RingGeometry(0.985, 1, 96, 1, -Math.PI / 2 - BEAM_HALF, BEAM_HALF * 2)),
      glow(0x4da3ff, 0.4)
    );
    m.position.y = 0.5;
    plot.add(m);
    pings.push(m);
  }

  /* ======================================================= K-LD7 + mast */
  const radar = new THREE.Group();
  root.add(radar);

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const leg = add(radar, cyl(1.0, 44, 10), ALU, Math.sin(a) * 7, 20, Math.cos(a) * 7);
    leg.rotation.set(Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3);
  }
  add(radar, cyl(3.2, 4, 16), DARK, 0, 40, 0);
  add(radar, cyl(1.6, 12, 12), ALU, 0, 46, 0);

  const head = new THREE.Group();
  head.position.set(0, 53, 0);
  radar.add(head);
  add(head, box(9, 9, 2.6), DARK, 0, 0, 0);          // housing
  add(head, box(7.4, 7.4, 0.3), P(0x2f3a46, 0.4, 0.5), 0, 0, 1.45);  // radome
  // 2 × 2 patch antenna array on the front face
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    add(head, box(2.4, 2.4, 0.18), GOLD, sx * 1.8, sy * 1.8, 1.65);
  }
  const radarLed = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff4d4d }));
  radarLed.position.set(3.4, -3.6, 1.5);
  head.add(radarLed);

  // UART lead down the mast and away to the ground station.
  {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 51, -1.6), new THREE.Vector3(-3, 44, -5),
      new THREE.Vector3(-6, 24, -9), new THREE.Vector3(-14, 4, -14),
      new THREE.Vector3(-52, 1.2, -34), new THREE.Vector3(-104, 1.2, -46)
    ]);
    add(radar, new THREE.TubeGeometry(curve, 60, 0.55, 8), P(0x1b1e24, 0.85), 0, 0, 0);
  }

  /* ==================================================== ground station */
  const pc = new THREE.Group();
  pc.position.set(-118, 0, -52);
  pc.rotation.y = 0.62;
  root.add(pc);
  add(pc, box(60, 3, 34), DARK, 0, 30, 0);                       // desk
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(pc, cyl(1.2, 30, 10), ALU, sx * 26, 15, sz * 13);        // legs
  }
  add(pc, cyl(6, 1.4, 20), DARK, 0, 32.4, -6);                   // monitor foot
  add(pc, box(2.6, 16, 2.6), ALU, 0, 41, -6);
  const screenShell = add(pc, box(46, 28, 1.6), DARK, 0, 55, -6);
  screenShell.rotation.x = -0.12;

  // The screen is the Tkinter ground station: the live radar plot,
  // redrawn from the same numbers that drive the robot.
  const cv = document.createElement("canvas");
  cv.width = cv.height = 320;
  const cx = cv.getContext("2d");
  const screenTex = new THREE.CanvasTexture(cv);
  const screen = new THREE.Mesh(box(43, 25, 0.2),
    new THREE.MeshBasicMaterial({ map: screenTex }));
  screen.position.set(0, 55, -5.1);
  screen.rotation.x = -0.12;
  pc.add(screen);

  /* ============================================================== robot */
  const bot = new THREE.Group();
  root.add(bot);
  // Where the camera looks when a shot follows the subject.
  const focus = new THREE.Vector3();

  add(bot, box(11, 0.5, 16.5), BLUE, 0, 5.6, 0);                 // chassis plate
  const wheels = [];
  for (const sx of [-1, 1]) {
    add(bot, box(0.7, 3.4, 15.5), BLUE, sx * 5.5, 4.2, 0);       // side beams
    for (let i = -3; i <= 3; i++) {                              // beam slots
      add(bot, box(0.9, 1.2, 1.0), DARK, sx * 5.5, 4.2, i * 2.1);
    }
    add(bot, cyl(1.9, 4.4, 16), DARK, sx * 4.0, 3.4, -3.2)       // gear motor
      .rotation.z = Math.PI / 2;

    // Outer group lays the axle along X; the inner one is what spins,
    // so tyre, rim and spokes always turn together.
    const axle = new THREE.Group();
    axle.position.set(sx * 6.7, 3.5, -3.2);
    axle.rotation.z = Math.PI / 2;
    bot.add(axle);
    const hub = new THREE.Group();
    axle.add(hub);
    wheels.push(hub);

    add(hub, cyl(3.5, 2.6, 28), RUBBER, 0, 0, 0);
    add(hub, cyl(2.1, 2.8, 20), SILVER, 0, 0, 0);
    for (let s = 0; s < 5; s++) {                                 // spokes
      const a = (s / 5) * Math.PI * 2;
      const sp = add(hub, box(0.5, 0.9, 1.9), SILVER,
        Math.sin(a) * 1.1, 0, Math.cos(a) * 1.1);
      sp.rotation.y = a;
    }
  }

  add(bot, box(3, 2.2, 3), DARK, 0, 2.2, 6.4);                   // caster bracket
  const caster = add(bot, new THREE.SphereGeometry(1.4, 16, 16), SILVER, 0, 1.4, 6.4);
  add(bot, box(6.5, 2.4, 6.5), P(0x2b2f36, 0.7), 0, 3.6, 1.2);   // battery pack

  // MeOrion board
  add(bot, box(8.2, 0.3, 10.2), PCB, 0, 6.0, 0.4);
  for (const sx of [-1, 1]) add(bot, box(0.9, 0.7, 8.4), P(0x0e1013, 0.8), sx * 3.4, 6.5, 0.4);
  add(bot, box(2.6, 0.6, 2.6), P(0x0e1013, 0.75), 0, 6.45, -1.6);  // MCU
  add(bot, box(2.2, 1.5, 1.6), SILVER, 0, 6.9, 4.0);               // barrel jack
  const leds = ["#7dff8a", "#ffc247", "#4da3ff"].map((c, i) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5),
      new THREE.MeshBasicMaterial({ color: c }));
    l.position.set(-1.6 + i * 0.9, 6.3, 2.6);
    bot.add(l);
    return l;
  });

  // Bluetooth module on PORT_6
  const bt = new THREE.Group();
  bt.position.set(3.0, 6.5, -3.4);
  bot.add(bt);
  add(bt, box(2.0, 0.3, 1.5), P(0x14559e, 0.5), 0, 0, 0);
  add(bt, box(1.0, 0.5, 0.8), P(0x0e1013, 0.75), -0.2, 0.35, 0);
  add(bt, box(0.7, 0.12, 1.2), SILVER, 0.7, 0.3, 0);

  // Ultrasonic sensor on PORT_3, on a bracket at the nose
  const us = new THREE.Group();
  us.position.set(0, 7.4, 7.6);
  bot.add(us);
  add(us, box(4.8, 2.2, 1.2), P(0x0e1013, 0.72), 0, 0, 0);
  for (const sx of [-1, 1]) {
    const can = add(us, cyl(0.85, 1.1, 18), SILVER, sx * 1.3, 0, 0.9);
    can.rotation.x = Math.PI / 2;
    add(us, cyl(0.55, 0.2, 14), P(0x2b2f36, 0.6), sx * 1.3, 0, 1.5)
      .rotation.x = Math.PI / 2;
  }
  add(bot, box(1.2, 3.2, 0.6), BLUE, 0, 6.2, 7.9);               // sensor post

  // Cables — board to each motor, and the ribbon up to the sensor head.
  const cable = (pts, r, mat) => add(bot,
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 32, r, 8),
    mat, 0, 0, 0);
  const WIRE = P(0x1b1e24, 0.85);
  for (const sx of [-1, 1]) {
    cable([[sx * 2.6, 6.3, -2.0], [sx * 3.6, 5.4, -3.4], [sx * 4.2, 4.4, -3.6], [sx * 4.0, 3.9, -3.2]], 0.28, WIRE);
  }
  cable([[0.8, 6.3, 3.4], [1.2, 7.4, 5.2], [0.6, 7.9, 6.8], [0, 7.6, 7.2]], 0.32, P(0x8a939f, 0.7));
  cable([[3.0, 6.7, -3.4], [2.4, 7.2, -1.4], [1.6, 6.6, 0.6]], 0.22, P(0x2f5fa0, 0.7));

  /* ============================================== markers and overlays */
  const goalRing = new THREE.Mesh(flat(new THREE.RingGeometry(7, 9, 48)), glow(0xff7a2f, 0.9));
  goalRing.position.set(GOAL.x, 0.8, GOAL.z);
  root.add(goalRing);

  const goalCol = new THREE.Mesh(
    new THREE.CylinderGeometry(6.5, 6.5, 46, 24, 1, true),
    glow(0xff7a2f, 0.16)
  );
  goalCol.position.set(GOAL.x, 23, GOAL.z);
  root.add(goalCol);

  // The 30 cm arrival window — the whole run only has to land inside this.
  const arrRing = new THREE.Mesh(flat(new THREE.RingGeometry(ARRIVAL - 0.6, ARRIVAL + 0.6, 64)), glow(0x7dff8a, 0));
  arrRing.position.set(GOAL.x, 0.6, GOAL.z);
  root.add(arrRing);

  // Lock indicator that rides on the robot once the radar has it.
  const lock = new THREE.Mesh(flat(new THREE.RingGeometry(11, 12.4, 40)), glow(0x7dff8a, 0));
  lock.position.y = 0.9;
  root.add(lock);

  // The trail the radar actually recorded: probe leg, then the drive leg.
  const PATH = [];
  const push = (a, b, n) => {
    for (let i = 1; i <= n; i++) {
      PATH.push(a.x + (b.x - a.x) * (i / n), 0.7, a.z + (b.z - a.z) * (i / n));
    }
  };
  PATH.push(P0.x, 0.7, P0.z);
  push(P0, P1, 24);
  push(P1, P2, 96);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.Float32BufferAttribute(PATH, 3));
  trailGeo.setDrawRange(0, 1);
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
    color: 0xff7a2f, transparent: true, opacity: 0.95
  }));
  root.add(trail);
  const PROBE_PTS = 25;                 // index where the probe leg ends

  // Heading vector derived from the probe, and the planned course.
  const arrowMat = glow(0x7dff8a, 0);
  const hdgArrow = new THREE.Mesh(new THREE.ConeGeometry(3.4, 9, 14), arrowMat);
  root.add(hdgArrow);

  const planGeo = new THREE.BufferGeometry();
  planGeo.setAttribute("position", new THREE.Float32BufferAttribute(
    [P1.x, 0.9, P1.z, GOAL.x, 0.9, GOAL.z], 3));
  const planMat = new THREE.LineDashedMaterial({
    color: 0x4da3ff, dashSize: 7, gapSize: 5, transparent: true, opacity: 0
  });
  const planLine = new THREE.Line(planGeo, planMat);
  planLine.computeLineDistances();
  root.add(planLine);

  /* Bluetooth link: the ground station's single-letter commands, moving
     down the wireless hop that actually carries them. */
  const btDots = [];
  for (let i = 0; i < 5; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 10), glow(0x4da3ff, 0.9));
    root.add(d);
    btDots.push(d);
  }
  const cmdCv = document.createElement("canvas");
  cmdCv.width = 256; cmdCv.height = 128;
  const cmdCtx = cmdCv.getContext("2d");
  const cmdTex = new THREE.CanvasTexture(cmdCv);
  const cmdTag = new THREE.Sprite(new THREE.SpriteMaterial({
    map: cmdTex, transparent: true, depthWrite: false, depthTest: false
  }));
  cmdTag.scale.set(17, 8.5, 1);
  root.add(cmdTag);

  let lastCmd = null;
  function drawCmd(cmd, label) {
    if (cmd === lastCmd) return;
    lastCmd = cmd;
    cmdCtx.clearRect(0, 0, 256, 128);
    cmdCtx.fillStyle = "rgba(8,12,20,.82)";
    cmdCtx.strokeStyle = "#4da3ff";
    cmdCtx.lineWidth = 3;
    cmdCtx.beginPath();
    cmdCtx.roundRect(6, 30, 244, 68, 8);
    cmdCtx.fill(); cmdCtx.stroke();
    cmdCtx.fillStyle = "#4da3ff";
    cmdCtx.font = "bold 44px ui-monospace, Consolas, monospace";
    cmdCtx.textBaseline = "middle";
    cmdCtx.fillText(cmd, 22, 65);
    cmdCtx.fillStyle = "#9aa7b8";
    cmdCtx.font = "600 22px ui-monospace, Consolas, monospace";
    cmdCtx.fillText(label, 74, 66);
    cmdTex.needsUpdate = true;
  }

  /* ---------------------------------------------------------- screen draw */
  let screenAcc = 0;
  function drawScreen(st, x, z, hdg, dist, trailN) {
    const S = 320, C = S / 2, K = C / (RANGE * 1.05);
    cx.fillStyle = "#080c14"; cx.fillRect(0, 0, S, S);
    cx.strokeStyle = "rgba(77,163,255,.20)"; cx.lineWidth = 1;
    for (const r of [50, 100, 150, 200, 250]) {
      cx.beginPath(); cx.arc(C, S - 12, r * K, Math.PI, 0); cx.stroke();
    }
    cx.strokeStyle = "rgba(255,77,77,.45)";
    cx.beginPath(); cx.arc(C, S - 12, 100 * K, Math.PI, 0); cx.stroke();
    cx.strokeStyle = "rgba(255,176,32,.40)";
    cx.beginPath(); cx.arc(C, S - 12, 200 * K, Math.PI, 0); cx.stroke();

    const px = (wx, wz) => [C + wx * K, S - 12 - wz * K];
    if (trailN > 1) {
      cx.strokeStyle = "#ff7a2f"; cx.lineWidth = 2; cx.beginPath();
      for (let i = 0; i < trailN; i++) {
        const [a, b] = px(PATH[i * 3], PATH[i * 3 + 2]);
        i ? cx.lineTo(a, b) : cx.moveTo(a, b);
      }
      cx.stroke();
    }
    const [gx, gy] = px(GOAL.x, GOAL.z);
    cx.strokeStyle = "#ff7a2f"; cx.lineWidth = 2;
    cx.beginPath(); cx.arc(gx, gy, 7, 0, 7); cx.stroke();
    if (x !== null) {
      const [bx, by] = px(x, z);
      cx.fillStyle = "#7dff8a";
      cx.beginPath(); cx.arc(bx, by, 5, 0, 7); cx.fill();
    }
    cx.fillStyle = "#dfe5ee";
    cx.font = "bold 17px ui-monospace, Consolas, monospace";
    cx.fillText(st, 12, 26);
    cx.fillStyle = "#8ea3bf";
    cx.font = "600 14px ui-monospace, Consolas, monospace";
    cx.fillText(x === null ? "NO TARGET" : `X ${x.toFixed(0)}  Y ${z.toFixed(0)} cm`, 12, 48);
    cx.fillText(hdg === null ? "HDG  --" : `HDG ${hdg.toFixed(0)}°   ${dist.toFixed(0)} cm`, 12, 68);
    screenTex.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- HUD */
  const hudA = document.getElementById("hud-a");
  const hudB = document.getElementById("hud-b");
  const hudC = document.getElementById("hud-c");

  /* ------------------------------------------------------------- update */
  /* Scroll scrubs the run, but not at a constant rate: each of the first
     five scenes is pinned to the moment its copy is about, so scrolling
     into a section plays exactly the phase you are reading about. After
     scene 4 the mission holds at ARRIVED. */
  const MARKS = [0, at(1) + 0.4, at(3), at(5) - 0.3, MISSION];
  function missionTime(cur) {
    const c = Math.min(Math.max(cur, 0), MARKS.length - 1);
    const i = Math.min(Math.floor(c), MARKS.length - 2);
    return MARKS[i] + (MARKS[i + 1] - MARKS[i]) * (c - i);
  }

  function update(dt, t, ctx) {
    const mt = missionTime(ctx.cur);

    let x = P0.x, z = P0.z, hdg = H0, state = PHASES[0][0];
    let locked = false, trailN = 0, cmd = "S", cmdLabel = "stop";
    let planOn = 0, arrowOn = 0, believed = null, dist = null;

    if (mt < at(1)) {
      // Spinning to acquire. Free-runs on real time so the page is alive
      // before the first scroll, and eases into H0 as the lock approaches.
      const fade = 1 - smooth(at(1) - 1.1, at(1), mt);
      hdg = H0 + t * 118 * fade;
      state = "SPIN_TO_ACQUIRE"; cmd = "L"; cmdLabel = "spin left";
    } else if (mt < at(2)) {
      locked = true; state = "LOCKED"; trailN = 1;
    } else if (mt < at(3)) {
      const k = smooth(at(2), at(3), mt);
      x = P0.x + (P1.x - P0.x) * k;
      z = P0.z + (P1.z - P0.z) * k;
      locked = true; state = "HEADING_PROBE";
      trailN = Math.round(k * PROBE_PTS);
      cmd = "F"; cmdLabel = "forward 30 cm";
    } else if (mt < at(4)) {
      x = P1.x; z = P1.z; locked = true; state = "PLANNING";
      trailN = PROBE_PTS;
      planOn = smooth(at(3), at(3) + 0.5, mt);
      arrowOn = 1; believed = H0; dist = LEG;
    } else if (mt < at(5)) {
      const k = smooth(at(4), at(5), mt);
      x = P1.x; z = P1.z; hdg = H0 + (H1 - H0) * k;
      locked = true; state = "ROTATING"; trailN = PROBE_PTS;
      planOn = 1; arrowOn = 1 - k;
      believed = H0 + TURN * k; dist = LEG;
      cmd = "R"; cmdLabel = `rotate +${TURN.toFixed(0)}°`;
    } else if (mt < at(6)) {
      const k = smooth(at(5), at(6), mt);
      hdg = H1;
      x = P1.x + (P2.x - P1.x) * k;
      z = P1.z + (P2.z - P1.z) * k;
      locked = true; state = "DRIVING";
      trailN = PROBE_PTS + Math.round(k * (PATH.length / 3 - PROBE_PTS));
      planOn = 1; believed = PLANNED; dist = LEG * (1 - k);
      cmd = "F"; cmdLabel = `forward ${LEG.toFixed(0)} cm`;
    } else if (mt < at(7)) {
      x = P2.x; z = P2.z; hdg = H1; state = "CHECKING";
      trailN = PATH.length / 3;
      // The radar loses a stationary robot; the fix comes back late.
      locked = mt > at(6) + 1.0;
      believed = PLANNED; dist = MISS;
      planOn = 1 - smooth(at(6), at(6) + 0.6, mt);
    } else {
      x = P2.x; z = P2.z; hdg = H1; state = "ARRIVED";
      trailN = PATH.length / 3; locked = true;
      believed = PLANNED; dist = MISS;
    }

    const done = mt >= at(7);

    /* ---- robot ---- */
    bot.position.set(x, 0, z);
    bot.rotation.y = hdg * D2R;
    focus.set(x, 0, z + root.position.z);
    const moving = cmd === "F" || cmd === "L" || cmd === "R";
    if (moving) {
      const spin = cmd === "F" ? 7 : 4;
      wheels.forEach((w, i) => { w.rotation.y += dt * spin * (cmd === "R" && i % 2 ? -1 : 1); });
      caster.rotation.x += dt * 6;
    }
    leds.forEach((l, i) => {
      l.material.color.setHex(i === 0 && locked ? 0x7dff8a
        : i === 1 && moving ? 0xffc247
        : i === 2 ? 0x4da3ff : 0x1a2430);
    });

    /* ---- radar ---- */
    radarLed.material.color.setHex(locked ? 0x7dff8a : 0xff4d4d);
    pings.forEach((p, i) => {
      const k = ((t * 0.55 + i / 3) % 1);
      const r = k * RANGE;
      p.scale.set(r, r, r);
      p.material.opacity = 0.42 * (1 - k) * (1 - k);
    });

    /* ---- overlays ---- */
    trail.geometry.setDrawRange(0, Math.max(trailN, 0));
    trail.material.opacity = trailN > 1 ? 0.95 : 0;

    lock.position.set(x, 0.9, z);
    lock.material.opacity = locked ? 0.34 + Math.sin(t * 5) * 0.12 : 0;
    const ls = locked ? 1 : 0.6;
    lock.scale.setScalar(ls);

    planMat.opacity = planOn * 0.75;
    arrowMat.opacity = arrowOn * 0.8;
    if (arrowOn > 0) {
      hdgArrow.position.set(P1.x + Math.sin(H0 * D2R) * 12, 4, P1.z + Math.cos(H0 * D2R) * 12);
      hdgArrow.rotation.set(Math.PI / 2, 0, -H0 * D2R);
    }

    goalRing.material.color.setHex(done ? 0x7dff8a : 0xff7a2f);
    goalCol.material.color.setHex(done ? 0x7dff8a : 0xff7a2f);
    goalRing.material.opacity = 0.55 + Math.sin(t * 3) * 0.2;
    goalRing.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
    arrRing.material.opacity = mt > at(6) ? 0.4 + Math.sin(t * 4) * 0.12 : 0;

    /* ---- bluetooth link ---- */
    const from = new THREE.Vector3(-118, 62, -52);
    const to = new THREE.Vector3(x, 10, z);
    btDots.forEach((d, i) => {
      const k = (t * 0.5 + i / btDots.length) % 1;
      d.position.lerpVectors(from, to, k);
      d.position.y += Math.sin(k * Math.PI) * 26;
      d.material.opacity = 0.85 * Math.sin(k * Math.PI);
    });
    cmdTag.position.set(x, 24, z);
    drawCmd(cmd, cmdLabel);

    /* ---- ground-station screen, a few times a second ---- */
    screenAcc += dt;
    if (screenAcc > 0.12) {
      screenAcc = 0;
      drawScreen(state, locked ? x : null, z, believed, dist == null ? 0 : dist, trailN);
    }

    /* ---- page HUD ---- */
    if (hudA) hudA.textContent = state;
    if (hudB) hudB.textContent = locked ? `${x.toFixed(0)} / ${z.toFixed(0)} cm` : "NO TARGET";
    if (hudC) {
      hudC.textContent = believed == null
        ? "—"
        : `${believed.toFixed(0)}°  ·  ${dist.toFixed(0)} cm`;
    }
  }

  // Additive overlays wash out on a light background, so the plot needs
  // more opacity there, not less.
  const baseOpacity = ringMats.map((m) => m.opacity);
  function theme(dark) {
    key.intensity = dark ? 2.1 : 2.6;
    rim.intensity = dark ? 1.15 : 0.7;
    shadowFloor.material.opacity = dark ? 0.34 : 0.2;
    ringMats.forEach((m, i) => { m.opacity = baseOpacity[i] * (dark ? 1 : 1.9); });
    wedge.material.opacity = dark ? 0.075 : 0.11;
  }

  return { fit: 520, focusY: 60, focus, update, theme };
}
