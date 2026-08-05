/* Project 06 page — Reverse engineering in Onshape. */
import { initSite } from "./site.js?v=11";
import { initStage } from "./stage.js?v=8";
import { buildCadWorld } from "./world-cad.js?v=2";

initSite({
  skip: "06",
  docs: [
    ["projects/06-cad-reverse-engineering/docs/reverse-engineering-assembly-practice.pdf",
     "assets/previews/06-reverse-engineering-assembly-practice.png", "เอกสารงานถอดแบบ", "Practice document"]
  ]
});

/* Scenes 0–4 walk one part from measurement to a working mate. */
initStage({
  build: buildCadWorld,
  shots: [
    { a: -0.95, y: 0.95, d: 0.66, ly: 0.52, lat:  0.28, follow: 0.00, dim: 1.00 },
    { a: -1.60, y: 0.80, d: 0.42, ly: 0.54, lat:  0.32, follow: 0.60, dim: 1.00 },
    { a: -2.25, y: 0.70, d: 0.36, ly: 0.54, lat: -0.32, follow: 0.80, dim: 1.00 },
    { a: -2.90, y: 0.62, d: 0.34, ly: 0.52, lat:  0.32, follow: 0.80, dim: 1.00 },
    { a: -3.55, y: 1.05, d: 0.74, ly: 0.50, lat: -0.28, follow: 0.20, dim: 1.00 },
    { a: -4.20, y: 1.00, d: 0.88, ly: 0.48, lat:  0.00, follow: 0.00, dim: 0.52 },
    { a: -4.85, y: 0.70, d: 0.92, ly: 0.50, lat:  0.32, follow: 0.00, dim: 0.46 },
    { a: -5.50, y: 1.10, d: 1.00, ly: 0.48, lat:  0.00, follow: 0.00, dim: 0.42 },
    { a: -6.15, y: 1.45, d: 0.90, ly: 0.46, lat:  0.00, follow: 0.00, dim: 0.68 }
  ]
});
