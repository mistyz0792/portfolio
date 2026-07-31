# Theecharat Klainin — Engineering Portfolio

**ธีร์ชรัสมิ์ คล้ายนิล** · Electronics Engineering Technology (Instrumentation & Control)
College of Industrial Technology, King Mongkut's University of Technology North Bangkok (KMUTNB)

🌐 **[เปิดเว็บพอร์ตโฟลิโอ / View the portfolio site](https://mistyz0792.github.io/portfolio/)**

---

**TH** — รวมผลงานด้านระบบควบคุม หุ่นยนต์ และ IoT ที่เคยทำ ตั้งแต่ปริญญานิพนธ์ควบคุมหุ่นยนต์ SCARA,
โปรเจกต์หุ่นยนต์เคลื่อนที่กับเรดาร์ที่ประเทศเยอรมนี, ระบบฟาร์มอัตโนมัติ, งานฝึกงาน R&D ด้าน IoT การเกษตร
ไปจนถึงงานเล็ก ๆ อย่าง CAD, IoT dashboard และ computer vision
แต่ละโปรเจกต์แยกเป็นโฟลเดอร์ของตัวเอง พร้อมซอร์สโค้ด เอกสาร และไฟล์ออกแบบ

**EN** — Control systems, robotics and IoT work: a SCARA robot control system (senior thesis), a radar-guided
mobile robot built during an exchange in Germany, two automated farming systems, an industrial R&D
internship, plus smaller CAD, IoT-dashboard and computer-vision pieces. Each project lives in its own folder
with source code, documentation and design files.

---

## ผลงานหลัก / Featured projects

| # | โปรเจกต์ / Project | สรุป / Summary | เทคโนโลยี / Stack |
|---|---|---|---|
| 1 | **[SCARA Robot Control System](projects/01-scara-robot-control/)** | ปริญญานิพนธ์ — Raspberry Pi คำนวณ inverse kinematics แล้วสั่งงาน ESP32 ประจำแต่ละข้อต่อผ่าน I2C รองรับ G-code และงาน pick-and-place | Raspberry Pi · ESP32 · I2C · Python/Tkinter · Arduino C++ · Onshape |
| 2 | **[Mobile Robot + K-LD7 Radar](projects/02-mobile-robot-kld7-radar/)** | โปรเจกต์ที่ Hochschule Esslingen เยอรมนี — สถานีภาคพื้นบน PC อ่านเรดาร์ Doppler K-LD7 และนำทางหุ่นยนต์ไปยังเป้าหมายผ่าน Bluetooth | Python · Tkinter · matplotlib · pyserial · K-LD7 radar · Arduino |
| 3 | **[Midori Wolffia — Duckweed Farm](projects/03-wolffia-farming-automation/)** | เครื่องเพาะเลี้ยงไข่ผำอัตโนมัติ ควบคุมผ่านแอป Android วัดอุณหภูมิ/ความชื้น คุมไฟ และเก็บเกี่ยวด้วยการปรับระดับน้ำ | IoT · Microcontroller · App Inventor · Sensors · Relays |
| 4 | **[Automatic Plant Watering](projects/04-plant-watering-blynk/)** | ระบบรดน้ำต้นไม้อัตโนมัติ 4 โซน มีตั้งเวลาและโหมดออโต้ตามความชื้นดิน สั่งผ่านมือถือด้วย Blynk | Blynk · Wi-Fi MCU · Soil moisture sensing · Relays |
| 5 | **[Prior Solution — R&D IoT for Agriculture](projects/05-internship-prior-solution/)** | สหกิจศึกษา R&D — เปรียบเทียบระบบไฮโดรโปนิกส์ ทำระบบเติมปุ๋ยอัตโนมัติ เซนเซอร์น้ำ/อากาศ และออกแบบโรงเรือน | IoT platform · Sensor systems · Hydroponics · 3D design |

## ผลงานย่อย / Smaller work

| # | โปรเจกต์ / Project | สรุป / Summary |
|---|---|---|
| 6 | **[CAD Reverse Engineering & Assembly](projects/06-cad-reverse-engineering/)** | ถอดแบบและประกอบชิ้นส่วนเครื่องกลใน Onshape — ปากกาจับชิ้นงาน, toggle clamp, จิ๊กยึด, บันไดเลื่อน, โครงเก้าอี้ |
| 7 | **[DHT Monitor on 3 Platforms](projects/07-dht-monitor-3-platforms/)** | ส่งค่าอุณหภูมิ/ความชื้นจากเซนเซอร์ DHT ขึ้น ThingsBoard, ThingSpeak และ Google Sheets พร้อมแจ้งเตือนผ่าน Telegram |
| 8 | **[Object Detection with Roboflow](projects/08-object-detection-roboflow/)** | ทำ dataset ตรวจจับวัตถุ ติด bounding box แยกคลาสตามสี แล้วเทรนโมเดลบน Roboflow |

## ทักษะ / Skills

**Embedded & Control** — ESP32, Arduino, Raspberry Pi, I2C, UART, stepper & AC servo drives (TB6600, Yaskawa SGDA), inverse kinematics, G-code interpretation, homing with photoelectric sensors

**Software** — Python (Tkinter, matplotlib, pyserial, smbus2, pigpio), Arduino C++, multi-threaded instrument GUIs, CSV data logging

**IoT & Data** — Bluetooth/BLE links, Doppler radar (RFbeam K-LD7), Blynk, ThingsBoard, ThingSpeak, Google Sheets logging, Telegram alerting

**Vision & Design** — Roboflow object detection, Onshape CAD, 3D printing, circuit diagrams, technical documentation (TH/EN)

## โครงสร้าง repo / Repository layout

```
projects/<nn>-<project>/
├── README.md      รายละเอียดโปรเจกต์ / project write-up
├── firmware/      โค้ดฝั่งไมโครคอนโทรลเลอร์ / microcontroller code
├── software/      โค้ดฝั่ง PC หรือ Raspberry Pi / host-side code
├── hardware/      ไฟล์ 3D และไฟล์ผลิต / CAD and fabrication files
├── docs/          เล่มรายงาน สไลด์ โปสเตอร์ / reports, slides, posters
└── images/        ภาพหน้าจอและภาพเรนเดอร์ / screenshots and renders
```

## ติดต่อ / Contact

- 📧 k.theecharat@gmail.com
- 💻 [github.com/mistyz0792](https://github.com/mistyz0792)

---

<sub>เอกสารประกอบทั้งหมดเป็นผลงานของผู้จัดทำและทีมตามที่ระบุในแต่ละเล่ม · Datasheet ของผู้ผลิตไม่ได้เก็บไว้ใน repo แต่ให้ลิงก์ไปยังต้นทางแทน</sub>
