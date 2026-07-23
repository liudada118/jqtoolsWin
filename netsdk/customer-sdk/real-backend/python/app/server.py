import json
import os
import sys
import traceback

import numpy as np

from integrated_system import IntegratedSeatSystem


def create_system():
    """根据当前 YAML 配置创建一套新的算法系统。"""
    return IntegratedSeatSystem(CONFIG_PATH)


def server(sensor_data):
    """处理一帧 144 点压力数据并返回汽车自适应算法结果。"""
    newdata = np.array(sensor_data, dtype=np.uint8)
    return system.process_frame(newdata)


def setParam(obj):
    """批量保存算法参数，并重建算法实例让全部配置立即生效。"""
    global system

    if not isinstance(obj, dict) or not obj:
        raise ValueError("obj 必须是非空参数对象")

    for key, value in obj.items():
        system.set_param(key, value, auto_save=False)

    system.config.save_to_file()
    system = create_system()
    return {"updated": len(obj), "paths": list(obj.keys())}


def getParam():
    """返回扁平化算法配置，每个参数同时包含当前值和中文注释。"""
    return system.config.get_all_with_comments()


def resetMessage():
    """清空当前按摩状态和历史状态。"""
    return system.reset_massage(clear_history=True)


def ping():
    """返回存活响应，供 Node.js 启动时检查 Python worker。"""
    return {"pong": True}


FUNCS = {
    "ping": ping,
    "server": server,
    "setParam": setParam,
    "getParam": getParam,
    "resetMessage": resetMessage,
}


def handle(req):
    """校验一条 JSON 请求并调用对应的算法函数。"""
    fn = req.get("fn")
    if fn not in FUNCS:
        raise ValueError(f"Unknown function: {fn}")
    args = req.get("args") or {}
    return {"ok": True, "data": FUNCS[fn](**args)}


def main():
    """持续读取 stdin，一行处理一条 JSON RPC 请求。"""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            rid = req.get("id")
            res = handle(req)
            print(json.dumps({"id": rid, **res}), flush=True)
        except Exception as error:
            print(json.dumps({
                "id": req.get("id") if "req" in locals() else None,
                "ok": False,
                "error": str(error),
                "trace": traceback.format_exc(),
            }), flush=True)


if __name__ == "__main__":
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    CONFIG_PATH = os.path.join(BASE_DIR, "sensor_config.yaml")
    system = create_system()
    main()
