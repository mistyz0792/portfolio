// --- ส่วนของการประกาศไลบรารี, ค่าคงที่ และตัวแปร ---

#include <Wire.h>                     // นำเข้าไลบรารี Wire สำหรับการสื่อสารผ่าน I2C
#include <Preferences.h>              // นำเข้าไลบรารี Preferences สำหรับการบันทึกข้อมูลลงหน่วยความจำถาวร (สำหรับ ESP32)
#define SLAVE_ADDR 0x09               // กำหนดหมายเลขประจำตัวของอุปกรณ์ (Slave Address) บนบัส I2C ให้เป็น 0x09
#define PULSE_PIN 14                  // กำหนดให้ขา GPIO 14 เป็นขาสำหรับส่งสัญญาณพัลส์ (Pulse)
#define REVERSE_PIN 27                // กำหนดให้ขา GPIO 27 เป็นขาสำหรับกำหนดทิศทางการหมุน (Direction/Reverse)
#define RELAY_PIN 25                  // กำหนดให้ขา GPIO 25 เป็นขาสำหรับควบคุมรีเลย์
#define SENSOR_PIN 26                 // กำหนดให้ขา GPIO 26 เป็นขาสำหรับรับสัญญาณจากเซ็นเซอร์
Preferences prefs;                    // สร้างอ็อบเจกต์ชื่อ prefs จากคลาส Preferences เพื่อใช้จัดการการบันทึกค่า

// --- ตัวแปร Global ที่ใช้ควบคุมการเคลื่อนที่ ---

volatile float targetAngle = 0;       // ตัวแปรเก็บองศาเป้าหมายที่ต้องการให้มอเตอร์หมุน (volatile เพราะอาจถูกแก้ไขใน onReceive)
volatile uint16_t freqHz = 1000;      // ตัวแปรเก็บความเร็วในการหมุนในหน่วยเฮิรตซ์ (Hz)
volatile uint32_t pulseCount = 0;     // ตัวแปรเก็บจำนวนพัลส์ทั้งหมดที่ต้องส่งออกไป
volatile bool reverseMode = false;    // ตัวแปรเก็บทิศทางการหมุน (false = ปกติ, true = หมุนกลับทาง)

// --- ตัวแปรสถานะ (Flags) ---

volatile bool dataReceived = false;   // Flag บอกว่าได้รับข้อมูลใหม่จาก Master แล้วหรือยัง
volatile bool homingRequested = false; // Flag บอกว่ามีการร้องขอให้เริ่มกระบวนการ Homing (หาตำแหน่งเริ่มต้น) หรือไม่
volatile bool motionDone = true;      // Flag บอกสถานะการเคลื่อนที่ (true = เสร็จสิ้น/หยุดนิ่ง, false = กำลังทำงาน)

// --- ตัวแปรอื่นๆ ที่ใช้ภายในโปรแกรม ---

volatile int16_t jogFreqHz = 0;       // ตัวแปรเก็บความเร็วสำหรับโหมด Jog (หมุนต่อเนื่อง) ค่า +,- บอกทิศทาง, 0 คือหยุด
uint32_t pulsesRemaining = 0;         // ตัวแปรนับจำนวนพัลส์ที่ยังเหลือที่ต้องส่ง
bool pulseState = LOW;                // ตัวแปรเก็บสถานะปัจจุบันของขา PULSE_PIN (HIGH หรือ LOW)
unsigned long lastToggleMicros = 0;   // ตัวแปรเก็บเวลา (หน่วยไมโครวินาที) ที่ส่งพัลส์ครั้งล่าสุด
unsigned int pulseIntervalMicros = 500; // ตัวแปรเก็บระยะห่างระหว่างการสลับสถานะพัลส์ (ครึ่งหนึ่งของคาบเวลา)
uint32_t PPR = 1600;                  // ตัวแปรเก็บค่า Pulses Per Revolution (จำนวนพัลส์ต่อการหมุน 1 รอบ)
bool relayState = false;              // ตัวแปรเก็บสถานะปัจจุบันของรีเลย์


// --- ฟังก์ชันที่จะถูกเรียกเมื่อได้รับข้อมูลผ่าน I2C ---

void onReceive(int numBytes) {        // ฟังก์ชันนี้จะทำงานอัตโนมัติเมื่อ Master ส่งข้อมูลมาให้
 if (numBytes < 1) return;            // ถ้าไม่มีข้อมูลส่งมา (จำนวนไบต์น้อยกว่า 1) ให้ออกจากฟังก์ชัน
 byte mode = Wire.read();             // อ่านข้อมูลไบต์แรกเพื่อใช้เป็นตัวกำหนดโหมดคำสั่ง

 // โหมด 0x01: ควบคุมด้วยองศา
 if (mode == 0x01 && numBytes == 1 + 4 + 2) { // ถ้าเป็นโหมด 0x01 และได้รับข้อมูลครบ 7 ไบต์ (mode+angle+freq)
   motionDone = false;                // ตั้งสถานะเป็น "กำลังทำงาน"
   jogFreqHz = 0;                     // ยกเลิกโหมด Jog ถ้าทำงานอยู่
   union { byte b[4]; float f; } angleConv; // สร้าง union เพื่อแปลงข้อมูล 4 ไบต์เป็น float
   for (int i = 0; i < 4; i++) angleConv.b[i] = Wire.read(); // อ่านข้อมูล 4 ไบต์สำหรับค่าองศา
   targetAngle = angleConv.f;         // แปลงค่า 4 ไบต์เป็น float แล้วเก็บใน targetAngle
   freqHz = Wire.read() | (Wire.read() << 8); // อ่านข้อมูล 2 ไบต์สำหรับค่าความถี่
   reverseMode = (targetAngle < 0);   // กำหนดทิศทาง: ถ้าองศาเป็นลบให้หมุนกลับทาง
   float absAngle = abs(targetAngle); // หาค่าองศาสัมบูรณ์ (ไม่คิดเครื่องหมาย)
   pulseCount = (uint32_t)((absAngle / 360.0) * PPR); // คำนวณจำนวนพัลส์จากองศาและค่า PPR
   pulseIntervalMicros = 500000 / freqHz; // คำนวณระยะห่างระหว่างพัลส์จากความเร็ว
   pulsesRemaining = pulseCount * 2;  // ตั้งค่าจำนวนพัลส์ที่ต้องส่ง (x2 เพราะ 1 พัลส์คือ HIGH->LOW)
   dataReceived = true;               // ตั้ง Flag ว่าได้รับข้อมูลใหม่แล้ว
 }
 // โหมด 0x02: ควบคุมด้วยจำนวนพัลส์
 else if (mode == 0x02 && numBytes == 1 + 4 + 2) { // ถ้าเป็นโหมด 0x02 และได้รับข้อมูลครบ 7 ไบต์ (mode+pulse+freq)
   motionDone = false;                // ตั้งสถานะเป็น "กำลังทำงาน"
   jogFreqHz = 0;                     // ยกเลิกโหมด Jog
   union { byte b[4]; int32_t i; } pulseConv; // สร้าง union เพื่อแปลง 4 ไบต์เป็น int32_t
   for (int i = 0; i < 4; i++) pulseConv.b[i] = Wire.read(); // อ่านข้อมูล 4 ไบต์สำหรับจำนวนพัลส์
   int32_t signedPulseCount = pulseConv.i; // แปลงค่า 4 ไบต์เป็นจำนวนพัลส์แบบมีเครื่องหมาย
   reverseMode = (signedPulseCount < 0); // กำหนดทิศทางจากเครื่องหมายของจำนวนพัลส์
   pulseCount = abs(signedPulseCount); // หาจำนวนพัลส์สัมบูรณ์
   freqHz = Wire.read() | (Wire.read() << 8); // อ่านค่าความถี่ 2 ไบต์
   pulseIntervalMicros = 500000 / freqHz; // คำนวณระยะห่างพัลส์
   pulsesRemaining = pulseCount * 2;  // ตั้งค่าจำนวนพัลส์ที่ต้องส่ง
   dataReceived = true;               // ตั้ง Flag ว่าได้รับข้อมูลใหม่แล้ว
 }
 // โหมด 0x03: ตั้งค่า PPR
 else if (mode == 0x03 && numBytes == 1 + 4) { // ถ้าเป็นโหมด 0x03 และได้รับข้อมูลครบ 5 ไบต์ (mode+PPR)
   uint32_t newPPR = Wire.read() | (Wire.read() << 8) | (Wire.read() << 16) | (Wire.read() << 24); // อ่านค่า PPR ใหม่ 4 ไบต์
   if (newPPR >= 1 && newPPR <= 1000000) { // ตรวจสอบว่าค่า PPR อยู่ในช่วงที่เหมาะสม
     PPR = newPPR;                    // อัปเดตค่า PPR ในโปรแกรม
     prefs.begin("config", false);    // เปิด Preferences ในโหมดเขียน
     prefs.putUInt("ppr", PPR);       // บันทึกค่า PPR ใหม่ลงหน่วยความจำ
     prefs.end();                     // ปิด Preferences เพื่อยืนยันการบันทึก
   }
 }
 // โหมด 0x04: ควบคุมรีเลย์
 else if (mode == 0x04 && numBytes == 1 + 1) { // ถ้าเป็นโหมด 0x04 และได้รับข้อมูลครบ 2 ไบต์ (mode+cmd)
   byte relayCmd = Wire.read();       // อ่านคำสั่ง 1 ไบต์
   relayState = (relayCmd != 0);      // ถ้าคำสั่งไม่ใช่ 0 ให้สถานะเป็น true (เปิด), ถ้าเป็น 0 ให้เป็น false (ปิด)
   digitalWrite(RELAY_PIN, relayState ? LOW : HIGH); // ส่งสัญญาณควบคุมรีเลย์ (แบบ Active Low)
 }
 // โหมด 0x05: สั่ง Homing
 else if (mode == 0x05) {              // ถ้าเป็นโหมด 0x05
   motionDone = false;                // ตั้งสถานะเป็น "กำลังทำงาน"
   jogFreqHz = 0;                     // ยกเลิกโหมด Jog
   homingRequested = true;            // ตั้ง Flag เพื่อให้ loop() เริ่มกระบวนการ Homing
 }
 // โหมด 0x07: ควบคุมแบบ Jog
 else if (mode == 0x07 && numBytes == 1 + 2) { // ถ้าเป็นโหมด 0x07 และได้รับข้อมูลครบ 3 ไบต์ (mode+freq)
    union { byte b[2]; int16_t i; } freqConv; // สร้าง union เพื่อแปลง 2 ไบต์เป็น int16_t
    freqConv.b[0] = Wire.read();      // อ่านไบต์ต่ำ
    freqConv.b[1] = Wire.read();      // อ่านไบต์สูง
    jogFreqHz = freqConv.i;           // แปลงค่า 2 ไบต์เป็นความเร็ว Jog (มีเครื่องหมายบอกทิศทาง)
    pulsesRemaining = 0;              // หยุดการเคลื่อนที่แบบกำหนดเป้าหมายทันที
    motionDone = (jogFreqHz == 0);    // ถ้าความเร็วเป็น 0 ให้ตั้งสถานะเป็น "เสร็จสิ้น" ทันที
 }
}

// --- ฟังก์ชันที่จะถูกเรียกเมื่อ Master ร้องขอข้อมูล ---

void onRequestHandler() {             // ฟังก์ชันนี้จะทำงานอัตโนมัติเมื่อ Master ขอข้อมูล
 byte status = motionDone ? 1 : 0;    // แปลงสถานะ motionDone (true/false) เป็น 1 (เสร็จ) หรือ 0 (ทำงาน)
 Wire.write(status);                  // ส่งค่าสถานะกลับไปให้ Master
}

// --- ฟังก์ชัน setup() ที่ทำงานครั้งเดียวเมื่อเปิดเครื่อง ---

void setup() {
 pinMode(PULSE_PIN, OUTPUT);            // ตั้งค่า PULSE_PIN เป็น Output
 pinMode(REVERSE_PIN, OUTPUT);          // ตั้งค่า REVERSE_PIN เป็น Output
 pinMode(RELAY_PIN, OUTPUT);            // ตั้งค่า RELAY_PIN เป็น Output
 pinMode(SENSOR_PIN, INPUT_PULLUP);     // ตั้งค่า SENSOR_PIN เป็น Input พร้อมเปิดใช้งาน Pull-up resistor ภายใน
 digitalWrite(PULSE_PIN, LOW);          // ตั้งค่าเริ่มต้นให้ PULSE_PIN เป็น LOW
 digitalWrite(REVERSE_PIN, LOW);        // ตั้งค่าเริ่มต้นให้ REVERSE_PIN เป็น LOW
 digitalWrite(RELAY_PIN, HIGH);         // ตั้งค่าเริ่มต้นให้ RELAY_PIN เป็น HIGH (รีเลย์ดับ)
 Serial.begin(115200);                // เริ่มการสื่อสารแบบ Serial ที่ความเร็ว 115200 bps
 Wire.begin(SLAVE_ADDR);              // เริ่มการทำงาน I2C ในโหมด Slave ด้วย Address ที่กำหนด
 Wire.onReceive(onReceive);           // ลงทะเบียนฟังก์ชัน onReceive ให้เป็นตัวจัดการเมื่อได้รับข้อมูล
 Wire.onRequest(onRequestHandler);    // ลงทะเบียนฟังก์ชัน onRequestHandler ให้เป็นตัวจัดการเมื่อถูกร้องขอข้อมูล
 prefs.begin("config", true);         // เปิด Preferences ในโหมดอ่านอย่างเดียว
 PPR = prefs.getUInt("ppr", 1600);    // โหลดค่า ppr ที่เคยบันทึกไว้, ถ้าไม่มีให้ใช้ค่าเริ่มต้น 1600
 prefs.end();                         // ปิด Preferences
}

// --- ฟังก์ชัน loop() ที่ทำงานวนซ้ำไปเรื่อยๆ ---

void loop() {
  // ส่วนจัดการข้อมูลที่ได้รับใหม่
  if (dataReceived) {                 // ถ้ามี Flag ว่าได้รับข้อมูลใหม่
    digitalWrite(REVERSE_PIN, reverseMode ? HIGH : LOW); // ให้ตั้งทิศทางการหมุนตามที่ได้รับ
    dataReceived = false;             // ล้าง Flag เพื่อรอรับข้อมูลชุดถัดไป
  }

  // ส่วนจัดการการลดความเร็ว (Ramp Down)
  uint32_t rampDownStart = pulseCount * 0.4; // คำนวณจุดที่จะเริ่มลดความเร็ว (40% สุดท้ายของระยะทาง)
  uint32_t pulseSent = (pulseCount * 2) - pulsesRemaining; // คำนวณจำนวนพัลส์ที่ส่งไปแล้ว (ยังไม่ได้ใช้ในโค้ดส่วนนี้)
  unsigned int currentPulseInterval = pulseIntervalMicros; // สร้างตัวแปรเก็บระยะห่างพัลส์ปัจจุบัน

  // ส่วนสร้างพัลส์ตามเป้าหมาย (Angle/Pulse mode)
  if (pulsesRemaining > 0) {          // ถ้ายังเหลือพัลส์ที่ต้องส่ง
    // ตรวจสอบว่าถึงโซนลดความเร็วหรือยัง
    if (pulsesRemaining <= rampDownStart && pulseCount > 0) { // ถ้าเข้าสู่ช่วง 40% สุดท้าย
      float ratio = (float)pulsesRemaining / (float)rampDownStart; // คำนวณสัดส่วนระยะทางที่เหลือ (ลดจาก 1.0 -> 0.0)
      float minFreqRatio = 0.6;       // กำหนดว่าต้องการให้ความเร็วลดลงไปต่ำสุดที่ 60% ของความเร็วเดิม
      float freqRatio = minFreqRatio + (1.0 - minFreqRatio) * ratio; // คำนวณสัดส่วนความเร็วปัจจุบันแบบแปรผันเชิงเส้น
      unsigned int minPulseInterval = 500000 / (freqHz * minFreqRatio); // คำนวณระยะห่างพัลส์ที่ยาวที่สุด (ความเร็วต่ำสุด)
      currentPulseInterval = (unsigned int)(pulseIntervalMicros / freqRatio); // คำนวณระยะห่างพัลส์ปัจจุบัน
      if (currentPulseInterval > minPulseInterval) currentPulseInterval = minPulseInterval; // ป้องกันไม่ให้ค่าเกินที่คำนวณไว้
    }

    // สร้างพัลส์ตามเวลาที่คำนวณได้
    unsigned long now = micros();     // อ่านเวลาปัจจุบัน
    if (now - lastToggleMicros >= currentPulseInterval) { // ถ้าเวลาผ่านไปนานกว่าระยะห่างที่กำหนด
      lastToggleMicros = now;         // อัปเดตเวลาล่าสุด
      pulseState = !pulseState;       // สลับสถานะของพัลส์ (LOW <-> HIGH)
      digitalWrite(PULSE_PIN, pulseState); // ส่งสถานะใหม่ไปที่ขาพัลส์
      pulsesRemaining--;              // ลดจำนวนพัลส์ที่เหลือลง 1
    }
  }
  // ส่วนสร้างพัลส์ต่อเนื่อง (Jog mode)
  else if (jogFreqHz != 0) {          // ถ้าไม่มีพัลส์เป้าหมาย แต่โหมด Jog ทำงานอยู่
    reverseMode = (jogFreqHz < 0);    // กำหนดทิศทางจากเครื่องหมายของความเร็ว
    digitalWrite(REVERSE_PIN, reverseMode ? HIGH : LOW); // ตั้งค่าทิศทาง
    uint16_t absFreq = abs(jogFreqHz); // หาค่าความเร็วสัมบูรณ์
    pulseIntervalMicros = 500000 / absFreq; // คำนวณระยะห่างพัลส์
    unsigned long now = micros();     // อ่านเวลาปัจจุบัน
    if (now - lastToggleMicros >= pulseIntervalMicros) { // ถ้าถึงเวลาที่ต้องส่งพัลส์
      lastToggleMicros = now;         // อัปเดตเวลา
      pulseState = !pulseState;       // สลับสถานะพัลส์
      digitalWrite(PULSE_PIN, pulseState); // ส่งพัลส์ออกไป
    }
  }
  // ส่วนจัดการเมื่อไม่มีการเคลื่อนที่
  else {                              // ถ้าไม่มีการเคลื่อนที่ใดๆ
    if (!motionDone) {                // ถ้าสถานะยังเป็น "กำลังทำงาน"
      motionDone = true;              // ให้เปลี่ยนเป็น "เสร็จสิ้น"
    }
    digitalWrite(PULSE_PIN, LOW);     // ดับขาพัลส์ให้เป็น LOW เสมอ
    digitalWrite(REVERSE_PIN, LOW);   // ดับขาทิศทาง
  }

  // --- ส่วนจัดการกระบวนการ Homing ---
  if (homingRequested) {              // ถ้ามี Flag ร้องขอให้ทำ Homing
   Serial.println("[HOMING] เริ่มการหมุนหา sensor..."); // พิมพ์ข้อความแจ้งเตือน
   switch (SLAVE_ADDR) {              // แยกการทำงานตามหมายเลข Address ของอุปกรณ์
   
   // --- Homing สำหรับแกน 1 (Address 0x08) ---
   case 0x08:  // แกน 1: หมุนย้อนกลับ -90°, ถ้าไม่เจอให้หมุนไปข้างหน้า +180°
   {
     Serial.println("[HOMING] แกน 1: หมุน -90° → +180°"); // แจ้งขั้นตอน
     digitalWrite(REVERSE_PIN, HIGH);  // ตั้งทิศทางหมุนย้อนกลับ
     bool found = false;              // ตัวแปรเช็คว่าเจอเซ็นเซอร์หรือยัง
     uint32_t steps1 = (uint32_t)((90.0 / 360.0) * PPR); // คำนวณจำนวนสเต็ปสำหรับ 90 องศา
     for (uint32_t i = 0; i < steps1; i++) { // วนลูปหมุนหาในระยะ 90 องศาแรก
       if (digitalRead(SENSOR_PIN) == HIGH) { // ถ้าเจอเซ็นเซอร์
         found = true;                // ตั้ง Flag ว่าเจอแล้ว
         Serial.printf("[HOMING] แกน 1 เจอ sensor ที่ -%lu สเต็ป\n", i); // แจ้งตำแหน่งที่เจอ
         uint32_t extraSteps = (uint32_t)((6.5 / 360.0) * PPR); // คำนวณสเต็ปเพื่อหมุนต่ออีก 6.5 องศา
         for (uint32_t j = 0; j < extraSteps; j++) { // วนลูปหมุนต่อ
            digitalWrite(PULSE_PIN, HIGH); delayMicroseconds(pulseIntervalMicros);
            digitalWrite(PULSE_PIN, LOW);  delayMicroseconds(pulseIntervalMicros);
          }
          Serial.printf("[HOMING] เดินต่ออีก %.1f องศา (%lu สเต็ป)\n", 6.5, extraSteps); // แจ้งผล
          break;                      // ออกจากลูปการค้นหา
       }
       digitalWrite(PULSE_PIN, HIGH); delayMicroseconds(pulseIntervalMicros); // สร้างพัลส์ 1 ลูก
       digitalWrite(PULSE_PIN, LOW);  delayMicroseconds(pulseIntervalMicros); // (จบ 1 พัลส์)
     }
     if (!found) {                    // ถ้าการค้นหาครั้งแรกไม่เจอ
        digitalWrite(REVERSE_PIN, LOW);  // ให้เปลี่ยนทิศทางเป็นเดินหน้า
        uint32_t steps2 = (uint32_t)((180.0 / 360.0) * PPR); // คำนวณสเต็ปสำหรับ 180 องศา
        for (uint32_t i = 0; i < steps2; i++) { // วนลูปหมุนหาอีกครั้ง
        found = true;                // ตั้ง Flag ว่าเจอแล้ว
          if (digitalRead(SENSOR_PIN) == HIGH) { // ถ้าเจอเซ็นเซอร์
            Serial.printf("[HOMING] แกน 1 เจอ sensor ตอน +%lu สเต็ป\n", i); // แจ้งตำแหน่ง
            uint32_t extraSteps = (uint32_t)((5.95 / 360.0) * PPR); // คำนวณสเต็ปเพื่อหมุนต่อ 5.95 องศา
            for (uint32_t j = 0; j < extraSteps; j++) { // วนลูปหมุนต่อ
              digitalWrite(PULSE_PIN, HIGH); delayMicroseconds(pulseIntervalMicros);
              digitalWrite(PULSE_PIN, LOW);  delayMicroseconds(pulseIntervalMicros);
            }
            Serial.printf("[HOMING] เดินต่ออีก %.1f องศา (%lu สเต็ป)\n", 5.95, extraSteps); // แจ้งผล
            break;                    // ออกจากลูป
          }
          digitalWrite(PULSE_PIN, HIGH); delayMicroseconds(pulseIntervalMicros); // สร้างพัลส์
          digitalWrite(PULSE_PIN, LOW);  delayMicroseconds(pulseIntervalMicros);
        }
      }
     digitalWrite(REVERSE_PIN, LOW);   // คืนค่าทิศทางเป็นปกติ
     homingRequested = false;          // ล้าง Flag การร้องขอ Homing
     motionDone = true;                // ตั้งสถานะว่าทำงานเสร็จแล้ว
     break;                            // จบ case 0x08
   }
   
   // --- Homing สำหรับแกน 2 (Address 0x09) ---
   case 0x09:  // แกน 2: หมุนไปข้างหน้า +115°, ถ้าไม่เจอให้หมุนย้อนกลับ -180°
   {
     Serial.println("[HOMING] แกน 2: หมุน +115° → -180°"); // แจ้งขั้นตอน (ข้อความอาจไม่ตรงกับองศาในโค้ด)
     digitalWrite(REVERSE_PIN, LOW);   // ตั้งทิศทางหมุนไปข้างหน้า (ที่จริง HIGH/LOW ขึ้นกับการต่อสาย)
     bool found = false;               // ตัวแปรเช็คว่าเจอเซ็นเซอร์
     uint32_t steps1 = (uint32_t)((115.0 / 360.0) * PPR); // คำนวณสเต็ปสำหรับ 115 องศา
     for (uint32_t i = 0; i < steps1; i++) { // วนลูปค้นหา
       if (digitalRead(SENSOR_PIN) == HIGH) { // ถ้าเจอเซ็นเซอร์
         found = true ;               // ตั้ง Flag ว่าเจอ
         Serial.printf("[HOMING] แกน 2 เจอ sensor ที่ +%lu สเต็ป\n", i); // แจ้งตำแหน่ง
         uint32_t extraSteps = (uint32_t)((2 / 360.0) * PPR); // คำนวณสเต็ปเพื่อหมุนต่อ 2 องศา
         for (uint32_t j = 0; j < extraSteps; j++) { // วนลูปหมุนต่อ
            digitalWrite(PULSE_PIN, HIGH); delayMicroseconds(pulseIntervalMicros);
            digitalWrite(PULSE_PIN, LOW);  delayMicroseconds(pulseIntervalMicros);
          }
          Serial.printf("[HOMING] เดินต่ออีก %.1f องศา (%lu สเต็ป)\n", 2, extraSteps); // แจ้งผล
          break;                      // ออกจากลูป
       }
       digitalWrite(PULSE_PIN, HIGH); delayMicroseconds(pulseIntervalMicros); // สร้างพัลส์
       digitalWrite(PULSE_PIN, LOW);  delayMicroseconds(pulseIntervalMicros);
     }
     if (!found) {                     // ถ้าครั้งแรกไม่เจอ
       digitalWrite(REVERSE_PIN, HIGH); // เปลี่ยนทิศทางเป็นถอยหลัง
       uint32_t steps2 = (uint32_t)((180.0 / 360.0) * PPR); // คำนวณสเต็ปสำหรับ 180 องศา
       for (uint32_t i = 0; i < steps2; i++) { // วนลูปค้นหาอีกครั้ง
       found = true;                // ตั้ง Flag ว่าเจอแล้ว
        if (digitalRead(SENSOR_PIN) == HIGH) { // ถ้าเจอเซ็นเซอร์
           Serial.printf("[HOMING] แกน 2 เจอ sensor ตอน -%lu สเต็ป\n", i); // แจ้งตำแหน่ง
           uint32_t extraSteps = (uint32_t)((1.35 / 360.0) * PPR); // คำนวณสเต็ปเพื่อหมุนต่อ 1.35 องศา
          for (uint32_t j = 0; j < extraSteps; j++) { // วนลูปหมุนต่อ
            digitalWrite(PULSE_PIN, HIGH); delayMicroseconds(pulseIntervalMicros);
            digitalWrite(PULSE_PIN, LOW);  delayMicroseconds(pulseIntervalMicros);
          }
          Serial.printf("[HOMING] เดินต่ออีก %.1f องศา (%lu สเต็ป)\n", 1.35, extraSteps); // แจ้งผล
          break;                     // ออกจากลูป
         }
         digitalWrite(PULSE_PIN, HIGH); delayMicroseconds(pulseIntervalMicros); // สร้างพัลส์
         digitalWrite(PULSE_PIN, LOW);  delayMicroseconds(pulseIntervalMicros);
       }
     }
     digitalWrite(REVERSE_PIN, LOW);  // คืนค่าทิศทาง
     homingRequested = false;         // ล้าง Flag
     motionDone = true;               // ตั้งสถานะเสร็จสิ้น
     break;                           // จบ case 0x09
   }
   
   // --- Homing สำหรับแกน 3 (Address 0x0A) ---
   case 0x0A:  // แกน 3: หมุนไปข้างหน้าทีละสเต็ปจนเจอ
   {
     Serial.println("[HOMING] แกน 3: หมุน +1 step → จนกว่าจะเจอ"); // แจ้งขั้นตอน
     digitalWrite(REVERSE_PIN, LOW);  // ตั้งทิศทางเดินหน้า
     uint32_t steps = (uint32_t)((360.0 / 360.0) * PPR); // กำหนดระยะค้นหาสูงสุด 1 รอบ
     for (uint32_t i = 0; i < steps; i++) { // วนลูปค้นหา
       if (digitalRead(SENSOR_PIN) == LOW) { // ถ้าเจอเซ็นเซอร์ (สังเกตว่าเช็ค LOW)
         Serial.printf("[HOMING] แกน 3 เจอ sensor ที่ +%lu สเต็ป\n", i); // แจ้งตำแหน่ง
         break;                     // ออกจากลูป
       }
       digitalWrite(PULSE_PIN, HIGH); delayMicroseconds(pulseIntervalMicros); // สร้างพัลส์
       digitalWrite(PULSE_PIN, LOW);  delayMicroseconds(pulseIntervalMicros);
     }
     digitalWrite(REVERSE_PIN, LOW);   // คืนค่าทิศทาง
     homingRequested = false;          // ล้าง Flag
     motionDone = true;                // ตั้งสถานะเสร็จสิ้น
     break;                            // จบ case 0x0A
   }
   
   // --- Homing สำหรับแกน 4 (Address 0x0B) ---
   case 0x0B:  // แกน 4: หมุนย้อนกลับไปเรื่อยๆ จนกว่าจะเจอ
   {
     Serial.println("[HOMING] แกน 4: กำลังหมุนหาเซ็นเซอร์..."); // แจ้งเตือน
     digitalWrite(REVERSE_PIN, HIGH); // กำหนดทิศทางหมุนย้อนกลับ
    
     while (true) {                   // วนลูปไปเรื่อยๆ ไม่มีสิ้นสุด
       if (digitalRead(SENSOR_PIN) == HIGH) { // ถ้าเจอเซ็นเซอร์
         Serial.println("[HOMING] แกน 4 เจอเซ็นเซอร์แล้ว -> หยุดทันที"); // แจ้งผล
         break;                       // ให้กระโดดออกจากลูป while ทันที
       }
       
       // ถ้ายังไม่เจอ ก็จะสร้างพัลส์ให้หมุนต่อไป
       digitalWrite(PULSE_PIN, HIGH); delayMicroseconds(pulseIntervalMicros);
       digitalWrite(PULSE_PIN, LOW);  delayMicroseconds(pulseIntervalMicros);
     }
     
     digitalWrite(REVERSE_PIN, LOW);  // เมื่อเจอเซ็นเซอร์แล้ว ให้หยุดมอเตอร์
     homingRequested = false;         // ล้าง Flag
     motionDone = true;               // ตั้งสถานะว่าเสร็จสิ้น
     break;                           // จบ case 0x0B
   }
  } // สิ้นสุด switch
 } // สิ้นสุด if(homingRequested)
} // สิ้นสุด loop()