/* Site D — product-launch page for the SCARA.
   One machine on a fixed stage; each scene changes the shot. */
import * as THREE from "./vendor/three.module.min.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";
import { initSite, root } from "./site.js?v=11";

initSite({
  skip: "01",
  docs: [
    ["projects/01-scara-robot-control/docs/thesis-full.pdf", "assets/previews/01-thesis-full.png", "เล่มปริญญานิพนธ์", "Full thesis"],
    ["projects/01-scara-robot-control/docs/presentation-slides.pdf", "assets/previews/01-presentation-slides.png", "สไลด์", "Slides"],
    ["projects/01-scara-robot-control/docs/poster.pdf", "assets/previews/01-poster.png", "โปสเตอร์", "Poster"],
    ["projects/01-scara-robot-control/docs/circuit-diagram.pdf", "assets/previews/01-circuit-diagram.png", "ผังวงจร", "Circuit"]
  ]
});

/* ----------------------------------------------------------------- stage */
initStage();

function initStage() {
  const canvas = document.getElementById("stage");
  const boot = document.getElementById("boot");
  const bootPct = document.getElementById("boot-pct");
  const hudPose = document.getElementById("hud-pose");
  const hudAng = document.getElementById("hud-ang");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, logarithmicDepthBuffer: true });
  } catch (e) { boot.classList.add("done"); return; }
  // A phone does not need a 2x buffer on a full-screen WebGL scene, and
  // soft shadows are the first thing to cost frames. Both scale down.
  const small = innerWidth < 900;
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
  renderer.shadowMap.enabled = !small || innerWidth >= 600;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 25, 20000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(900, 1600, 900);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { near: 200, far: 6000, left: -1300, right: 1300, top: 1300, bottom: -1300 });
  key.shadow.bias = -0.0009;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fbaff, 1.2);
  rim.position.set(-900, 500, -800);
  scene.add(rim);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.ShadowMaterial({ opacity: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const rig = new THREE.Group();
  scene.add(rig);

  let focusY = 500, fit = 2400, ready = false;

  new GLTFLoader().load(canvas.dataset.model, (g) => {
    const m = g.scene;
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      o.material.side = THREE.DoubleSide;
      o.material.shadowSide = THREE.DoubleSide;
      o.material.envMapIntensity = 1.2;
      o.material.needsUpdate = true;
    });
    const b = new THREE.Box3().setFromObject(m);
    m.position.x -= (b.min.x + b.max.x) / 2;
    m.position.z -= (b.min.z + b.max.z) / 2;
    m.position.y -= b.min.y;
    rig.add(m);
    m.updateMatrixWorld(true);
    const s = new THREE.Box3().setFromObject(m).getBoundingSphere(new THREE.Sphere());
    focusY = s.center.y;
    fit = s.radius / Math.sin((camera.fov * Math.PI) / 360);
    ready = true;
    canvas.classList.add("ready");
    boot.classList.add("done");
  }, (e) => {
    if (!e.lengthComputable) return;
    const p = Math.round((e.loaded / e.total) * 100);
    bootPct.textContent = p;
    boot.querySelector("i").style.setProperty("--p", p + "%");
  }, () => { if (!ready) boot.classList.add("done"); });

  // One shot per scene: orbit angle, height, distance, look-at, lateral
  // framing. `lat` pushes the machine to the opposite side from that
  // scene's copy — positive away from a left-aligned block, negative away
  // from a right-aligned one. The text-heavy centred scenes (specs, work)
  // need the biggest push, because their copy owns the middle of the frame.
  // `dim` fades the machine back on the scenes whose copy has to be read
  // rather than looked past. Below 900px the lateral offset is switched
  // off entirely and the wide copy blocks span the viewport, so this is
  // the only thing keeping those scenes legible on a phone.
  const SHOTS = [
    { a: -0.65, y: 0.30, d: 1.30, ly: 0.50, lat:  0.00, dim: 1.00, pose: "HOME" },
    { a: -1.55, y: 0.62, d: 1.00, ly: 0.62, lat:  0.34, dim: 1.00, pose: "SHOULDER" },
    { a: -2.55, y: 0.22, d: 0.85, ly: 0.66, lat: -0.34, dim: 1.00, pose: "I2C BUS" },
    { a: -3.55, y: 0.12, d: 0.78, ly: 0.28, lat:  0.34, dim: 1.00, pose: "TOOL" },
    { a: -4.60, y: 0.45, d: 1.70, ly: 0.48, lat: -0.48, dim: 0.52, pose: "FULL VIEW" },
    { a: -5.40, y: 0.38, d: 1.55, ly: 0.50, lat:  0.44, dim: 0.46, pose: "OPERATOR" },
    { a: -6.30, y: 0.30, d: 1.95, ly: 0.50, lat: -0.48, dim: 0.42, pose: "GALLERY" },
    { a: -7.10, y: 0.55, d: 1.50, ly: 0.46, lat: -0.30, dim: 0.68, pose: "STANDBY" }
  ];

  const scenes = [...document.querySelectorAll(".scene")];
  let target = 0, cur = 0;
  addEventListener("scroll", () => {
    // Which scene owns the middle of the viewport right now.
    const mid = innerHeight / 2;
    let best = 0, bestD = Infinity;
    scenes.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestD) { bestD = d; best = i; }
    });
    target = best;
  }, { passive: true });

  let mx = 0, my = 0, px = 0, py = 0;
  addEventListener("pointermove", (e) => {
    mx = (e.clientX / innerWidth) * 2 - 1;
    my = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);
  resize();

  function theme(dark) {
    key.intensity = dark ? 2.2 : 2.5;
    rim.intensity = dark ? 1.2 : 0.8;
    floor.material.opacity = dark ? 0.3 : 0.18;
    renderer.toneMappingExposure = dark ? 1.0 : 1.1;
  }
  window.dStage = { theme, resize };
  theme(root.getAttribute("data-theme") === "dark");

  const UP = new THREE.Vector3(0, 1, 0);
  const eye = new THREE.Vector3(), aim = new THREE.Vector3(), side = new THREE.Vector3();
  const lerp = THREE.MathUtils.lerp;

  function frame() {
    requestAnimationFrame(frame);
    if (!ready) return;

    cur += (target - cur) * 0.055;
    px += (mx - px) * 0.05;
    py += (my - py) * 0.05;

    const i = Math.min(Math.floor(cur), SHOTS.length - 2);
    const k = Math.min(Math.max(cur - i, 0), 1);
    const e = k * k * (3 - 2 * k);
    const A = SHOTS[i], B = SHOTS[i + 1];
    const mix = (p) => lerp(A[p], B[p], e);

    const narrow = innerWidth < 900;
    const dist = mix("d") * fit * (narrow ? 1.45 : 1);
    // Lateral framing is angular, so it has to scale with the shot
    // distance. Against a fixed `fit` the far shots barely moved at all,
    // which is how the machine ended up sitting under the copy.
    const lat = narrow ? 0 : mix("lat") * dist;
    const ang = mix("a") + px * 0.12;

    eye.set(Math.cos(ang) * dist, focusY * mix("y") * 2 - py * fit * 0.05, Math.sin(ang) * dist);
    aim.set(0, focusY * mix("ly") * 2, 0);
    side.subVectors(eye, aim).normalize().cross(UP).normalize();
    eye.addScaledVector(side, lat);
    aim.addScaledVector(side, lat);
    camera.position.copy(eye);
    camera.lookAt(aim);

    rig.rotation.y = cur * 0.35 + (reduced ? 0 : performance.now() * 0.00002);
    canvas.style.opacity = (mix("dim") * (narrow ? 0.6 : 1)).toFixed(3);

    if (hudPose) hudPose.textContent = (e < 0.5 ? A : B).pose;
    if (hudAng) {
      hudAng.textContent = (ang * 180 / Math.PI).toFixed(1) + "° / " +
        (rig.rotation.y * 180 / Math.PI % 360).toFixed(1) + "°";
    }

    renderer.render(scene, camera);
  }
  frame();
}
