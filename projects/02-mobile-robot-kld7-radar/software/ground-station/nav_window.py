"""
nav_window.py - Toplevel window for go-to-goal navigation.

User clicks on the map to set a goal, then presses START NAV.
Navigator runs on its own worker thread; the GUI just renders.
"""

import math
import time
from collections import deque

import tkinter as tk
from tkinter import messagebox

import matplotlib
matplotlib.use("TkAgg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

from navigator import Navigator, ARRIVAL_THRESHOLD


class NavWindow:
    def __init__(self, parent_root, bt, get_position, on_close=None,
                 max_range_cm=500):
        self.parent_root = parent_root
        self.bt = bt
        self.get_position = get_position
        self.on_close_cb = on_close
        self.max_range = max_range_cm

        # Trail history for the dotted line behind the robot.
        self.path_x = deque(maxlen=400)
        self.path_y = deque(maxlen=400)

        self.goal_x = None
        self.goal_y = None
        self.navigator = None
        self.is_navigating = False

        self.win = tk.Toplevel(parent_root)
        self.win.title("Go-to-Goal Navigation")
        self.win.configure(bg="#1a1a2e")
        self.win.geometry("760x780")
        self.win.protocol("WM_DELETE_WINDOW", self._on_user_close)

        self._build_ui()
        self._refresh_loop()

    # ---- UI ------------------------------------------------------------
    def _build_ui(self):
        header = tk.Frame(self.win, bg="#1a1a2e")
        header.pack(fill="x", padx=10, pady=8)
        tk.Label(header, text="GO-TO-GOAL NAVIGATION",
                 font=("Consolas", 14, "bold"),
                 fg="#00e5ff", bg="#1a1a2e").pack(side="left")

        status = tk.Frame(self.win, bg="#1a1a2e")
        status.pack(fill="x", padx=10)
        self.state_label = tk.Label(status, text="State: IDLE",
                                    font=("Consolas", 11),
                                    fg="#00e5ff", bg="#1a1a2e")
        self.state_label.pack(side="left")
        self.pos_label = tk.Label(status, text="Robot: (--, --)",
                                  font=("Consolas", 11),
                                  fg="#aaa", bg="#1a1a2e")
        self.pos_label.pack(side="left", padx=20)
        self.goal_label = tk.Label(status, text="Goal: (--, --)",
                                   font=("Consolas", 11),
                                   fg="#aaa", bg="#1a1a2e")
        self.goal_label.pack(side="left", padx=20)

        # Map. Coordinate frame matches the main radar plot: radar at
        # origin, +Y forward, +X right. Aspect = equal so the arrival
        # circle doesn't get squashed into an ellipse.
        plot_frame = tk.Frame(self.win, bg="#1a1a2e")
        plot_frame.pack(fill="both", expand=True, padx=10, pady=8)

        self.fig = plt.Figure(figsize=(7, 5), facecolor="#1a1a2e")
        self.ax = self.fig.add_subplot(111)
        self.ax.set_facecolor("#0d1117")
        self.ax.set_title("Click on map to set goal",
                          color="#00e5ff", fontsize=11)
        self.ax.set_xlabel("X [cm]", color="#aaa")
        self.ax.set_ylabel("Y [cm]", color="#aaa")
        self.ax.tick_params(colors="#aaa")
        self.ax.grid(True, alpha=0.2, linestyle="--")
        self.ax.set_xlim(-self.max_range, self.max_range)
        self.ax.set_ylim(0, self.max_range)
        self.ax.set_aspect("equal")

        self.ax.plot(0, 0, "s", color="#00e5ff", markersize=10)

        (self.path_line,) = self.ax.plot([], [], "-",
                                         color="#888", linewidth=1, alpha=0.6)
        (self.robot_dot,) = self.ax.plot([], [], "o",
                                         markersize=14,
                                         markeredgecolor="white",
                                         color="#00e096")

        (self.goal_dot,) = self.ax.plot([], [], "*",
                                        markersize=20,
                                        markeredgecolor="white",
                                        color="#ffaa00")
        self.arrival_circle = plt.Circle((0, 0), ARRIVAL_THRESHOLD,
                                          fill=False, color="#ffaa00",
                                          linestyle="--", alpha=0.6,
                                          visible=False)
        self.ax.add_patch(self.arrival_circle)

        # Heading arrow gets re-created every refresh tick - matplotlib
        # arrows don't have a clean set_data().
        self.heading_arrow = None

        canvas = FigureCanvasTkAgg(self.fig, master=plot_frame)
        canvas.get_tk_widget().pack(fill="both", expand=True)
        self.canvas = canvas
        canvas.mpl_connect("button_press_event", self._on_map_click)

        btn_row = tk.Frame(self.win, bg="#1a1a2e")
        btn_row.pack(fill="x", padx=10, pady=8)

        self.start_btn = tk.Button(btn_row, text="▶ START NAV",
                                   font=("Consolas", 12, "bold"),
                                   fg="white", bg="#00e096", relief="flat",
                                   width=14, height=2,
                                   command=self._on_start_clicked,
                                   state="disabled")
        self.start_btn.pack(side="left", padx=4)

        self.stop_btn = tk.Button(btn_row, text="■ STOP",
                                  font=("Consolas", 12, "bold"),
                                  fg="white", bg="#ff3d71", relief="flat",
                                  width=14, height=2,
                                  command=self._on_stop_clicked,
                                  state="disabled")
        self.stop_btn.pack(side="left", padx=4)

        tk.Button(btn_row, text="CLEAR GOAL",
                  font=("Consolas", 10),
                  fg="white", bg="#444", relief="flat",
                  width=12, height=2,
                  command=self._clear_goal).pack(side="left", padx=4)

        tk.Button(btn_row, text="CLEAR PATH",
                  font=("Consolas", 10),
                  fg="white", bg="#444", relief="flat",
                  width=12, height=2,
                  command=self._clear_path).pack(side="left", padx=4)

        log_frame = tk.Frame(self.win, bg="#0d1117",
                             highlightbackground="#2a2a4a",
                             highlightthickness=1)
        log_frame.pack(fill="x", padx=10, pady=(0, 8))
        tk.Label(log_frame, text="NAV LOG",
                 font=("Consolas", 8), fg="#888",
                 bg="#0d1117").pack(anchor="w", padx=5, pady=(3, 0))
        self.log_text = tk.Text(log_frame, height=8,
                                font=("Consolas", 9),
                                bg="#0d1117", fg="#00e5ff",
                                relief="flat", wrap="word")
        self.log_text.pack(fill="x", padx=5, pady=(0, 3))
        self.log_text.config(state="disabled")

    # ---- map interaction -----------------------------------------------
    def _on_map_click(self, event):
        if event.inaxes != self.ax:
            return
        if self.is_navigating:
            return
        if event.xdata is None or event.ydata is None:
            return
        gx, gy = event.xdata, event.ydata
        # K-LD7 near-field is unreliable below ~30 cm - reject goals
        # that close instead of trying to be clever.
        if gy < 30:
            self._log("Goal too close to radar; pick a point with Y > 30 cm.")
            return
        self.goal_x = gx
        self.goal_y = gy
        self.goal_dot.set_data([gx], [gy])
        self.arrival_circle.center = (gx, gy)
        self.arrival_circle.set_visible(True)
        self.goal_label.config(text=f"Goal: ({gx:.0f}, {gy:.0f})", fg="#ffaa00")
        self.start_btn.config(state="normal")
        self._log(f"Goal set: ({gx:.0f}, {gy:.0f})")
        self.canvas.draw_idle()

    def _clear_goal(self):
        self.goal_x = None
        self.goal_y = None
        self.goal_dot.set_data([], [])
        self.arrival_circle.set_visible(False)
        self.goal_label.config(text="Goal: (--, --)", fg="#aaa")
        self.start_btn.config(state="disabled")
        self.canvas.draw_idle()

    def _clear_path(self):
        self.path_x.clear()
        self.path_y.clear()
        self.path_line.set_data([], [])
        self.canvas.draw_idle()

    # ---- navigation control --------------------------------------------
    def _on_start_clicked(self):
        if not self.bt or not self.bt.is_connected:
            messagebox.showerror("Navigation",
                "Bluetooth not connected.", parent=self.win)
            return
        if self.goal_x is None:
            return
        # Final safety prompt - once START is pressed the navigator
        # owns the motors.
        if not messagebox.askyesno("Navigation",
            f"Drive robot to ({self.goal_x:.0f}, {self.goal_y:.0f})?\n\n"
            "Make sure the path is clear.",
            parent=self.win):
            return

        self.navigator = Navigator(
            bt=self.bt,
            get_position=self.get_position,
            report=self._log,
            on_state=self._on_nav_state,
            on_done=self._on_nav_done,
        )
        self.is_navigating = True
        self.start_btn.config(state="disabled")
        self.stop_btn.config(state="normal")
        self._log("Starting navigation")
        self.navigator.start(self.goal_x, self.goal_y)

    def _on_stop_clicked(self):
        if self.navigator:
            self.navigator.stop()

    def _on_nav_state(self, state):
        # Runs on the navigator's worker thread, so marshal back to Tk.
        def _do():
            try:
                self.state_label.config(text=f"State: {state}")
            except tk.TclError:
                pass
        self.parent_root.after(0, _do)

    def _on_nav_done(self, success, msg):
        def finalize():
            try:
                self.is_navigating = False
                self.start_btn.config(state="normal" if self.goal_x is not None else "disabled")
                self.stop_btn.config(state="disabled")
            except tk.TclError:
                pass
        self.parent_root.after(0, finalize)

    def _log(self, text):
        ts = time.strftime("%H:%M:%S")
        msg = f"{ts} {text}\n"
        def _do():
            try:
                self.log_text.config(state="normal")
                self.log_text.insert("end", msg)
                # Cap to 200 lines so Tk doesn't slow down.
                lines = int(self.log_text.index("end-1c").split(".")[0])
                if lines > 200:
                    self.log_text.delete("1.0", f"{lines-200}.0")
                self.log_text.see("end")
                self.log_text.config(state="disabled")
            except tk.TclError:
                pass
        self.parent_root.after(0, _do)

    # ---- map refresh loop ----------------------------------------------
    def _refresh_loop(self):
        try:
            x, y, detected = self.get_position()
            if detected:
                self.path_x.append(x)
                self.path_y.append(y)
                self.path_line.set_data(list(self.path_x), list(self.path_y))
                self.robot_dot.set_data([x], [y])
                self.pos_label.config(text=f"Robot: ({x:.0f}, {y:.0f})",
                                      fg="#00e096")

                if self.navigator and self.navigator.heading is not None:
                    self._draw_heading(x, y, self.navigator.heading)
            else:
                self.robot_dot.set_data([], [])
                self.pos_label.config(text="Robot: (lost)", fg="#ff3d71")

            self.canvas.draw_idle()
        except tk.TclError:
            return   # window closed
        except Exception:
            pass

        try:
            self.win.after(150, self._refresh_loop)
        except tk.TclError:
            pass

    def _draw_heading(self, x, y, heading_deg):
        # Remove the old arrow before drawing a new one.
        if self.heading_arrow is not None:
            try:
                self.heading_arrow.remove()
            except Exception:
                pass
            self.heading_arrow = None
        L = 40
        rad = math.radians(heading_deg)
        # sin/cos swapped vs the textbook because heading is measured
        # from +Y (forward), not +X. Same convention as navigator.py.
        dx = L * math.sin(rad)
        dy = L * math.cos(rad)
        self.heading_arrow = self.ax.arrow(
            x, y, dx, dy, head_width=12, head_length=10,
            fc="#00e5ff", ec="#00e5ff", alpha=0.8, length_includes_head=True)

    # ---- lifecycle -----------------------------------------------------
    def _on_user_close(self):
        if self.navigator:
            try:
                self.navigator.stop()
            except Exception:
                pass
        # Belt-and-braces in case the navigator was between commands.
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
