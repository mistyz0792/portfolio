"""
settings_window.py - Toplevel window for tuning robot motor settings.

Four groups of controls:
    - Base PWM speed (50..255)
    - Per-direction trim offsets (L_F, R_F, L_B, R_B)
    - Rotation rate calibration (manual stopwatch, one full turn / time)
    - Linear speed calibration (manual stopwatch, distance / time)

Press-and-hold +/- uses a debounce so the BT command goes out once on
release rather than once per tick - the firmware's blink(2) takes
~400 ms per multi-char command and would lose bytes otherwise.

APPLY runs on a worker thread because apply_to_robot() sleeps for ~10 s
between its five commands. Running on the Tk thread would freeze the GUI.
"""

import time

import tkinter as tk
from tkinter import messagebox

from robot_settings import (load_settings, save_settings, apply_to_robot,
                            DEFAULT)


SPEED_MIN, SPEED_MAX = 50, 255
OFFSET_MIN, OFFSET_MAX = -100, 100


class SettingsWindow:
    def __init__(self, parent_root, bt, get_position=None, on_close=None):
        self.parent_root = parent_root
        self.bt = bt
        self.get_position = get_position    # unused now, kept for compat
        self.on_close_cb = on_close

        self.settings = load_settings()
        self._test_active = None        # 'F' or 'B' while TEST is held
        self._repeat_id = None          # after() id for +/- auto-repeat
        self._active_key = None         # which setting is being adjusted
        self._pending_send_id = None    # after() id for debounced BT send
        self._repeat_delay = 250
        self._is_busy = False           # True while apply_to_robot runs

        # Manual-stopwatch state for the two calibrations.
        self._rot_cal_active = None     # 'L' or 'R' or None
        self._rot_cal_t_start = None
        self._spd_cal_active = False
        self._spd_cal_t_start = None

        self.win = tk.Toplevel(parent_root)
        self.win.title("Robot Settings")
        self.win.configure(bg="#1a1a2e")
        self.win.geometry("560x800")
        self.win.protocol("WM_DELETE_WINDOW", self._on_user_close)

        self._build_ui()
        self._refresh_labels()

    # ---- UI ------------------------------------------------------------
    def _build_ui(self):
        title = tk.Frame(self.win, bg="#1a1a2e")
        title.pack(fill="x", padx=10, pady=8)
        tk.Label(title, text="ROBOT SETTINGS",
                 font=("Consolas", 14, "bold"),
                 fg="#00e5ff", bg="#1a1a2e").pack(side="left")

        # --- Base speed ---
        speed_frame = tk.LabelFrame(self.win, text=" Base speed ",
                                    font=("Consolas", 10, "bold"),
                                    fg="#aaa", bg="#1a1a2e",
                                    bd=1, relief="solid")
        speed_frame.pack(fill="x", padx=10, pady=4)
        self.speed_label = tk.Label(speed_frame, text="120",
                                    font=("Consolas", 18, "bold"),
                                    fg="#00e5ff", bg="#1a1a2e", width=6)
        self.speed_label.pack(side="left", padx=10, pady=8)
        self._add_pm(speed_frame, self._speed_minus, self._speed_plus,
                     key="speed")
        tk.Label(speed_frame, text=f"  ({SPEED_MIN}..{SPEED_MAX})",
                 font=("Consolas", 9, "italic"),
                 fg="#666", bg="#1a1a2e").pack(side="left")

        # --- Forward offsets ---
        f_frame = tk.LabelFrame(self.win, text=" Forward offsets ",
                                font=("Consolas", 10, "bold"),
                                fg="#00e5ff", bg="#1a1a2e",
                                bd=1, relief="solid")
        f_frame.pack(fill="x", padx=10, pady=4)
        self.lf_label = self._add_offset_row(f_frame, "Left  motor",
                                             "L_F", "#00e5ff")
        self.rf_label = self._add_offset_row(f_frame, "Right motor",
                                             "R_F", "#00e5ff")

        # --- Backward offsets ---
        b_frame = tk.LabelFrame(self.win, text=" Backward offsets ",
                                font=("Consolas", 10, "bold"),
                                fg="#9990C9", bg="#1a1a2e",
                                bd=1, relief="solid")
        b_frame.pack(fill="x", padx=10, pady=4)
        self.lb_label = self._add_offset_row(b_frame, "Left  motor",
                                             "L_B", "#9990C9")
        self.rb_label = self._add_offset_row(b_frame, "Right motor",
                                             "R_B", "#9990C9")

        # --- Rotation rate (manual stopwatch) ---
        rot_frame = tk.LabelFrame(self.win,
                                  text=" Rotation rates (deg/s) - manual stopwatch ",
                                  font=("Consolas", 10, "bold"),
                                  fg="#ffaa00", bg="#1a1a2e",
                                  bd=1, relief="solid")
        rot_frame.pack(fill="x", padx=10, pady=4)

        rot_row = tk.Frame(rot_frame, bg="#1a1a2e")
        rot_row.pack(fill="x", padx=8, pady=4)

        tk.Label(rot_row, text="L spin:", font=("Consolas", 10),
                 fg="#aaa", bg="#1a1a2e", width=8,
                 anchor="w").pack(side="left")
        self.rot_L_label = tk.Label(rot_row, text="150.0",
                                    font=("Consolas", 12, "bold"),
                                    fg="#ffaa00", bg="#1a1a2e", width=6)
        self.rot_L_label.pack(side="left", padx=4)
        self.cal_L_btn = tk.Button(rot_row, text="START L",
                                   font=("Consolas", 9, "bold"),
                                   fg="#1a1a2e", bg="#ffaa00", relief="flat",
                                   width=10,
                                   command=lambda: self._rot_cal_toggle("L"))
        self.cal_L_btn.pack(side="left", padx=4)

        tk.Label(rot_row, text="   R spin:", font=("Consolas", 10),
                 fg="#aaa", bg="#1a1a2e",
                 anchor="w").pack(side="left", padx=(15, 0))
        self.rot_R_label = tk.Label(rot_row, text="150.0",
                                    font=("Consolas", 12, "bold"),
                                    fg="#ffaa00", bg="#1a1a2e", width=6)
        self.rot_R_label.pack(side="left", padx=4)
        self.cal_R_btn = tk.Button(rot_row, text="START R",
                                   font=("Consolas", 9, "bold"),
                                   fg="#1a1a2e", bg="#ffaa00", relief="flat",
                                   width=10,
                                   command=lambda: self._rot_cal_toggle("R"))
        self.cal_R_btn.pack(side="left", padx=4)

        self.rot_timer_label = tk.Label(rot_frame,
                 text="Press START L (or R) - robot spins - press STOP after exactly ONE full turn",
                 font=("Consolas", 8, "italic"),
                 fg="#888", bg="#1a1a2e")
        self.rot_timer_label.pack(anchor="w", padx=8, pady=(0, 3))

        # --- Linear speed (manual stopwatch) ---
        spd_frame = tk.LabelFrame(self.win,
                                  text=" Linear speed (cm/s) - manual stopwatch ",
                                  font=("Consolas", 10, "bold"),
                                  fg="#00e5ff", bg="#1a1a2e",
                                  bd=1, relief="solid")
        spd_frame.pack(fill="x", padx=10, pady=4)

        spd_row = tk.Frame(spd_frame, bg="#1a1a2e")
        spd_row.pack(fill="x", padx=8, pady=4)

        tk.Label(spd_row, text="Forward:", font=("Consolas", 10),
                 fg="#aaa", bg="#1a1a2e", width=10,
                 anchor="w").pack(side="left")
        self.spd_label = tk.Label(spd_row, text="30.0",
                                  font=("Consolas", 12, "bold"),
                                  fg="#00e5ff", bg="#1a1a2e", width=6)
        self.spd_label.pack(side="left", padx=4)
        tk.Label(spd_row, text="cm/s", font=("Consolas", 9),
                 fg="#aaa", bg="#1a1a2e").pack(side="left")

        self.cal_F_btn = tk.Button(spd_row, text="START F",
                                   font=("Consolas", 9, "bold"),
                                   fg="#1a1a2e", bg="#00e5ff", relief="flat",
                                   width=10,
                                   command=self._spd_cal_toggle)
        self.cal_F_btn.pack(side="left", padx=4)

        tk.Label(spd_row, text="  Distance:", font=("Consolas", 9),
                 fg="#aaa", bg="#1a1a2e").pack(side="left", padx=(15, 0))
        self.spd_distance_var = tk.StringVar(value="100")
        spd_entry = tk.Entry(spd_row, textvariable=self.spd_distance_var,
                             width=5, font=("Consolas", 10),
                             bg="#0d1117", fg="#00e5ff",
                             insertbackground="#00e5ff", relief="flat")
        spd_entry.pack(side="left", padx=2)
        tk.Label(spd_row, text="cm", font=("Consolas", 9),
                 fg="#aaa", bg="#1a1a2e").pack(side="left")

        self.spd_timer_label = tk.Label(spd_frame,
                 text="Set distance, press START F - robot drives - press STOP after that distance",
                 font=("Consolas", 8, "italic"),
                 fg="#888", bg="#1a1a2e")
        self.spd_timer_label.pack(anchor="w", padx=8, pady=(0, 3))

        # Effective PWM = speed + offset, shown so the user can see
        # when a large offset pushes a motor outside the safe band.
        eff_frame = tk.Frame(self.win, bg="#0d1117", bd=1, relief="solid")
        eff_frame.pack(fill="x", padx=10, pady=4)
        tk.Label(eff_frame, text="Effective motor PWM:",
                 font=("Consolas", 9), fg="#888",
                 bg="#0d1117").pack(anchor="w", padx=8, pady=(4, 0))
        self.eff_label = tk.Label(eff_frame, text="",
                                  font=("Consolas", 10),
                                  fg="#00e5ff", bg="#0d1117",
                                  justify="left")
        self.eff_label.pack(anchor="w", padx=8, pady=(0, 4))

        # --- Action row ---
        action_frame = tk.Frame(self.win, bg="#1a1a2e")
        action_frame.pack(fill="x", padx=10, pady=8)

        # TEST F / TEST B are momentary - bind press/release explicitly.
        self.test_f_btn = tk.Button(action_frame, text="TEST F",
                                    font=("Consolas", 11, "bold"),
                                    fg="white", bg="#2a4a6a", relief="flat",
                                    width=10, height=2)
        self.test_f_btn.pack(side="left", padx=2)
        self.test_f_btn.bind("<ButtonPress-1>",   lambda e: self._test_press("F"))
        self.test_f_btn.bind("<ButtonRelease-1>", lambda e: self._test_release())

        self.test_b_btn = tk.Button(action_frame, text="TEST B",
                                    font=("Consolas", 11, "bold"),
                                    fg="white", bg="#5a3070", relief="flat",
                                    width=10, height=2)
        self.test_b_btn.pack(side="left", padx=2)
        self.test_b_btn.bind("<ButtonPress-1>",   lambda e: self._test_press("B"))
        self.test_b_btn.bind("<ButtonRelease-1>", lambda e: self._test_release())

        tk.Button(action_frame, text="STOP",
                  font=("Consolas", 11, "bold"),
                  fg="white", bg="#ff3d71", relief="flat",
                  width=8, height=2,
                  command=self._send_stop).pack(side="left", padx=2)

        self.apply_btn = tk.Button(action_frame, text="APPLY",
                  font=("Consolas", 11, "bold"),
                  fg="#1a1a2e", bg="#ffaa00", relief="flat",
                  width=8, height=2,
                  command=self._apply_now)
        self.apply_btn.pack(side="left", padx=(15, 2))

        tk.Button(action_frame, text="SAVE",
                  font=("Consolas", 11, "bold"),
                  fg="#1a1a2e", bg="#00e096", relief="flat",
                  width=8, height=2,
                  command=self._save_now).pack(side="left", padx=2)

        tk.Button(action_frame, text="RESET",
                  font=("Consolas", 9),
                  fg="white", bg="#444", relief="flat",
                  width=6, height=2,
                  command=self._reset).pack(side="right", padx=2)

        self.status_label = tk.Label(self.win, text="",
                                     font=("Consolas", 9),
                                     fg="#888", bg="#1a1a2e")
        self.status_label.pack(anchor="w", padx=10, pady=(0, 5))

    def _add_offset_row(self, parent, name, key, color):
        row = tk.Frame(parent, bg="#1a1a2e")
        row.pack(fill="x", padx=8, pady=4)
        tk.Label(row, text=name, font=("Consolas", 10),
                 fg="#aaa", bg="#1a1a2e", width=12,
                 anchor="w").pack(side="left")
        lbl = tk.Label(row, text="+0", font=("Consolas", 14, "bold"),
                       fg=color, bg="#1a1a2e", width=5)
        lbl.pack(side="left", padx=8)
        self._add_pm(row,
                     minus_cb=lambda k=key: self._offset_minus(k),
                     plus_cb=lambda k=key: self._offset_plus(k),
                     key=key)
        return lbl

    def _add_pm(self, parent, minus_cb, plus_cb, key=None):
        minus = tk.Button(parent, text="-",
                          font=("Consolas", 14, "bold"),
                          fg="white", bg="#2a2a4a", relief="flat",
                          width=3)
        minus.pack(side="left", padx=2)
        minus.bind("<ButtonPress-1>",   lambda e: self._start_repeat(minus_cb, key=key))
        minus.bind("<ButtonRelease-1>", lambda e: self._stop_repeat())

        plus = tk.Button(parent, text="+",
                         font=("Consolas", 14, "bold"),
                         fg="white", bg="#2a2a4a", relief="flat",
                         width=3)
        plus.pack(side="left", padx=2)
        plus.bind("<ButtonPress-1>",   lambda e: self._start_repeat(plus_cb, key=key))
        plus.bind("<ButtonRelease-1>", lambda e: self._stop_repeat())

    # ---- press-and-hold repeat -----------------------------------------
    def _start_repeat(self, fn, key=None):
        if self._is_busy:
            return
        self._active_key = key
        self._cancel_pending_send()
        fn()    # immediate local update (no BT yet)
        self._repeat_id = self.win.after(400, lambda: self._repeat_step(fn))

    def _repeat_step(self, fn):
        fn()
        self._repeat_id = self.win.after(80, lambda: self._repeat_step(fn))

    def _stop_repeat(self):
        if self._repeat_id is not None:
            try:
                self.win.after_cancel(self._repeat_id)
            except Exception:
                pass
            self._repeat_id = None
        # Debounce 700 ms covers blink(2) + echo + buffer settle, so
        # back-to-back rapid presses don't race. If the user presses
        # another button within the window, _start_repeat cancels
        # this pending send and reschedules.
        key = getattr(self, "_active_key", None)
        if key:
            self._pending_send_id = self.win.after(
                700, lambda k=key: self._do_pending_send(k))

    def _cancel_pending_send(self):
        pid = getattr(self, "_pending_send_id", None)
        if pid is not None:
            try:
                self.win.after_cancel(pid)
            except Exception:
                pass
            self._pending_send_id = None

    def _do_pending_send(self, key):
        self._pending_send_id = None
        if key == "speed":
            self._send_speed()
        elif key in ("L_F", "R_F", "L_B", "R_B"):
            self._send_offset(key)
        self._active_key = None

    # ---- value tweaks (local only - BT send happens on release) --------
    # During a hold the local settings dict updates every tick, but
    # the BT command is sent once on release via _stop_repeat. Otherwise
    # holding '+' for 2 seconds would queue 25 commands the firmware
    # can't process in time.
    def _speed_plus(self):
        self.settings["speed"] = min(self.settings["speed"] + 1, SPEED_MAX)
        self._refresh_labels()

    def _speed_minus(self):
        self.settings["speed"] = max(self.settings["speed"] - 1, SPEED_MIN)
        self._refresh_labels()

    def _offset_plus(self, key):
        self.settings[key] = min(self.settings[key] + 1, OFFSET_MAX)
        self._refresh_labels()

    def _offset_minus(self, key):
        self.settings[key] = max(self.settings[key] - 1, OFFSET_MIN)
        self._refresh_labels()

    # ---- BT helpers ----------------------------------------------------
    def _send_speed(self):
        if self._is_busy:
            return
        if self.bt and self.bt.is_connected:
            self.bt.send_cmd(f"SP{self.settings['speed']}")

    def _send_offset(self, key):
        if self._is_busy:
            return
        if not self.bt or not self.bt.is_connected:
            return
        cmd_map = {"L_F": "OFL", "R_F": "OFR", "L_B": "OBL", "R_B": "OBR"}
        self.bt.send_cmd(f"{cmd_map[key]}{self.settings[key]:+d}")

    def _send_stop(self):
        if self._is_busy:
            return
        if self.bt and self.bt.is_connected:
            self.bt.send_cmd("S")

    # ---- Test buttons --------------------------------------------------
    def _test_press(self, direction):
        if self._is_busy:
            return
        if not self.bt or not self.bt.is_connected:
            self._set_status("Bluetooth not connected", "#ff3d71")
            return
        # Don't re-push speed and offsets here. An earlier version did
        # and the SP+OFL+OFR+OBL+OBR sequence didn't finish before the
        # F/B command landed - F got parsed as part of the last offset's
        # value. The current settings are already on the firmware
        # (pushed on connect, or by _stop_repeat after the last tweak).
        self._test_active = direction
        self.bt.send_cmd(direction)

    def _test_release(self):
        if self._is_busy:
            return
        if self._test_active and self.bt and self.bt.is_connected:
            self.bt.send_cmd("S")
        self._test_active = None

    # ---- Save / Apply / Reset ------------------------------------------
    def _apply_now(self):
        if self._is_busy:
            return
        if not self.bt or not self.bt.is_connected:
            self._set_status("Bluetooth not connected", "#ff3d71")
            return
        # apply_to_robot uses time.sleep(2.0) between commands. Running
        # on the Tk main thread would freeze the GUI for ~10 s. Set
        # _is_busy so every other BT handler bails out while the
        # sequence is in flight.
        import threading
        self._is_busy = True
        self.apply_btn.config(state="disabled", text="...")
        # Cancel any pending debounced send so it doesn't fire mid-apply.
        self._cancel_pending_send()
        self._set_status("Applying settings...", "#aaa")
        threading.Thread(target=self._apply_in_thread, daemon=True).start()

    def _apply_in_thread(self):
        try:
            apply_to_robot(self.bt, self.settings, send_handshake=False)
            self.win.after(0, self._apply_done_ok)
        except Exception as e:
            err = str(e)
            self.win.after(0, lambda: self._apply_done_err(err))

    def _apply_done_ok(self):
        self._is_busy = False
        self.apply_btn.config(state="normal", text="APPLY")
        self._set_status("Applied to robot.", "#00e096")

    def _apply_done_err(self, msg):
        self._is_busy = False
        self.apply_btn.config(state="normal", text="APPLY")
        self._set_status(f"Apply error: {msg}", "#ff3d71")

    def _save_now(self):
        ok = save_settings(self.settings)
        if ok:
            self._set_status("Saved to motor_settings.json", "#00e096")
        else:
            self._set_status("Save failed!", "#ff3d71")

    def _reset(self):
        if not messagebox.askyesno("Reset",
            "Reset all values to defaults?\n"
            "(speed=120, all offsets=0)", parent=self.win):
            return
        self.settings = dict(DEFAULT)
        self._refresh_labels()
        if self.bt and self.bt.is_connected:
            apply_to_robot(self.bt, self.settings, send_handshake=False)
        self._set_status("Reset to defaults (not yet saved).", "#ffaa00")

    # ---- Display refresh -----------------------------------------------
    def _refresh_labels(self):
        self.speed_label.config(text=str(self.settings["speed"]))
        self.lf_label.config(text=f"{self.settings['L_F']:+d}")
        self.rf_label.config(text=f"{self.settings['R_F']:+d}")
        self.lb_label.config(text=f"{self.settings['L_B']:+d}")
        self.rb_label.config(text=f"{self.settings['R_B']:+d}")
        try:
            self.rot_L_label.config(text=f"{self.settings.get('rot_L_dps', 150.0):.1f}")
            self.rot_R_label.config(text=f"{self.settings.get('rot_R_dps', 150.0):.1f}")
            self.spd_label.config(text=f"{self.settings.get('linear_speed_cm_s', 30.0):.1f}")
        except Exception:
            pass

        s = self.settings
        eff = (f"  Forward:  L = {s['speed'] + s['L_F']:>3}    "
               f"R = {s['speed'] + s['R_F']:>3}\n"
               f"  Backward: L = {s['speed'] + s['L_B']:>3}    "
               f"R = {s['speed'] + s['R_B']:>3}")
        self.eff_label.config(text=eff)

    def _set_status(self, text, color):
        self.status_label.config(text=text, fg=color)

    # ---- Rotation calibration (manual stopwatch) ----------------------
    def _rot_cal_toggle(self, direction):
        if self._rot_cal_active is None:
            self._rot_cal_start(direction)
        else:
            self._rot_cal_stop()

    def _rot_cal_start(self, direction):
        if not self.bt or not self.bt.is_connected:
            self._set_status("Bluetooth not connected", "#ff3d71")
            return

        self.bt.send_cmd(direction)
        self._rot_cal_active = direction
        self._rot_cal_t_start = time.time()

        # Disable the OTHER button so the user can't start two
        # calibrations in parallel.
        if direction == "L":
            self.cal_L_btn.config(text="STOP", bg="#ff3d71", fg="white")
            self.cal_R_btn.config(state="disabled")
        else:
            self.cal_R_btn.config(text="STOP", bg="#ff3d71", fg="white")
            self.cal_L_btn.config(state="disabled")

        self._set_status(f"Spinning {direction}... press STOP after one full turn",
                         "#ffaa00")
        self._tick_timer()

    def _rot_cal_stop(self):
        if self._rot_cal_active is None:
            return
        elapsed = time.time() - self._rot_cal_t_start
        direction = self._rot_cal_active

        try:
            self.bt.send_cmd("S")
        except Exception:
            pass

        # Guard against a misclick that stopped the timer immediately -
        # dividing 360 by a near-zero number gives an absurd deg/s.
        if elapsed > 0.1:
            dps = 360.0 / elapsed
            key = "rot_L_dps" if direction == "L" else "rot_R_dps"
            self.settings[key] = float(dps)
            self._refresh_labels()
            self._set_status(
                f"{direction} spin: 360° in {elapsed:.2f}s = {dps:.1f} deg/s. "
                f"Press SAVE to keep.",
                "#00e096")
        else:
            self._set_status("Time too short to be meaningful", "#ff3d71")

        self._rot_cal_active = None
        self._rot_cal_t_start = None
        self.cal_L_btn.config(text="START L", bg="#ffaa00",
                              fg="#1a1a2e", state="normal")
        self.cal_R_btn.config(text="START R", bg="#ffaa00",
                              fg="#1a1a2e", state="normal")

    def _tick_timer(self):
        if self._rot_cal_active is None or self._rot_cal_t_start is None:
            return
        elapsed = time.time() - self._rot_cal_t_start
        try:
            self.rot_timer_label.config(
                text=f"Spinning {self._rot_cal_active}: {elapsed:.2f}s elapsed   "
                     f"(press STOP after exactly ONE full turn)",
                fg="#ffaa00")
            self.win.after(100, self._tick_timer)
        except tk.TclError:
            pass

    # ---- Linear speed calibration (manual stopwatch) -------------------
    def _spd_cal_toggle(self):
        if not self._spd_cal_active:
            self._spd_cal_start()
        else:
            self._spd_cal_stop()

    def _spd_cal_start(self):
        if not self.bt or not self.bt.is_connected:
            self._set_status("Bluetooth not connected", "#ff3d71")
            return

        try:
            distance = float(self.spd_distance_var.get())
            if distance < 10:
                raise ValueError
        except ValueError:
            self._set_status("Distance must be a number >= 10 cm", "#ff3d71")
            return

        self.bt.send_cmd("F")
        self._spd_cal_active = True
        self._spd_cal_t_start = time.time()

        self.cal_F_btn.config(text="STOP", bg="#ff3d71", fg="white")
        self.cal_L_btn.config(state="disabled")
        self.cal_R_btn.config(state="disabled")

        self._set_status(f"Driving F... press STOP after {distance:.0f} cm",
                         "#00e5ff")
        self._spd_tick_timer()

    def _spd_cal_stop(self):
        if not self._spd_cal_active:
            return
        elapsed = time.time() - self._spd_cal_t_start

        try:
            self.bt.send_cmd("S")
        except Exception:
            pass

        try:
            distance = float(self.spd_distance_var.get())
        except ValueError:
            distance = 100.0

        if elapsed > 0.1:
            speed = distance / elapsed
            self.settings["linear_speed_cm_s"] = float(speed)
            self._refresh_labels()
            self._set_status(
                f"Linear speed: {distance:.0f} cm in {elapsed:.2f}s = "
                f"{speed:.1f} cm/s. Press SAVE to keep.",
                "#00e096")
        else:
            self._set_status("Time too short to be meaningful", "#ff3d71")

        self._spd_cal_active = False
        self._spd_cal_t_start = None
        self.cal_F_btn.config(text="START F", bg="#00e5ff",
                              fg="#1a1a2e", state="normal")
        self.cal_L_btn.config(state="normal")
        self.cal_R_btn.config(state="normal")

    def _spd_tick_timer(self):
        if not self._spd_cal_active or self._spd_cal_t_start is None:
            return
        elapsed = time.time() - self._spd_cal_t_start
        try:
            distance = self.spd_distance_var.get()
            self.spd_timer_label.config(
                text=f"Driving F: {elapsed:.2f}s elapsed   "
                     f"(press STOP after {distance} cm)",
                fg="#00e5ff")
            self.win.after(100, self._spd_tick_timer)
        except tk.TclError:
            pass

    # ---- Lifecycle -----------------------------------------------------
    def _on_user_close(self):
        self._stop_repeat()
        if self._rot_cal_active is not None or self._spd_cal_active:
            try:
                self.bt.send_cmd("S")
            except Exception:
                pass
            self._rot_cal_active = None
            self._spd_cal_active = False
        try:
            if self.bt and self.bt.is_connected:
                self.bt.send_cmd("S")
        except Exception:
            pass
        if self.on_close_cb:
            self.on_close_cb()
        try:
            self.win.destroy()
        except Exception:
            pass
