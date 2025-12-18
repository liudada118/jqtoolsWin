import sys, json, traceback
from integrated_system import IntegratedSeatSystem
import numpy as np
import os
count = 1
def server(sensor_data):
    newdata = np.array(sensor_data, dtype=np.uint8)
    # return 111
    result = system.process_frame(newdata)
    
    return result

def setParam(obj):
    print(obj , '111')
    # system.set_param(key, value)
    for key, value in obj.items():
        # print(key, value)
        system.set_param(key, value)
    print('set success')

def getParam():
    return system.config.get_all_with_comments()

def ping():
    return {"pong": True}


FUNCS = {"ping": ping, "server": server , "setParam" : setParam , "getParam" : getParam}



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

    system = IntegratedSeatSystem(CONFIG_PATH)
    main()