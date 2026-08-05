/* Project 02 page — Mobile Robot + K-LD7 Radar. */
/* The ?v= on each import is the cache key. GitHub Pages (and the browser's
   module cache) will happily serve a stale module next to a fresh one, so
   every shared module a page pulls in carries the page's version. */
import { initSite } from "./site.js?v=11";
import { initStage } from "./stage.js?v=8";
import { buildRadarWorld } from "./world-radar.js?v=5";

initSite({
  skip: "02",
  docs: [
    ["projects/02-mobile-robot-kld7-radar/docs/project-report-esslingen.pdf",
     "assets/previews/02-project-report-esslingen.png", "รายงานฉบับเต็ม 221 หน้า", "Full report (221 p)"],
    ["docs/certificates/certificate-hochschule-esslingen-internship.pdf",
     "assets/previews/cert-esslingen.png", "ใบรับรองการฝึกงาน", "Internship certificate"]
  ]
});

/* One shot per scene: orbit angle, camera height, distance, look-at height,
   lateral framing, and how much the shot follows the robot rather than the
   plot centre. Scenes 0–4 also scrub the navigation run itself. */
initStage({
  build: buildRadarWorld,
  /* `a` climbs monotonically so the camera keeps orbiting one way as you
     scroll. `lat` pushes the subject to the opposite side from that scene's
     copy: positive for a left-aligned block, negative for a right one. */
  shots: [
    { a: -3.92, y: 0.30, d: 0.26, ly: 0.08, lat:  0.34, follow: 1.00, dim: 1.00 },  // reveal — robot, radar behind
    { a: -3.20, y: 0.18, d: 0.19, ly: 0.06, lat:  0.34, follow: 1.00, dim: 1.00 },  // can't see it spin
    { a: -2.50, y: 0.55, d: 0.30, ly: 0.06, lat: -0.34, follow: 1.00, dim: 1.00 },  // heading probe
    { a: -1.80, y: 0.40, d: 0.26, ly: 0.06, lat:  0.34, follow: 1.00, dim: 1.00 },  // rotate + drive
    { a: -1.57, y: 2.60, d: 0.62, ly: 0.02, lat: -0.14, follow: 0.25, dim: 1.00 },  // arrived — plot view
    { a: -0.90, y: 0.90, d: 0.82, ly: 0.09, lat:  0.00, follow: 0.00, dim: 0.52 },  // specs
    { a: -0.20, y: 0.55, d: 0.88, ly: 0.09, lat:  0.34, follow: 0.00, dim: 0.46 },  // profile
    { a:  0.50, y: 1.00, d: 0.98, ly: 0.08, lat:  0.00, follow: 0.00, dim: 0.42 },  // other work
    { a:  1.20, y: 1.40, d: 0.88, ly: 0.06, lat:  0.00, follow: 0.00, dim: 0.68 }   // contact
  ]
});
