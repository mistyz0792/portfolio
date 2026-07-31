# Datasheets / เอกสารอุปกรณ์

ไฟล์ datasheet ของผู้ผลิตไม่ได้เก็บไว้ใน repo นี้ (เป็นลิขสิทธิ์ของผู้ผลิต) — ด้านล่างคือลิงก์ไปยังต้นทางแทน
Manufacturer datasheets are not redistributed here; use the official sources below.

| อุปกรณ์ / Part | ใช้ทำอะไร / Used for | แหล่งข้อมูล / Source |
|---|---|---|
| Yaskawa **SGDA** AC servo + driver | ขับข้อต่อหลักของแขนกล | [yaskawa.com — Sigma series](https://www.yaskawa.com/products/motion/sigma-servo) |
| **TB6600** stepper motor driver | ขับสเต็ปเปอร์แต่ละแกน รับ pulse/dir จาก ESP32 | [Toshiba TB6600HG](https://toshiba.semicon-storage.com/ap-en/semiconductor/product/motor-driver-ics.html) |
| **Raspberry Pi 3 Model B+** | Master processor, GUI | [raspberrypi.com — documentation](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html) |
| **ESP32** | Joint processor (I2C slave, pulse generator) | [Espressif ESP32 datasheet](https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf) |
| OMRON **EE-SX674P-WR** photoelectric sensor | Homing / limit ของแต่ละแกน | [omron — EE-SX67 series](https://industrial.omron.eu/en/products/ee-sx674p-wr) |
| **ZRAC2220-11** noise filter | กรองสัญญาณรบกวนฝั่งไฟเข้า | ดูสเปกจากผู้จำหน่าย / vendor spec sheet |
| Stepper motors | ข้อต่อแกน 1–4 | ตามสเปกในเล่มปริญญานิพนธ์ บทที่ 3 |

> รายละเอียดการเลือกอุปกรณ์และการต่อวงจรทั้งหมดอยู่ใน [เล่มปริญญานิพนธ์](thesis-full.pdf) และ [ผังวงจร](circuit-diagram.pdf)
