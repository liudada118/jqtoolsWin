import sys, json, traceback
import numpy as np
import os
from real_rime_and_replay_cop_speed2 import process_frame_realtime , process_playback_batch
import real_time_and_replay_cop_speed_2 as real_rime_and_replay_cop_speed
from Comprehensive_Indicators_4096_modify_input3 import extract_peak_frame , generate_foot_pressure_report


def realtime_server(sensor_data , data_prev ,):
    
    result = real_rime_and_replay_cop_speed.process_frame_realtime(sensor_data , data_prev)
    return result


def replay_server(sensor_data):

    result = real_rime_and_replay_cop_speed.process_playback_batch(sensor_data , fps=20.0)

    return result

def get_peak_frame(sensor_data):
    result = extract_peak_frame(sensor_data)
    return result

def generate_foot_pressure_report1(sensor_data , pdf_name , heatmap_png_path ,user_name, user_age, user_gender, user_id):
    print(pdf_name,user_name, user_age, user_gender, user_id)
    # return "111"
    result = generate_foot_pressure_report(sensor_data , pdf_name , heatmap_png_path ,user_name, user_age, user_gender, user_id)
    # print(result)
    return result

def ping():
    return {"pong": True}


FUNCS = {"ping": ping, "realtime_server": realtime_server , "replay_server" : replay_server , "get_peak_frame": get_peak_frame , "generate_foot_pressure_report1": generate_foot_pressure_report1}



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
