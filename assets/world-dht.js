/* Project 07 — one DHT sensor, three platforms, one Telegram bot.

   Built fresh for its own page. The bench is the real thing: an ESP on a
   breadboard with a DHT22 wired to it on a short stand, a local OLED so you
   can read it without a network, and three cloud panels standing behind.

   What scrolls past is why anyone would publish the same value three times.
   The reading goes up to all three at once, each panel shows what it is
   actually good at, and when humidity crosses the threshold the bot fires. */

const HI = 70;        // % — the alert threshold

const SINKS = [
  ["ThingsBoard",   0x4da3ff, "live dashboard"],
  ["ThingSpeak",    0x7dff8a, "MATLAB analysis"],
  ["Google Sheets", 0xffc247, "raw retention"]
];

const PHASES = [
  ["IDLE",       2.4],
  ["READING",    2.6],
  ["PUBLISHING", 3.0],
  ["RISING",     2.4],
  ["ALERT",      2.6],
  ["LOGGING",    2.0]
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

export function buildDhtWorld(scene, THREE) {
  const P = (h, r, m = 0) => new THREE.MeshStandardMaterial({ color: h, roughness: r, metalness: m });
  const DESK  = P(0x2b3038, 0.75);
  const BB    = P(0xeef1f5, 0.72);        // breadboard white
  const PCB   = P(0x11406e, 0.58, 0.10);
  const ALU   = P(0xb9c1cc, 0.32, 0.85);
  const DARK  = P(0x14171c, 0.65, 0.20);
  const GOLD  = P(0xd8a83c, 0.35, 0.80);

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r, h, s = 16) => new THREE.CylinderGeometry(r, r, h, s);
  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const glow = (hex, o) => new THREE.MeshBasicMaterial({
    color: hex, transparent: true, opacity: o,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });

  const root = new THREE.Group();
  scene.add(root);

  /* --------------------------------------------------------------- lights */
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(90, 220, 140);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { near: 30, far: 700, left: -190, right: 190, top: 190, bottom: -190 });
  key.shadow.bias = -0.0013;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x86c8ff, 1.05);
  rim.position.set(-130, 100, -120);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x0a0d13, 0.55));

  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200),
    new THREE.ShadowMaterial({ opacity: 0.3 }));
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);

  add(root, box(210, 6, 130), DESK, 0, 42, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(root, box(8, 42, 8), DARK, sx * 90, 21, sz * 52);
  }

  /* ------------------------------------------------------- breadboard rig */
  const bb = new THREE.Group();
  bb.position.set(-14, 45, 12);
  root.add(bb);
  add(bb, box(84, 7, 52), BB, 0, 3.5, 0);
  // The two power rails and the centre channel, so it reads as a breadboard.
  for (const sz of [-1, 1]) {
    add(bb, box(80, 0.5, 1), P(0xc0342c, 0.8), 0, 7.2, sz * 22);
    add(bb, box(80, 0.5, 1), P(0x2f63c4, 0.8), 0, 7.2, sz * 19.5);
  }
  add(bb, box(80, 1.4, 3), P(0xd8dde4, 0.8), 0, 7, 0);

  // ESP dev board straddling the channel.
  add(bb, box(46, 3, 24), PCB, -8, 8.6, 0);
  add(bb, box(14, 3.4, 12), P(0x9aa2ad, 0.35, 0.7), -20, 11.6, 0);   // RF can
  add(bb, box(8, 2.6, 8), P(0x0e1013, 0.7), 0, 11.4, 0);             // MCU
  add(bb, box(7, 2.6, 5), ALU, 12, 11.4, 0);                         // USB
  for (const sz of [-1, 1]) add(bb, box(44, 1.6, 1.6), P(0x0e1013, 0.8), -8, 10.6, sz * 11);
  const espLed = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.6),
    new THREE.MeshBasicMaterial({ color: 0x1a2430 }));
  espLed.position.set(6, 10.6, 8);
  bb.add(espLed);

  // The DHT22 on a short stand: white grille body, four legs.
  const dht = new THREE.Group();
  dht.position.set(30, 8, 0);
  bb.add(dht);
  for (let i = 0; i < 4; i++) add(dht, box(0.8, 12, 0.8), ALU, -3.3 + i * 2.2, 6, 0);
  add(dht, box(16, 22, 8), P(0xe8ecf1, 0.7), 0, 23, 0);
  for (let i = 0; i < 5; i++) add(dht, box(12, 1.4, 0.9), P(0xc2c8d0, 0.75), 0, 29 - i * 4, 4.4);
  add(dht, box(11, 5, 0.6), P(0x5a6472, 0.6), 0, 15, 4.4);

  // Jumper wires from the sensor legs back to the board headers.
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  [[-3.3, 0xc0342c], [-1.1, 0xe8c33a], [1.1, 0x3aa85a], [3.3, 0x2b2f36]].forEach(([x, c], i) => {
    const curve = new THREE.CatmullRomCurve3([
      V(30 + x, 2, 0), V(26 + x, 2, 3 - i * 1.6), V(14, 10, 6 - i * 2), V(2 - i * 3, 10.6, 8)
    ]);
    add(bb, new THREE.TubeGeometry(curve, 34, 0.55, 6), P(c, 0.65), 0, 0, 0);
  });

  // Local OLED — the reading exists before any network does.
  const oled = new THREE.Group();
  oled.position.set(-52, 46, -8);
  oled.rotation.y = 0.5;
  root.add(oled);
  add(oled, box(30, 4, 16), P(0x0e1013, 0.7), 0, 2, 0);
  add(oled, box(30, 18, 3), P(0x0e1013, 0.7), 0, 11, -6);
  const oCv = document.createElement("canvas");
  oCv.width = 192; oCv.height = 96;
  const ox = oCv.getContext("2d");
  const oTex = new THREE.CanvasTexture(oCv);
  const oFace = new THREE.Mesh(box(26, 14, 0.4), new THREE.MeshBasicMaterial({ map: oTex }));
  oFace.position.set(0, 11, -4.3);
  oFace.rotation.y = Math.PI;
  oled.add(oFace);

  /* ------------------------------------------------------- three platforms */
  const panels = SINKS.map(([name, colour, blurb], i) => {
    const g = new THREE.Group();
    g.position.set(-72 + i * 72, 132, -62);
    g.rotation.y = 0.34 - i * 0.34;
    root.add(g);
    add(g, box(62, 46, 2.2), P(0x11161d, 0.55), 0, 0, 0);
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 190;
    const cx = cv.getContext("2d");
    const tex = new THREE.CanvasTexture(cv);
    const face = new THREE.Mesh(box(57, 41, 0.4), new THREE.MeshBasicMaterial({ map: tex }));
    face.position.z = 1.5;
    g.add(face);
    const halo = new THREE.Mesh(box(68, 52, 0.2), glow(colour, 0));
    halo.position.z = -2;
    g.add(halo);
    return { g, cx, tex, halo, name, colour, blurb, hist: [] };
  });

  // Packets: one reading leaving the board for all three at once.
  const packets = [];
  for (let s = 0; s < SINKS.length; s++) {
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 8), glow(SINKS[s][1], 0));
      root.add(m);
      packets.push({ m, s, off: i / 3 });
    }
  }
  const FROM = new THREE.Vector3(-14, 62, 12);
  const TO = new THREE.Vector3();

  /* ---------------------------------------------------------- Telegram bot */
  const phone = new THREE.Group();
  phone.position.set(66, 45, 24);
  phone.rotation.set(-0.5, -0.6, 0.1);
  root.add(phone);
  add(phone, box(30, 58, 3), P(0x15181d, 0.4), 0, 26, 0);
  const tCv = document.createElement("canvas");
  tCv.width = 190; tCv.height = 360;
  const tx = tCv.getContext("2d");
  const tTex = new THREE.CanvasTexture(tCv);
  const tFace = new THREE.Mesh(box(26, 52, 0.4), new THREE.MeshBasicMaterial({ map: tTex }));
  tFace.position.set(0, 26, 1.8);
  phone.add(tFace);
  const buzz = new THREE.Mesh(box(38, 66, 0.2), glow(0x4da3ff, 0));
  buzz.position.set(0, 26, -2.4);
  phone.add(buzz);

  /* ------------------------------------------------------------- drawing */
  let uiAcc = 0;

  function drawOled(temp, humid, live) {
    ox.fillStyle = "#04070c"; ox.fillRect(0, 0, 192, 96);
    ox.strokeStyle = "#2a3444"; ox.strokeRect(3, 3, 186, 90);
    if (!live) {
      ox.fillStyle = "#3a4553"; ox.font = "600 15px ui-monospace, Consolas, monospace";
      ox.fillText("DHT --", 16, 52);
    } else {
      ox.fillStyle = "#7fe8ff"; ox.font = "bold 30px ui-monospace, Consolas, monospace";
      ox.fillText(temp.toFixed(1) + "C", 14, 44);
      ox.fillStyle = humid > HI ? "#ff9a4d" : "#9fe8b0";
      ox.fillText(humid.toFixed(0) + "%", 14, 82);
      ox.fillStyle = "#5d708c"; ox.font = "600 12px ui-monospace, Consolas, monospace";
      ox.fillText("RH", 118, 82);
    }
    oTex.needsUpdate = true;
  }

  function drawPanels(temp, humid, live, rows) {
    panels.forEach((p, i) => {
      const g = p.cx;
      const col = "#" + p.colour.toString(16).padStart(6, "0");
      g.fillStyle = "#0b0f15"; g.fillRect(0, 0, 256, 190);
      g.fillStyle = col; g.fillRect(0, 0, 256, 30);
      g.fillStyle = "#0d1117"; g.font = "bold 15px ui-monospace, Consolas, monospace";
      g.fillText(p.name, 12, 21);
      g.fillStyle = "#4a5666"; g.font = "600 11px ui-monospace, Consolas, monospace";
      g.fillText(p.blurb, 12, 48);

      if (!live) {
        g.fillStyle = "#3a4553"; g.font = "600 13px ui-monospace, Consolas, monospace";
        g.fillText("waiting for data", 12, 110);
      } else {
        p.hist.push(humid);
        if (p.hist.length > 44) p.hist.shift();
        // Each platform shows the same numbers its own way.
        if (i === 0) {
          g.fillStyle = "#dfe5ee"; g.font = "bold 24px ui-monospace, Consolas, monospace";
          g.fillText(temp.toFixed(1) + " C", 12, 86);
          g.fillText(humid.toFixed(0) + " %", 12, 116);
          const k = Math.min(humid / 100, 1);
          g.fillStyle = "#1b2430"; g.fillRect(12, 132, 232, 12);
          g.fillStyle = humid > HI ? "#e0793c" : col;
          g.fillRect(12, 132, 232 * k, 12);
        } else if (i === 1) {
          g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
          p.hist.forEach((v, n) => {
            const x = 12 + (n / 43) * 232, y = 170 - ((v - 40) / 45) * 100;
            n ? g.lineTo(x, y) : g.moveTo(x, y);
          });
          g.stroke();
          g.strokeStyle = "#e0793c"; g.setLineDash([4, 4]);
          const hy = 170 - ((HI - 40) / 45) * 100;
          g.beginPath(); g.moveTo(12, hy); g.lineTo(244, hy); g.stroke();
          g.setLineDash([]);
        } else {
          g.fillStyle = "#5d708c"; g.font = "600 11px ui-monospace, Consolas, monospace";
          ["time", "temp", "humid"].forEach((h, n) => g.fillText(h, 16 + n * 78, 72));
          for (let r = 0; r < 5; r++) {
            const v = p.hist[p.hist.length - 1 - r];
            if (v === undefined) break;
            g.fillStyle = r ? "#7c8ba0" : "#e6e9f2";
            g.font = "600 11px ui-monospace, Consolas, monospace";
            g.fillText(String(12 - r).padStart(2, "0") + ":0" + r, 16, 94 + r * 18);
            g.fillText(temp.toFixed(1), 94, 94 + r * 18);
            g.fillText(v.toFixed(0), 172, 94 + r * 18);
          }
          g.fillStyle = "#4a5666"; g.font = "600 10px ui-monospace, Consolas, monospace";
          g.fillText(rows + " rows", 16, 182);
        }
      }
      p.tex.needsUpdate = true;
    });
  }

  function drawPhone(humid, alerting) {
    tx.fillStyle = "#0e1621"; tx.fillRect(0, 0, 190, 360);
    tx.fillStyle = "#2b5278"; tx.fillRect(0, 0, 190, 44);
    tx.fillStyle = "#eaf1f8"; tx.font = "bold 14px ui-monospace, Consolas, monospace";
    tx.fillText("Telegram", 12, 28);
    if (alerting) {
      tx.fillStyle = "#2b5278";
      tx.beginPath(); tx.roundRect(12, 64, 166, 78, 10); tx.fill();
      tx.fillStyle = "#ffb26b"; tx.font = "bold 13px ui-monospace, Consolas, monospace";
      tx.fillText("HUMIDITY ALERT", 22, 90);
      tx.fillStyle = "#eaf1f8"; tx.font = "600 12px ui-monospace, Consolas, monospace";
      tx.fillText(humid.toFixed(0) + " % > " + HI + " %", 22, 112);
      tx.fillStyle = "#8fa8bf"; tx.font = "600 10px ui-monospace, Consolas, monospace";
      tx.fillText("sent automatically", 22, 130);
    } else {
      tx.fillStyle = "#243447"; tx.font = "600 12px ui-monospace, Consolas, monospace";
      tx.fillText("no alerts", 14, 84);
    }
    tTex.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ HUD */
  const hudA = document.getElementById("hud-a");
  const hudB = document.getElementById("hud-b");
  const hudC = document.getElementById("hud-c");

  const MARKS = [0, at(1), at(2) + 1.2, at(4) + 0.6, MISSION];
  function missionTime(cur) {
    const c = Math.min(Math.max(cur, 0), MARKS.length - 1);
    const i = Math.min(Math.floor(c), MARKS.length - 2);
    return MARKS[i] + (MARKS[i + 1] - MARKS[i]) * (c - i);
  }

  const focus = new THREE.Vector3(-14, 62, 0);

  function update(dt, t, ctx) {
    const mt = missionTime(ctx.cur);

    const live = mt >= at(1);
    const temp = 27.1 + smooth(at(3), at(4), mt) * 1.6 + Math.sin(t * 0.5) * 0.5;
    const humid = 56 + smooth(at(2), at(4), mt) * 22 + Math.sin(t * 0.9) * 1.1;
    const alerting = humid > HI && mt >= at(4);
    const rows = Math.round(140 + smooth(at(1), MISSION, mt) * 940);

    let state = "IDLE";
    if (!live) state = "IDLE";
    else if (mt < at(2)) state = "READING";
    else if (mt < at(3)) state = "PUBLISHING";
    else if (mt < at(4)) state = "RISING";
    else if (mt < at(5)) state = "TELEGRAM ALERT";
    else state = "LOGGING";

    espLed.material.color.setHex(live ? (alerting ? 0xffc247 : 0x7dff8a) : 0x1a2430);

    const fan = smooth(at(2) - 0.6, at(2) + 0.9, mt);
    packets.forEach((p) => {
      const k = (t * 0.5 + p.off + p.s * 0.11) % 1;
      TO.copy(panels[p.s].g.position);
      p.m.position.lerpVectors(FROM, TO, k);
      p.m.position.y += Math.sin(k * Math.PI) * 20;
      p.m.material.opacity = fan * 0.9 * Math.sin(k * Math.PI);
    });
    panels.forEach((p, i) => {
      p.halo.material.opacity = fan * (0.10 + Math.sin(t * 2 + i) * 0.03);
      p.g.position.y = 132 + Math.sin(t * 0.7 + i * 1.3) * 2.2;
    });

    buzz.material.opacity = alerting ? 0.16 + Math.sin(t * 14) * 0.06 : 0;
    phone.rotation.z = 0.1 + (alerting ? Math.sin(t * 22) * 0.012 : 0);

    uiAcc += dt;
    if (uiAcc > 0.15) {
      uiAcc = 0;
      drawOled(temp, humid, live);
      drawPanels(temp, humid, live, rows);
      drawPhone(humid, alerting);
    }
    if (hudA) hudA.textContent = state;
    if (hudB) hudB.textContent = live ? temp.toFixed(1) + " C · " + humid.toFixed(0) + " %" : "—";
    if (hudC) hudC.textContent = live ? rows + " rows · 3 sinks" : "threshold " + HI + " %";
  }

  function theme(dark) {
    key.intensity = dark ? 2.2 : 2.9;
    rim.intensity = dark ? 1.05 : 0.6;
    shadowFloor.material.opacity = dark ? 0.3 : 0.17;
  }

  return { fit: 500, focusY: 62, focus, update, theme };
}
