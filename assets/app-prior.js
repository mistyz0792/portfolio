/* Project 05 page — Prior Solution, R&D IoT for agriculture. */
import { initSite } from "./site.js?v=11";
import { initStage } from "./stage.js?v=8";
import { buildPriorWorld } from "./world-prior.js?v=5";

initSite({
  skip: "05",
  docs: [
    ["projects/05-internship-prior-solution/docs/internship-report.pdf",
     "assets/previews/05-internship-report.png", "รายงานสหกิจศึกษา 111 หน้า", "Co-op report (111 p)"],
    ["projects/05-internship-prior-solution/docs/internship-poster.pdf",
     "assets/previews/05-internship-poster.png", "โปสเตอร์สรุปงาน", "Summary poster"]
  ]
});

/* `a` climbs monotonically so the camera keeps orbiting one way as you
   scroll. `lat` pushes the greenhouse to the opposite side from that
   scene's copy; `dim` fades it back on the scenes that have to be read.
   Scenes 0–4 scrub one automatic dosing cycle. */
initStage({
  build: buildPriorWorld,
  shots: [
    { a: -0.80, y: 0.85, d: 1.00, ly: 0.42, lat:  0.24, follow: 0.00, dim: 1.00 },  // reveal — the house
    { a: -1.45, y: 0.72, d: 0.46, ly: 0.44, lat:  0.32, follow: 0.75, dim: 1.00 },  // EC falling
    { a: -2.10, y: 0.66, d: 0.40, ly: 0.42, lat: -0.32, follow: 1.00, dim: 1.00 },  // the dosing skid
    { a: -2.75, y: 0.82, d: 0.52, ly: 0.42, lat:  0.32, follow: 0.70, dim: 1.00 },  // feeding the benches
    { a: -3.40, y: 1.30, d: 0.72, ly: 0.36, lat: -0.28, follow: 0.20, dim: 1.00 },  // the cabinet + scale
    { a: -4.10, y: 1.10, d: 0.86, ly: 0.36, lat:  0.00, follow: 0.00, dim: 0.52 },  // specs
    { a: -4.80, y: 0.70, d: 0.92, ly: 0.38, lat:  0.32, follow: 0.00, dim: 0.46 },  // profile
    { a: -5.50, y: 1.20, d: 1.00, ly: 0.36, lat:  0.00, follow: 0.00, dim: 0.42 },  // other work
    { a: -6.20, y: 1.60, d: 0.90, ly: 0.34, lat:  0.00, follow: 0.00, dim: 0.68 }   // contact
  ]
});
