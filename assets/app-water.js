/* Project 04 page — Automatic plant watering, four zones on Blynk. */
import { initSite } from "./site.js?v=11";
import { initStage } from "./stage.js?v=8";
import { buildWaterWorld } from "./world-water.js?v=2";

initSite({
  skip: "04",
  docs: [
    ["projects/04-plant-watering-blynk/docs/source-code-listing-blynk.pdf",
     "assets/previews/04-source-code-listing-blynk.png", "โค้ดโปรแกรม", "Source listing"]
  ]
});

/* Scenes 0–4 scrub the automatic mode: two zones cross their threshold
   at different moments and each is handled on its own. */
initStage({
  build: buildWaterWorld,
  shots: [
    { a: -0.85, y: 0.70, d: 0.74, ly: 0.42, lat:  0.28, follow: 0.00, dim: 1.00 },
    { a: -1.50, y: 0.55, d: 0.36, ly: 0.44, lat:  0.32, follow: 0.85, dim: 1.00 },
    { a: -2.15, y: 0.60, d: 0.32, ly: 0.44, lat: -0.32, follow: 1.00, dim: 1.00 },
    { a: -2.80, y: 0.50, d: 0.34, ly: 0.42, lat:  0.32, follow: 1.00, dim: 1.00 },
    { a: -3.45, y: 0.95, d: 0.80, ly: 0.40, lat: -0.28, follow: 0.20, dim: 1.00 },
    { a: -4.10, y: 0.90, d: 0.92, ly: 0.40, lat:  0.00, follow: 0.00, dim: 0.52 },
    { a: -4.75, y: 0.60, d: 0.96, ly: 0.42, lat:  0.32, follow: 0.00, dim: 0.46 },
    { a: -5.40, y: 1.05, d: 1.04, ly: 0.40, lat:  0.00, follow: 0.00, dim: 0.42 },
    { a: -6.05, y: 1.40, d: 0.94, ly: 0.38, lat:  0.00, follow: 0.00, dim: 0.68 }
  ]
});
