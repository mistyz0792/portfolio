import tkinter as tk
import time
from tkinter import messagebox
from tkinter import ttk
import smbus2
import struct
import math
import matplotlib
matplotlib.use("TkAgg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from mpl_toolkits.mplot3d import Axes3D
from matplotlib.animation import FuncAnimation
import re
import pigpio

# ===================================================================
# --- CORE LOGIC AND PARAMS (FROM t32) ---
# ===================================================================

# --- I2C Setup ---
bus = smbus2.SMBus(1)
addresses = ["0x08", "0x09", "0x0A", "0x0B"]
after_homing = False
# เพิ่มตัวแปรนี้ใกล้กับ after_homing
z_just_homed = False

# --- Robot Arm Params ---
l1, l2 = 210, 235
z_base = 340
THETA_CORRECTION_OFFSET = 9

# --- min/max freq ของแต่ละแกน ---
AXES_FREQ_RANGE = {
    "0x08": (500, 4000),      # แกน 1
    "0x09": (100, 1000),      # แกน 2
    "0x0A": (8000, 20250),    # แกน 3
    "0x0B": (40, 100),        # แกน 4
}

# --- Servo/Gripper Control ---
SERVO_GPIO = 4
SERVO_MIN_PW, SERVO_MAX_PW = 500, 2500
SERVO_ANGLE_MIN, SERVO_ANGLE_MAX = 0, 180
try:
    pi = pigpio.pi()
    if not pi.connected: raise RuntimeError("pigpio daemon not running!")
except Exception as e:
    pi = None
    print(f"Warning: pigpio connection failed. Servo control will be disabled. Error: {e}")

# ===================================================================
# --- NEW GUI SETUP (FROM gui.py) ---
# ===================================================================

# ----------- CONFIG -----------
WIN_W, WIN_H = 1024, 600
BG_COLOR = "#232a33"
CARD_COLOR = "#2d3542"
BTN_COLOR = "#2980b9"
BTN_COLOR2 = "#e67e22"
BTN_COLOR3 = "#e74c3c"
BTN_FONT = ("Segoe UI", 12, "bold")
LBL_FONT = ("Segoe UI", 11)
ENTRY_FONT = ("Consolas", 12)
TITLE_FONT = ("Segoe UI", 15, "bold")
INFO_FONT = ("Consolas", 10)
ACCENT = "#00cec9"
ACCENT2 = "#ffeaa7"
AXES_LABELS = ["0x08", "0x09", "0x0A", "0x0B"] # Re-defined for GUI loop, same as `addresses`

def style_button(btn, color=BTN_COLOR):
    btn.configure(bg=color, fg="white", bd=0, relief="flat", font=BTN_FONT, cursor="hand2", activeforeground="white")

def style_entry(e):
    e.configure(bg="#232a33", fg="#81ecec", insertbackground="white", font=ENTRY_FONT, bd=2, relief="flat")

def style_check(cb):
    cb.configure(bg=CARD_COLOR, fg="#f5f6fa", selectcolor="#273c75", activebackground=CARD_COLOR, font=LBL_FONT, highlightthickness=0, bd=0)

root = tk.Tk()
root.title("P.T.D Scara Robot Arm Controller")
root.geometry(f"{WIN_W}x{WIN_H}")
root.configure(bg=BG_COLOR)

style = ttk.Style()
style.theme_use("clam")
style.configure("TNotebook", background=BG_COLOR, borderwidth=0)
style.configure("TNotebook.Tab", background=BG_COLOR, foreground="#95a5a6", font=BTN_FONT, padding=[10, 5])
style.map("TNotebook.Tab", background=[("selected", ACCENT)], foreground=[("selected", "#fff")])

notebook = ttk.Notebook(root)
notebook.pack(fill="both", expand=True)

# Dummy label for functions that need a status label but don't have a dedicated one
dummy_status_label = tk.Label()

# ===================================================================
# --- CORE FUNCTIONS (FROM t32) ---
# ===================================================================

def map_speed_to_freq(speed, min_freq, max_freq):
    return int(min_freq + (max_freq - min_freq) * (speed - 1) / 99)

def map_z_to_deg(z):
    return -(z / 45.0) * 360

def send_i2c_data(addr_hex, data, status_label, success_msg):
    try:
        addr = int(addr_hex, 16)
        msg = smbus2.i2c_msg.write(addr, data)
        bus.i2c_rdwr(msg)
        status_label.config(text=success_msg, fg="#2ecc71")
    except Exception as e:
        status_label.config(text=f"Send Failed: {e}", fg="#e74c3c")

def wait_until_done(addr_hex):
    addr = int(addr_hex, 16)
    # --- Part 1: Wait for axis to start (status changes to 0) ---
    busy_timeout = time.time() + 2.0  # Max 2 sec wait to start
    is_busy = False
    esp_feedback_label.config(text=f"Waiting for {addr_hex} to start...", fg="orange")
    root.update()
    while time.time() < busy_timeout:
        try:
            status = bus.read_byte(addr)
            if status == 0:
                is_busy = True
                esp_feedback_label.config(text=f"{addr_hex} is busy (0)", fg="purple")
                root.update()
                break
        except Exception:
            pass
        time.sleep(0.02)

    if not is_busy:
        try:
            final_status = bus.read_byte(addr)
            if final_status == 1:
                esp_feedback_label.config(text=f"{addr_hex} finished instantly (0-move)", fg="green")
                return True
        except Exception as e:
            esp_feedback_label.config(text=f"Error checking {addr_hex}", fg="red")
        esp_feedback_label.config(text=f"Timeout! {addr_hex} did not start", fg="red")
        return False

    # --- Part 2: Wait for axis to finish (status changes to 1) ---
    done_timeout = time.time() + 20  # Max 20 sec wait to finish
    while time.time() < done_timeout:
        try:
            status = bus.read_byte(addr)
            if status == 1:
                esp_feedback_label.config(text=f"{addr_hex} finished (1)", fg="green")
                return True
        except Exception as e:
            esp_feedback_label.config(text=f"Read error on {addr_hex}", fg="red")
            return False
        root.update()
        time.sleep(0.05)

    esp_feedback_label.config(text=f"Timeout waiting for {addr_hex} to FINISH", fg="red")
    return False

# =====[ NEW FUNCTION ADDED HERE ]=====
def set_servo_angle(angle, status_label=None):
    """Sets the servo to a specific angle and updates a given status label."""
    if not pi:
        if status_label:
            status_label.config(text="Servo disabled (pigpio)", fg="orange")
        print("Error: pigpio daemon is not connected. Servo commands will fail.")
        return False

    try:
        angle_float = float(angle)
        angle_clamped = max(SERVO_ANGLE_MIN, min(SERVO_ANGLE_MAX, angle_float))
        pw = SERVO_MIN_PW + (SERVO_MAX_PW - SERVO_MIN_PW) * (angle_clamped - SERVO_ANGLE_MIN) / (SERVO_ANGLE_MAX - SERVO_ANGLE_MIN)
        pi.set_servo_pulsewidth(SERVO_GPIO, int(pw))
        time.sleep(0.5)
        if status_label:
            status_label.config(text=f"Servo set: {int(angle_clamped)}°", fg="#2ecc71")
        return True
    except Exception as e:
        if status_label:
            status_label.config(text=f"Servo Error: {e}", fg="red")
        print(f"Servo Exception: {e}")
        return False

# ===================================================================
# --- TAB 1: MANUAL CONTROL ---
# ===================================================================
tab1 = tk.Frame(notebook, bg=BG_COLOR)
notebook.add(tab1, text="Manual Control")
main1 = tk.Frame(tab1, bg=BG_COLOR)
main1.pack(fill="both", expand=True, padx=10, pady=8)
main1.grid_columnconfigure(0, weight=3, minsize=510)
main1.grid_columnconfigure(1, weight=1, minsize=180)
main1.grid_rowconfigure(0, weight=1)

# LEFT CONTROL PANEL
axes_panel = tk.LabelFrame(main1, text="Axes Control", fg=ACCENT, font=TITLE_FONT, bg=CARD_COLOR, bd=2)
axes_panel.grid(row=0, column=0, sticky="nsew", padx=(0, 12), pady=0)
axes_panel.grid_columnconfigure((0, 1), weight=1)

# --- Speed Control ---
speed_frame = tk.Frame(axes_panel, bg=CARD_COLOR)
speed_frame.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(4, 6), padx=10)
tk.Label(speed_frame, text="Speed", font=LBL_FONT, bg=CARD_COLOR, fg=ACCENT2).pack(side=tk.LEFT, padx=(0, 8))
speed_var = tk.IntVar(value=50)
speed_slider = tk.Scale(speed_frame, from_=1, to=100, orient=tk.HORIZONTAL, variable=speed_var, font=LBL_FONT, length=220,
                        bg=CARD_COLOR, fg="#fff", troughcolor="#485460", sliderrelief="flat", highlightthickness=0, bd=0)
speed_slider.pack(side=tk.LEFT)
speed_slider.configure(activebackground="#273c75")

# --- Axes Control Vars ---
axes_status_labels = []
axes_relay_vars = [] # MODIFIED: Add list to store relay variables

# --- Manual Control Functions ---
def send_speed_to_all():
    speed_percent = int(speed_var.get())
    for i, addr_hex in enumerate(addresses):
        min_freq, max_freq = AXES_FREQ_RANGE[addr_hex]
        freq = map_speed_to_freq(speed_percent, min_freq, max_freq)
        try:
            freq_bytes = freq.to_bytes(2, 'little')
            data = [0x06] + list(freq_bytes)
            send_i2c_data(addr_hex, data, axes_status_labels[i], f"Speed Set: {speed_percent}% ({freq} Hz)")
        except Exception as e:
            axes_status_labels[i].config(text=f"Speed Set Fail: {e}", fg="red")

def set_speed_for_all_axes(speed_percent):
    """Sets the speed for all axes based on a percentage (1-100)."""
    try:
        speed_val = int(speed_percent)
        # ตรวจสอบว่าค่า speed อยู่ในช่วง 1-100
        if not 1 <= speed_val <= 100:
            print(f"Speed value {speed_val} is out of range (1-100).")
            return

        for i, addr_hex in enumerate(addresses):
            min_freq, max_freq = AXES_FREQ_RANGE[addr_hex]
            freq = map_speed_to_freq(speed_val, min_freq, max_freq) 
            freq_bytes = freq.to_bytes(2, 'little')
            data = [0x06] + list(freq_bytes) # 0x06 คือ command สำหรับตั้งค่าความเร็ว 
            
            # ใช้ dummy_status_label เพื่อไม่ให้กระทบกับ UI หลักมากเกินไป
            send_i2c_data(addr_hex, data, dummy_status_label, f"Speed Set: {speed_val}%")
            time.sleep(0.01) # หน่วงเวลาเล็กน้อยเพื่อให้ ESP32 ประมวลผลทัน

    except Exception as e:
        # แสดงข้อผิดพลาดใน console หากมีปัญหา
        print(f"Failed to set speed for all axes: {e}")
            
def execute_compensated_theta_move(angle: float, speed_percent: float, status_label):
    """
    [แก้ไขใหม่] เพิ่มการตรวจสอบว่าไม่ชดเชยหากเพิ่ง Homing มา
    """
    global after_homing
    
    # 🔴 ตรวจสอบว่าหากเพิ่ง Homing มา และ angle น้อยมาก ให้ข้ามการชดเชย
    if after_homing and abs(angle) < 0.1:
        status_label.config(text="Skipping compensation (post-homing)", fg="blue")
        # ส่งเฉพาะแกน Theta โดยไม่ชดเชย Z
        min_freq_theta, max_freq_theta = AXES_FREQ_RANGE["0x0A"]
        freq_theta = map_speed_to_freq(speed_percent, min_freq_theta, max_freq_theta)
        angle_bytes_theta = struct.pack("<f", angle)
        freq_bytes_theta = struct.pack("<h", int(freq_theta))
        data_theta = [0x01] + list(angle_bytes_theta) + list(freq_bytes_theta)
        send_i2c_data("0x0A", data_theta, status_label, f"Theta Only: {angle:.2f}°")
        return
    
    try:
        # --- 0. ตรวจสอบว่าจำเป็นต้องเคลื่อนที่หรือไม่ ---
        if abs(angle) < 0.01:
            status_label.config(text="Theta move is too small.", fg="blue")
            return

        # --- 1. กำหนดอัตราส่วนการเคลื่อนที่ทางกลระหว่าง Theta กับ Z ---
        COMPENSATION_RATIO = 0.54

        # --- 2. คำนวณค่ามุมและ "ความถี่" ของแต่ละแกนจาก Speed Slider ---
        # มุมที่ Z ต้องเคลื่อนที่ ยังคงคำนวณเหมือนเดิม
        angle_z = angle * COMPENSATION_RATIO

        # [ส่วนที่แก้ไขหลัก]
        # คำนวณความถี่ของ "ทั้งสองแกน" จาก speed_percent เดียวกัน
        # โดยใช้ช่วงความถี่ (min/max) ของแต่ละแกนเอง
        min_freq_theta, max_freq_theta = AXES_FREQ_RANGE["0x0A"]
        freq_theta = map_speed_to_freq(speed_percent, min_freq_theta, max_freq_theta)

        min_freq_z, max_freq_z = AXES_FREQ_RANGE["0x0B"]
        freq_z = map_speed_to_freq(speed_percent, min_freq_z, max_freq_z)
        
        # --- 3. เตรียมข้อมูล I2C สำหรับส่งไปยังแต่ละแกน ---
        # แกน Theta (0x0A)
        angle_bytes_theta = struct.pack("<f", angle)
        freq_bytes_theta = struct.pack("<h", int(freq_theta))
        data_theta = [0x01] + list(angle_bytes_theta) + list(freq_bytes_theta)

        # แกน Z (0x0B)
        angle_bytes_z = struct.pack("<f", angle_z)
        freq_bytes_z = struct.pack("<h", int(freq_z))
        data_z = [0x01] + list(angle_bytes_z) + list(freq_bytes_z)

        # --- 4. ส่งคำสั่งให้แกนทั้งสองทำงานพร้อมกัน ---
        send_i2c_data("0x0B", data_z, dummy_status_label, f"Z Compensate: {angle_z:.2f}° @ {freq_z}Hz")
        send_i2c_data("0x0A", data_theta, status_label, f"Theta Move: {angle:.2f}° @ {freq_theta}Hz")

        status_label.config(text=f"Moving Theta {angle}° with synced Z compensation...", fg="green")

    except Exception as e:
        status_label.config(text=f"Compensated Move Failed: {e}", fg="red")

def send_angle(addr_hex, angle_var, status_label):
    try:
        angle = float(angle_var.get())
        speed_percent = int(speed_var.get())
        
        # --- ถ้าเป็นแกน Theta (0x0A) ให้เรียกใช้ฟังก์ชันรักษาระดับ Z กลาง ---
        if addr_hex == "0x0A":
            execute_compensated_theta_move(angle, speed_percent, status_label)
        else:
            # --- ถ้าเป็นแกนอื่น ให้ทำงานแบบปกติ ---
            min_freq, max_freq = AXES_FREQ_RANGE[addr_hex]
            freq = map_speed_to_freq(speed_percent, min_freq, max_freq)
            angle_bytes = struct.pack("<f", angle)
            # แก้ไข bug ที่ใช้ freq_bytes แทนที่จะเป็น freq
            freq_bytes = struct.pack("<h", freq) 
            data = [0x01] + list(angle_bytes) + list(freq_bytes)
            send_i2c_data(addr_hex, data, status_label, f"Sent {angle:.2f}° @ {speed_percent}%")
            
    except Exception as e:
        status_label.config(text=f"Send Angle Failed: {e}", fg="red")


def send_test_pulse(addr_hex, pulse_var, status_label):
    try:
        pulse_count = int(pulse_var.get())
        speed_percent = int(speed_var.get())
        min_freq, max_freq = AXES_FREQ_RANGE[addr_hex]
        freq = map_speed_to_freq(speed_percent, min_freq, max_freq)
        pulse_bytes = pulse_count.to_bytes(4, 'little')
        freq_bytes = freq.to_bytes(2, 'little')
        data = [0x02] + list(pulse_bytes) + list(freq_bytes)
        send_i2c_data(addr_hex, data, status_label, f"Sent {pulse_count} pulses")
    except Exception as e:
        status_label.config(text=f"Pulse Test Failed: {e}", fg="red")

def send_set_ppr(addr_hex, ppr_var, status_label):
    try:
        new_ppr = int(ppr_var.get())
        ppr_bytes = new_ppr.to_bytes(4, 'little')
        data = [0x03] + list(ppr_bytes)
        send_i2c_data(addr_hex, data, status_label, f"PPR set to {new_ppr}")
    except Exception as e:
        status_label.config(text=f"PPR Set Failed: {e}", fg="red")

def send_relay(addr_hex, relay_var, status_label):
    try:
        relay_state = 1 if relay_var.get() else 0
        data = [0x04, relay_state]
        send_i2c_data(addr_hex, data, status_label, f"Relay {'OFF' if relay_state else 'ON'}")
    except Exception as e:
        status_label.config(text=f"Relay Failed: {e}", fg="red")

def send_homing(addr_hex, status_label):
    try:
        speed_percent = int(speed_var.get())
        min_freq, max_freq = AXES_FREQ_RANGE[addr_hex]
        freq = map_speed_to_freq(speed_percent, min_freq, max_freq)
        freq_bytes = freq.to_bytes(2, 'little')
        data = [0x05] + list(freq_bytes)
        send_i2c_data(addr_hex, data, status_label, f"Homing @ {speed_percent}%")
    except Exception as e:
        status_label.config(text=f"Homing Failed: {e}", fg="red")

def check_connections():
    for i, addr_hex in enumerate(addresses):
        addr = int(addr_hex, 16)
        try:
            bus.write_i2c_block_data(addr, 0, [])
            axes_status_labels[i].config(text="Connection OK", fg="#2ecc71")
        except Exception:
            axes_status_labels[i].config(text="Connection Failed", fg="#e74c3c")

btn_speed = tk.Button(speed_frame, text="Set All", command=send_speed_to_all)
btn_speed.pack(side=tk.LEFT, padx=14)
style_button(btn_speed, BTN_COLOR2)

# --- Gripper Manual Control ---
tk.Label(speed_frame, text="Gripper Angle:", font=LBL_FONT, bg=CARD_COLOR, fg=ACCENT2).pack(side=tk.LEFT, padx=(20, 2))
gripper_manual_var = tk.StringVar(value="90")
e_gripper = tk.Entry(speed_frame, textvariable=gripper_manual_var, width=5)
style_entry(e_gripper)
e_gripper.pack(side=tk.LEFT, padx=(0, 5))

def send_gripper_manual_wrapper():
    try:
        angle = gripper_manual_var.get()
        # Call the set_servo_angle function and pass the specific status label
        set_servo_angle(angle, gripper_status_label)
    except ValueError:
        gripper_status_label.config(text="Invalid angle", fg="red")
    except Exception as e:
        gripper_status_label.config(text=f"Error: {e}", fg="red")

btn_gripper = tk.Button(speed_frame, text="Set", command=send_gripper_manual_wrapper)
btn_gripper.pack(side=tk.LEFT, padx=5)
style_button(btn_gripper, BTN_COLOR)


for i, addr_hex in enumerate(AXES_LABELS):
    row = 1 + (i // 2)
    col = i % 2
    ax_box = tk.LabelFrame(axes_panel, text=f"Axis {i + 1} [{addr_hex}]", bg=CARD_COLOR, fg="#81ecec", font=LBL_FONT, bd=1)
    ax_box.grid(row=row, column=col, sticky="nsew", padx=8, pady=6)

    status_label = tk.Label(ax_box, text="Status: -", fg="#f9ca24", bg=CARD_COLOR, font=INFO_FONT) # defined before command
    
    angle_var = tk.StringVar(value="0.0")
    tk.Label(ax_box, text="Angle:", bg=CARD_COLOR, fg=ACCENT2, font=LBL_FONT).grid(row=0, column=0, sticky="w")
    e1 = tk.Entry(ax_box, textvariable=angle_var, width=7)
    e1.grid(row=0, column=1)
    style_entry(e1)
    btn1 = tk.Button(ax_box, text="Send", width=7, command=lambda a=addr_hex, v=angle_var, s=status_label: send_angle(a, v, s))
    btn1.grid(row=0, column=2, padx=3)
    style_button(btn1)

    pulse_var = tk.StringVar(value="1000")
    tk.Label(ax_box, text="Pulse:", bg=CARD_COLOR, fg=ACCENT2, font=LBL_FONT).grid(row=1, column=0, sticky="w")
    e2 = tk.Entry(ax_box, textvariable=pulse_var, width=7)
    e2.grid(row=1, column=1)
    style_entry(e2)
    btn2 = tk.Button(ax_box, text="Test", width=7, command=lambda a=addr_hex, v=pulse_var, s=status_label: send_test_pulse(a, v, s))
    btn2.grid(row=1, column=2, padx=3)
    style_button(btn2, BTN_COLOR2)

    ppr_var = tk.StringVar(value="1600")
    tk.Label(ax_box, text="PPR:", bg=CARD_COLOR, fg=ACCENT2, font=LBL_FONT).grid(row=2, column=0, sticky="w")
    e3 = tk.Entry(ax_box, textvariable=ppr_var, width=7)
    e3.grid(row=2, column=1)
    style_entry(e3)
    btn3 = tk.Button(ax_box, text="Set", width=7, command=lambda a=addr_hex, v=ppr_var, s=status_label: send_set_ppr(a, v, s))
    btn3.grid(row=2, column=2, padx=3)
    style_button(btn3, BTN_COLOR2)

    relay_var = tk.IntVar(value=0)
    axes_relay_vars.append(relay_var) # MODIFIED: Store the variable
    cb1 = tk.Checkbutton(ax_box, text="Relay", variable=relay_var, command=lambda a=addr_hex, v=relay_var, s=status_label: send_relay(a, v, s))
    cb1.grid(row=3, column=0, sticky="w", pady=(2, 0))
    style_check(cb1)
    btn4 = tk.Button(ax_box, text="Homing", width=8, command=lambda a=addr_hex, s=status_label: send_homing(a, s))
    btn4.grid(row=3, column=2, padx=3, pady=(2, 0))
    style_button(btn4, BTN_COLOR3)

    status_label.grid(row=4, column=0, columnspan=3, sticky="w", pady=(4, 0))
    axes_status_labels.append(status_label)

# RIGHT: JOG CONTROL
jog_panel = tk.LabelFrame(main1, text="Jog Control", fg=ACCENT, font=TITLE_FONT, bg=CARD_COLOR, bd=2)
jog_panel.grid(row=0, column=1, sticky="nsew", padx=(0, 0))

def send_continuous_jog(addr_hex, direction, status_label):
    try:
        JOG_CONTINUOUS_CMD = 0x07
        speed_percent = int(speed_var.get())
        
        # --- 1. คำนวณและส่งคำสั่ง Jog สำหรับแกนที่เลือก ---
        min_freq, max_freq = AXES_FREQ_RANGE[addr_hex]
        freq = map_speed_to_freq(speed_percent, min_freq, max_freq) * direction
        
        if direction == 0:
            success_msg = f"Stop Jog -> {addr_hex}"
        else:
            success_msg = f"Start Jog (freq={freq}) -> {addr_hex}"
            
        freq_bytes = struct.pack('<h', freq)
        data = [JOG_CONTINUOUS_CMD] + list(freq_bytes)
        send_i2c_data(addr_hex, data, status_label, success_msg)

        # --- 2. [ส่วนแก้ไข] ถ้า Jog แกน Theta ให้ชดเชย Z ตามสัดส่วน ---
        if addr_hex == "0x0A":
            z_addr_hex = "0x0B"
            z_status_label = axes_status_labels[3] # status label ของแกน Z
            
            if direction == 0:
                # ถ้าหยุด Theta ก็หยุด Z ด้วย
                freq_z = 0
                success_msg_z = f"Stop Jog (Comp) -> {z_addr_hex}"
            else:
                # กำหนด "อัตราส่วน" ความเร็วของแกน Z เทียบกับ Theta
                COMPENSATION_RATIO = 0.00475 # <<< ปรับอัตราส่วนตรงนี้
                
                # คำนวณความเร็ว Z จากความเร็วของ Theta
                freq_z_float = freq * COMPENSATION_RATIO
                freq_z = int(freq_z_float)
                
                # ป้องกันกรณีปัดเป็น 0 ทำให้มอเตอร์ไม่หมุน
                if freq_z == 0 and direction != 0:
                    freq_z = -1 if direction > 0 else 1

                success_msg_z = f"Start Jog (Comp) (ratio freq={freq_z}) -> {z_addr_hex}"

            # --- 3. สร้างและส่งข้อมูล I2C สำหรับแกน Z ---
            freq_bytes_z = struct.pack('<h', freq_z)
            data_z = [JOG_CONTINUOUS_CMD] + list(freq_bytes_z)
            send_i2c_data(z_addr_hex, data_z, z_status_label, success_msg_z)

    except Exception as e:
        status_label.config(text=f"Jog command failed: {e}", fg="red")

def start_jog(event, addr_hex, direction, status_label):
    send_continuous_jog(addr_hex, direction, status_label)

def stop_jog(event, addr_hex, status_label):
    send_continuous_jog(addr_hex, 0, status_label)

for i, addr_hex in enumerate(AXES_LABELS):
    jog_box = tk.Frame(jog_panel, bg=CARD_COLOR)
    jog_box.pack(fill="x", pady=10, padx=12)
    tk.Label(jog_box, text=f"Axis {i + 1} [{addr_hex}]", font=LBL_FONT, bg=CARD_COLOR, fg="#a29bfe").pack(anchor="w")
    jog_btns = tk.Frame(jog_box, bg=CARD_COLOR)
    jog_btns.pack()
    btn_minus = tk.Button(jog_btns, text="-", width=5)
    btn_plus = tk.Button(jog_btns, text="+", width=5)
    style_button(btn_minus, BTN_COLOR3)
    style_button(btn_plus, BTN_COLOR)
    btn_minus.pack(side=tk.LEFT, padx=5)
    btn_plus.pack(side=tk.LEFT, padx=5)

    dir_plus, dir_minus = (1, -1)
    if addr_hex == "0x08": dir_plus, dir_minus = (-1, 1)

    btn_minus.bind('<ButtonPress-1>', lambda e, a=addr_hex, d=dir_minus, s=axes_status_labels[i]: start_jog(e, a, d, s))
    btn_minus.bind('<ButtonRelease-1>', lambda e, a=addr_hex, s=axes_status_labels[i]: stop_jog(e, a, s))
    btn_plus.bind('<ButtonPress-1>', lambda e, a=addr_hex, d=dir_plus, s=axes_status_labels[i]: start_jog(e, a, d, s))
    btn_plus.bind('<ButtonRelease-1>', lambda e, a=addr_hex, s=axes_status_labels[i]: stop_jog(e, a, s))

# BOTTOM BAR
bottom_panel = tk.Frame(tab1, bg=BG_COLOR)
bottom_panel.pack(fill="x", side=tk.BOTTOM, pady=8)

def toggle_relay_all():
    new_state = relay_all_var.get()
    for i, addr_hex in enumerate(addresses):
        axes_relay_vars[i].set(new_state) # Update individual checkbox
        try:
            relay_state = 1 if new_state else 0
            data = [0x04, relay_state]
            status_label = axes_status_labels[i]
            send_i2c_data(addr_hex, data, status_label, f"Relay {'OFF' if relay_state else 'ON'}")
        except Exception as e:
            axes_status_labels[i].config(text=f"Relay Failed: {e}", fg="red")

btn_homing_all = tk.Button(bottom_panel, text="Homing All & Reset", width=18)
btn_check = tk.Button(bottom_panel, text="Check Connection", width=18, command=check_connections)
relay_all_var = tk.IntVar(value=0)
cb_relay_all = tk.Checkbutton(bottom_panel, text="Relay All On/Off", variable=relay_all_var, command=toggle_relay_all)

# --- Gripper status label is created in the bottom panel ---
gripper_status_label = tk.Label(bottom_panel, text="Gripper Status: -", font=INFO_FONT, bg=BG_COLOR, width=20, anchor='w', fg="gray")

# Custom style for the relay checkbox to match the background
cb_relay_all.configure(bg=BG_COLOR, fg=ACCENT2, selectcolor="#273c75", activebackground=BG_COLOR, font=LBL_FONT, highlightthickness=0, bd=0)

style_button(btn_homing_all, BTN_COLOR2)
style_button(btn_check, "#00b894")

# --- Layout for the bottom panel ---
btn_homing_all.pack(side=tk.LEFT, padx=(20, 10))
cb_relay_all.pack(side=tk.LEFT, padx=10)
# --- Pack the gripper status label next to the relay checkbox ---
gripper_status_label.pack(side=tk.LEFT, padx=10)
btn_check.pack(side=tk.RIGHT, padx=20)


# ==================================================
# TAB 2: REMOTE ARM CONTROL (IK & AUTOMATION)
# ==================================================
tab2 = tk.Frame(notebook, bg=BG_COLOR)
notebook.add(tab2, text="Remote Arm Control")

main2 = tk.Frame(tab2, bg=BG_COLOR)
main2.pack(fill="both", expand=True, padx=8, pady=8)
main2.grid_columnconfigure(0, weight=4)
main2.grid_columnconfigure(0, weight=2)
main2.grid_rowconfigure(0, weight=1)

# --- Visualization Zone ---
vis_frame = tk.Frame(main2, bg=BG_COLOR)
vis_frame.grid(row=0, column=0, sticky="nsew", padx=(0, 10))
vis_frame.grid_rowconfigure(0, weight=3)
vis_frame.grid_rowconfigure(0, weight=2)
vis_frame.grid_columnconfigure(0, weight=1)

# 3D Graph
fig_3d = plt.Figure(figsize=(5, 4))
fig_3d.patch.set_facecolor(BG_COLOR)
ax_3d = fig_3d.add_subplot(111, projection='3d')
canvas_3d = FigureCanvasTkAgg(fig_3d, master=vis_frame)
canvas_3d.get_tk_widget().grid(row=0, column=0, sticky="nsew", pady=(4, 2))

# 2D Graph
fig_2d = plt.Figure(figsize=(4, 2))
fig_2d.patch.set_facecolor(BG_COLOR)
ax_2d = fig_2d.add_subplot(111)
canvas_2d = FigureCanvasTkAgg(fig_2d, master=vis_frame)
canvas_2d.get_tk_widget().grid(row=1, column=0, sticky="nsew", pady=(2, 4))


# --- Control Panel ---
right_panel = tk.Frame(main2, bg=BG_COLOR)
right_panel.grid(row=0, column=1, sticky="nsew")
right_panel.grid_rowconfigure(1, weight=1)

# --- IK Control Panel ---
ctrl_panel = tk.LabelFrame(right_panel, text="IK Control Panel", fg=ACCENT, font=TITLE_FONT, bg=CARD_COLOR, bd=2)
ctrl_panel.grid(row=0, column=0, sticky="ew", padx=0, pady=(0, 6))
ik_row = tk.Frame(ctrl_panel, bg=CARD_COLOR)
ik_row.pack(fill="x", pady=6, padx=8)

x_var, y_var, z_var, theta_var = tk.StringVar(value="100"), tk.StringVar(value="50"), tk.StringVar(value="150"), tk.StringVar(value="0")
for lbl, var in zip(["X:", "Y:", "Z:", "Θ:"], [x_var, y_var, z_var, theta_var]):
    frame = tk.Frame(ik_row, bg=CARD_COLOR)
    frame.pack(side=tk.LEFT, padx=4)
    tk.Label(frame, text=lbl, font=LBL_FONT, bg=CARD_COLOR, fg=ACCENT2).pack(side=tk.LEFT)
    e = tk.Entry(frame, textvariable=var, width=5)
    e.pack(side=tk.LEFT, padx=(2, 0))
    style_entry(e)

# --- Multi-Point Automation Panel ---
multi_panel = tk.LabelFrame(right_panel, text="Multi-Point Automation", fg=ACCENT, font=TITLE_FONT, bg=CARD_COLOR, bd=2)
multi_panel.grid(row=1, column=0, sticky="nsew", padx=0, pady=(6, 0))
multi_text = tk.Text(multi_panel, height=8, font=ENTRY_FONT, bg=BG_COLOR, fg="#b2bec3", insertbackground="white")
multi_text.insert("1.0", """# Format: G1 [X..] [Y..] [Z..] [A..] [F..]
G1 X50 Y350 Z45 F50
G1 Z0
G1 Y400 A0 F100
G1 X0 Y445 Z45 A90 F100""")
multi_text.pack(fill="both", expand=True, padx=8, pady=6)
current_line_label = tk.Label(multi_panel, text="Status: Ready", bg=CARD_COLOR, fg="#00b894", font=INFO_FONT)
current_line_label.pack(anchor="w", pady=(0, 6), padx=12)
multi_btns = tk.Frame(multi_panel, bg=CARD_COLOR)
multi_btns.pack(fill="x", pady=(0, 8), padx=8)

# --- IK and Automation Logic ---
prev_q1_send, prev_q2_send, prev_z, prev_theta_send = None, None, None, None
multi_points_cache = []
multi_current_index = 0

def solve_ik_2d(x, y, l1, l2, elbow_up=True):
    try:
        C2 = (x**2 + y**2 - l1**2 - l2**2) / (2 * l1 * l2)
        if not -1.0 <= C2 <= 1.0: return None, None
        S2 = math.sqrt(1 - C2**2)
        if not elbow_up: S2 = -S2
        q2 = math.atan2(S2, C2)
        k1 = l1 + l2 * C2
        k2 = l2 * S2
        q1 = math.atan2(y, x) - math.atan2(k2, k1)
        return math.degrees(q1), math.degrees(q2)
    except:
        return None, None

def interpolate_angles(q1_start, q2_start, q1_end, q2_end, steps=30):
    q1s = [q1_start + (q1_end - q1_start) * i / steps for i in range(steps + 1)]
    q2s = [q2_start + (q2_end - q2_start) * i / steps for i in range(steps + 1)]
    return q1s, q2s

def animate_move(q1_start, q2_start, q1_end, q2_end, z_start, z_end):
    try:
        if hasattr(canvas_3d,'ani') and canvas_3d.ani is not None:
            canvas_3d.ani.event_source.stop()
    except Exception:
        pass
    # --- Clear and Style 3D Plot ---
    ax_3d.clear()
    ax_3d.set_facecolor(CARD_COLOR)
    ax_3d.tick_params(axis='x', colors='white')
    ax_3d.tick_params(axis='y', colors='white')
    ax_3d.tick_params(axis='z', colors='white')
    ax_3d.view_init(elev=25, azim=45)
    ax_3d.set_box_aspect([1, 1, 0.7])
    ax_3d.set_xlim(-450, 450)
    ax_3d.set_ylim(-450, 450)
    ax_3d.set_zlim(0, z_base + 50)
    ax_3d.grid(True, color="#636e72", linestyle="--", linewidth=0.6, alpha=0.5)
    
    # --- Clear and Style 2D Plot ---
    ax_2d.clear()
    ax_2d.set_facecolor(CARD_COLOR)
    ax_2d.set_xlim(-450, 450)
    ax_2d.set_ylim(-450, 450)
    ax_2d.set_aspect('equal', adjustable='box')
    ax_2d.grid(True, color="#636e72", linestyle="--", linewidth=0.6, alpha=0.5)
    ax_2d.tick_params(axis='x', colors='white')
    ax_2d.tick_params(axis='y', colors='white')

    # --- IK Goal Calculation ---
    x_goal = l1 * math.cos(math.radians(q1_end)) + l2 * math.cos(math.radians(q1_end + q2_end))
    y_goal = l1 * math.sin(math.radians(q1_end)) + l2 * math.sin(math.radians(q1_end + q2_end))
    
    # --- Plot Goals ---
    ax_3d.scatter(x_goal, y_goal, z_end, c='#e74c3c', s=80, label="Target", depthshade=False)
    ax_2d.scatter(x_goal, y_goal, c='#e74c3c', s=80, label="Target")

    # --- Interpolate Data ---
    q1s, q2s = interpolate_angles(q1_start, q2_start, q1_end, q2_end)
    zs = [z_start + (z_end - z_start) * i / (len(q1s) - 1) for i in range(len(q1s))]
    
    # --- Create Plot Artists ---
    lines_3d = [ax_3d.plot([], [], [], 'k--', linewidth=1)[0],
                ax_3d.plot([], [], [], color=ACCENT, linewidth=4)[0],
                ax_3d.plot([], [], [], color=ACCENT2, linewidth=4)[0],
                ax_3d.plot([], [], [], 'g--', linewidth=2)[0]]
    
    lines_2d = [ax_2d.plot([], [], [], color=ACCENT, linewidth=4)[0],
                ax_2d.plot([], [], [], color=ACCENT2, linewidth=4)[0]]

    def update(i):
        q1, q2, z_tip = q1s[i], q2s[i], zs[i]
        x1, y1 = l1 * math.cos(math.radians(q1)), l1 * math.sin(math.radians(q1))
        x2, y2 = x1 + l2 * math.cos(math.radians(q1 + q2)), y1 + l2 * math.sin(math.radians(q1 + q2))
        
        # Update 3D lines
        lines_3d[0].set_data([0, 0], [0, 0]); lines_3d[0].set_3d_properties([0, z_base])
        lines_3d[1].set_data([0, x1], [0, y1]); lines_3d[1].set_3d_properties([z_base, z_base])
        lines_3d[2].set_data([x1, x2], [y1, y2]); lines_3d[2].set_3d_properties([z_base, z_base])
        lines_3d[3].set_data([x2, x2], [y2, y2]); lines_3d[3].set_3d_properties([z_base, z_tip])

        # Update 2D lines
        lines_2d[0].set_data([0, x1], [0, y1])
        lines_2d[1].set_data([x1, x2], [y1, y2])
        
        return lines_3d + lines_2d

    canvas_3d.ani = FuncAnimation(fig_3d, update, frames=len(q1s), interval=25, blit=True, repeat=False)
    canvas_3d.draw()
    canvas_2d.draw()


def move_to_new_point_and_send():
    target_point = {
        'x': float(x_var.get()),
        'y': float(y_var.get()),
        'z': float(z_var.get()),
        'theta': float(theta_var.get())
    }
    return pnp_move_and_wait(target_point)

def parse_multi_lines_tab():
    """
    Parses G-code (G1 commands only) from the multi_text widget.
    It will ignore any line that does not start with "G1".
    """
    global multi_points_cache, multi_current_index
    multi_points_cache, multi_current_index = [], 0
    
    # ใช้ตำแหน่งปัจจุบันของหุ่นยนต์เป็นค่าเริ่มต้น
    try:
        current_pos = {
            'x': float(x_var.get()),
            'y': float(y_var.get()),
            'z': float(z_var.get()),
            'theta': float(theta_var.get()),
            'speed': int(speed_var.get()) # เพิ่ม speed เข้ามาด้วย
        }
    except ValueError:
        current_pos = {'x': 100, 'y': 50, 'z': 150, 'theta': 0, 'speed': 50}

    input_lines = multi_text.get("1.0", "end").strip().split("\n")

    for line in input_lines:
        line = line.strip().upper()
        
        if not line or not line.startswith("G1"):
            continue 

        next_point = current_pos.copy()
        
        # ใช้ re.findall เพื่อหาค่าทั้งหมดในบรรทัด
        params = re.findall(r'([XYZAFT])\s*(-?\d+\.?\d*)', line)
        
        has_move = False
        for axis, value_str in params:
            try:
                value = float(value_str)
                if axis == 'X':
                    next_point['x'] = value
                    has_move = True
                elif axis == 'Y':
                    next_point['y'] = value
                    has_move = True
                elif axis == 'Z':
                    next_point['z'] = value
                    has_move = True
                elif axis == 'A': # ใช้ A แทน Theta
                    next_point['theta'] = value
                    has_move = True
                elif axis == 'F': # ใช้ F แทน Speed
                    next_point['speed'] = int(value)
            except ValueError:
                continue 
        
        if has_move and solve_ik_2d(next_point['x'], next_point['y'], l1, l2)[0] is not None:
            multi_points_cache.append(next_point)
            current_pos = next_point.copy()

    current_line_label.config(text=f"Prepared {len(multi_points_cache)} G-Code commands", fg="#2ecc71")

def run_next_point_tab():
    global multi_current_index
    if not multi_points_cache or multi_current_index >= len(multi_points_cache):
        current_line_label.config(text="No data or finished", fg="red" if not multi_points_cache else "green")
        return
    pt = multi_points_cache[multi_current_index]
    if 'speed' in pt and pt['speed'] is not None:
        speed_value = pt['speed']
        status_msg = f"Step {multi_current_index + 1}: Setting Speed to {speed_value}%"
        current_line_label.config(text=status_msg, fg="#ffeaa7") # สีเหลือง
        root.update()
        
        # 2. เรียกใช้ฟังก์ชันใหม่เพื่อตั้งค่าความเร็วทุกแกน
        set_speed_for_all_axes(speed_value)
        
        # 3. (Optional) อัปเดตหน้าจอ Slider ให้ตรงกับค่าที่ตั้ง
        speed_var.set(speed_value)
        
        time.sleep(0.1) # รอสักครู่เพื่อให้แน่ใจว่าค่าความเร็วถูกตั้งแล้ว
    status_msg = f"Step {multi_current_index + 1}/{len(multi_points_cache)}: X={pt['x']} Y={pt['y']} Z={pt['z']}"
    if 'theta' in pt: status_msg += f" T={pt['theta']}"
    if 'speed' in pt: status_msg += f" F={pt['speed']}"
    current_line_label.config(text=status_msg, fg="cyan")
    root.update()
    pnp_move_and_wait(pt)
    multi_current_index += 1
    if multi_current_index >= len(multi_points_cache):
        current_line_label.config(text="All points finished", fg="green")

def run_all_points_auto():
    parse_multi_lines_tab()
    if not multi_points_cache: return
    
    def auto_step():
        if multi_current_index < len(multi_points_cache):
            run_next_point_tab()
            root.after(100, auto_step)
    auto_step()


btn_send = tk.Button(ik_row, text="Send Delta", command=move_to_new_point_and_send)
btn_send.pack(side=tk.LEFT, padx=(10, 0), fill="y")
style_button(btn_send, BTN_COLOR)

# Configure grid for equal columns
multi_btns.grid_columnconfigure((0, 1, 2), weight=1)

btn_run_all = tk.Button(multi_btns, text="Run All", command=run_all_points_auto)
btn_prepare = tk.Button(multi_btns, text="Prepare", command=parse_multi_lines_tab)
btn_run_next = tk.Button(multi_btns, text="Run Next", command=run_next_point_tab)

# Place buttons in the grid
btn_run_all.grid(row=0, column=0, sticky="ew", padx=2)
btn_prepare.grid(row=0, column=1, sticky="ew", padx=2)
btn_run_next.grid(row=0, column=2, sticky="ew", padx=2)

# Style the buttons
style_button(btn_run_all, BTN_COLOR)
style_button(btn_prepare, BTN_COLOR2)
style_button(btn_run_next, BTN_COLOR)

# ==================================================
# TAB 3: PICK & PLACE
# ==================================================
tab3 = tk.Frame(notebook, bg=BG_COLOR)
notebook.add(tab3, text="Pick & Place")

main3 = tk.Frame(tab3, bg=BG_COLOR)
main3.pack(fill="both", expand=True, padx=24, pady=10)

main3.columnconfigure(0, weight=1)
main3.rowconfigure(2, weight=1)

# Place Point (row 0)
place_frame = tk.LabelFrame(main3, text="จุดวาง (Place Point)", font=LBL_FONT, bg=BG_COLOR, fg="#fff", padx=10, pady=6, bd=2)
place_frame.grid(row=0, column=0, sticky="ew", pady=(0, 8))
place_x_var = tk.StringVar(value="200")
place_y_var = tk.StringVar(value="350")
place_z_var = tk.StringVar(value="0")
place_theta_var = tk.StringVar(value="90")
for lbl, var in zip(["X:", "Y:", "Z:", "Theta:"], [place_x_var, place_y_var, place_z_var, place_theta_var]):
    tk.Label(place_frame, text=lbl, font=LBL_FONT, bg=BG_COLOR, fg=ACCENT2).pack(side=tk.LEFT, padx=(10, 2))
    entry = tk.Entry(place_frame, textvariable=var, width=8, font=ENTRY_FONT)
    entry.pack(side=tk.LEFT, padx=(0, 8))
    style_entry(entry)

# Gripper (row 1)
gripper_frame = tk.LabelFrame(main3, text="ตั้งค่า Gripper (Gripper Settings)", font=LBL_FONT, bg=BG_COLOR, fg="#fff", padx=10, pady=6, bd=2)
gripper_frame.grid(row=1, column=0, sticky="ew", pady=(0, 8))
gripper_open_var = tk.StringVar(value="180")
gripper_closed_var = tk.StringVar(value="0")
tk.Label(gripper_frame, text="มุมตอนเปิด (Open):", font=LBL_FONT, bg=BG_COLOR, fg=ACCENT2).pack(side=tk.LEFT, padx=(10, 2))
entry_open = tk.Entry(gripper_frame, textvariable=gripper_open_var, width=8, font=ENTRY_FONT)
entry_open.pack(side=tk.LEFT, padx=(0, 16))
style_entry(entry_open)
tk.Label(gripper_frame, text="มุมตอนปิด (Close):", font=LBL_FONT, bg=BG_COLOR, fg=ACCENT2).pack(side=tk.LEFT, padx=(0, 2))
entry_close = tk.Entry(gripper_frame, textvariable=gripper_closed_var, width=8, font=ENTRY_FONT)
entry_close.pack(side=tk.LEFT, padx=(0, 8))
style_entry(entry_close)

# Pick Points (row 2)
pick_frame = tk.LabelFrame(main3, text="จุดหยิบ (Pick Points)", font=LBL_FONT, bg=BG_COLOR, fg="#fff", padx=10, pady=6, bd=2)
pick_frame.grid(row=2, column=0, sticky="nsew", pady=(0, 8))
pick_points_canvas = tk.Canvas(pick_frame, bg=BG_COLOR, highlightthickness=0)
pick_points_scrollbar = ttk.Scrollbar(pick_frame, orient="vertical", command=pick_points_canvas.yview)
pick_points_scrollable = tk.Frame(pick_points_canvas, bg=BG_COLOR)
pick_points_scrollable.bind("<Configure>", lambda e: pick_points_canvas.configure(scrollregion=pick_points_canvas.bbox("all")))
pick_points_canvas.create_window((0, 0), window=pick_points_scrollable, anchor="nw")
pick_points_canvas.configure(yscrollcommand=pick_points_scrollbar.set)
pick_points_canvas.pack(side="left", fill="both", expand=True)
pick_points_scrollbar.pack(side="right", fill="y")

pick_point_entries = []
def add_pick_point_entry():
    row = tk.Frame(pick_points_scrollable, bg=BG_COLOR)
    row.pack(fill="x", pady=2, padx=2)
    idx = len(pick_point_entries) + 1
    tk.Label(row, text=f"จุดที่ {idx}:", font=LBL_FONT, bg=BG_COLOR, fg=ACCENT2).pack(side=tk.LEFT, padx=(6, 4))
    x_var_p, y_var_p, z_var_p, t_var_p = tk.StringVar(), tk.StringVar(), tk.StringVar(), tk.StringVar()
    for lbl, var, w in zip(["X:", "Y:", "Z:", "Theta:"], [x_var_p, y_var_p, z_var_p, t_var_p], [8, 8, 8, 8]):
        tk.Label(row, text=lbl, font=LBL_FONT, bg=BG_COLOR, fg=ACCENT2).pack(side=tk.LEFT, padx=(2, 2))
        entry = tk.Entry(row, textvariable=var, width=w, font=ENTRY_FONT)
        entry.pack(side=tk.LEFT, padx=(0, 8))
        style_entry(entry)
    pick_point_entries.append({'x': x_var_p, 'y': y_var_p, 'z': z_var_p, 'theta': t_var_p})
    pick_points_canvas.yview_moveto(1.0)
add_pick_point_entry()
pick_point_entries[0]['x'].set("50")
pick_point_entries[0]['y'].set("350")
pick_point_entries[0]['z'].set("0")
pick_point_entries[0]['theta'].set("90")

# Footer (row 3)
footer = tk.Frame(main3, bg=BG_COLOR)
footer.grid(row=3, column=0, sticky="ew", pady=(8, 2))

# Feedback labels (row 4)
pnp_status_feedback_frame = tk.Frame(main3, bg=BG_COLOR)
pnp_status_feedback_frame.grid(row=4, column=0, sticky="ew", pady=(0, 5))
pnp_status_label = tk.Label(pnp_status_feedback_frame, text="Status: Ready", font=LBL_FONT, bg=BG_COLOR, fg="cyan")
pnp_status_label.pack(side=tk.LEFT)
esp_feedback_label = tk.Label(pnp_status_feedback_frame, text="ESP32 Status: -", font=INFO_FONT, bg=BG_COLOR, fg="gray")
esp_feedback_label.pack(side=tk.RIGHT)


# --- START: PICK AND PLACE LOGIC (FROM t32) ---
pnp_task_running = False

def pnp_move_and_wait(target_point, axes_to_wait =None):
    global prev_q1_send, prev_q2_send, prev_z, prev_theta_send
    try:
        # --- 1. คำนวณค่า Delta ทั้งหมด (เหมือนเดิม) ---
        x_new = target_point['x']
        y_new = target_point['y'] 
        z_new = target_point['z'] 
        theta_new = target_point.get('theta', prev_theta_send if prev_theta_send is not None else 0) 

        q1_prev = prev_q1_send if prev_q1_send is not None else 90 
        q2_prev = prev_q2_send if prev_q2_send is not None else 0 
        z_prev = prev_z if prev_z is not None else 45 
        theta_prev = prev_theta_send if prev_theta_send is not None else 90

        q1_new, q2_new = solve_ik_2d(x_new, y_new, l1, l2) 
        if q1_new is None:
            pnp_status_label.config(text=f"ตำแหน่ง XY={x_new},{y_new} อยู่นอกระยะ", fg="red") 
            return False

        delta_q1 = -(q1_new - q1_prev) 
        delta_q2 = q2_new - q2_prev 
        delta_theta = theta_new - theta_prev 
        
        # [แก้ไข] คำนวณเฉพาะ Z ในแนวดิ่งแยกออกมา
        delta_z_vertical = map_z_to_deg(z_new) - map_z_to_deg(z_prev) 

        animate_move(q1_prev, q2_prev, q1_new, q2_new, z_prev, z_new) 

        # --- 2. [จังหวะที่ 1] เคลื่อนที่ XY และ Theta (พร้อมชดเชย Z อัตโนมัติ) ---
        pnp_status_label.config(text=f"กำลังเคลื่อนที่ XY และ Theta...", fg="blue") 
        root.update()

        axes_to_run_first = []
        if abs(delta_q1) > 0.01:
            send_angle("0x08", tk.StringVar(value=str(delta_q1)), dummy_status_label)
            axes_to_run_first.append("0x08") 
        if abs(delta_q2) > 0.01:
            send_angle("0x09", tk.StringVar(value=str(delta_q2)), dummy_status_label) 
            axes_to_run_first.append("0x09")
        
        # การเรียก send_angle("0x0A") จะไปเรียก execute_compensated_theta_move
        # ซึ่งจะสั่งให้แกน Z (0x0B) ขยับชดเชยไปพร้อมกันโดยอัตโนมัติ
        if abs(delta_theta) > 0.01:
            send_angle("0x0A", tk.StringVar(value=str(delta_theta)), dummy_status_label)
            axes_to_run_first.append("0x0A") 
            # เราจำเป็นต้องรอแกน Z ที่ขยับเพื่อชดเชยด้วย
            axes_to_run_first.append("0x0B")

        time.sleep(0.1)

        # รอให้การเคลื่อนที่ในจังหวะที่ 1 เสร็จสิ้น
        for addr in axes_to_run_first:
            if not wait_until_done(addr):
                pnp_status_label.config(text=f"Timeout ขณะรอแกน {addr}", fg="red") 
                return False

        # --- 3. [จังหวะที่ 2] เคลื่อนที่ Z ในแนวดิ่งเท่านั้น ---
        if abs(delta_z_vertical) > 0.01:
            pnp_status_label.config(text=f"กำลังเคลื่อนที่แกน Z...", fg="blue") 
            root.update()
            # ส่งค่า delta_z_vertical ตรงๆ ไม่มีการชดเชยอีก
            send_angle("0x0B", tk.StringVar(value=str(delta_z_vertical)), dummy_status_label)
            if not wait_until_done("0x0B"):
                pnp_status_label.config(text="Timeout ขณะรอแกน Z (0x0B)", fg="red") 
                return False

        # --- 4. อัปเดต state เมื่อทุกอย่างสำเร็จ ---
        prev_q1_send, prev_q2_send, prev_z, prev_theta_send = q1_new, q2_new, z_new, theta_new 
        x_var.set(str(x_new)); y_var.set(str(y_new)); z_var.set(str(z_new)); theta_var.set(str(theta_new)) 
        pnp_status_label.config(text=f"เคลื่อนที่สำเร็จ", fg="green")
        return True

    except Exception as e:
        pnp_status_label.config(text=f"เกิดข้อผิดพลาดในการเคลื่อนที่: {e}", fg="red") 
        return False

def pnp_move_maintain_orientation(target_point, axes_to_wait, world_theta):
    global prev_q1_send, prev_q2_send, prev_z, prev_theta_send
    try:
        # --- 1. คำนวณค่า Delta ทั้งหมด (เหมือนเดิม) ---
        x_new, y_new, z_new = target_point['x'], target_point['y'], target_point['z']

        q1_prev = prev_q1_send if prev_q1_send is not None else 90 
        q2_prev = prev_q2_send if prev_q2_send is not None else 0 
        z_prev = prev_z if prev_z is not None else 45 
        theta_prev = prev_theta_send if prev_theta_send is not None else 90 

        q1_new, q2_new = solve_ik_2d(x_new, y_new, l1, l2) 
        if q1_new is None:
            pnp_status_label.config(text=f"ตำแหน่ง XY={x_new},{y_new} อยู่นอกระยะ", fg="red") 
            return False

        theta_new = world_theta - q1_new - q2_new - THETA_CORRECTION_OFFSET 

        delta_q1 = -(q1_new - q1_prev)
        delta_q2 = q2_new - q2_prev

        delta_theta = theta_new - theta_prev 

        # [แก้ไข] คำนวณเฉพาะ Z ในแนวดิ่งแยกออกมา
        delta_z_vertical = map_z_to_deg(z_new) - map_z_to_deg(z_prev) 

        animate_move(q1_prev, q2_prev, q1_new, q2_new, z_prev, z_new) 
        
        # --- 2. [จังหวะที่ 1] เคลื่อนที่ XY และ Theta (พร้อมชดเชย Z อัตโนมัติ) ---
        pnp_status_label.config(text=f"กำลังเคลื่อนที่ XY (รักษาระนาบ)...", fg="blue") 
        root.update()

        axes_to_run_first = []
        if abs(delta_q1) > 0.01:
            send_angle("0x08", tk.StringVar(value=str(delta_q1)), dummy_status_label) 
            axes_to_run_first.append("0x08") 
        if abs(delta_q2) > 0.01:
            send_angle("0x09", tk.StringVar(value=str(delta_q2)), dummy_status_label) 
            axes_to_run_first.append("0x09") 
        if abs(delta_theta) > 0.01:
            send_angle("0x0A", tk.StringVar(value=str(delta_theta)), dummy_status_label)
            axes_to_run_first.append("0x0A") 
            axes_to_run_first.append("0x0B")

        time.sleep(0.1) 
        # รอให้การเคลื่อนที่ในจังหวะที่ 1 เสร็จสิ้น
        for addr in axes_to_run_first:
            if not wait_until_done(addr):
                pnp_status_label.config(text=f"Timeout ขณะรอแกน {addr}", fg="red") 
                return False

        # --- 3. [จังหวะที่ 2] เคลื่อนที่ Z ในแนวดิ่งเท่านั้น ---
        if abs(delta_z_vertical) > 0.01:
            pnp_status_label.config(text=f"กำลังเคลื่อนที่แกน Z...", fg="blue")
            root.update()
            send_angle("0x0B", tk.StringVar(value=str(delta_z_vertical)), dummy_status_label) 
            if not wait_until_done("0x0B"):
                pnp_status_label.config(text="Timeout ขณะรอแกน Z (0x0B)", fg="red")
                return False

        prev_q1_send, prev_q2_send, prev_z, prev_theta_send = q1_new, q2_new, z_new, theta_new 
        x_var.set(str(x_new)); y_var.set(str(y_new)); z_var.set(str(z_new)); theta_var.set(str(theta_new)) 
        pnp_status_label.config(text=f"เคลื่อนที่สำเร็จ", fg="green") 
        return True

    except Exception as e:
        pnp_status_label.config(text=f"เกิดข้อผิดพลาดในการเคลื่อนที่: {e}", fg="red") 
        return False

def run_pick_and_place():
    global pnp_task_running
    if pnp_task_running: return
    try:
        open_angle = float(gripper_open_var.get())
        closed_angle = float(gripper_closed_var.get())
        place_point = {
            'x': float(place_x_var.get()),
            'y': float(place_y_var.get()),
            'z': float(place_z_var.get()),
            'theta': float(place_theta_var.get()) if place_theta_var.get() else 0
        }
        pick_points = [
            {
                'x': float(v['x'].get()),
                'y': float(v['y'].get()),
                'z': float(v['z'].get()),
                'theta': float(v['theta'].get()) if v['theta'].get() else 0
            }
            for v in pick_point_entries if v['x'].get() and v['y'].get() and v['z'].get()
        ]
    except ValueError:
        messagebox.showerror("Error", "Invalid coordinates."); return
    if not pick_points:
        messagebox.showinfo("Info", "No pick points defined."); return

    pnp_task_running = True
    run_pnp_btn.config(state=tk.DISABLED)
    add_point_btn.config(state=tk.DISABLED)
    pnp_sequence_step(0, pick_points, place_point, open_angle,closed_angle)

def send_homing_theta():
    """Homing เฉพาะแกน theta และรอให้เสร็จ"""
    try:
        speed_percent = int(speed_var.get())
        min_freq, max_freq = AXES_FREQ_RANGE["0x0A"]
        freq = map_speed_to_freq(speed_percent, min_freq, max_freq)
        freq_bytes = freq.to_bytes(2, 'little')
        data = [0x05] + list(freq_bytes)
        send_i2c_data("0x0A", data, dummy_status_label, f"Homing Z @ {speed_percent}%")
        
        # รอให้ Homing เสร็จจริงๆ
        success = wait_until_done("0x0A")
        if success:
            # รีเซ็ตค่าล่าสุดของ theta หลังจาก Homing
            global prev_theta_send
            prev_theta_send = 90  # ตั้งค่าเป็น 0 หลังจาก Homing # รีเซ็ต 
            return True
        return False
    except Exception as e:
        pnp_status_label.config(text=f"Homing Theta Failed: {e}", fg="red")
        return False

def send_homing_z():
    """Homing เฉพาะแกน Z และรอให้เสร็จ"""
    try:
        speed_percent = int(speed_var.get())
        min_freq, max_freq = AXES_FREQ_RANGE["0x0B"]
        freq = map_speed_to_freq(speed_percent, min_freq, max_freq)
        freq_bytes = freq.to_bytes(2, 'little')
        data = [0x05] + list(freq_bytes)
        send_i2c_data("0x0B", data, dummy_status_label, f"Homing Z @ {speed_percent}%")
        
        # รอให้ Homing เสร็จจริงๆ
        success = wait_until_done("0x0B")
        if success:
            # รีเซ็ตค่าล่าสุดของ Z
            global prev_z
            prev_z = 45  # ตั้งค่าเป็น 0 หลังจาก Homing # รีเซ็ต theta เพื่อป้องกันการชดเชยที่ไม่ต้องการ
            
            # 🔴 ส่งคำสั่งหยุดการชดเชยทันทีหลัง Homing
            send_stop_z_compensation()
            
            
            return True
        return False
    except Exception as e:
        pnp_status_label.config(text=f"Homing Z Failed: {e}", fg="red")
        return False

# เพิ่มฟังก์ชันใหม่สำหรับหยุดการชดเชย Z
def send_stop_z_compensation():
    """ส่งคำสั่งหยุดการเคลื่อนที่ของแกน Z ทันที"""
    try:
        # ส่งคำสั่งหยุด (freq = 0) ไปยังแกน Z
        stop_data = [0x07] + [0x00, 0x00]  # Command 0x07 (JOG) with freq 0
        send_i2c_data("0x0B", stop_data, dummy_status_label, "Stop Z compensation")
    except Exception as e:
        print(f"Error stopping Z compensation: {e}")

def reset_prev_angles_theta():
    global prev_theta_send
    prev_theta_send = 0
    root.update()
    return True

def pnp_sequence_step(index, pick_points, place_point, open_angle, closed_angle):
    reset_prev_angles_theta()
    if index >= len(pick_points):
        actions = [
            ("กลับจุดพัก", lambda: pnp_move_maintain_orientation({'x': 0, 'y': 445, 'z': 45}, ['0x08', '0x09', '0x0B'], world_theta=90.0)),
            ("lower z axis", lambda: pnp_move_maintain_orientation({'x': 0, 'y': 445, 'z': 35},['0x08', '0x09', '0x0B'] , world_theta=60.0)),
            ("Home แกน theta สุดท้าย", lambda: send_homing_theta()), 
            ("Home แกน Z สุดท้าย", lambda: send_homing_z()),
            ("จบงาน: หุบ Gripper", lambda: set_servo_angle(closed_angle)),
            ("reset angle ", lambda: reset_prev_angles()),
        ]
        run_action_sequence(actions, None)
        return

    current_pick = pick_points[index]
    safe_z = 0

    actions = [
        # Home Z ก่อนเริ่มงานแต่ละจุดเพื่อ reset
        ("Home แกน Z ก่อนเริ่มงาน", lambda: send_homing_z()),
        ("หยุดชดเชย Z หลัง Homing", lambda: send_stop_z_compensation() or True),  # 🔴 เพิ่มบรรทัดนี้
        
        ("เตรียมพร้อม: กาง Gripper", lambda: set_servo_angle(open_angle)),
        
        ("เคลื่อนที่ไปจุดหยิบ", lambda: pnp_move_maintain_orientation({'x': current_pick['x'], 'y': current_pick['y'], 'z': safe_z}, ['0x08', '0x09', '0x0B'], world_theta=current_pick.get('theta', 0.0))),
        
        ("ลดระดับ Z เพื่อหยิบ", lambda: pnp_move_and_wait({'x': current_pick['x'], 'y': current_pick['y'], 'z': current_pick['z']}, ['0x0B'])),
        ("รอ Z ลงสุด", lambda: time.sleep(0.7) or True),
        
        ("หยิบ: หนีบ Gripper", lambda: set_servo_angle(closed_angle)),
        
        ("ยก Z กลับที่ปลอดภัย", lambda: pnp_move_and_wait({'x': current_pick['x'], 'y': current_pick['y'], 'z': safe_z}, ['0x0B'])),
        ("Home แกน Z หลังหยิบ", lambda: send_homing_z()),
        ("หยุดชดเชย Z หลัง Homing", lambda: send_stop_z_compensation() or True),  # 🔴 เพิ่มบรรทัดนี้
        ("wait z home", lambda: time.sleep(0.3) or True),
        
        ("เคลื่อนที่ไปจุดวาง", lambda: pnp_move_maintain_orientation({'x': place_point['x'], 'y': place_point['y'], 'z': safe_z}, ['0x08', '0x09', '0x0A'], world_theta=place_point.get('theta', 0.0))),
        
        ("ลดระดับ Z เพื่อวาง", lambda: pnp_move_and_wait({'x': place_point['x'], 'y': place_point['y'], 'z': place_point['z']}, ['0x0B'])),
        ("รอ Z ลงสุด", lambda: time.sleep(0.5) or True),
        
        ("วาง: กาง Gripper", lambda: set_servo_angle(open_angle)),
        
        ("ยก Z กลับที่ปลอดภัย", lambda: pnp_move_and_wait({'x': place_point['x'], 'y': place_point['y'], 'z': safe_z}, ['0x0B'])),
        ("Home แกน Z หลังวาง", lambda: send_homing_z()),
        ("หยุดชดเชย Z หลัง Homing", lambda: send_stop_z_compensation() or True),  # 🔴 เพิ่มบรรทัดนี้
        ("wait z home", lambda: time.sleep(0.3) or True),
    ]

    next_step_callback = lambda: pnp_sequence_step(index + 1, pick_points, place_point, open_angle, closed_angle)
    run_action_sequence(actions, next_step_callback)

def run_action_sequence(actions, on_complete_callback):
    global pnp_task_running
    if not actions:
        if on_complete_callback: on_complete_callback()
        else:
            pnp_task_running = False
            run_pnp_btn.config(state=tk.NORMAL)
            add_point_btn.config(state=tk.NORMAL)
            pnp_status_label.config(text="Pick & Place เสร็จสมบูรณ์", fg="green")
        return

    status_text, action_func = actions[0]
    pnp_status_label.config(text=status_text, fg="blue")
    root.update()

    action_result = action_func()
    if action_result == False:
        pnp_task_running = False
        run_pnp_btn.config(state=tk.NORMAL)
        add_point_btn.config(state=tk.NORMAL)
        pnp_status_label.config(text="ภารกิจล้มเหลว หยุดการทำงาน", fg="red")
        return

    root.after(100, lambda: run_action_sequence(actions[1:], on_complete_callback))

# --- END: PICK AND PLACE LOGIC (FROM t32) ---
def reset_prev_angles():
    global prev_q1_send, prev_q2_send, prev_z, prev_theta_send
    q1, q2 = solve_ik_2d(0, 445, l1, l2)
    prev_q1_send, prev_q2_send, prev_z, prev_theta_send = q1, q2, 45, 90
    x_var.set("0")
    y_var.set("445")
    z_var.set("45")
    theta_var.set("90")
    animate_move(90, 0, q1, q2, 0, 0)
    root.update()
    return True

def send_homing_all():
    speed_percent = int(speed_var.get())
    axes_group_1 = ["0x08", "0x09", "0x0A"]
    z_axis = "0x0B"
    
    pnp_status_label.config(text="Homing XY-Theta axes...", fg="orange")
    root.update()
    for addr_hex in axes_group_1:
        i = addresses.index(addr_hex)
        send_homing(addr_hex, axes_status_labels[i])
    
    for addr_hex in axes_group_1:
        if not wait_until_done(addr_hex):
            pnp_status_label.config(text=f"Timeout Homing {addr_hex}!", fg="red")
            return
    
    pnp_status_label.config(text="Homing Z axis...", fg="orange")
    root.update()
    send_homing(z_axis, axes_status_labels[3])
    if not wait_until_done(z_axis):
        pnp_status_label.config(text="Timeout Homing Z axis!", fg="red")
        return
        
    pnp_status_label.config(text="Homing Complete. Resetting angles.", fg="green")
    global after_homing
    after_homing = True
    reset_prev_angles()

btn_homing_all.config(command=send_homing_all)

# --- Contents of the footer frame ---
add_point_btn = tk.Button(footer, text="+ เพิ่มจุดหยิบ", font=BTN_FONT, bg="#43d17e", fg="white", width=14, command=add_pick_point_entry)
add_point_btn.pack(side=tk.LEFT, padx=(0, 16))
style_button(add_point_btn, "#27ae60")
run_pnp_btn = tk.Button(footer, text="เริ่มงาน (Run Pick & Place)", font=BTN_FONT, bg=BTN_COLOR3, fg="white", width=32, command=run_pick_and_place)
run_pnp_btn.pack(side=tk.RIGHT, padx=(0, 8))
style_button(run_pnp_btn, BTN_COLOR3)

# --- Initial State ---
reset_prev_angles()
root.mainloop()
