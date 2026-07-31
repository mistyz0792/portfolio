"""
robot_settings.py - persistent storage for motor calibration values.

Kept on the PC, not on the robot's EEPROM, because these values depend
on floor surface, battery level, and motor wear during a given test
session - re-tuning every couple of sessions is normal. Two robots can
also share the same firmware binary, only the JSON file differs.

Eight values:
    speed                   base PWM (50..255)
    L_F, R_F, L_B, R_B      per-direction trim offsets (-100..+100)
    rot_L_dps, rot_R_dps    measured rotation rate, deg/s
    linear_speed_cm_s       measured forward speed at the base PWM
"""

import json
import os
import time


SETTINGS_FILE = "motor_settings.json"

# DEFAULT is also the source of truth for which keys exist - load_settings
# iterates over DEFAULT so older saved files (missing newer keys) still
# load correctly.
DEFAULT = {
    "speed": 120,
    "L_F": 0, "R_F": 0, "L_B": 0, "R_B": 0,
    "rot_L_dps": 150.0,
    "rot_R_dps": 150.0,
    "linear_speed_cm_s": 30.0,
}


def load_settings():
    """Load motor_settings.json or return DEFAULT on any error."""
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, "r") as f:
                d = json.load(f)
            out = {}
            for k, default_v in DEFAULT.items():
                v = d.get(k, default_v)
                # JSON gives us floats for every number; coerce back so
                # the int formatter "OFL{:+d}" doesn't blow up.
                if isinstance(default_v, float):
                    out[k] = float(v)
                else:
                    out[k] = int(v)
            return out
    except Exception:
        pass
    return dict(DEFAULT)


def save_settings(settings):
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(settings, f, indent=2)
        return True
    except Exception:
        return False


def apply_to_robot(bt, settings, send_handshake=True):
    """Push speed and all four motor offsets to the firmware.

    Each multi-char command triggers blink(2) (4 x delay(100) = 400 ms
    of blocking time) plus an echo line back to the PC, so we leave a
    2.0 s gap between commands. Anything shorter races with the blink
    and the next command's bytes get dropped.
    """
    if send_handshake:
        bt.send_cmd("C")
        time.sleep(1.0)

    bt.send_cmd(f"SP{settings['speed']}")
    time.sleep(2.0)
    # {:+d} forces an explicit sign so the firmware's readSignedInt
    # never confuses OFL5 with OFL+5.
    bt.send_cmd(f"OFL{settings['L_F']:+d}")
    time.sleep(2.0)
    bt.send_cmd(f"OFR{settings['R_F']:+d}")
    time.sleep(2.0)
    bt.send_cmd(f"OBL{settings['L_B']:+d}")
    time.sleep(2.0)
    bt.send_cmd(f"OBR{settings['R_B']:+d}")
    time.sleep(0.5)
