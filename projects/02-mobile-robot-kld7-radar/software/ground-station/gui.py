"""
gui.py - main Tkinter GUI for the K-LD7 radar monitor.

Owns the Tk window and wires together every other module:
    serial_io       - K-LD7 radar UART
    plots           - matplotlib plot helpers
    data_logging    - CSV logger
    bluetooth_io    - PC<->robot BT link (Phase 2)
    settings_window - motor calibration window (Phase 2)
    nav_window      - go-to-goal window (Phase 2)

Three update mechanisms run in parallel:
    - worker thread reads radar frames into deques (no Tk access)
    - Tk.after every 100 ms refreshes value boxes + CSV + logs
    - two FuncAnimations refresh the three plots at ~12.5 Hz
"""

import time
import math
import threading
from collections import deque

import matplotlib
matplotlib.use("TkAgg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.animation import FuncAnimation

import tkinter as tk
from tkinter import ttk, messagebox, filedialog

import serial_io
import plots
from data_logging import DataLogger
from bluetooth_io import BluetoothRobot
from robot_settings import load_settings, apply_to_robot
from settings_window import SettingsWindow
from nav_window import NavWindow


# Default zone thresholds in cm. The sliders override these on connect.
ZONE_DANGER = 100
ZONE_WARNING = 200

# 300 points at ~10 Hz = ~30 s of history, comfortably covering the
# 10-second scrolling plot window.
MAX_POINTS = 300


class RadarApp:
    def __init__(self):
        # --- Radar serial state ---
        self.com = None
        self.running = False

        self.frame_count = 0
        self.start_time = 0

        # --- Plot data buffers (shared with the worker thread) ---
        self.time_data = deque(maxlen=MAX_POINTS)
        self.distance_data = deque(maxlen=MAX_POINTS)
        self.speed_radar_data = deque(maxlen=MAX_POINTS)
        self.speed_est_data = deque(maxlen=MAX_POINTS)
        self.speed_time_data = deque(maxlen=MAX_POINTS)

        # --- Latest values (read by GUI refresh + navigator) ---
        self.target_x = 0
        self.target_y = 0
        self.target_detected = False
        self.latest_dist = 0
        self.latest_speed = 0
        self.latest_angle = 0
        self.latest_est_speed = 0

        # Previous-sample bookkeeping for v_est = dD/dt.
        self.prev_dist = None
        self.prev_time = None

        # Only log on actual zone changes, not every frame.
        self.prev_zone = "SAFE"

        self.logger = DataLogger()

        # BT side. The two callbacks route incoming telemetry and
        # outgoing commands to the RX / TX log widgets.
        self.bt = BluetoothRobot(on_telemetry=self._on_bt_telemetry,
                                 on_tx=self._on_bt_tx)
        # Tracks the last 'press' command so the matching release can
        # send 'S' without ambiguity.
        self.bt_pressed_cmd = None

        # Toplevel windows - we keep refs so a second click just
        # raises the existing window.
        self.settings_window = None
        self.nav_window = None

        self._build_gui()

    # ============================================================
    # GUI construction
    # ============================================================
    def _build_gui(self):
        self.root = tk.Tk()
        self.root.title("K-LD7 Radar Monitor")
        self.root.configure(bg="#1a1a2e")
        self.root.geometry("1600x950")
        # Open maximised on Windows. Other platforms raise TclError on
        # 'zoomed', so fall back to the geometry above.
        try:
            self.root.state("zoomed")
        except tk.TclError:
            pass
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        self._build_top_bar()
        self._build_value_display()
        self._build_zone_settings()
        self._build_bt_panel()
        self._build_main_content()
        self._init_graphs()

        # blit=False because axhspan backgrounds and dynamic xlim
        # break blitting. cache_frame_data=False to stop the
        # animation from accumulating frames in RAM forever.
        self.anim_left = FuncAnimation(self.fig_left, self._animate_left,
                                       interval=80, blit=False, cache_frame_data=False)
        self.anim_right = FuncAnimation(self.fig_right, self._animate_right,
                                        interval=80, blit=False, cache_frame_data=False)

    def _build_top_bar(self):
        top = tk.Frame(self.root, bg="#1a1a2e")
        top.pack(fill="x", padx=10, pady=5)

        tk.Label(top, text="K-LD7 RADAR", font=("Consolas", 14, "bold"),
                 fg="#00e5ff", bg="#1a1a2e").pack(side="left")

        tk.Label(top, text="COM:", font=("Consolas", 10), fg="#aaa",
                 bg="#1a1a2e").pack(side="left", padx=(20, 2))
        self.com_var = tk.StringVar()
        self.com_combo = ttk.Combobox(top, textvariable=self.com_var, width=8, state="readonly")
        self.com_combo.pack(side="left")
        self._refresh_ports()

        tk.Button(top, text="⟳", command=self._refresh_ports, bg="#2a2a4a",
                  fg="white", relief="flat", width=3).pack(side="left", padx=2)

        tk.Label(top, text="Speed:", font=("Consolas", 10), fg="#aaa",
                 bg="#1a1a2e").pack(side="left", padx=(15, 2))
        self.speed_var = tk.StringVar(value="25 km/h")
        ttk.Combobox(top, textvariable=self.speed_var, width=9, state="readonly",
                     values=["12.5 km/h", "25 km/h", "50 km/h", "100 km/h"]).pack(side="left")

        tk.Label(top, text="Range:", font=("Consolas", 10), fg="#aaa",
                 bg="#1a1a2e").pack(side="left", padx=(15, 2))
        self.range_var = tk.StringVar(value="5m")
        ttk.Combobox(top, textvariable=self.range_var, width=5, state="readonly",
                     values=["5m", "10m", "30m", "100m"]).pack(side="left")

        self.connect_btn = tk.Button(top, text="CONNECT", font=("Consolas", 10, "bold"),
                                     fg="#00e5ff", bg="#2a2a4a", relief="flat", padx=15,
                                     command=self._toggle_connect)
        self.connect_btn.pack(side="left", padx=15)

        self.status_label = tk.Label(top, text="● OFFLINE", font=("Consolas", 10),
                                     fg="#ff3d71", bg="#1a1a2e")
        self.status_label.pack(side="left")

    def _build_value_display(self):
        val_frame = tk.Frame(self.root, bg="#1a1a2e")
        val_frame.pack(fill="x", padx=10, pady=3)

        self.dist_label = self._make_val(val_frame, "DISTANCE", "-- cm", 0)
        self.speed_label = self._make_val(val_frame, "SPEED", "-- km/h", 1)
        self.angle_label = self._make_val(val_frame, "ANGLE", "--°", 2)
        self.zone_label = self._make_val(val_frame, "ZONE", "--", 3)

    def _make_val(self, parent, title, default, col):
        frame = tk.Frame(parent, bg="#0d1117", highlightbackground="#2a2a4a", highlightthickness=1)
        frame.grid(row=0, column=col, sticky="nsew", padx=2)
        parent.columnconfigure(col, weight=1)

        tk.Label(frame, text=title, font=("Consolas", 9), fg="#888",
                 bg="#0d1117").pack(pady=(5, 0))
        label = tk.Label(frame, text=default, font=("Consolas", 18, "bold"),
                         fg="#00e5ff", bg="#0d1117")
        label.pack(pady=(0, 5))
        return label

    def _build_zone_settings(self):
        zone_frame = tk.Frame(self.root, bg="#1a1a2e")
        zone_frame.pack(fill="x", padx=10, pady=3)

        tk.Label(zone_frame, text="Danger:", font=("Consolas", 10),
                 fg="#ff3d71", bg="#1a1a2e").pack(side="left", padx=(0, 3))
        self.danger_var = tk.IntVar(value=ZONE_DANGER)
        # Slider max gets stretched by _update_slider_range when the
        # user picks a wider radar range.
        self.danger_slider = tk.Scale(zone_frame, from_=10, to=500, orient="horizontal",
                                      variable=self.danger_var, length=150, bg="#1a1a2e",
                                      fg="#ff3d71", troughcolor="#2a2a4a", highlightthickness=0,
                                      font=("Consolas", 8), command=self._update_zones)
        self.danger_slider.pack(side="left")
        self.danger_cm = tk.Label(zone_frame, text=f"{ZONE_DANGER} cm",
                                  font=("Consolas", 10, "bold"), fg="#ff3d71", bg="#1a1a2e")
        self.danger_cm.pack(side="left", padx=(2, 15))

        tk.Label(zone_frame, text="Warning:", font=("Consolas", 10),
                 fg="#ffaa00", bg="#1a1a2e").pack(side="left", padx=(0, 3))
        self.warning_var = tk.IntVar(value=ZONE_WARNING)
        self.warning_slider = tk.Scale(zone_frame, from_=20, to=500, orient="horizontal",
                                       variable=self.warning_var, length=150, bg="#1a1a2e",
                                       fg="#ffaa00", troughcolor="#2a2a4a", highlightthickness=0,
                                       font=("Consolas", 8), command=self._update_zones)
        self.warning_slider.pack(side="left")
        self.warning_cm = tk.Label(zone_frame, text=f"{ZONE_WARNING} cm",
                                   font=("Consolas", 10, "bold"), fg="#ffaa00", bg="#1a1a2e")
        self.warning_cm.pack(side="left", padx=(2, 15))

        tk.Button(zone_frame, text="SET", font=("Consolas", 10, "bold"),
                  fg="#1a1a2e", bg="#00e5ff", relief="flat", padx=15,
                  command=self._apply_zones).pack(side="left", padx=10)

        self.log_btn = tk.Button(zone_frame, text="● START LOG", font=("Consolas", 10, "bold"),
                                 fg="#00e096", bg="#2a2a4a", relief="flat", padx=15,
                                 command=self._toggle_log)
        self.log_btn.pack(side="left", padx=5)

        self.log_status = tk.Label(zone_frame, text="", font=("Consolas", 8),
                                   fg="#888", bg="#1a1a2e")
        self.log_status.pack(side="left", padx=5)

    # ============================================================
    # Bluetooth panel (Phase 2)
    # ============================================================
    def _build_bt_panel(self):
        bt_frame = tk.Frame(self.root, bg="#1a1a2e")
        bt_frame.pack(fill="x", padx=10, pady=5)

        conn_row = tk.Frame(bt_frame, bg="#1a1a2e")
        conn_row.pack(side="left", fill="y")

        tk.Label(conn_row, text="ROBOT BT", font=("Consolas", 12, "bold"),
                 fg="#ffaa00", bg="#1a1a2e").pack(side="left")

        tk.Label(conn_row, text="COM:", font=("Consolas", 10), fg="#aaa",
                 bg="#1a1a2e").pack(side="left", padx=(15, 2))
        self.bt_com_var = tk.StringVar()
        self.bt_com_combo = ttk.Combobox(conn_row, textvariable=self.bt_com_var,
                                         width=8, state="readonly")
        self.bt_com_combo.pack(side="left")
        self._refresh_bt_ports()

        tk.Button(conn_row, text="⟳", command=self._refresh_bt_ports, bg="#2a2a4a",
                  fg="white", relief="flat", width=3).pack(side="left", padx=2)

        self.bt_connect_btn = tk.Button(conn_row, text="BT CONNECT",
                                        font=("Consolas", 10, "bold"),
                                        fg="#ffaa00", bg="#2a2a4a", relief="flat", padx=15,
                                        command=self._toggle_bt_connect)
        self.bt_connect_btn.pack(side="left", padx=10)

        self.bt_status_label = tk.Label(conn_row, text="● BT OFFLINE",
                                        font=("Consolas", 10),
                                        fg="#ff3d71", bg="#1a1a2e")
        self.bt_status_label.pack(side="left")

        tk.Label(conn_row, text="(hold F/B/L/R)",
                 font=("Consolas", 8, "italic"), fg="#666",
                 bg="#1a1a2e").pack(side="left", padx=15)

        # RX log: telemetry coming back from the robot.
        rx_log_frame = tk.Frame(bt_frame, bg="#0d1117",
                                highlightbackground="#2a2a4a",
                                highlightthickness=1)
        rx_log_frame.pack(side="left", fill="both", expand=True, padx=(20, 5))

        tk.Label(rx_log_frame, text="◀ RX (from robot)",
                 font=("Consolas", 8),
                 fg="#ffaa00", bg="#0d1117").pack(anchor="w",
                                                  padx=5, pady=(2, 0))
        self.bt_log_text = tk.Text(rx_log_frame, height=2,
                                   font=("Consolas", 8),
                                   fg="#ffaa00", bg="#0d1117",
                                   insertbackground="#ffaa00",
                                   relief="flat", borderwidth=0)
        self.bt_log_text.pack(fill="both", expand=True, padx=5, pady=(0, 2))
        self.bt_log_text.config(state="disabled")

        # TX log: outgoing commands. Useful for catching cases where
        # the GUI is flooding the firmware.
        tx_log_frame = tk.Frame(bt_frame, bg="#0d1117",
                                highlightbackground="#2a2a4a",
                                highlightthickness=1)
        tx_log_frame.pack(side="left", fill="both", expand=True, padx=(5, 0))

        tk.Label(tx_log_frame, text="▶ TX (to robot)",
                 font=("Consolas", 8),
                 fg="#00e096", bg="#0d1117").pack(anchor="w",
                                                  padx=5, pady=(2, 0))
        self.bt_tx_text = tk.Text(tx_log_frame, height=2,
                                  font=("Consolas", 8),
                                  fg="#00e096", bg="#0d1117",
                                  insertbackground="#00e096",
                                  relief="flat", borderwidth=0)
        self.bt_tx_text.pack(fill="both", expand=True, padx=5, pady=(0, 2))
        self.bt_tx_text.config(state="disabled")

    def _build_control_sidebar(self, parent):
        """Right-side panel: D-pad + tap commands + SETTINGS + GO-TO-GOAL."""
        sidebar = tk.Frame(parent, bg="#1a1a2e",
                           highlightbackground="#2a2a4a", highlightthickness=1)
        sidebar.grid(row=0, column=2, sticky="ns", padx=(10, 0))

        tk.Label(sidebar, text="ROBOT CONTROL",
                 font=("Consolas", 11, "bold"),
                 fg="#ffaa00", bg="#1a1a2e").pack(pady=(8, 4), padx=10)

        # D-pad with the same layout as the Phase 1 mobile app, so
        # muscle memory carries over.
        dpad = tk.Frame(sidebar, bg="#1a1a2e")
        dpad.pack(pady=4)
        self._mk_hold_btn(dpad, "F", "F", row=0, column=1)
        self._mk_hold_btn(dpad, "L", "L", row=1, column=0)
        self._mk_tap_btn(dpad,  "S", "S", row=1, column=1, color="#ff3d71")
        self._mk_hold_btn(dpad, "R", "R", row=1, column=2)
        self._mk_hold_btn(dpad, "B", "B", row=2, column=1)

        tk.Label(sidebar, text="OTHER",
                 font=("Consolas", 9), fg="#888",
                 bg="#1a1a2e").pack(pady=(10, 2), padx=10)
        other = tk.Frame(sidebar, bg="#1a1a2e")
        other.pack(pady=2)
        self._mk_tap_btn(other, "+", "+", row=0, column=0, color="#00e096")
        self._mk_tap_btn(other, "-", "-", row=0, column=1, color="#00e096")
        self._mk_tap_btn(other, "A", "A", row=0, column=2, color="#9990C9")
        self._mk_tap_btn(other, "C", "C", row=1, column=0, color="#00e5ff")
        self._mk_tap_btn(other, "D", "D", row=1, column=1, color="#888")

        tk.Frame(sidebar, height=2, bg="#2a2a4a").pack(
            fill="x", padx=10, pady=12)

        self.cal_btn = tk.Button(sidebar, text="SETTINGS",
                                 font=("Consolas", 11, "bold"),
                                 fg="#1a1a2e", bg="#ffaa00", relief="flat",
                                 width=14, height=2,
                                 command=self._open_settings)
        self.cal_btn.pack(pady=4, padx=10)

        self.nav_btn = tk.Button(sidebar, text="GO-TO-GOAL",
                                 font=("Consolas", 11, "bold"),
                                 fg="white", bg="#9990C9", relief="flat",
                                 width=14, height=2,
                                 command=self._open_navigation)
        self.nav_btn.pack(pady=4, padx=10)

    def _mk_hold_btn(self, parent, label, cmd_char, row, column):
        """Press-and-hold: send cmd on press, 'S' on release."""
        b = tk.Button(parent, text=label, font=("Consolas", 14, "bold"),
                      fg="white", bg="#2a4a6a", relief="flat",
                      width=4, height=2, takefocus=0)
        b.grid(row=row, column=column, padx=2, pady=2)
        b.bind("<ButtonPress-1>", lambda e, c=cmd_char: self._bt_press(c))
        b.bind("<ButtonRelease-1>", lambda e: self._bt_release())
        return b

    def _mk_tap_btn(self, parent, label, cmd_char, row, column, color="#2a4a6a"):
        """Single-tap: send the command once on click."""
        b = tk.Button(parent, text=label, font=("Consolas", 12, "bold"),
                      fg=color, bg="#2a2a4a", relief="flat",
                      width=4, height=2, takefocus=0,
                      command=lambda c=cmd_char: self._bt_tap(c))
        b.grid(row=row, column=column, padx=2, pady=2)
        return b

    def _refresh_bt_ports(self):
        ports = serial_io.list_com_ports()
        self.bt_com_combo["values"] = ports
        if ports:
            self.bt_com_combo.current(0)

    def _toggle_bt_connect(self):
        if self.bt.is_connected:
            self.bt.disconnect()
            self.bt_connect_btn.config(text="BT CONNECT")
            self.bt_status_label.config(text="● BT OFFLINE", fg="#ff3d71")
            self._log_event("BT disconnected", color="warning")
        else:
            port = self.bt_com_var.get()
            if not port:
                messagebox.showerror("Error", "Select Bluetooth COM port")
                return
            try:
                self.bt.connect(port, baud=115200)
            except Exception as e:
                messagebox.showerror("BT Error", f"Failed to open {port}: {e}")
                return
            self.bt_connect_btn.config(text="BT DISCONNECT")
            self.bt_status_label.config(text="● BT ONLINE", fg="#00e096")
            self._log_event(f"BT connected on {port}", color="safe")

            # Auto-push saved calibration so the connect -> GO-TO-GOAL
            # flow works without any manual steps. Without this the
            # firmware starts every session at offset=0.
            try:
                settings = load_settings()
                apply_to_robot(self.bt, settings, send_handshake=True)
                self._log_event(
                    f"Settings applied: speed={settings['speed']} "
                    f"FL={settings['L_F']:+d} FR={settings['R_F']:+d} "
                    f"BL={settings['L_B']:+d} BR={settings['R_B']:+d}",
                    color="safe")
            except Exception as e:
                self._log_event(f"Could not apply saved settings: {e}",
                                color="warning")

    def _bt_press(self, cmd_char):
        if not self.bt.is_connected:
            return
        self.bt_pressed_cmd = cmd_char
        self.bt.send_cmd(cmd_char)

    def _bt_release(self):
        if not self.bt.is_connected:
            return
        # Only send S if a press is actually outstanding.
        if self.bt_pressed_cmd is not None:
            self.bt.send_cmd("S")
            self.bt_pressed_cmd = None

    def _bt_tap(self, cmd_char):
        if not self.bt.is_connected:
            messagebox.showinfo("Bluetooth", "Connect to robot first.")
            return
        self.bt.send_cmd(cmd_char)

    # Both callbacks fire on the BT reader thread, so marshal back to
    # Tk via after(0, ...) before touching the log widgets.
    def _on_bt_telemetry(self, text):
        self.root.after(0, lambda t=text: self._append_rx_log(t))

    def _on_bt_tx(self, cmd):
        self.root.after(0, lambda c=cmd: self._append_tx_log(c))

    def _append_rx_log(self, text):
        ts = time.strftime("%H:%M:%S")
        self._append_to_log(self.bt_log_text, f"{ts} {text}\n", max_lines=100)

    def _append_tx_log(self, cmd):
        ts = time.strftime("%H:%M:%S")
        self._append_to_log(self.bt_tx_text, f"{ts} {cmd}\n", max_lines=100)

    def _append_to_log(self, widget, line, max_lines=100):
        try:
            widget.config(state="normal")
            widget.insert("end", line)
            lines = int(widget.index("end-1c").split(".")[0])
            if lines > max_lines:
                widget.delete("1.0", f"{lines - max_lines}.0")
            widget.see("end")
            widget.config(state="disabled")
        except tk.TclError:
            pass

    # ============================================================
    # Toplevel windows (Settings / Navigation)
    # ============================================================
    def _open_settings(self):
        if self.settings_window is not None:
            try:
                self.settings_window.win.lift()
                return
            except Exception:
                self.settings_window = None

        # Allow opening offline so the user can review values, but
        # the BT-sending parts will no-op until they connect.
        if not self.bt.is_connected:
            if not messagebox.askyesno("Settings",
                "Bluetooth not connected. You can still edit values, "
                "but they won't be sent to the robot until you connect.\n\n"
                "Open settings anyway?"):
                return

        self.settings_window = SettingsWindow(
            self.root, self.bt,
            get_position=self._nav_get_position,
            on_close=self._settings_window_closed)

    def _settings_window_closed(self):
        self.settings_window = None

    def _open_navigation(self):
        if self.nav_window is not None:
            try:
                self.nav_window.win.lift()
                return
            except Exception:
                self.nav_window = None

        if not self.bt.is_connected:
            messagebox.showerror("Navigation",
                "Connect Bluetooth to robot first.")
            return
        if not self.running:
            messagebox.showerror("Navigation",
                "Connect to radar first.")
            return

        # Match nav-window scale to the radar's range setting.
        range_cm = {"5m": 500, "10m": 1000, "30m": 3000,
                    "100m": 10000}.get(self.range_var.get(), 500)

        self.nav_window = NavWindow(
            self.root, self.bt,
            get_position=self._nav_get_position,
            on_close=self._nav_window_closed,
            max_range_cm=range_cm,
        )

    def _nav_get_position(self):
        return (self.target_x, self.target_y, self.target_detected)

    def _nav_window_closed(self):
        self.nav_window = None

    def _build_main_content(self):
        content = tk.Frame(self.root, bg="#1a1a2e")
        content.pack(fill="both", expand=True, padx=10, pady=5)
        content.columnconfigure(0, weight=1)
        content.columnconfigure(1, weight=1)
        content.columnconfigure(2, weight=0)   # sidebar fixed-width
        content.rowconfigure(0, weight=1)

        # LEFT: Target Position plot + Event Log + Data Log
        left = tk.Frame(content, bg="#1a1a2e")
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 5))

        self.fig_left = plt.Figure(figsize=(5, 3.2), facecolor="#1a1a2e")
        self.ax2 = self.fig_left.add_subplot(111)
        self.fig_left.subplots_adjust(left=0.15, right=0.95, top=0.92, bottom=0.15)
        canvas_left = FigureCanvasTkAgg(self.fig_left, master=left)
        canvas_left.get_tk_widget().pack(fill="both", expand=True)
        self.canvas_left = canvas_left

        self._build_event_log(left)
        self._build_data_log(left)

        # MIDDLE: Distance vs Time + Speed Comparison
        right = tk.Frame(content, bg="#1a1a2e")
        right.grid(row=0, column=1, sticky="nsew", padx=(5, 0))

        self.fig_right = plt.Figure(figsize=(5, 6), facecolor="#1a1a2e")
        self.ax1 = self.fig_right.add_subplot(211)
        self.ax3 = self.fig_right.add_subplot(212)
        self.fig_right.subplots_adjust(left=0.12, right=0.95, top=0.95, bottom=0.08, hspace=0.4)
        canvas_right = FigureCanvasTkAgg(self.fig_right, master=right)
        canvas_right.get_tk_widget().pack(fill="both", expand=True)
        self.canvas_right = canvas_right

        # RIGHT: control sidebar
        self._build_control_sidebar(content)

    def _build_event_log(self, parent):
        log_frame = tk.Frame(parent, bg="#0d1117", highlightbackground="#2a2a4a", highlightthickness=1)
        log_frame.pack(fill="x", pady=(3, 0))

        tk.Label(log_frame, text="EVENT LOG", font=("Consolas", 8),
                 fg="#888", bg="#0d1117").pack(anchor="w", padx=5, pady=(3, 0))
        self.log_text = tk.Text(log_frame, height=4, font=("Consolas", 9),
                                bg="#0d1117", fg="#888", insertbackground="#00e5ff",
                                relief="flat", wrap="word")
        self.log_text.pack(fill="x", padx=5, pady=(0, 3))
        self.log_text.config(state="disabled")
        self.log_text.tag_configure("danger", foreground="#ff3d71")
        self.log_text.tag_configure("warning", foreground="#ffaa00")
        self.log_text.tag_configure("safe", foreground="#00e096")

    def _build_data_log(self, parent):
        data_log_frame = tk.Frame(parent, bg="#0d1117", highlightbackground="#2a2a4a", highlightthickness=1)
        data_log_frame.pack(fill="x", pady=(3, 0))

        tk.Label(data_log_frame, text="DATA LOG", font=("Consolas", 8),
                 fg="#888", bg="#0d1117").pack(anchor="w", padx=5, pady=(3, 0))
        self.data_log_text = tk.Text(data_log_frame, height=4, font=("Consolas", 8),
                                     bg="#0d1117", fg="#00e5ff", insertbackground="#00e5ff",
                                     relief="flat", wrap="none")
        self.data_log_text.pack(fill="x", padx=5, pady=(0, 3))
        self.data_log_text.config(state="disabled")

    def _init_graphs(self):
        self.line1, self.dot1, _ = plots.init_distance_plot(self.ax1, ZONE_DANGER, ZONE_WARNING)
        self.dot2 = plots.init_target_plot(self.ax2, ZONE_DANGER, ZONE_WARNING)
        self.line_radar, self.line_est = plots.init_speed_plot(self.ax3)

    # ============================================================
    # Animation callbacks
    # ============================================================
    def _animate_left(self, frame):
        if not self.running:
            return
        if self.target_detected:
            self.dot2.set_data([self.target_x], [self.target_y])
            _, color = self._get_zone(self.latest_dist)
            self.dot2.set_color(color)
        else:
            self.dot2.set_data([], [])

    def _animate_right(self, frame):
        if not self.running or len(self.time_data) < 1:
            return

        t = list(self.time_data)
        d = [x / 100.0 for x in self.distance_data]   # cm -> m
        self.line1.set_data(t, d)

        if t:
            self.dot1.set_data([t[-1]], [d[-1]])
            plots.auto_scroll_x(self.ax1, t[-1])

        if len(self.speed_time_data) > 1:
            st = list(self.speed_time_data)
            self.line_radar.set_data(st, list(self.speed_radar_data))
            self.line_est.set_data(st, list(self.speed_est_data))
            plots.auto_scroll_x(self.ax3, st[-1])

    # ============================================================
    # Connection
    # ============================================================
    def _refresh_ports(self):
        ports = serial_io.list_com_ports()
        self.com_combo["values"] = ports
        if ports:
            self.com_combo.current(0)

    def _toggle_connect(self):
        if self.running:
            self._disconnect()
        else:
            self._connect()

    def _connect(self):
        port = self.com_var.get()
        if not port:
            messagebox.showerror("Error", "Select COM port!")
            return

        try:
            self.com = serial_io.open_port(port)
        except Exception as e:
            messagebox.showerror("Error", f"Cannot open {port}:\n{e}")
            return

        if not serial_io.init_handshake(self.com):
            messagebox.showerror("Error", "K-LD7 not responding!")
            self.com.close()
            return

        # Small settling delay - without it the first RRAI/RSPI is
        # occasionally dropped while the radar is still switching baud.
        time.sleep(0.075)
        serial_io.configure_sensor(self.com, self.range_var.get(), self.speed_var.get())

        self._update_slider_range()
        self._apply_zones()

        # Fresh-session reset.
        self.time_data.clear()
        self.distance_data.clear()
        self.speed_radar_data.clear()
        self.speed_est_data.clear()
        self.speed_time_data.clear()
        self.prev_dist = None
        self.prev_time = None
        self.frame_count = 0
        self.start_time = time.time()
        self.running = True

        self.connect_btn.config(text="DISCONNECT", fg="#ff3d71")
        self.status_label.config(text="● ONLINE", fg="#00e096")

        threading.Thread(target=self._read_loop, daemon=True).start()
        self._update_values()

    def _disconnect(self):
        self.running = False
        # Let the worker notice the flag before closing the port,
        # otherwise pyserial sometimes raises on the in-flight read.
        time.sleep(0.2)
        serial_io.close_session(self.com)
        if self.logger.active:
            self._toggle_log()

        self.connect_btn.config(text="CONNECT", fg="#00e5ff")
        self.status_label.config(text="● OFFLINE", fg="#ff3d71")

    # ============================================================
    # Worker thread
    # ============================================================
    def _read_loop(self):
        while self.running:
            try:
                result = serial_io.request_frame(self.com)
                t = time.time() - self.start_time

                if result is not None:
                    dist, speed, angle = result
                    self._on_target(t, dist, speed, angle)
                else:
                    self._on_no_target(t)

            except Exception:
                if self.running:
                    break

    def _on_target(self, t, dist, speed, angle):
        # Polar -> Cartesian. atan from +Y means sin/cos arguments
        # are swapped vs the classical math convention.
        angle_rad = math.radians(angle)
        self.target_x = dist * math.sin(angle_rad)
        self.target_y = dist * math.cos(angle_rad)
        self.target_detected = True

        self.latest_dist = dist
        self.latest_speed = speed
        self.latest_angle = angle

        # est_speed = (dd/dt) * 3.6 [km/h]. First sample stays 0.
        est_speed = 0
        if self.prev_dist is not None and self.prev_time is not None:
            dt = t - self.prev_time
            if dt > 0:
                est_speed = ((dist - self.prev_dist) / 100.0) / dt * 3.6
        self.prev_dist = dist
        self.prev_time = t
        self.latest_est_speed = est_speed

        self.time_data.append(t)
        self.distance_data.append(dist)
        self.speed_radar_data.append(speed)
        self.speed_est_data.append(est_speed)
        self.speed_time_data.append(t)
        self.frame_count += 1

    def _on_no_target(self, t):
        # Push zeros so the time axis stays continuous when nothing
        # is detected.
        self.target_detected = False
        self.time_data.append(t)
        self.distance_data.append(0)
        self.speed_radar_data.append(0)
        self.speed_est_data.append(0)
        self.speed_time_data.append(t)

    # ============================================================
    # GUI refresh (Tk.after every 100 ms)
    # ============================================================
    def _update_values(self):
        if not self.running:
            return

        if self.target_detected:
            self._refresh_target_displays()
        else:
            self._refresh_no_target_displays()

        self.root.after(100, self._update_values)

    def _refresh_target_displays(self):
        self.dist_label.config(text=f"{self.latest_dist} cm")
        self.speed_label.config(text=f"{self.latest_speed:.1f} km/h")
        self.angle_label.config(text=f"{self.latest_angle:.1f}°")

        zone, color = self._get_zone(self.latest_dist)
        self.zone_label.config(text=zone, fg=color)
        self._play_warning(zone)

        self.logger.write_frame(self.frame_count, self.latest_dist, self.latest_speed,
                                self.latest_angle, self.latest_est_speed, zone,
                                "Detected", self.target_x, self.target_y)

        ts = time.strftime("%H:%M:%S")
        log_line = (f"{ts} | D:{self.latest_dist}cm | S:{self.latest_speed:.1f}km/h "
                    f"| A:{self.latest_angle:.1f}° | {zone}\n")
        self._append_data_log(log_line)

        # Event log only writes on actual zone changes.
        if zone != self.prev_zone:
            self._log_zone_change(zone, ts)
            self.prev_zone = zone

    def _refresh_no_target_displays(self):
        self.dist_label.config(text="-- cm")
        self.speed_label.config(text="-- km/h")
        self.angle_label.config(text="--°")
        self.zone_label.config(text="NO TARGET", fg="#888")

        ts = time.strftime("%H:%M:%S")
        self._append_data_log(f"{ts} | NO TARGET\n")

        self.logger.write_frame(self.frame_count, 0, 0, 0, 0, "NO TARGET",
                                "No target", 0, 0)

    def _append_data_log(self, line):
        self.data_log_text.config(state="normal")
        self.data_log_text.insert("end", line)
        self.data_log_text.see("end")
        line_count = int(self.data_log_text.index("end-1c").split(".")[0])
        if line_count > 50:
            self.data_log_text.delete("1.0", "2.0")
        self.data_log_text.config(state="disabled")

    def _log_zone_change(self, zone, timestamp):
        if zone == "DANGER":
            msg = f"{timestamp} - Entered DANGER zone ({self.latest_dist}cm)\n"
            tag = "danger"
        elif zone == "WARNING":
            msg = f"{timestamp} - Entered WARNING zone ({self.latest_dist}cm)\n"
            tag = "warning"
        else:
            msg = f"{timestamp} - Back to SAFE zone ({self.latest_dist}cm)\n"
            tag = "safe"

        self.log_text.config(state="normal")
        self.log_text.insert("end", msg, tag)
        self.log_text.see("end")
        self.log_text.config(state="disabled")

        self.logger.write_event(timestamp, msg.strip(), self.latest_dist)

    def _log_event(self, text, color="safe"):
        """Generic timestamped line into the EVENT LOG (used by BT panel)."""
        ts = time.strftime("%H:%M:%S")
        msg = f"{ts} - {text}\n"
        try:
            self.log_text.config(state="normal")
            self.log_text.insert("end", msg, color)
            self.log_text.see("end")
            self.log_text.config(state="disabled")
        except tk.TclError:
            pass

    # ============================================================
    # Safety zone management
    # ============================================================
    def _update_zones(self, val=None):
        # Keep warning > danger by at least 10 cm.
        if self.danger_var.get() >= self.warning_var.get():
            self.warning_var.set(self.danger_var.get() + 10)
        self.danger_cm.config(text=f"{self.danger_var.get()} cm")
        self.warning_cm.config(text=f"{self.warning_var.get()} cm")

    def _update_slider_range(self):
        range_cm = {"5m": 500, "10m": 1000, "30m": 3000, "100m": 10000}
        max_val = range_cm.get(self.range_var.get(), 500)
        self.danger_slider.config(to=max_val)
        self.warning_slider.config(to=max_val)

    def _apply_zones(self):
        """SET button: redraw the zone bands and arcs with the new values."""
        danger = self.danger_var.get()
        warning = self.warning_var.get()
        range_cm = {"5m": 500, "10m": 1000, "30m": 3000, "100m": 10000}
        max_cm = range_cm.get(self.range_var.get(), 500)
        max_m = max_cm / 100

        # Full axis reset - axhspan can't be cleared cleanly otherwise.
        self.ax2.clear()
        plots.style_axis(self.ax2, "Target Position", "X [cm]", "Y [cm]")
        self.ax2.set_xlim(-max_cm, max_cm)
        self.ax2.set_ylim(0, max_cm)
        self.ax2.set_aspect("equal")
        plots.redraw_zone_arcs(self.ax2, danger, warning)
        self.ax2.plot(0, 0, "s", color="#00e5ff", markersize=8)
        # Re-create the dot artist - the old one belonged to the
        # cleared axes.
        self.dot2, = self.ax2.plot([], [], "o", markersize=14, markeredgecolor="white",
                                   markeredgewidth=1.5, color="#00e096")

        self.ax1.clear()
        plots.style_axis(self.ax1, "Distance vs Time", "Time [s]", "Distance [m]")
        self.ax1.set_ylim(0, max_m)
        self.ax1.set_xlim(0, 10)
        plots.redraw_zone_bands(self.ax1, danger, warning, max_m)
        self.line1, = self.ax1.plot([], [], color="#00e5ff", linewidth=1.5)
        self.dot1, = self.ax1.plot([], [], "o", color="#00e5ff", markersize=8)

        self.canvas_left.draw_idle()
        self.canvas_right.draw_idle()

    def _get_zone(self, distance_cm):
        danger = self.danger_var.get()
        warning = self.warning_var.get()
        if distance_cm < danger:
            return "DANGER", "#ff3d71"
        elif distance_cm < warning:
            return "WARNING", "#ffaa00"
        else:
            return "SAFE", "#00e096"

    def _play_warning(self, zone):
        if zone == "SAFE":
            return
        # Throttle to one beep per 500 ms so the speaker doesn't buzz
        # continuously while the target sits in a non-Safe zone.
        if not hasattr(self, "_last_beep"):
            self._last_beep = 0
        now = time.time()
        if now - self._last_beep < 0.5:
            return
        self._last_beep = now

        try:
            import winsound
            freq = 1000 if zone == "DANGER" else 700
            duration = 250 if zone == "DANGER" else 300
            # Beep on its own thread - winsound.Beep is blocking.
            threading.Thread(target=lambda: winsound.Beep(freq, duration), daemon=True).start()
        except Exception:
            pass

    # ============================================================
    # CSV logging
    # ============================================================
    def _toggle_log(self):
        if self.logger.active:
            self.logger.stop()
            self.log_btn.config(text="● START LOG", fg="#00e096")
            self.log_status.config(text="Log saved!", fg="#00e096")
        else:
            folder = filedialog.askdirectory(title="Select folder to save logs")
            if not folder:
                return
            self.logger.start(folder)
            self.log_btn.config(text="■ STOP LOG", fg="#ff3d71")
            self.log_status.config(text=f"Recording... ({self.logger.timestamp})", fg="#ff3d71")

    # ============================================================
    # Lifecycle
    # ============================================================
    def _on_close(self):
        # Disconnect both links cleanly - otherwise the BT virtual COM
        # stays held by Windows and the next launch fails to open it
        # for ~30 seconds.
        try:
            self.bt.disconnect()
        except Exception:
            pass
        self._disconnect()
        self.root.destroy()

    def run(self):
        self.root.mainloop()
