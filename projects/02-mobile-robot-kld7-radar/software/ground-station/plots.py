"""
plots.py
Builds and updates the three matplotlib plots used by the GUI.
"""

import numpy as np


def style_axis(ax, title, xlabel, ylabel):
    """Apply the dark-theme styling used across all plots."""
    ax.set_facecolor("#0d1117")
    ax.tick_params(colors="#666", labelsize=8)
    for spine in ax.spines.values():
        spine.set_color("#333")
    ax.grid(True, alpha=0.15, color="#444")
    ax.set_title(title, color="#aaa", fontsize=10)
    ax.set_xlabel(xlabel, color="#888", fontsize=8)
    ax.set_ylabel(ylabel, color="#888", fontsize=8)


def init_distance_plot(ax, danger_cm, warning_cm):
    """Set up the Distance vs Time plot with safety zone bands."""
    style_axis(ax, "Distance vs Time", "Time [s]", "Distance [m]")
    ax.set_ylim(0, 5)
    ax.set_xlim(0, 10)

    zone_d = ax.axhspan(0, danger_cm / 100, alpha=0.12, color="red")
    zone_w = ax.axhspan(danger_cm / 100, warning_cm / 100, alpha=0.12, color="orange")
    zone_s = ax.axhspan(warning_cm / 100, 5, alpha=0.08, color="green")

    line, = ax.plot([], [], color="#00e5ff", linewidth=1.5)
    dot, = ax.plot([], [], "o", color="#00e5ff", markersize=8)
    return line, dot, (zone_d, zone_w, zone_s)


def init_target_plot(ax, danger_cm, warning_cm):
    """Set up the Target Position (X/Y) plot."""
    style_axis(ax, "Target Position", "X [cm]", "Y [cm]")
    ax.set_xlim(-400, 400)
    ax.set_ylim(0, 500)
    ax.set_aspect("equal")

    theta = np.linspace(-np.pi / 2, np.pi / 2, 100)
    ax.plot(danger_cm * np.sin(theta), danger_cm * np.cos(theta),
            "r--", alpha=0.3, linewidth=1, label=f"Danger {danger_cm}cm")
    ax.plot(warning_cm * np.sin(theta), warning_cm * np.cos(theta),
            "--", color="orange", alpha=0.3, linewidth=1, label=f"Warning {warning_cm}cm")
    ax.legend(fontsize=7, facecolor="#0d1117", edgecolor="#333",
              labelcolor="#aaa", loc="upper right")
    ax.plot(0, 0, "s", color="#00e5ff", markersize=8)

    dot, = ax.plot([], [], "o", markersize=14, markeredgecolor="white",
                   markeredgewidth=1.5, color="#00e096")
    return dot


def init_speed_plot(ax):
    """Set up the Radar vs Estimated Speed plot."""
    style_axis(ax, "Radar vs Estimated Speed", "Time [s]", "Speed [km/h]")
    ax.set_xlim(0, 10)
    ax.set_ylim(-15, 15)

    line_radar, = ax.plot([], [], color="#00e5ff", linewidth=1.5, label="Radar")
    line_est, = ax.plot([], [], color="#ff6b6b", linewidth=1, linestyle="--", label="Estimated")
    ax.legend(fontsize=7, facecolor="#0d1117", edgecolor="#333", labelcolor="#aaa")
    return line_radar, line_est


def auto_scroll_x(ax, latest_t, window=10):
    """Keep the time axis scrolling so that the latest sample is at the right edge."""
    if latest_t > window:
        ax.set_xlim(latest_t - window, latest_t)
    else:
        ax.set_xlim(0, window)


def redraw_zone_bands(ax, danger_cm, warning_cm, max_m=5):
    """Redraw the colored safety zone background bands on the distance plot."""
    ax.axhspan(0, danger_cm / 100, alpha=0.12, color="red")
    ax.axhspan(danger_cm / 100, warning_cm / 100, alpha=0.12, color="orange")
    ax.axhspan(warning_cm / 100, max_m, alpha=0.08, color="green")


def redraw_zone_arcs(ax, danger_cm, warning_cm):
    """Redraw the dashed semicircle arcs on the target position plot."""
    theta = np.linspace(-np.pi / 2, np.pi / 2, 100)
    ax.plot(danger_cm * np.sin(theta), danger_cm * np.cos(theta),
            "r--", alpha=0.3, linewidth=1, label=f"Danger {danger_cm}cm")
    ax.plot(warning_cm * np.sin(theta), warning_cm * np.cos(theta),
            "--", color="orange", alpha=0.3, linewidth=1, label=f"Warning {warning_cm}cm")
    ax.legend(fontsize=7, facecolor="#0d1117", edgecolor="#333",
              labelcolor="#aaa", loc="upper right")
