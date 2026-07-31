"""
data_logging.py
Handles CSV logging of frame data and zone transition events.
"""

import csv
import datetime


class DataLogger:
    """Manage two CSV files: one per-frame, one for zone transition events."""

    def __init__(self):
        self.active = False
        self.data_file = None
        self.event_file = None
        self.data_writer = None
        self.event_writer = None
        self.timestamp = None

    def start(self, folder):
        """Open both CSV files in the chosen folder and write headers."""
        self.timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

        self.data_file = open(f"{folder}/radar_data_{self.timestamp}.csv", "w", newline="")
        self.data_writer = csv.writer(self.data_file)
        self.data_writer.writerow([
            "timestamp", "frame", "distance_cm", "speed_kmh",
            "angle_deg", "est_speed_kmh", "zone", "detection", "", "x_cm", "y_cm",
        ])

        self.event_file = open(f"{folder}/radar_events_{self.timestamp}.csv", "w", newline="")
        self.event_writer = csv.writer(self.event_file)
        self.event_writer.writerow(["timestamp", "event", "distance_cm"])

        self.active = True

    def write_frame(self, frame_count, distance, speed, angle, est_speed, zone,
                    detection, x_cm, y_cm):
        """Append one frame row to the data CSV."""
        if not self.active or self.data_writer is None:
            return
        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        self.data_writer.writerow([
            ts, frame_count, distance, speed, angle, round(est_speed, 2), zone,
            detection, "", round(x_cm, 5), round(y_cm, 5),
        ])

    def write_event(self, timestamp, message, distance):
        """Append one zone transition row to the event CSV."""
        if not self.active or self.event_writer is None:
            return
        self.event_writer.writerow([timestamp, message, distance])

    def stop(self):
        """Close both CSV files."""
        if self.data_file:
            self.data_file.close()
        if self.event_file:
            self.event_file.close()
        self.data_file = None
        self.event_file = None
        self.data_writer = None
        self.event_writer = None
        self.active = False
