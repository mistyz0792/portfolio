/* Project 08 — Object detection trained on Roboflow.

   The capture bench, unchanged from where it was built: coloured cubes on a
   white sheet under a fixed camera. What scrolls past is the dataset
   workflow — shoot the frame, draw the boxes by hand one at a time, version
   it, train, and then watch the boxes appear on their own with a confidence
   score beside each class. */

const CUBES = [
  [-46, -20, 0xd63b2a, "red"],
  [2, 18, 0xe0a92a, "yellow"],
  [50, -14, 0xd63b2a, "red"],
  [-10, -50, 0xe0a92a, "yellow"],
  [40, 40, 0xd63b2a, "red"]
];

const PHASES = [
  ["CAPTURE",   3.0],
  ["ANNOTATE",  3.0],
  ["VERSIONED", 1.8],
  ["TRAINING",  2.4],
  ["DETECTING", 3.0]
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

export function buildVisionWorld(scene, THREE) {
  const P = (h, r, m = 0) => new THREE.MeshStandardMaterial({ color: h, roughness: r, metalness: m });
  const DESK  = P(0x2b3038, 0.75);
  const ALU   = P(0xb9c1cc, 0.32, 0.85);
  const DARK  = P(0x1b1e24, 0.65, 0.2);
  const WHITE = P(0xdfe5ee, 0.6, 0.05);

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
  key.position.set(120, 300, 170);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { near: 40, far: 800, left: -240, right: 240, top: 240, bottom: -240 });
  key.shadow.bias = -0.0012;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x86c8ff, 1.05);
  rim.position.set(-160, 130, -150);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x0a0d13, 0.55));

  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400),
    new THREE.ShadowMaterial({ opacity: 0.3 }));
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);

  /* ----------------------------------------------------------- the bench */
  add(root, box(300, 7, 200), DESK, 0, 44, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(root, box(9, 44, 9), DARK, sx * 128, 22, sz * 84);
  }
  add(root, box(190, 3, 150), WHITE, 0, 49, 0);           // capture sheet

  const cubes = CUBES.map(([x, z, colour, cls]) => {
    const m = add(root, box(24, 24, 24), P(colour, 0.55), x, 62, z);
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(31, 31, 31)),
      new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0 })
    );
    edge.position.set(x, 62, z);
    root.add(edge);

    const tagCv = document.createElement("canvas");
    tagCv.width = 208; tagCv.height = 48;
    const tx = tagCv.getContext("2d");
    const tagTex = new THREE.CanvasTexture(tagCv);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tagTex, transparent: true, opacity: 0, depthWrite: false, depthTest: false
    }));
    tag.scale.set(46, 11, 1);
    tag.position.set(x, 86, z);
    root.add(tag);
    return { m, edge, tag, tx, tagTex, colour, cls, conf: 0.86 + Math.random() * 0.12, learned: false };
  });

  /* --------------------------------------------------------- camera rig */
  add(root, cyl(4, 170, 12), ALU, -92, 86, -66);
  add(root, box(100, 5, 5), ALU, -46, 170, -66);
  const cam = new THREE.Group();
  cam.position.set(0, 166, -66);
  root.add(cam);
  add(cam, box(28, 22, 22), DARK, 0, 0, 0);
  add(cam, cyl(9, 15, 16), P(0x11161d, 0.4, 0.5), 0, -11, 0);
  const camLed = new THREE.Mesh(new THREE.SphereGeometry(2, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0x3a2a10 }));
  camLed.position.set(12, 8, 11);
  cam.add(camLed);

  const flash = new THREE.Mesh(new THREE.ConeGeometry(88, 150, 4, 1, true), glow(0xdfe5ee, 0));
  flash.position.set(0, 90, -66);
  flash.rotation.x = Math.PI;
  root.add(flash);

  /* ---------------------------------------------- the dataset, on a panel */
  const panel = new THREE.Group();
  panel.position.set(122, 118, -40);
  panel.rotation.y = -0.62;
  root.add(panel);
  add(panel, box(96, 70, 2.4), P(0x11161d, 0.55), 0, 0, 0);
  const dsCv = document.createElement("canvas");
  dsCv.width = 320; dsCv.height = 234;
  const dx = dsCv.getContext("2d");
  const dsTex = new THREE.CanvasTexture(dsCv);
  const face = new THREE.Mesh(box(90, 64, 0.4), new THREE.MeshBasicMaterial({ map: dsTex }));
  face.position.z = 1.6;
  panel.add(face);
  const halo = new THREE.Mesh(box(104, 78, 0.2), glow(0x9d5cff, 0));
  halo.position.z = -2;
  panel.add(halo);

  function drawTag(c, learned) {
    const { tx } = c;
    tx.clearRect(0, 0, 208, 48);
    tx.fillStyle = "#" + c.colour.toString(16).padStart(6, "0");
    tx.fillRect(0, 0, 208, 48);
    tx.fillStyle = "#0d1117";
    tx.font = "bold 23px ui-monospace, Consolas, monospace";
    tx.fillText(c.cls + (learned ? "  " + c.conf.toFixed(2) : ""), 12, 33);
    c.tagTex.needsUpdate = true;
  }
  cubes.forEach((c) => drawTag(c, false));

  let uiAcc = 0;
  function drawPanel(state, boxed, epoch, mAP) {
    dx.fillStyle = "#0b0f15"; dx.fillRect(0, 0, 320, 234);
    dx.fillStyle = "#9d5cff"; dx.fillRect(0, 0, 320, 32);
    dx.fillStyle = "#0d1117"; dx.font = "bold 17px ui-monospace, Consolas, monospace";
    dx.fillText("Roboflow", 14, 23);
    dx.fillStyle = "#cbbdf0"; dx.font = "600 14px ui-monospace, Consolas, monospace";
    dx.fillText(state, 14, 60);

    dx.fillStyle = "#5d708c"; dx.font = "600 12px ui-monospace, Consolas, monospace";
    dx.fillText("ANNOTATED", 14, 92);
    dx.fillText("CLASSES", 14, 116);
    dx.fillText("VERSION", 14, 140);
    dx.fillStyle = "#e6e9f2"; dx.font = "bold 14px ui-monospace, Consolas, monospace";
    dx.fillText(boxed + " / " + cubes.length + " boxes", 130, 92);
    dx.fillText("red · yellow", 130, 116);
    dx.fillText(epoch > 0 ? "v2" : "v1", 130, 140);

    // Training curve, drawn only once training has started.
    dx.strokeStyle = "#2a3444"; dx.strokeRect(14, 158, 292, 62);
    if (epoch > 0) {
      dx.strokeStyle = "#7dff8a"; dx.lineWidth = 2; dx.beginPath();
      for (let i = 0; i <= epoch; i++) {
        const x = 16 + (i / 40) * 288;
        const y = 216 - (1 - Math.exp(-i / 9)) * 54;
        i ? dx.lineTo(x, y) : dx.moveTo(x, y);
      }
      dx.stroke();
      dx.fillStyle = "#7dff8a"; dx.font = "bold 13px ui-monospace, Consolas, monospace";
      dx.fillText("mAP " + mAP.toFixed(2), 226, 176);
    } else {
      dx.fillStyle = "#3a4553"; dx.font = "600 12px ui-monospace, Consolas, monospace";
      dx.fillText("not trained yet", 22, 194);
    }
    dsTex.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ HUD */
  const hudA = document.getElementById("hud-a");
  const hudB = document.getElementById("hud-b");
  const hudC = document.getElementById("hud-c");

  const MARKS = [0, at(1) - 0.4, at(1) + 1.6, at(3) + 0.4, MISSION];
  function missionTime(cur) {
    const c = Math.min(Math.max(cur, 0), MARKS.length - 1);
    const i = Math.min(Math.floor(c), MARKS.length - 2);
    return MARKS[i] + (MARKS[i + 1] - MARKS[i]) * (c - i);
  }

  const focus = new THREE.Vector3(0, 70, 0);

  function update(dt, t, ctx) {
    const mt = missionTime(ctx.cur);

    let state = "CAPTURE";
    if (mt < at(1)) state = "CAPTURE";
    else if (mt < at(2)) state = "ANNOTATING";
    else if (mt < at(3)) state = "VERSIONED";
    else if (mt < at(4)) state = "TRAINING";
    else state = "DETECTING";

    // Shutter fires once, right at the end of the capture beat.
    flash.material.opacity = mt > at(1) - 0.7 && mt < at(1) + 0.2
      ? 0.24 * (1 - smooth(at(1) - 0.7, at(1) + 0.2, mt)) : 0;

    const annotate = smooth(at(1), at(2) - 0.3, mt);
    const training = smooth(at(3), at(4), mt);
    const detecting = mt >= at(4);
    camLed.material.color.setHex(detecting ? 0xff4d4d : mt > at(1) - 0.7 ? 0xffc247 : 0x3a2a10);

    let boxed = 0;
    cubes.forEach((c, i) => {
      // Hand annotation lands one box at a time; detection puts them all
      // up at once, which is the entire difference between the two.
      const byHand = Math.min(Math.max((annotate - i * 0.16) / 0.24, 0), 1);
      if (byHand > 0.5) boxed++;
      const on = detecting ? 1 : byHand;
      c.edge.material.opacity = on * 0.95;
      c.edge.scale.setScalar(detecting ? 1 : lerp(1.3, 1, byHand));
      c.tag.material.opacity = on * 0.95;
      c.tag.position.y = 86 + Math.sin(t * 1.2 + i) * 0.9;
      if (detecting !== c.learned) { c.learned = detecting; drawTag(c, detecting); }
    });

    const epoch = Math.round(training * 40);
    const mAP = 0.94 * (1 - Math.exp(-Math.max(epoch, 0) / 9));
    halo.material.opacity = 0.05 + training * 0.12 + (detecting ? Math.sin(t * 2) * 0.03 : 0);
    panel.position.y = 118 + Math.sin(t * 0.7) * 2;

    uiAcc += dt;
    if (uiAcc > 0.16) { uiAcc = 0; drawPanel(state, detecting ? cubes.length : boxed, epoch, mAP); }
    if (hudA) hudA.textContent = state;
    if (hudB) hudB.textContent = (detecting ? cubes.length : boxed) + " / " + cubes.length + " boxes";
    if (hudC) hudC.textContent = epoch > 0 ? "mAP " + mAP.toFixed(2) : "2 classes";
  }

  function theme(dark) {
    key.intensity = dark ? 2.2 : 2.9;
    rim.intensity = dark ? 1.05 : 0.6;
    shadowFloor.material.opacity = dark ? 0.3 : 0.17;
  }

  return { fit: 560, focusY: 66, focus, update, theme };
}
