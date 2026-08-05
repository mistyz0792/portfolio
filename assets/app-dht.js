/* Project 07 page — DHT to ThingsBoard, ThingSpeak and Google Sheets. */
import { initSite } from "./site.js?v=11";
import { initStage } from "./stage.js?v=8";
import { buildDhtWorld } from "./world-dht.js?v=1";

initSite({ skip: "07", docs: [] });

/* Scenes 0–4 walk one reading from the sensor to three platforms and a bot. */
initStage({
  build: buildDhtWorld,
  shots: [
    { a: -0.90, y: 0.90, d: 0.72, ly: 0.56, lat:  0.28, follow: 0.00, dim: 1.00 },
    { a: -1.55, y: 0.72, d: 0.34, ly: 0.52, lat:  0.32, follow: 0.80, dim: 1.00 },
    { a: -2.20, y: 1.15, d: 0.56, ly: 0.70, lat: -0.32, follow: 0.30, dim: 1.00 },
    { a: -2.85, y: 0.85, d: 0.44, ly: 0.56, lat:  0.32, follow: 0.60, dim: 1.00 },
    { a: -3.50, y: 1.10, d: 0.78, ly: 0.58, lat: -0.28, follow: 0.20, dim: 1.00 },
    { a: -4.15, y: 1.00, d: 0.90, ly: 0.56, lat:  0.00, follow: 0.00, dim: 0.52 },
    { a: -4.80, y: 0.70, d: 0.94, ly: 0.58, lat:  0.32, follow: 0.00, dim: 0.46 },
    { a: -5.45, y: 1.10, d: 1.02, ly: 0.56, lat:  0.00, follow: 0.00, dim: 0.42 },
    { a: -6.10, y: 1.45, d: 0.92, ly: 0.54, lat:  0.00, follow: 0.00, dim: 0.68 }
  ]
});
