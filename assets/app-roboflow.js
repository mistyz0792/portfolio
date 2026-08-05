/* Project 08 page — Object detection trained on Roboflow. */
import { initSite } from "./site.js?v=11";
import { initStage } from "./stage.js?v=8";
import { buildVisionWorld } from "./world-vision.js?v=1";

initSite({ skip: "08", docs: [] });

/* Scenes 0–4 walk the dataset: capture, annotate, version, train, detect. */
initStage({
  build: buildVisionWorld,
  shots: [
    { a: -0.90, y: 1.10, d: 0.74, ly: 0.60, lat:  0.28, follow: 0.00, dim: 1.00 },
    { a: -1.55, y: 1.35, d: 0.44, ly: 0.62, lat:  0.32, follow: 0.40, dim: 1.00 },
    { a: -2.20, y: 1.55, d: 0.42, ly: 0.62, lat: -0.32, follow: 0.30, dim: 1.00 },
    { a: -2.85, y: 1.05, d: 0.52, ly: 0.62, lat:  0.32, follow: 0.20, dim: 1.00 },
    { a: -3.50, y: 1.45, d: 0.68, ly: 0.60, lat: -0.28, follow: 0.10, dim: 1.00 },
    { a: -4.15, y: 1.05, d: 0.88, ly: 0.58, lat:  0.00, follow: 0.00, dim: 0.52 },
    { a: -4.80, y: 0.75, d: 0.92, ly: 0.60, lat:  0.32, follow: 0.00, dim: 0.46 },
    { a: -5.45, y: 1.15, d: 1.00, ly: 0.58, lat:  0.00, follow: 0.00, dim: 0.42 },
    { a: -6.10, y: 1.50, d: 0.90, ly: 0.56, lat:  0.00, follow: 0.00, dim: 0.68 }
  ]
});
