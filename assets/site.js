/* Shared page machinery for every project page: language, theme, scroll
   reveal, toasts, the inline document viewer, the "other work" cards and
   the project-detail overlay.

   A project page supplies only two things of its own — the documents for
   its spec section, and its own id so its card is left out of the
   "other work" grid. Everything visual and interactive beyond that lives
   in the page's scene module. */

export const root = document.documentElement;
/* Kept as a one-argument passthrough so call sites read the same. */
export const T = (en) => en;

/* ------------------------------------------------------------------ data */
const RAW = [
  { id: "01", en: "SCARA — Robot Control System",
    when: "JUN – SEP 2025 · KMUTNB",
    subEn: "Senior thesis",
    img: "projects/01-scara-robot-control/images/control-gui-01.png",
    page: "project-scara.html",
    bEn: "A Raspberry Pi solves the inverse kinematics and commands one ESP32 per joint over I²C.",
    moreEn: ["One processor solving coordinates while pulsing every axis wrecks the timing, so the job is split into one brain and four hands.",
             "Each ESP32 answers on its own I²C address (0x08–0x0B), then generates the step and direction pulses for its axis by itself.",
             "The control screen is Python + Tkinter and accepts G-code, per-axis jogging and taught pick-and-place routines."],
    tags: ["Raspberry Pi", "ESP32", "I²C", "Inverse kinematics", "Python", "G-code"],
    docs: [["projects/01-scara-robot-control/docs/thesis-full.pdf", "assets/previews/01-thesis-full.png", "Full thesis"],
           ["projects/01-scara-robot-control/docs/presentation-slides.pdf", "assets/previews/01-presentation-slides.png", "Slides"],
           ["projects/01-scara-robot-control/docs/poster.pdf", "assets/previews/01-poster.png", "Poster"]],
    repo: "https://github.com/mistyz0792/portfolio/tree/main/projects/01-scara-robot-control" },

  { id: "02", en: "Mobile Robot + K-LD7 Radar",
    when: "APR – MAY 2026 · Hochschule Esslingen, Germany",
    subEn: "Automation, Robotics and Drive Systems Laboratory",
    img: "assets/previews/02-project-report-esslingen.png",
    page: "project-radar.html",
    bEn: "A stationary Doppler radar positions a robot with no encoders and no IMU, then navigates it to a clicked goal.",
    moreEn: ["A Doppler radar cannot see a robot spinning in place — radial velocity is zero — so heading comes from driving 30 cm forward and reading the start-to-end vector.",
             "Rotation is open-loop on purpose, timed against a calibrated rate, then the drive-and-correct cycle repeats up to three times until the goal is within 30 cm.",
             "The ground station is ten Python modules running three mechanisms in parallel: a radar thread at 2 Mbaud, a 100 ms value/CSV update, and plots refreshing at 12.5 Hz."],
    tags: ["Python", "Tkinter", "matplotlib", "pyserial", "K-LD7", "BLE", "Makeblock"],
    docs: [["projects/02-mobile-robot-kld7-radar/docs/project-report-esslingen.pdf", "assets/previews/02-project-report-esslingen.png", "Report (221 p)"],
           ["docs/certificates/certificate-hochschule-esslingen-internship.pdf", "assets/previews/cert-esslingen.png", "Certificate"]],
    repo: "https://github.com/mistyz0792/portfolio/tree/main/projects/02-mobile-robot-kld7-radar" },

  { id: "03", en: "Midori Wolffia — Duckweed Farm",
    when: "DEC 2024 – FEB 2025",
    subEn: "App-controlled cultivation rig",
    img: "projects/03-wolffia-farming-automation/images/app-inventor-screens.png",
    page: "project-wolffia.html",
    bEn: "PLC + ESP32 over Modbus TCP. Harvesting is done by raising the water level — no robot arm at all.",
    moreEn: ["Grown at a 10 cm water level; at harvest the level rises to 13 cm and the crop floats out over a cheesecloth-lined channel that separates it from the water.",
             "20 % is always kept back as seed stock so the cycle never restarts from scratch, and every drop of water is recycled.",
             "The Android app is built in Thunkable across five screens — Login, Overview, Manual, Auto, Setting — with Google Sheets as the cloud database."],
    tags: ["PLC", "ESP32", "Modbus TCP", "HMI", "Thunkable", "Google Sheets"],
    docs: [["projects/03-wolffia-farming-automation/docs/presentation.pdf", "assets/previews/03-presentation.png", "Presentation"],
           ["projects/03-wolffia-farming-automation/docs/mobile-app-design.pdf", "assets/previews/03-mobile-app-design.png", "App design"]],
    repo: "https://github.com/mistyz0792/portfolio/tree/main/projects/03-wolffia-farming-automation" },

  { id: "04", en: "Automatic Plant Watering",
    when: "Blynk · IoT",
    subEn: "Mobile controlled",
    img: "projects/04-plant-watering-blynk/images/blynk-dashboard.png",
    page: "project-water.html",
    bEn: "Four independent zones — manual, scheduled, or driven by live soil moisture.",
    moreEn: ["Four relays drive four independent zones, each with its own daily on/off schedule.",
             "The automatic mode reads live soil moisture and waters whenever it drops below the configured min/max band."],
    tags: ["Blynk", "Wi-Fi MCU", "Soil moisture", "Relays", "Scheduling"],
    docs: [["projects/04-plant-watering-blynk/docs/source-code-listing-blynk.pdf", "assets/previews/04-source-code-listing-blynk.png", "Code"]],
    repo: "https://github.com/mistyz0792/portfolio/tree/main/projects/04-plant-watering-blynk" },

  { id: "05", en: "Prior Solution — R&D IoT for Agriculture",
    when: "DEC 2025 – MAR 2026",
    subEn: "Co-operative education internship",
    img: "projects/05-internship-prior-solution/images/greenhouse-render-02.png",
    page: "project-prior.html",
    bEn: "R&D IoT for agriculture: cutting manual labour without losing cost-effectiveness, automatic fertiliser dosing, greenhouse design.",
    moreEn: ["Benchmarked several hydroponic systems against each other in real trials, looking for the one worth automating.",
             "Designed and built an automatic fertiliser-dosing system with water-quality and climate sensing.",
             "Built the farm-management software side and modelled the greenhouse in 3D."],
    tags: ["IoT platform", "Hydroponics", "Sensor systems", "Fertiliser dosing", "3D design"],
    docs: [["projects/05-internship-prior-solution/docs/internship-poster.pdf", "assets/previews/05-internship-poster.png", "Poster"],
           ["projects/05-internship-prior-solution/docs/internship-report.pdf", "assets/previews/05-internship-report.png", "Report (111 p)"]],
    repo: "https://github.com/mistyz0792/portfolio/tree/main/projects/05-internship-prior-solution" },

  { id: "06", en: "Reverse Engineering — Onshape",
    when: "CAD",
    subEn: "Mechanical reverse engineering",
    img: "projects/06-cad-reverse-engineering/images/onshape-models.png",
    page: "project-cad.html",
    bEn: "Measuring real mechanical parts and rebuilding them as working assemblies.",
    moreEn: ["Parts rebuilt: a machine vise, a toggle clamp on a jig, a push-pull clamp, a flanged fixture, a mobile step ladder and a chair frame.",
             "Covers bent tube frames, lead screws, multi-link mechanisms and revolute/slider mates that actually move."],
    tags: ["Onshape", "CAD", "Assembly mates", "3D printing"],
    docs: [["projects/06-cad-reverse-engineering/docs/reverse-engineering-assembly-practice.pdf", "assets/previews/06-reverse-engineering-assembly-practice.png", "Document"]],
    repo: "https://github.com/mistyz0792/portfolio/tree/main/projects/06-cad-reverse-engineering" },

  { id: "07", en: "DHT Monitor on 3 Platforms",
    when: "IoT workshop",
    subEn: "IoT dashboards and alerting",
    img: "projects/07-dht-monitor-3-platforms/images/dashboards-overview.png",
    page: "project-dht.html",
    bEn: "One sensor publishing to ThingsBoard, ThingSpeak and Google Sheets at once, with Telegram alerts.",
    moreEn: ["One DHT sensor streaming to three platforms at once to compare them — ThingsBoard for live dashboards, ThingSpeak for MATLAB analysis, Google Sheets for unlimited raw retention.",
             "A humidity threshold at 70 % triggers automatic Telegram messages, so a chart nobody is watching can still reach someone.",
             "Over 1,000 readings were logged continuously, which is what gives the comparison any weight."],
    tags: ["ThingsBoard", "ThingSpeak", "Google Sheets", "Telegram Bot", "DHT22"],
    docs: [],
    repo: "https://github.com/mistyz0792/portfolio/tree/main/projects/07-dht-monitor-3-platforms" },

  { id: "08", en: "Object Detection — Roboflow",
    when: "Vision workshop",
    subEn: "Object detection",
    img: "projects/08-object-detection-roboflow/images/roboflow-dataset.png",
    page: "project-roboflow.html",
    bEn: "A self-captured dataset, hand-annotated by colour class, versioned and trained until the model draws its own boxes.",
    moreEn: ["No off-the-shelf dataset — the scene was arranged and shot in place with one camera, one angle and one light, and that choice caps how good the model can ever get.",
             "Every object gets a bounding box and a colour class by hand. It is dull work and it is the entire model: label it wrong and it learns exactly that.",
             "Roboflow keeps the dataset as versions, so a round of relabelling and retraining can be compared against the last one on the mAP curve."],
    tags: ["Roboflow", "Object detection", "Dataset versioning", "Annotation", "mAP"],
    docs: [],
    repo: "https://github.com/mistyz0792/portfolio/tree/main/projects/08-object-detection-roboflow" },

  { id: "09", en: "PolyHome — Embedded Home Automation",
    when: "2026 · Polytech Dijon, France · remote",
    subEn: "Remote collaboration with Polytech Dijon, University of Burgundy — in progress",
    img: null,
    inProgress: true,
    bEn: "A hand-built controller for a connected chalet — shutters, garage door and lighting — driven entirely through the PolyHome web API.",
    moreEn: ["The brief is to stop using anyone else's home-automation front end and build the device itself: a prototype with its own display and keypad that talks to the house hub over its web API.",
             "It has to register a user account, log in, and keep the returned token so it can authenticate on its own from then on, then list the devices in the house and send them commands.",
             "Beyond the minimum, the interesting part is the bonus scope — one action driving several devices at once, and an automatic mode that reacts to a temperature or light sensor wired to the device."],
    tags: ["Embedded", "REST API", "Auth token", "Remote", "Polytech Dijon"],
    docs: [],
    repo: "https://github.com/mistyz0792/portfolio" }
];

/* Newest first. Anything without a period is undated workshop practice and
   sorts to the end, in its original order. */
const ORDER = ["09", "02", "05", "01", "03", "04", "06", "07", "08"];
export const WORK = RAW.slice().sort(
  (a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));

export const CERTS = [
  ["docs/certificates/certificate-hochschule-esslingen-internship.pdf", "assets/previews/cert-esslingen.png", "Esslingen internship"],
  ["docs/certificates/certificate-cefr-english-b1-1.pdf", "assets/previews/cert-cefr.png", "CEFR English B1.1"]
];

/* ---------------------------------------------------------------- helpers */
export function docBtn([src, prev, en]) {
  const b = document.createElement("button");
  b.className = "doc";
  Object.assign(b.dataset, { view: src, preview: prev, en });
  b.innerHTML = '<img loading="lazy" alt=""><span></span>';
  b.querySelector("img").src = prev;
  b.querySelector("span").textContent = en;
  return b;
}

/* --------------------------------------------------------------- init all */
export function initSite({ docs = [], skip = null } = {}) {
  const shown = WORK.filter((w) => w.id !== skip);

  /* ------------------------------------------------------------ language */
  function render() {
    renderDocs();
    renderCards();
  }

  const themeBtn = document.getElementById("theme");
  function setTheme(t) {
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("d-theme", t); } catch (e) {}
    if (window.dStage) window.dStage.theme(t === "dark");
  }
  themeBtn.addEventListener("click", () =>
    setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));

  /* -------------------------------------------------------------- render */
  function renderDocs() {
    const host = document.getElementById("docs");
    if (!host) return;
    host.innerHTML = "";
    docs.forEach((d) => host.appendChild(docBtn(d)));
  }

  function renderCards() {
    const host = document.getElementById("cards");
    if (host) {
      host.innerHTML = "";
      shown.forEach((w, i) => {
        const c = document.createElement("button");
        c.className = "card";
        c.type = "button";
        c.dataset.project = String(i);
        // A project still in progress has nothing to screenshot yet, so it
        // gets a labelled panel instead of a broken image.
        const thumb = document.createElement("span");
        thumb.className = "card-thumb" + (w.img ? "" : " blank");
        if (w.img) {
          const im = document.createElement("img");
          im.src = w.img; im.alt = ""; im.loading = "lazy";
          thumb.appendChild(im);
        } else {
          thumb.textContent = "NO PREVIEW YET";
        }
        const h = document.createElement("h3"); h.textContent = w.en;
        const when = document.createElement("p"); when.className = "when"; when.textContent = w.when;
        const p = document.createElement("p"); p.textContent = w.bEn;
        const tags = document.createElement("ul"); tags.className = "tags";
        w.tags.slice(0, 4).forEach((t) => {
          const li = document.createElement("li"); li.textContent = t; tags.appendChild(li);
        });
        const more = document.createElement("span");
        more.className = "card-more";
        more.textContent = w.page ? "Open the 3D page →" : "Read more →";
        c.append(thumb, h, when, p, tags, more);
        host.appendChild(c);
      });
    }
    const certs = document.getElementById("certs");
    if (certs) { certs.innerHTML = ""; CERTS.forEach((d) => certs.appendChild(docBtn(d))); }
  }

  /* ------------------------------------------------------ project detail */
  const detail = document.getElementById("detail");
  function openProject(i) {
    const w = shown[i];
    if (!w || !detail) return;
    document.getElementById("d-when").textContent = w.when;
    document.getElementById("d-title").textContent = w.en;
    document.getElementById("d-sub").textContent = w.subEn || "";

    const shot = document.getElementById("d-shot");
    shot.innerHTML = "";
    shot.classList.toggle("blank", !w.img);
    if (w.img) {
      const im = document.createElement("img");
      im.src = w.img; im.alt = "";
      shot.appendChild(im);
    } else {
      shot.textContent = "NO PREVIEW YET";
    }

    document.getElementById("d-lead").textContent = w.bEn;

    const more = document.getElementById("d-detail");
    more.innerHTML = "";
    w.moreEn.forEach((line) => {
      const p = document.createElement("p");
      p.textContent = line;
      more.appendChild(p);
    });

    const tags = document.getElementById("d-tags");
    tags.innerHTML = "";
    w.tags.forEach((t) => { const li = document.createElement("li"); li.textContent = t; tags.appendChild(li); });

    const dd = document.getElementById("d-docs");
    dd.innerHTML = "";
    // A project with its own 3D page leads with that, not with a PDF.
    if (w.page) {
      const go = document.createElement("a");
      go.className = "doc go"; go.href = w.page;
      go.textContent = "Open the 3D page →";
      dd.appendChild(go);
    }
    w.docs.forEach((d) => dd.appendChild(docBtn(d)));
    const a = document.createElement("a");
    a.className = "doc"; a.href = w.repo; a.target = "_blank"; a.rel = "noopener";
    a.textContent = "GitHub ↗";
    dd.appendChild(a);

    detail.hidden = false;
    document.body.classList.add("locked");
    detail.querySelector(".d-x").focus();
    detail.querySelector(".d-panel").scrollTop = 0;
  }

  function closeProject() {
    if (!detail) return;
    detail.hidden = true;
    if (document.getElementById("viewer").hidden) document.body.classList.remove("locked");
  }

  document.addEventListener("click", (e) => {
    const card = e.target.closest("[data-project]");
    if (card) { openProject(+card.dataset.project); return; }
    if (e.target.closest("[data-dclose]")) closeProject();
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && detail && !detail.hidden &&
        document.getElementById("viewer").hidden) closeProject();
  });

  /* -------------------------------------------------------------- toasts */
  const toasts = document.getElementById("toasts");
  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = "✓ " + msg;
    toasts.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".copy-btn");
    if (!b) return;
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

  /* -------------------------------------------------------------- viewer */
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
      const scope = t.closest(".docs, .row, .acts");
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

  /* -------------------------------------------------------------- reveal */
  const copies = [...document.querySelectorAll(".copy")];
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.25 });
    copies.forEach((c) => io.observe(c));
  } else {
    copies.forEach((c) => c.classList.add("in"));
  }

  /* Applied last: setLang() reaches forward into renderDocs/renderCards,
     which close over bindings declared above. Calling it any earlier hits
     the temporal dead zone and kills the module without an error. */
  let savedLang = null, savedTheme = null;
  try { savedLang = localStorage.getItem("d-lang"); savedTheme = localStorage.getItem("d-theme"); } catch (e) {}
  setTheme(savedTheme || "dark");
  render();
}
