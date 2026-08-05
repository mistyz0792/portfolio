/* Hub page — profile, the project index, and the SCARA holding the stage.
   Each project links to its own page; the ones not built yet say so. */
import * as THREE from "./vendor/three.module.min.js";

const root = document.documentElement;
/* English only; kept so the call sites below read unchanged. */

const PROJECTS = [
  { en: "PolyHome — Embedded Home Automation",
    when: "2026 · Polytech Dijon, France · remote",
    img: null,
    inProgress: true,
    bEn: "A controller built from scratch for a connected chalet — shutters, garage door and lighting — driven through the PolyHome web API. Remote collaboration with Polytech Dijon, University of Burgundy, France.",
    tags: ["Embedded", "REST API", "Remote", "Polytech Dijon"] },
  { page: "project-radar.html",
    en: "Mobile Robot + K-LD7 Radar",
    when: "APR – MAY 2026 · Esslingen, DE",
    img: "assets/previews/02-project-report-esslingen.png",
    bEn: "A stationary Doppler radar positions a robot with no encoders and no IMU, then navigates it.",
    tags: ["Python", "K-LD7", "BLE"] },
  { page: "project-prior.html",
    en: "Prior Solution — R&D IoT Agriculture",
    when: "DEC 2025 – MAR 2026",
    img: "projects/05-internship-prior-solution/images/greenhouse-render-02.png",
    bEn: "R&D IoT for agriculture: automatic fertiliser dosing, sensing, and greenhouse design.",
    tags: ["IoT", "Hydroponics", "3D"] },
  { page: "project-scara.html",
    en: "SCARA Robot Control System",
    when: "JUN – SEP 2025 · KMUTNB",
    img: "projects/01-scara-robot-control/images/control-gui-01.png",
    bEn: "A Raspberry Pi solves inverse kinematics and commands one ESP32 per joint over I²C, with G-code support.",
    tags: ["Raspberry Pi", "ESP32 ×4", "I²C", "IK"] },
  { page: "project-wolffia.html",
    en: "Midori Wolffia — Duckweed Farm",
    when: "DEC 2024 – FEB 2025",
    img: "projects/03-wolffia-farming-automation/images/app-inventor-screens.png",
    bEn: "PLC + ESP32 over Modbus TCP; harvesting by raising the water level, no robot arm.",
    tags: ["PLC", "Modbus TCP", "HMI"] },
  { page: "project-water.html",
    en: "Automatic Plant Watering",
    when: "Blynk · IoT",
    img: "projects/04-plant-watering-blynk/images/blynk-dashboard.png",
    bEn: "Four zones — manual, scheduled, or driven by live soil moisture.",
    tags: ["Blynk", "Relays"] },
  { page: "project-cad.html",
    en: "Reverse Engineering — Onshape",
    when: "CAD practice",
    img: "projects/06-cad-reverse-engineering/images/onshape-models.png",
    bEn: "Measuring real mechanical parts and rebuilding them as working assemblies.",
    tags: ["Onshape", "CAD"] },
  { page: "project-dht.html",
    en: "DHT Monitor on 3 Platforms",
    when: "IoT workshop",
    img: "projects/07-dht-monitor-3-platforms/images/dashboards-overview.png",
    bEn: "One sensor to ThingsBoard, ThingSpeak and Google Sheets, with Telegram alerts.",
    tags: ["ThingsBoard", "Telegram"] },
  { page: "project-roboflow.html",
    en: "Object Detection — Roboflow",
    when: "Vision workshop",
    img: "projects/08-object-detection-roboflow/images/roboflow-dataset.png",
    bEn: "Capturing images, annotating bounding boxes by colour class, training a detector.",
    tags: ["Roboflow", "Dataset"] }
];

const CERTS = [
  ["docs/certificates/certificate-hochschule-esslingen-internship.pdf", "assets/previews/cert-esslingen.png", "Esslingen internship"],
  ["docs/certificates/certificate-cefr-english-b1-1.pdf", "assets/previews/cert-cefr.png", "CEFR English B1.1"]
];

/* ------------------------------------------------------------------ i18n */

const themeBtn = document.getElementById("theme");
function setTheme(t) {
  root.setAttribute("data-theme", t);
  try { localStorage.setItem("d-theme", t); } catch (e) {}
  if (window.dStage) window.dStage.theme(t === "dark");
}
themeBtn.addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));

/* ---------------------------------------------------------------- render */
function docBtn([src, prev, en]) {
  const b = document.createElement("button");
  b.className = "doc";
  Object.assign(b.dataset, { view: src, preview: prev, en });
  b.innerHTML = '<img loading="lazy" alt=""><span></span>';
  b.querySelector("img").src = prev;
  b.querySelector("span").textContent = en;
  return b;
}

function render() {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  PROJECTS.forEach((p) => {
    const built = !!p.page;
    const el = document.createElement(built ? "a" : "div");
    el.className = "proj" + (built ? "" : " soon");
    if (built) el.href = p.page;

    const badge = document.createElement("span");
    badge.className = "proj-badge";
    badge.textContent = built ? "3D" : p.inProgress ? "IN PROGRESS" : "SOON";
    el.appendChild(badge);

    const shot = document.createElement("span");
    shot.className = "proj-shot" + (p.img ? "" : " blank");
    if (p.img) {
      const im = document.createElement("img");
      im.src = p.img; im.alt = ""; im.loading = "lazy";
      shot.appendChild(im);
    } else {
      shot.textContent = "NO PREVIEW YET";
    }

    const inner = document.createElement("span");
    inner.className = "proj-in";
    const when = document.createElement("p"); when.className = "proj-when"; when.textContent = p.when;
    const h = document.createElement("h3"); h.textContent = p.en;
    const body = document.createElement("p"); body.textContent = p.bEn;
    const tags = document.createElement("ul"); tags.className = "tags";
    p.tags.forEach((t) => { const li = document.createElement("li"); li.textContent = t; tags.appendChild(li); });
    const go = document.createElement("span");
    go.className = "proj-go";
    go.textContent = built ? "Open project page →"
                           : p.inProgress ? "Not finished yet" : "3D page in progress";
    inner.append(when, h, body, tags, go);
    el.append(shot, inner);
    grid.appendChild(el);
  });

  const certs = document.getElementById("certs");
  certs.innerHTML = "";
  CERTS.forEach((d) => certs.appendChild(docBtn(d)));
}

let savedTheme = null;
try { savedTheme = localStorage.getItem("d-theme"); } catch (e) {}
setTheme(savedTheme || "dark");
render();

/* --------------------------------------------------------------- reveal */
const copies = [...document.querySelectorAll(".copy")];
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.2 });
  copies.forEach((c) => io.observe(c));
} else copies.forEach((c) => c.classList.add("in"));

/* --------------------------------------------------------------- toasts */
const toasts = document.getElementById("toasts");
function toast(m) {
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = "✓ " + m;
  toasts.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest(".copy-btn");
  if (!b) return;
  e.preventDefault();
  const text = b.dataset.copy;
  const done = () => toast(b.dataset.en + " — " + text);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fb); else fb();
  function fb() {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (err) {}
    ta.remove();
  }
});

/* --------------------------------------------------------------- viewer */
const viewer = document.getElementById("viewer");
const vBody = document.getElementById("v-body");
const vTitle = document.getElementById("v-title");
const vNav = document.getElementById("v-nav");
const vCount = document.getElementById("v-count");
let group = [], index = 0, lastFocus = null;
const item = (el) => ({ src: el.dataset.view, preview: el.dataset.preview, en: el.dataset.en });

function fallback(it) {
  const f = document.createDocumentFragment();
  if (it.preview) { const i = document.createElement("img"); i.src = it.preview; i.alt = ""; f.appendChild(i); }
  const a = document.createElement("a");
  a.className = "btn primary"; a.href = it.src; a.target = "_blank"; a.rel = "noopener";
  a.textContent = "Open the full document";
  f.appendChild(a);
  return f;
}

function open(it) {
  if (viewer.hidden) lastFocus = document.activeElement;
  vBody.innerHTML = ""; vBody.className = "v-body";
  vTitle.textContent = it.en || it.src;
  document.getElementById("v-open").href = it.src;
  document.getElementById("v-dl").href = it.src;
  if (matchMedia("(max-width: 900px)").matches && it.preview) {
    vBody.className = "v-body fallback";
    vBody.appendChild(fallback(it));
  } else {
    const o = document.createElement("object");
    o.data = it.src + "#view=FitH"; o.type = "application/pdf";
    o.appendChild(fallback(it));
    vBody.appendChild(o);
  }
  viewer.hidden = false;
  document.body.classList.add("locked");
  viewer.querySelector("[data-close]").focus();
}
function show(i) {
  index = (i + group.length) % group.length;
  open(item(group[index]));
  vNav.classList.toggle("solo", group.length < 2);
  vCount.textContent = (index + 1) + " / " + group.length;
}
function close() {
  viewer.hidden = true; vBody.innerHTML = "";
  document.body.classList.remove("locked");
  if (lastFocus?.focus) lastFocus.focus();
}
document.getElementById("v-prev").addEventListener("click", () => show(index - 1));
document.getElementById("v-next").addEventListener("click", () => show(index + 1));
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-view]");
  if (t) {
    e.preventDefault();
    const scope = t.closest(".row, .acts");
    group = scope ? [...scope.querySelectorAll("[data-view]")] : [t];
    show(group.indexOf(t));
    return;
  }
  if (e.target.closest("[data-close]")) close();
});
addEventListener("keydown", (e) => {
  if (viewer.hidden) return;
  if (e.key === "Escape") close();
  if (group.length > 1 && e.key === "ArrowLeft") show(index - 1);
  if (group.length > 1 && e.key === "ArrowRight") show(index + 1);
});

/* ---------------------------------------------------------------- stage */
initStage();
function initStage() {
  const canvas = document.getElementById("stage");
  const boot = document.getElementById("boot");
  const bootPct = document.getElementById("boot-pct");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, logarithmicDepthBuffer: true });
  } catch (e) { boot.classList.add("done"); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 1, 12000);

  /* -- signal field ------------------------------------------------------
     The hub does not need the robot — the projects have that. Instead: a
     wireframe plane with travelling waves, which reads as signal and motion
     without competing with the copy. Nothing to download; it is generated. */
  const W = 120, D = 80, STEP = 42;
  const geo = new THREE.PlaneGeometry(W * STEP, D * STEP, W, D);
  geo.rotateX(-Math.PI / 2);
  const base = Float32Array.from(geo.attributes.position.array);

  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x4da3ff, transparent: true, opacity: 0.22 })
  );
  scene.add(wire);

  // A brighter crest rides the wave so the eye has something to follow.
  const crest = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xff7a2f, size: 9, transparent: true, opacity: 0.0, sizeAttenuation: true })
  );
  scene.add(crest);

  const pos = geo.attributes.position;
  const crestAlpha = new Float32Array(pos.count);

  function wave(t) {
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2];
      const r = Math.hypot(x, z) * 0.0016;
      const h =
        Math.sin(x * 0.0022 + t * 0.9) * 90 +
        Math.sin(z * 0.0031 - t * 0.7) * 70 +
        Math.sin(r * 6 - t * 1.6) * 120 / (1 + r * 3);
      pos.array[i * 3 + 1] = h;
      crestAlpha[i] = h;
    }
    pos.needsUpdate = true;
    geo.computeBoundingSphere();
  }
  wave(0);

  // The wireframe copy has to be rebuilt to follow the surface, which is
  // expensive — so update it at a lower rate than the render loop.
  function refreshWire() {
    const old = wire.geometry;
    wire.geometry = new THREE.WireframeGeometry(geo);
    old.dispose();
  }

  let ready = true;
  const fit = W * STEP * 0.42;
  const focusY = 0;
  canvas.classList.add("ready");
  boot.classList.add("done");
  bootPct.textContent = 100;

  // Hero → profile → work → contact: the field tilts and pulls back as the
  // page fills up, so the background never sits still but never shouts either.
  const SHOTS = [
    { a: -0.62, y: 0.30, d: 1.05, ly: 0.00, lat:  0.00 },
    { a: -1.05, y: 0.16, d: 1.30, ly: 0.00, lat:  0.00 },
    { a: -1.60, y: 0.42, d: 1.75, ly: 0.00, lat:  0.00 },
    { a: -2.10, y: 0.22, d: 1.45, ly: 0.00, lat:  0.00 }
  ];
  const scenes = [...document.querySelectorAll(".scene")];
  let target = 0, cur = 0;
  addEventListener("scroll", () => {
    const mid = innerHeight / 2;
    let best = 0, bestD = Infinity;
    scenes.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestD) { bestD = d; best = i; }
    });
    target = best;
  }, { passive: true });

  let mx = 0, px = 0;
  addEventListener("pointermove", (e) => { mx = (e.clientX / innerWidth) * 2 - 1; }, { passive: true });

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);
  resize();

  function theme(dark) {
    wire.material.color.setHex(dark ? 0x4da3ff : 0x0f62c4);
    wire.material.opacity = dark ? 0.22 : 0.3;
    crest.material.color.setHex(dark ? 0xff7a2f : 0xd8551a);
    renderer.toneMappingExposure = dark ? 1.0 : 1.1;
  }
  window.dStage = { theme, resize };
  theme(root.getAttribute("data-theme") === "dark");

  const lerp = THREE.MathUtils.lerp;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let t = 0, tick = 0;

  function frame() {
    requestAnimationFrame(frame);
    if (!ready) return;

    if (!reduced) {
      t += 0.006;
      wave(t);
      if ((tick++ % 3) === 0) refreshWire();
    }

    cur += (target - cur) * 0.055;
    px += (mx - px) * 0.05;

    const i = Math.min(Math.floor(cur), SHOTS.length - 2);
    const k = Math.min(Math.max(cur - i, 0), 1);
    const e = k * k * (3 - 2 * k);
    const A = SHOTS[i], B = SHOTS[i + 1];
    const mix = (p) => lerp(A[p], B[p], e);

    const narrow = innerWidth < 900;
    const dist = mix("d") * fit * (narrow ? 1.35 : 1);
    const ang = mix("a") + px * 0.08;
    const height = fit * mix("y");

    camera.position.set(Math.cos(ang) * dist, height + 220, Math.sin(ang) * dist);
    camera.lookAt(0, -60, 0);

    renderer.render(scene, camera);
  }
  frame();
}
