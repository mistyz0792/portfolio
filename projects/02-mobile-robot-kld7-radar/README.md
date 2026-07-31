# Mobile Robot with Bluetooth Connection + Stationary K-LD7 Radar Monitoring

### หุ่นยนต์เคลื่อนที่ควบคุมผ่าน Bluetooth พร้อมระบบติดตามด้วยเรดาร์ K-LD7

> Project Report · Scholarship Program for Undergraduate International Internship
> **Hochschule Esslingen – University of Applied Sciences**, Germany
> Automation, Robotics and Drive Systems Laboratory · Faculty of Mechanical and Systems Engineering
> ร่วมกับ มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าพระนครเหนือ (KMUTNB)
> **ช่วงที่ทำ / Period — 1 APR 2026 – 31 MAY 2026**
> 📄 [ใบรับรองการฝึกงาน / Internship certificate](../../docs/certificates/certificate-hochschule-esslingen-internship.pdf)

**ผู้จัดทำ / Authors** — Theecharat Klainin · Chawakorn Kittirotcharoen
**อาจารย์ที่ปรึกษา / Advisors** — Prof. Dr.-Ing. Ralph Schmidt · Prof. Dr.-Ing. Jürgen Haag

---

## ภาพรวม / Overview

**TH** — เรดาร์ที่ติดตั้งอยู่กับที่ ทำหน้าที่เป็น "ระบบระบุตำแหน่ง" ให้หุ่นยนต์ที่ไม่มีทั้ง encoder และ IMU
ฝั่ง PC เขียนเป็นโปรแกรม Python/Tkinter อ่านข้อมูลจากเรดาร์ RFbeam **K-LD7** ผ่าน UART พล็อตกราฟแบบเรียลไทม์
บันทึกลง CSV และสั่งงานหุ่นยนต์ผ่าน Bluetooth ผู้ใช้คลิกจุดเป้าหมายบนแผนที่เรดาร์แล้วหุ่นยนต์จะขับไปเอง

**EN** — A single stationary radar acts as the positioning system for a robot that has neither encoders
nor an IMU. A Python/Tkinter ground station reads the RFbeam **K-LD7** over UART, plots live data, logs to CSV,
and drives the robot over Bluetooth. Click a goal on the radar map and the robot navigates to it.

## ระบบทำงานยังไง / How it works

```
┌─────────────────────────────┐          ┌──────────────────────────┐
│  PC ground station (Python) │  UART    │  RFbeam K-LD7 radar      │
│  • Tkinter GUI              │◄────────►│  24 GHz Doppler          │
│  • 3 live matplotlib plots  │ 2 Mbaud  │  stationary, watches area│
│  • CSV logging              │          └──────────────────────────┘
│  • go-to-goal navigator     │
└──────────────┬──────────────┘
               │  Bluetooth Classic SPP (virtual COM port)
               ▼
┌─────────────────────────────┐
│  Makeblock MeOrion robot    │
│  • 2 × DC motors + trim     │
│  • ultrasonic sensor        │
│  • dual-mode BT module      │◄── BLE ── โทรศัพท์มือถือ (Phase 1)
└─────────────────────────────┘
```

### จุดที่ยากที่สุด — หาทิศทางหุ่นยนต์จากเรดาร์อย่างเดียว

เรดาร์ Doppler มองเห็นเฉพาะ **ความเร็วในแนวรัศมี** ตอนหุ่นยนต์หมุนอยู่กับที่ ความเร็วในแนวรัศมีเป็นศูนย์ เรดาร์จึง "มองไม่เห็น"
ระบบจึงต้องหาทิศทางด้วยวิธีอ้อม:

1. หมุนซ้ายจนกว่าเรดาร์จะจับหุ่นยนต์ได้ (timeout 12 วินาที)
2. ขับตรงไปข้างหน้า 30 ซม. แล้วคำนวณทิศทางจากเวกเตอร์ จุดเริ่ม → จุดจบ
3. วางแผน: หามุมที่ต้องหมุนและระยะที่ต้องขับ
4. หมุนแบบ open-loop (เวลา = มุม ÷ อัตราหมุนที่คาลิเบรตไว้)
5. ขับตรงแบบ open-loop (เวลา = ระยะ ÷ ความเร็วเชิงเส้น)
6. รอ 2 วินาทีให้เรดาร์จับใหม่ แล้ววนซ้ำ สูงสุด 3 รอบ (ถือว่าถึงที่หมายเมื่อเหลือ < 30 ซม.)

การหมุนใช้ open-loop **โดยตั้งใจ** เพราะเรดาร์ Doppler ไม่สามารถวัดการหมุนรอบตัวเองได้ จึงต้องเชื่ออัตราหมุนที่คาลิเบรตไว้แทน

### สถาปัตยกรรมโปรแกรมฝั่ง PC

รันสามกลไกขนานกัน — worker thread อ่านเฟรมเรดาร์เข้า deque (ไม่แตะ Tk),
`Tk.after` ทุก 100 ms อัปเดตค่าและเขียน CSV, และ `FuncAnimation` สองตัวรีเฟรชกราฟที่ ~12.5 Hz

| ไฟล์ / File | หน้าที่ / Responsibility |
|---|---|
| [`main.py`](software/ground-station/main.py) | จุดเริ่มโปรแกรม |
| [`gui.py`](software/ground-station/gui.py) | หน้าต่างหลัก Tkinter ประกอบทุกโมดูลเข้าด้วยกัน |
| [`serial_io.py`](software/ground-station/serial_io.py) | คุยกับ K-LD7 ผ่าน UART — handshake `INIT` แล้วสลับเป็น 2,000,000 baud |
| [`navigator.py`](software/ground-station/navigator.py) | ตรรกะนำทาง go-to-goal ทั้งหมด |
| [`bluetooth_io.py`](software/ground-station/bluetooth_io.py) | ลิงก์ Bluetooth SPP ไปยังหุ่นยนต์ + reader thread |
| [`plots.py`](software/ground-station/plots.py) | ตัวช่วยพล็อต matplotlib |
| [`data_logging.py`](software/ground-station/data_logging.py) | บันทึกข้อมูลลง CSV |
| [`robot_settings.py`](software/ground-station/robot_settings.py) | โหลด/บันทึกค่าคาลิเบรตมอเตอร์ |
| [`settings_window.py`](software/ground-station/settings_window.py) | หน้าต่างคาลิเบรตมอเตอร์ |
| [`nav_window.py`](software/ground-station/nav_window.py) | หน้าต่างเลือกเป้าหมาย |

### การตั้งค่าเรดาร์ / Radar configuration

| ค่า / Setting | ตัวเลือก / Options |
|---|---|
| Baud rate | เริ่มที่ 115,200 (parity even) → สลับเป็น 2,000,000 หลัง `INIT` |
| ระยะตรวจจับ / Range | 5 m · 10 m · 30 m · 100 m |
| ความเร็วสูงสุด / Max speed | 12.5 · 25 · 50 · 100 km/h |
| โซนเตือน / Zone thresholds | danger 100 cm · warning 200 cm (ปรับด้วย slider ได้) |

## เฟิร์มแวร์หุ่นยนต์ / Robot firmware

บอร์ด Makeblock **MeOrion** — มอเตอร์ DC 2 ตัว, ultrasonic sensor (PORT_3), โมดูล Bluetooth (PORT_6)

[`MeOrionBot_Extra.ino`](firmware/arduino/MeOrionBot_Extra.ino) เป็นเฟิร์มแวร์ Phase 2 ที่ยังรองรับคำสั่งตัวอักษรเดียวของ Phase 1
(ที่แอปมือถือใช้) ได้เหมือนเดิม แล้วเพิ่มคำสั่งแบบหลายตัวอักษรให้ PC ปรับค่าตอนรันไทม์ได้:

| คำสั่ง / Command | ความหมาย / Meaning |
|---|---|
| `SP<n>` | ตั้งค่า PWM หลัก (50–255) |
| `OFL<±n>` / `OFR<±n>` | ชดเชยล้อซ้าย/ขวา ตอนเดินหน้า |
| `OBL<±n>` / `OBR<±n>` | ชดเชยล้อซ้าย/ขวา ตอนถอยหลัง |
| `Q` | อ่านค่าความเร็วและค่าชดเชยปัจจุบัน |

แยกค่าชดเชยเป็นเดินหน้า/ถอยหลังคนละชุด เพราะมอเตอร์ DC แบบแปรงถ่านมีเส้นโค้งแรงบิด–กระแสไม่สมมาตรระหว่างสองทิศทาง
ค่าที่แก้อาการเบี้ยวตอนเดินหน้าจึงแก้ตอนถอยหลังไม่ได้

## โครงสร้างไฟล์ / What's in here

| โฟลเดอร์ | เนื้อหา |
|---|---|
| [`software/ground-station/`](software/ground-station/) | โปรแกรม Python ฝั่ง PC ทั้งหมด (10 โมดูล) |
| [`firmware/arduino/`](firmware/arduino/) | เฟิร์มแวร์หุ่นยนต์ MeOrion |
| [`docs/`](docs/) | [เล่มรายงานฉบับเต็ม 221 หน้า](docs/project-report-esslingen.pdf) |

## ต้องใช้อะไรบ้าง / Requirements

```bash
pip install pyserial matplotlib
```

Python 3 + Tkinter (มากับ Python บน Windows อยู่แล้ว) · เรดาร์ RFbeam K-LD7 · หุ่นยนต์ Makeblock MeOrion + โมดูล Bluetooth
