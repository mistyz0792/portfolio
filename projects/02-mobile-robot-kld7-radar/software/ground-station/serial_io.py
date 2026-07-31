"""
serial_io.py
Handles all UART communication with the K-LD7 radar sensor.
"""

import serial
import serial.tools.list_ports


# K-LD7 command map for the INIT and configuration commands
INIT_BAUD_VALUE = 3   # 3 = 2,000,000 baud (see datasheet p.18)
TARGET_BAUDRATE = 2_000_000

RANGE_MAP = {"5m": 0, "10m": 1, "30m": 2, "100m": 3}
SPEED_MAP = {"12.5 km/h": 0, "25 km/h": 1, "50 km/h": 2, "100 km/h": 3}


def list_com_ports():
    """Return a list of all detected COM ports."""
    return [p.device for p in serial.tools.list_ports.comports()]


def open_port(port_name):
    """Open a K-LD7 serial port with the default factory settings."""
    return serial.Serial(
        port_name,
        baudrate=115200,
        parity=serial.PARITY_EVEN,
        stopbits=serial.STOPBITS_ONE,
        bytesize=serial.EIGHTBITS,
        timeout=3,
    )


def send_cmd(com, cmd, value):
    """Send a 4-byte command to the K-LD7 and return its 9-byte response."""
    packet = (
        bytes(cmd, "utf-8")
        + (4).to_bytes(4, byteorder="little")
        + (value).to_bytes(4, byteorder="little")
    )
    com.write(packet)
    return com.read(9)


def init_handshake(com):
    """Send INIT command and switch baud rate to 2 MHz."""
    header = bytes("INIT", "utf-8")
    length = (4).to_bytes(4, byteorder="little")
    value = (INIT_BAUD_VALUE).to_bytes(4, byteorder="little")
    com.write(header + length + value)

    resp = com.read(9)
    if len(resp) < 9 or resp[8] != 0:
        return False  # K-LD7 did not acknowledge

    com.baudrate = TARGET_BAUDRATE
    return True


def configure_sensor(com, range_str, speed_str):
    """Apply distance range and speed range from GUI selections."""
    send_cmd(com, "RRAI", RANGE_MAP.get(range_str, 0))
    send_cmd(com, "RSPI", SPEED_MAP.get(speed_str, 1))


def request_frame(com):
    """
    Request the next TDAT frame from the K-LD7.
    Returns (distance_cm, speed_kmh, angle_deg) or None when no target.
    """
    com.write(
        bytes("GNFD", "utf-8")
        + (4).to_bytes(4, byteorder="little")
        + (0x08).to_bytes(4, byteorder="little")
    )

    resp = com.read(9)
    if len(resp) < 9 or resp[8] != 0:
        return None

    msg = com.read(8)
    if len(msg) < 8:
        return None

    payload_len = int.from_bytes(msg[4:8], byteorder="little")
    if payload_len < 8:
        return None  # No target detected

    raw = com.read(8)
    if len(raw) < 8:
        return None

    distance = int.from_bytes(raw[0:2], byteorder="little", signed=False)
    speed = int.from_bytes(raw[2:4], byteorder="little", signed=True) / 100.0
    angle = int.from_bytes(raw[4:6], byteorder="little", signed=True) / 100.0
    return distance, speed, angle


def close_session(com):
    """Send GBYE and close the port."""
    if com and com.is_open:
        try:
            com.write(bytes("GBYE", "utf-8") + (0).to_bytes(4, byteorder="little"))
            com.read(9)
            com.close()
        except Exception:
            pass
