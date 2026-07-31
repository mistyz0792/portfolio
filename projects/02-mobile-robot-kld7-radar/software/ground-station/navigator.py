"""
navigator.py - single-shot go-to-goal navigator.

Drives the robot to a clicked goal using only the radar. No IMU, no
encoder, so heading has to come from the radar trail (drive forward,
look at where the displacement points).

Flow:
    1. Spin left until the radar locks on
    2. Drive forward 30 cm, derive heading from start->end vector
    3. Plan: turn angle and distance to goal
    4. Rotate open-loop (time = angle / rot_X_dps from settings)
    5. Drive forward open-loop (time = distance / linear_speed)
    6. Wait POST_DRIVE_WAIT, recheck, repeat or finish

Rotation is open-loop on purpose: the K-LD7 is Doppler, and a robot
spinning around its centre produces zero radial velocity, so the
radar can't see it. We trust the calibrated rotation rate.
"""

import math
import threading
import time

from robot_settings import load_settings


# ---- Tunables -------------------------------------------------------------
ARRIVAL_THRESHOLD       = 30.0    # cm
HEADING_PROBE_TRAVEL    = 30.0    # cm - forward probe length for heading
HEADING_PROBE_MAX_TIME  = 6.0     # s

ACQUIRE_TIMEOUT         = 12.0    # s - max spin time looking for radar lock
SETTLE_TIME             = 1.00    # s - let motors fully stop between phases
POST_DRIVE_WAIT         = 2.0     # s - give the radar time to reacquire
FRESH_TIMEOUT           = 2.5     # s - max wait for a fresh radar frame
LOST_TIMEOUT            = 3.0     # s - radar-loss tolerance during drive

MAX_ITERATIONS          = 3       # plan-drive cycles before giving up

# Safety floors so a bad calibration can't cause divide-by-zero or
# absurdly long timed actions.
MIN_ROT_DPS             = 30.0
MIN_LINEAR_CM_S         = 5.0
# ---------------------------------------------------------------------------


def _angle_diff(a, b):
    """Smallest signed difference a-b in degrees, wrapped to (-180, 180]."""
    return (a - b + 180.0) % 360.0 - 180.0


class Navigator:
    def __init__(self, bt, get_position, report, on_state, on_done):
        self.bt = bt
        self._raw_get_position = get_position
        self.report = report
        self.on_state = on_state
        self.on_done = on_done

        self.goal_x = 0.0
        self.goal_y = 0.0
        self.heading = None

        # Captured in step 1, used as the start point for step 2.
        self._anchor_x = None
        self._anchor_y = None

        # Last good radar fix - fallback when the Doppler radar loses
        # the (now stationary) robot at the end of a drive.
        self._last_x = None
        self._last_y = None
        self._last_t = 0.0

        self._thread = None
        self._stop_flag = threading.Event()
        self._state = "IDLE"

    @property
    def state(self):
        return self._state

    def is_running(self):
        return self._thread is not None and self._thread.is_alive()

    def start(self, goal_x, goal_y):
        if self.is_running():
            self.report("Navigation already running.")
            return False
        self.goal_x = float(goal_x)
        self.goal_y = float(goal_y)
        # Don't reset heading or last position - if the previous run
        # finished, the robot is still facing the same way and the
        # last fix is still good. Reusing both lets the next START
        # skip steps 1+2 entirely.
        self._stop_flag.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        return True

    def stop(self):
        self._stop_flag.set()
        try:
            self.bt.send_cmd("S")
        except Exception:
            pass

    # --- helpers --------------------------------------------------------
    def get_position(self):
        """Read the radar; cache the result if it's a fresh fix."""
        x, y, detected = self._raw_get_position()
        if detected:
            self._last_x = x
            self._last_y = y
            self._last_t = time.time()
            return (x, y, True)
        return (x, y, False)

    def _wait_for_fresh(self, timeout):
        t_end = time.time() + timeout
        while time.time() < t_end:
            if self._stop_flag.is_set():
                return None
            x, y, fresh = self.get_position()
            if fresh:
                return (x, y)
            time.sleep(0.05)
        return None

    def _set_state(self, new_state):
        self._state = new_state
        try:
            self.on_state(new_state)
        except Exception:
            pass

    # --- main worker ----------------------------------------------------
    def _run(self):
        try:
            self.report(f"Goal = ({self.goal_x:.0f}, {self.goal_y:.0f})")

            # Skip spin + probe if we already know our heading from a
            # previous run (see start()).
            if self.heading is not None and self._last_x is not None:
                self.report(f"Reusing heading {self.heading:.0f}° "
                            f"and position ({self._last_x:.0f}, "
                            f"{self._last_y:.0f}) from previous run")
            else:
                self._set_state("SPIN_TO_ACQUIRE")
                if not self._spin_to_acquire():
                    self._finish(False, "Could not acquire target via radar")
                    return

                self._set_state("HEADING_PROBE")
                if not self._heading_probe():
                    self._finish(False, "Could not measure heading")
                    return

            # Iterate: plan -> rotate -> drive -> recheck.
            attempt = 0
            while not self._stop_flag.is_set():
                attempt += 1
                if attempt > MAX_ITERATIONS:
                    xf, yf = self._last_x, self._last_y
                    err = math.hypot(self.goal_x - xf, self.goal_y - yf)
                    self._finish(False,
                        f"Stopped after {MAX_ITERATIONS} attempts. "
                        f"Final position ({xf:.0f}, {yf:.0f}), "
                        f"{err:.1f} cm from goal")
                    return

                x, y = self._last_x, self._last_y
                dx = self.goal_x - x
                dy = self.goal_y - y
                distance = math.hypot(dx, dy)

                self.report(f"--- Attempt #{attempt} ---")
                self.report(f"  position : ({x:.0f}, {y:.0f})")
                self.report(f"  heading  : {self.heading:.0f}°")
                self.report(f"  goal     : ({self.goal_x:.0f}, {self.goal_y:.0f})")
                self.report(f"  distance : {distance:.0f} cm")

                if distance < ARRIVAL_THRESHOLD:
                    self._finish(True, f"Arrived at goal (distance {distance:.1f} cm)")
                    return

                # atan2(dx, dy) with this arg order matches the radar's
                # frame: 0° = +Y (forward), positive = clockwise.
                target_heading = math.degrees(math.atan2(dx, dy))
                angle_err = _angle_diff(target_heading, self.heading)

                self.report(f"  target hdg = {target_heading:.0f}°, "
                            f"turn = {angle_err:+.0f}°")

                # 5° threshold avoids tiny rotations that the motors
                # can't reliably execute due to PWM dead-band.
                if abs(angle_err) > 5.0:
                    self._set_state("ROTATING")
                    self._open_loop_rotate(angle_err)

                self._set_state("DRIVING")
                self._open_loop_drive(distance)

                self._set_state("CHECKING")
                self.report(f"  wait {POST_DRIVE_WAIT:.1f} s, then re-check")
                # Lets the tracking filter forget the moving target it
                # was watching; without this pause it sometimes merges
                # the new track with the stale one on the next move.
                time.sleep(POST_DRIVE_WAIT)

                pos = self._wait_for_fresh(FRESH_TIMEOUT)
                if pos is not None:
                    nx, ny = pos
                    self.report(f"  re-check OK: ({nx:.0f}, {ny:.0f})")
                else:
                    # Doppler lost the stationary robot. Fall back to
                    # the last fix captured during the drive itself.
                    self.report(f"  no fresh frame; using last known "
                                f"({self._last_x:.0f}, {self._last_y:.0f}) "
                                f"from end of drive")

        except Exception as e:
            import traceback
            traceback.print_exc()
            self._finish(False, f"Error: {e}")

    # === Step 1 ===========================================================
    def _spin_to_acquire(self):
        """Spin left in place until the radar reports a target."""
        self.report("Step 1: spin left to acquire radar lock")
        x, y, fresh = self.get_position()
        if fresh:
            self._anchor_x, self._anchor_y = x, y
            self.report(f"  already locked at ({x:.0f}, {y:.0f})")
            time.sleep(SETTLE_TIME)
            return True

        self.bt.send_cmd("L")
        t_end = time.time() + ACQUIRE_TIMEOUT
        while time.time() < t_end:
            if self._stop_flag.is_set():
                self.bt.send_cmd("S")
                return False
            x, y, fresh = self.get_position()
            if fresh:
                self.bt.send_cmd("S")
                self._anchor_x, self._anchor_y = x, y
                self.report(f"  acquired at ({x:.0f}, {y:.0f})")
                time.sleep(SETTLE_TIME)
                return True
            time.sleep(0.05)
        self.bt.send_cmd("S")
        return False

    # === Step 2 ===========================================================
    def _heading_probe(self):
        """Drive forward 30 cm, derive heading from the radar trail."""
        x0, y0 = self._anchor_x, self._anchor_y

        try:
            settings = load_settings()
            linear = float(settings.get("linear_speed_cm_s", 30.0))
        except Exception:
            linear = 30.0
        linear = max(linear, MIN_LINEAR_CM_S)

        drive_time = HEADING_PROBE_TRAVEL / linear

        self.report(f"Step 2: drive forward {HEADING_PROBE_TRAVEL:.0f} cm "
                    f"({drive_time:.2f} s at {linear:.1f} cm/s)")
        self.report(f"  start at ({x0:.0f}, {y0:.0f})")

        # Poll the radar during the drive so _last_x/_last_y stay
        # current - otherwise we lose sight on stop and fall back to
        # the anchor (zero travel = no heading).
        self.bt.send_cmd("F")
        t_end = time.time() + drive_time
        while time.time() < t_end:
            if self._stop_flag.is_set():
                self.bt.send_cmd("S")
                return False
            self.get_position()
            time.sleep(0.05)
        self.bt.send_cmd("S")
        time.sleep(SETTLE_TIME)

        pos = self._wait_for_fresh(FRESH_TIMEOUT)
        if pos is None:
            if self._last_x is not None:
                x1, y1 = self._last_x, self._last_y
                self.report(f"  no fresh frame after drive - "
                            f"using last known ({x1:.0f}, {y1:.0f})")
            else:
                self.report("  no position data after drive - abort")
                return False
        else:
            x1, y1 = pos
            self.report(f"  end at ({x1:.0f}, {y1:.0f})")

        dx = x1 - x0
        dy = y1 - y0
        travel = math.hypot(dx, dy)
        # < 5 cm of travel = heading dominated by noise. Bail out.
        if travel < 5.0:
            self.report(f"  travel {travel:.1f} cm too small - abort")
            self.heading = None
            return False

        self.heading = math.degrees(math.atan2(dx, dy))
        self.report(f"  heading = {self.heading:.0f}°  "
                    f"(dx={dx:+.1f}, dy={dy:+.1f}, travel={travel:.1f} cm)")
        return True

    # === Step 4 ===========================================================
    def _open_loop_rotate(self, angle_err):
        """Rotate by angle_err degrees. Time = |angle| / rot_X_dps."""
        cmd = "R" if angle_err > 0 else "L"
        try:
            settings = load_settings()
            rot_dps = float(settings.get(
                "rot_R_dps" if cmd == "R" else "rot_L_dps", 150.0))
        except Exception:
            rot_dps = 150.0
        rot_dps = max(rot_dps, MIN_ROT_DPS)

        rotation_time = abs(angle_err) / rot_dps
        self.report(f"Step 4: rotate {cmd} {abs(angle_err):.0f}° "
                    f"in {rotation_time:.2f} s "
                    f"(rate {rot_dps:.1f} deg/s from settings)")

        self.bt.send_cmd(cmd)
        t_end = time.time() + rotation_time
        while time.time() < t_end:
            if self._stop_flag.is_set():
                self.bt.send_cmd("S")
                return
            time.sleep(0.05)
        self.bt.send_cmd("S")
        time.sleep(SETTLE_TIME)

        # Trust the calibrated rate. Any residual error gets caught
        # and corrected by the next plan-rotate-drive cycle.
        self.heading = (self.heading + angle_err) % 360.0
        if self.heading > 180.0:
            self.heading -= 360.0
        self.report(f"  heading after rotate: {self.heading:.0f}°")

    # === Step 5 ===========================================================
    def _open_loop_drive(self, distance):
        """Drive forward by distance cm. Time = distance / linear_speed."""
        try:
            settings = load_settings()
            linear = float(settings.get("linear_speed_cm_s", 30.0))
        except Exception:
            linear = 30.0
        linear = max(linear, MIN_LINEAR_CM_S)

        drive_time = distance / linear
        self.report(f"Step 5: drive forward {distance:.0f} cm "
                    f"in {drive_time:.2f} s "
                    f"(speed {linear:.1f} cm/s)")

        self.bt.send_cmd("F")
        t_end = time.time() + drive_time
        while time.time() < t_end:
            if self._stop_flag.is_set():
                self.bt.send_cmd("S")
                return
            # Same reason as the heading probe: keep _last_x/_last_y
            # current for the post-drive fallback.
            self.get_position()
            time.sleep(0.05)
        self.bt.send_cmd("S")
        time.sleep(SETTLE_TIME)

    # === finish ===========================================================
    def _finish(self, success, msg):
        try:
            self.bt.send_cmd("S")
        except Exception:
            pass
        self._set_state("DONE" if success else "FAILED")
        self.report(("DONE: " if success else "FAIL: ") + msg)
        try:
            self.on_done(success, msg)
        except Exception:
            pass
