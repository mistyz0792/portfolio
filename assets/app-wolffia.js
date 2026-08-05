/* Project 03 page — Midori Wolffia, automated duckweed farming. */
import { initSite } from "./site.js?v=11";
import { initStage } from "./stage.js?v=8";
import { buildWolffiaWorld } from "./world-wolffia.js?v=3";

initSite({
  skip: "03",
  docs: [
    ["projects/03-wolffia-farming-automation/docs/presentation.pdf",
     "assets/previews/03-presentation.png", "สไลด์นำเสนอ 39 หน้า", "Presentation (39 p)"],
    ["projects/03-wolffia-farming-automation/docs/mobile-app-design.pdf",
     "assets/previews/03-mobile-app-design.png", "แบบแอปพลิเคชัน", "App design"],
    ["projects/03-wolffia-farming-automation/docs/source-code-listing.pdf",
     "assets/previews/03-source-code-listing.png", "โค้ดโปรแกรม", "Source listing"]
  ]
});

/* `a` climbs monotonically so the camera keeps orbiting one way as you
   scroll. `lat` pushes the rig to the opposite side from that scene's copy.
   Scenes 0–4 scrub the harvest cycle itself. */
initStage({
  build: buildWolffiaWorld,
  shots: [
    { a: 0.70, y: 0.74, d: 0.56, ly: 0.48, lat:  0.30, follow: 0.00, dim: 1.00 },  // reveal — the whole rig
    { a: 1.25, y: 0.90, d: 0.34, ly: 0.50, lat:  0.32, follow: 0.85, dim: 1.00 },  // the crop on the water
    // Shots 2 and 3 look down into the rig: at eye level the tank wall is
    // between the camera and the water it is trying to show.
    { a: 1.85, y: 1.15, d: 0.44, ly: 0.47, lat: -0.32, follow: 1.00, dim: 1.00 },  // over the weir
    { a: 2.45, y: 1.00, d: 0.42, ly: 0.46, lat:  0.32, follow: 1.00, dim: 1.00 },  // channel + cheesecloth
    { a: 3.05, y: 0.86, d: 0.62, ly: 0.46, lat: -0.28, follow: 0.20, dim: 1.00 },  // seed stock + closed loop
    { a: 3.75, y: 0.95, d: 0.92, ly: 0.44, lat:  0.00, follow: 0.00, dim: 0.52 },  // specs
    { a: 4.45, y: 0.70, d: 0.96, ly: 0.46, lat:  0.32, follow: 0.00, dim: 0.46 },  // profile
    { a: 5.15, y: 1.05, d: 1.06, ly: 0.44, lat:  0.00, follow: 0.00, dim: 0.42 },  // other work
    { a: 5.85, y: 1.40, d: 0.96, ly: 0.42, lat:  0.00, follow: 0.00, dim: 0.68 }   // contact
  ]
});
