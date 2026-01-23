import sys, json, traceback
import numpy as np
import os
import real_rime_and_replay_cop_speed2 as real_rime_and_replay_cop_speed 


def realtime_server(sensor_data , data_prev ,):
    
    result = real_rime_and_replay_cop_speed.process_frame_realtime(sensor_data , data_prev)
    return result


def replay_server(sensor_data):

    result = real_rime_and_replay_cop_speed.process_playback_batch(sensor_data , fps=20.0)

    return result

def ping():
    return {"pong": True}


FUNCS = {"ping": ping, "realtime_server": realtime_server , "replay_server" : replay_server}



def handle(req):
    fn = req.get("fn")
    if fn not in FUNCS:
        raise ValueError(f"Unknown function: {fn}")
    args = req.get("args") or {}
    return {"ok": True, "data": FUNCS[fn](**args)}
def main():
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