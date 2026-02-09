import sys, json, traceback
import numpy as np
import os
from real_rime_and_replay_cop_speed2 import process_frame_realtime , process_playback_batch
import real_time_and_replay_cop_speed_2 as real_rime_and_replay_cop_speed
from staticFoot.Comprehensive_Indicators_4096_modify_input3 import extract_peak_frame , generate_foot_pressure_report
from hand.get_adc_form_csv import process_glove_data_from_array
from foot.generate_pdf_front import analyze_gait_and_build_report
from foot.generate_video_front import generate_dashboard_video
from sitAndfoot.generate_ss_pdf_front import process_and_generate_report
from sitAndfoot.generate_ss_video_front import generate_combined_dashboard


def realtime_server(sensor_data , data_prev ,):
    
    result = real_rime_and_replay_cop_speed.process_frame_realtime(sensor_data , data_prev)
    return result


def replay_server(sensor_data):

    result = real_rime_and_replay_cop_speed.process_playback_batch(sensor_data , fps=20.0)

    return result

def ping():
    return {"pong": True}

def analyze_gait_and_build_report_with_csv(
    d1, d2, d3, d4, t1, t2, t3, t4, body_weight_kg, output_pdf, working_dir=None, csv_path=None
):
    import csv
    import json
    from datetime import datetime

    if csv_path:
        csv_out = csv_path
    elif output_pdf:
        base, _ = os.path.splitext(output_pdf)
        csv_out = base + "_input.csv"
    else:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        csv_out = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"gait_input_{ts}.csv")

    os.makedirs(os.path.dirname(csv_out), exist_ok=True)

    n = min(len(d1), len(d2), len(d3), len(d4), len(t1), len(t2), len(t3), len(t4))
    with open(csv_out, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["time1", "time2", "time3", "time4", "foot1", "foot2", "foot3", "foot4"])
        for i in range(n):
            writer.writerow([
                t1[i], t2[i], t3[i], t4[i],
                json.dumps(d1[i], ensure_ascii=False),
                json.dumps(d2[i], ensure_ascii=False),
                json.dumps(d3[i], ensure_ascii=False),
                json.dumps(d4[i], ensure_ascii=False),
            ])

    return analyze_gait_and_build_report(
        d1, d2, d3, d4, t1, t2, t3, t4, body_weight_kg, output_pdf, working_dir=working_dir
    )


def generate_dashboard_video_safe(d1, d2, d3, d4, t1, t2, t3, t4, output_filename="gait_dashboard.mp4"):
    import contextlib
    with contextlib.redirect_stdout(sys.stderr):
        return generate_dashboard_video(d1, d2, d3, d4, t1, t2, t3, t4, output_filename=output_filename)


FUNCS = {
    "ping": ping,
    "realtime_server": realtime_server,
    "replay_server": replay_server,
    "get_peak_frame": extract_peak_frame,
    "generate_foot_pressure_report": generate_foot_pressure_report,
    "process_glove_data_from_array": process_glove_data_from_array,
    "analyze_gait_and_build_report": analyze_gait_and_build_report_with_csv,
    "generate_dashboard_video": generate_dashboard_video_safe,
    "process_and_generate_report": process_and_generate_report,
    "generate_combined_dashboard": generate_combined_dashboard,
}



def handle(req):
    fn = req.get("fn")
    if fn not in FUNCS:
        raise ValueError(f"Unknown function: {fn}")
    args = req.get("args") or {}
    return {"ok": True, "data": FUNCS[fn](**args)}
def main():
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    # 持续读：一行一条请求
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            rid = req.get("id")
            res = handle(req)
            print(json.dumps({"id": rid, **res}), flush=True)  # ✅ stdout 仅输出 JSON
        except Exception as e:
            print(json.dumps({
                "id": req.get("id") if 'req' in locals() else None,
                "ok": False, "error": str(e), "trace": traceback.format_exc()
            }), flush=True)

if __name__ == "__main__":
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    CONFIG_PATH = os.path.join(BASE_DIR, "sensor_config.yaml")

    main()
