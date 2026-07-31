/*
 * MeOrionBot_Extra.ino - Phase 2 robot firmware.
 *
 * Extends the Phase 1 sketch with multi-character commands that let
 * the PC change PWM at runtime, apply per-direction trim offsets,
 * and query state. Phase 1 single-char commands still work
 * unchanged, so the mobile app stays compatible.
 *
 * New commands:
 *   SP<n>           set base PWM (50..255)
 *   OFL<+/-n>       forward-left trim offset
 *   OFR<+/-n>       forward-right trim offset
 *   OBL<+/-n>       backward-left trim offset
 *   OBR<+/-n>       backward-right trim offset
 *   OL/OR<+/-n>     legacy: apply to both forward AND backward
 *   Q               query speed + offsets
 *
 * Note: on this build M1 is wired to the RIGHT wheel and M2 to the
 * LEFT wheel. The variable names refer to the LOGICAL wheel, not the
 * M-port, so the code reads naturally even though the wiring is
 * mirrored.
 */

#include "MeOrion.h"
#include <SoftwareSerial.h>

MeDCMotor leftMotor(M1);
MeDCMotor rightMotor(M2);
MeUltrasonicSensor ultraSensor(PORT_3);
MeBluetooth bt(PORT_6);

int speed = 120;

// Two pairs of offsets because brushed DC motors have slightly
// asymmetric torque-current curves between forward and backward,
// so an offset that cancels forward drift won't cancel reverse drift.
int offsetLF = 0;     // left motor offset, Forward
int offsetRF = 0;     // right motor offset, Forward
int offsetLB = 0;     // left motor offset, Backward
int offsetRB = 0;     // right motor offset, Backward

float distance;
bool RobotConnected = false;
bool autoMode = false;


// === Drive helpers ============================================
void driveForward()  { leftMotor.run(  speed + offsetLF ); rightMotor.run((speed + offsetRF)); }
void driveBackward() { leftMotor.run(-(speed + offsetLB)); rightMotor.run( -(speed + offsetRB));  }

// In-place rotation ignores the offsets - the user is open-loop
// timing the spin and small PWM imbalance averages out over a turn.
void driveLeft()     { leftMotor.run( -speed); rightMotor.run( speed); }
void driveRight()    { leftMotor.run(speed); rightMotor.run(-speed); }
void stopRobot()     { leftMotor.run(0); rightMotor.run(0); }


// Visual heartbeat. Blink counts encode events:
//   1 = command received,  2 = speed/offset changed,
//   3 = connected,         5 = auto toggled,  10 = disconnected.
void blink(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_BUILTIN, HIGH); delay(100);
    digitalWrite(LED_BUILTIN, LOW);  delay(100);
  }
}


// Parse a signed integer like "+5", "-3", "0" terminated by '\n' or
// any non-digit. 1 s timeout is generous on purpose - inter-character
// delay on the BT bridge spikes to hundreds of ms occasionally.
int readSignedInt() {
  int value = 0;
  int sign = 1;
  unsigned long start = millis();
  bool gotDigit = false;
  while (millis() - start < 1000) {
    if (!bt.available()) continue;
    char c = bt.read();
    if (c == '\n' || c == '\r') break;
    if (c == '+') sign = 1;
    else if (c == '-') sign = -1;
    else if (c >= '0' && c <= '9') {
      value = value * 10 + (c - '0');
      gotDigit = true;
    } else {
      break;
    }
  }
  return gotDigit ? sign * value : 0;
}


// Peek-ahead helper for disambiguating S vs SP, O vs OFL/etc.
char waitChar(unsigned long timeout_ms) {
  unsigned long start = millis();
  while (millis() - start < timeout_ms) {
    if (bt.available()) return bt.read();
  }
  return 0;
}


// Phase 1 auto-avoidance: drive forward; on obstacle < 20 cm, stop,
// reverse, then spin left until > 30 cm. Two thresholds give the loop
// hysteresis so it doesn't oscillate at the edge.
void autoAvoid() {
  distance = ultraSensor.distanceCm();
  if (distance < 20) {
    stopRobot();             delay(200);
    leftMotor.run(-speed);   rightMotor.run(speed);
    delay(400);
    stopRobot();             delay(200);
    while (true) {
      leftMotor.run(speed);  rightMotor.run(speed);
      delay(100);
      distance = ultraSensor.distanceCm();
      if (distance > 30) { stopRobot(); delay(200); break; }
      // Manual override mid-spin so the user can take back control.
      if (bt.available()) {
        char cmd = bt.read();
        if (cmd == 'S' || cmd == 'A') {
          autoMode = false;  stopRobot();  return;
        }
      }
    }
  } else {
    driveForward();
  }
  delay(50);
}


void setup() {
  Serial.begin(115200);
  bt.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.println("Ready - Waiting for connecting");
}


void loop() {

  // WAITING state - ignore everything until 'C' arrives. Phase 1
  // handshake; keeps stray bytes from driving the motors at boot.
  if (!RobotConnected) {
    if (bt.available()) {
      char c = bt.read();
      Serial.print("Got: "); Serial.println(c);
      if (c == 'C') {
        RobotConnected = true;
        blink(3);
        Serial.println("Remote Connected!");
      }
    }
    return;
  }

  if (bt.available()) {
    char cmd = bt.read();

    // === O-family - per-direction trim offsets ===============
    // OFL+5\n  forward-left offset = +5
    // OFR-3\n  forward-right offset = -3
    // OBL+5\n  backward-left offset = +5
    // OBR-3\n  backward-right offset = -3
    //
    // Legacy 2-char OL/OR are still accepted and apply to BOTH
    // directions at once - retained for backward compatibility.
    if (cmd == 'O') {
      // 500 ms matches the PC-side post-blink settle. A shorter
      // timeout drops the second character on back-to-back commands.
      char a = waitChar(500);
      if (a == 0) return;

      bool legacy = (a == 'L' || a == 'R');
      char dirCh = 0;   // 'F' or 'B' for the new protocol
      char side = 0;    // 'L' or 'R'

      if (legacy) {
        side = a;
      } else if (a == 'F' || a == 'B') {
        dirCh = a;
        side = waitChar(500);
        // Unknown side - silently abandon. Better to drop one bad
        // command than write a wrong offset to the wrong motor.
        if (side != 'L' && side != 'R') return;
      } else {
        return;
      }

      int value = readSignedInt();
      value = constrain(value, -100, 100);

      if (legacy) {
        if (side == 'L') { offsetLF = value; offsetLB = value; }
        else             { offsetRF = value; offsetRB = value; }
      } else {
        if (dirCh == 'F' && side == 'L') offsetLF = value;
        else if (dirCh == 'F' && side == 'R') offsetRF = value;
        else if (dirCh == 'B' && side == 'L') offsetLB = value;
        else if (dirCh == 'B' && side == 'R') offsetRB = value;
      }

      // Echo back so the PC's RX log can confirm the value landed.
      bt.print("O");
      if (!legacy) bt.print(dirCh);
      bt.print(side); bt.print("="); bt.println(value);

      Serial.print("Offset ");
      if (!legacy) { Serial.print(dirCh); }
      Serial.print(side); Serial.print(": "); Serial.println(value);

      blink(2);
      return;
    }

    // === S vs SP - the only ambiguous case in the protocol ===
    // 'P' within 300 ms after 'S' => SP<n>. Anything else => stop.
    if (cmd == 'S') {
      char a = waitChar(300);
      if (a == 'P') {
        int value = readSignedInt();
        speed = constrain(value, 50, 255);
        bt.print("SP="); bt.println(speed);
        Serial.print("Speed set: "); Serial.println(speed);
        blink(2);
        return;
      } else if (a == 0) {
        autoMode = false;
        stopRobot();
        Serial.println("CMD: S");
        blink(1);
        return;
      } else {
        // Stray byte after S - treat as stop, swallow the byte.
        autoMode = false;
        stopRobot();
        Serial.println("CMD: S (with stray)");
        blink(1);
        return;
      }
    }

    // === Q - query speed + offsets ============================
    if (cmd == 'Q') {
      bt.print("Q: spd="); bt.print(speed);
      bt.print(" FL=");    bt.print(offsetLF);
      bt.print(" FR=");    bt.print(offsetRF);
      bt.print(" BL=");    bt.print(offsetLB);
      bt.print(" BR=");    bt.println(offsetRB);

      Serial.print("Query  speed=");  Serial.print(speed);
      Serial.print(" FL=");           Serial.print(offsetLF);
      Serial.print(" FR=");           Serial.print(offsetRF);
      Serial.print(" BL=");           Serial.print(offsetLB);
      Serial.print(" BR=");           Serial.println(offsetRB);
      return;
    }

    // === Phase 1 single-char commands =========================
    blink(1);
    Serial.print("CMD: "); Serial.println(cmd);

    switch (cmd) {
      // Any directional command clears autoMode - manual input wins.
      case 'F': autoMode = false; driveForward();  break;
      case 'B': autoMode = false; driveBackward(); break;
      case 'L': autoMode = false; driveLeft();     break;
      case 'R': autoMode = false; driveRight();    break;
      case '+':
        speed = min(speed + 20, 255);
        Serial.print("Speed: "); Serial.println(speed);
        blink(2);
        break;
      case '-':
        speed = max(speed - 20, 50);
        Serial.print("Speed: "); Serial.println(speed);
        blink(2);
        break;
      case 'A':
        autoMode = !autoMode;
        if (!autoMode) stopRobot();
        Serial.println(autoMode ? "Auto:ON" : "Auto:OFF");
        blink(5);
        break;
      case 'D':
        autoMode = false;
        RobotConnected = false;
        stopRobot();
        Serial.println("Disconnected");
        blink(10);
        return;
    }
  }

  if (autoMode) {
    autoAvoid();
    return;
  }

  // === Telemetry - throttled to ~10 Hz ======================
  // Loop runs at ~50 Hz (delay(20) below). Sending every iteration
  // would flood the BT link and starve the parser when the user is
  // sending offset commands. Counter: emit every 5th iteration.
  static uint8_t tel_counter = 0;
  if (++tel_counter >= 5) {
    tel_counter = 0;
    distance = ultraSensor.distanceCm();
    bt.print("D: ");  bt.print(distance, 1);
    bt.print(" Cm S: "); bt.println(speed);
  }

  delay(20);
}
