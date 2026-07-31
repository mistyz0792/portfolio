"""
bluetooth_io.py - Classic SPP communication with the Makeblock robot.

After pairing, the BT module appears on Windows as a virtual COM port,
so we just use pyserial. Two jobs: write commands (sync) and read
telemetry lines back (daemon thread + on_telemetry callback). The
optional on_tx callback mirrors outgoing commands to the GUI's TX log.

The BLE half of the dual-mode module is what the phone talks to in
Phase 1 - PC <-> robot uses Classic SPP instead because Windows exposes
it as a normal serial port.
"""

import threading
import time

import serial


class BluetoothRobot:
    def __init__(self, on_telemetry=None, on_tx=None):
        self.ser = None
        self.on_telemetry = on_telemetry
        self.on_tx = on_tx
        self._reader_thread = None
        self._reader_running = False

    @property
    def is_connected(self):
        return self.ser is not None and self.ser.is_open

    # --- connection lifecycle ---
    def connect(self, com_port: str, baud: int = 115200):
        """Open the COM port and start the background reader thread."""
        self.ser = serial.Serial(com_port, baud, timeout=0.1)
        # Windows needs ~300 ms after open() before the SPP link is
        # actually usable - without this the first command gets dropped.
        time.sleep(0.3)
        self._reader_running = True
        self._reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
        self._reader_thread.start()

    def disconnect(self):
        """Stop the reader and close the COM port."""
        self._reader_running = False
        if self._reader_thread is not None:
            self._reader_thread.join(timeout=1.0)
            self._reader_thread = None
        if self.ser is not None and self.ser.is_open:
            self.ser.close()
        self.ser = None

    # --- sending commands ---
    def send_cmd(self, cmd: str):
        """Send a command. Single char (e.g. 'F') or multi-char like 'OFL+5'."""
        if not self.is_connected:
            return
        try:
            # Multi-char commands need '\n' so the firmware knows when
            # the value ends. Single-char Phase 1 commands don't.
            if len(cmd) > 1:
                payload = (cmd + "\n").encode("utf-8")
            else:
                payload = cmd.encode("utf-8")
            self.ser.write(payload)
            self.ser.flush()
            if self.on_tx is not None:
                try:
                    self.on_tx(cmd)
                except Exception:
                    pass
        except (serial.SerialException, OSError):
            # Port vanished mid-write - treat link as dead.
            self.disconnect()

    # --- background reader ---
    def _reader_loop(self):
        """Read telemetry lines from the robot and dispatch to callback."""
        buf = bytearray()
        while self._reader_running and self.ser is not None and self.ser.is_open:
            try:
                data = self.ser.read(64)
            except (serial.SerialException, OSError):
                break
            if not data:
                continue
            buf.extend(data)
            # BT often splits one print() across two read()s, so
            # accumulate until we see a newline.
            while b"\n" in buf:
                line, _, rest = buf.partition(b"\n")
                buf = bytearray(rest)
                text = line.decode("utf-8", errors="ignore").strip()
                if text and self.on_telemetry is not None:
                    try:
                        self.on_telemetry(text)
                    except Exception:
                        pass
