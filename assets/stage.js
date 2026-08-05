/* Shared 3D stage for every project page.

   One machine sits on a fixed canvas behind the copy; each scene owns a
   camera shot and the stage cross-fades between them as you scroll. The
   page supplies the world (`build`) and the shot list; everything about
   the renderer, the camera rig and the scroll plumbing lives here. */

import * as THREE from "./vendor/three.module.min.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";

export { THREE };

/* build(scene, THREE) must return:
     { fit, focusY, update(dt, t, ctx), theme(dark) }
   where `fit` is the camera distance that frames the whole world at
   shot distance 1.0, and ctx carries the smoothed scene index. */
export function initStage({ build, shots, onShot }) {
  const canvas = document.getElementById("stage");
  const boot = document.getElementById("boot");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true, logarithmicDepthBuffer: true
    });
  } catch (e) { boot.classList.add("done"); return null; }
  // A phone does not need a 2x buffer on a full-screen WebGL scene, and
  // soft shadows are the first thing to cost frames. Both scale down.
  const small = innerWidth < 900;
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
  renderer.shadowMap.enabled = !small || innerWidth >= 600;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 20000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const world = build(scene, THREE);
  const fit = world.fit;
  const focusY = world.focusY;
  // Coplanar CAD-style panels need the log depth buffer to have something
  // to work with; a near plane proportional to the world keeps it sane.
  camera.near = Math.max(fit / 400, 0.05);
  camera.far = fit * 40;

  canvas.classList.add("ready");
  boot.classList.add("done");

  /* --------------------------------------------------------- scroll link */
  const scenes = [...document.querySelectorAll(".scene")];
  let target = 0, cur = 0;
  function pick() {
    const mid = innerHeight / 2;
    let best = 0, bestD = Infinity;
    scenes.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestD) { bestD = d; best = i; }
    });
    target = best;
  }
  addEventListener("scroll", pick, { passive: true });
  pick();
  cur = target;

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
    renderer.toneMappingExposure = dark ? 1.0 : 1.15;
    if (world.theme) world.theme(dark);
  }
  window.dStage = { theme, resize };
  theme(document.documentElement.getAttribute("data-theme") === "dark");

  /* ---------------------------------------------------------------- loop */
  const UP = new THREE.Vector3(0, 1, 0);
  const eye = new THREE.Vector3(), aim = new THREE.Vector3(), side = new THREE.Vector3();
  const pivot = new THREE.Vector3(), tmp = new THREE.Vector3();
  const lerp = THREE.MathUtils.lerp;
  let last = performance.now(), t = 0;

  // A world may expose `focus`, a point it keeps updated (the subject that
  // moves). A shot's `follow` slides the orbit centre from the world origin
  // onto that point, so close shots track the subject instead of losing it.
  const focus = world.focus || null;

  function frame(now) {
    requestAnimationFrame(frame);
    // Tab-switch produces a huge gap; clamp so nothing jumps on return.
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;

    cur += (target - cur) * 0.055;
    px += (mx - px) * 0.05;
    py += (my - py) * 0.05;

    const i = Math.min(Math.floor(cur), shots.length - 2);
    const k = Math.min(Math.max(cur - i, 0), 1);
    const e = k * k * (3 - 2 * k);
    const A = shots[i], B = shots[i + 1];
    const mix = (p, dflt = 0) => lerp(A[p] ?? dflt, B[p] ?? dflt, e);

    // Fade the world back on scenes whose copy has to be read rather than
    // looked past. Below 900px the lateral offset is switched off entirely
    // and the copy spans the viewport, so every scene needs some of it —
    // there is nowhere left for the subject to move to.
    const tight = innerWidth < 900;
    canvas.style.opacity = (mix("dim", 1) * (tight ? 0.6 : 1)).toFixed(3);

    // The world moves its subject before the camera is placed, so a
    // following shot never trails a frame behind.
    world.update(reduced ? 0 : dt, t, { cur, shot: e < 0.5 ? A : B, ang: mix("a") });

    const narrow = innerWidth < 900;
    const dist = mix("d") * fit * (narrow ? 1.45 : 1);
    const ang = mix("a") + px * 0.12;
    const aimY = focusY * mix("ly") * 2;

    pivot.set(0, aimY, 0);
    if (focus) pivot.lerp(tmp.set(focus.x, aimY, focus.z), mix("follow"));

    eye.set(pivot.x + Math.cos(ang) * dist,
            focusY * mix("y") * 2 - py * fit * 0.05,
            pivot.z + Math.sin(ang) * dist);
    aim.copy(pivot);
    // Lateral framing is angular, so it scales with the shot distance —
    // otherwise a close shot pushes the subject clean out of frame.
    const lat = narrow ? 0 : mix("lat") * dist;
    side.subVectors(eye, aim).normalize().cross(UP).normalize();
    eye.addScaledVector(side, lat);
    aim.addScaledVector(side, lat);
    camera.position.copy(eye);
    camera.lookAt(aim);

    if (onShot) onShot(e < 0.5 ? A : B, cur);

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return { scene, camera, renderer, world };
}
