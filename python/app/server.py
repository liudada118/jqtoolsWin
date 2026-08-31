import json
import os
import sys
import traceback
from contextlib import redirect_stdout

import numpy as np

from integrated_system import IntegratedSeatSystem


SENSOR_IDS = (1, 2)


def create_system():
    """根据当前 YAML 配置创建一套新的算法系统。"""
    # stdout 专用于 JSON-RPC；算法诊断输出统一转到 stderr。
    with redirect_stdout(sys.stderr):
        return IntegratedSeatSystem(CONFIG_PATH)


def create_systems():
    """为主、副传感器分别创建互不共享历史状态的算法系统。"""
    return {sensor_id: create_system() for sensor_id in SENSOR_IDS}


def normalize_sensor_id(sensor_id):
    """校验并返回传感器标识符，只接受主传感器 1 和副传感器 2。"""
    try:
        normalized = int(sensor_id)
    except (TypeError, ValueError) as error:
        raise ValueError("sensor_id 只允许为 1（主）或 2（副）") from error

    if normalized not in SENSOR_IDS:
        raise ValueError("sensor_id 只允许为 1（主）或 2（副）")
    return normalized


def get_system(sensor_id):
    """根据传感器标识符取得对应的独立算法实例。"""
    return systems[normalize_sensor_id(sensor_id)]


def server(sensor_data, sensor_id=1):
    """使用指定传感器的独立算法实例处理一帧 144 点压力数据。"""
    newdata = np.array(sensor_data, dtype=np.uint8)
    return get_system(sensor_id).process_frame(newdata)


def setParam(obj):
    """批量保存共享算法参数，并重建主、副两套算法实例使配置立即生效。"""
    global systems

    if not isinstance(obj, dict) or not obj:
        raise ValueError("obj 必须是非空参数对象")

    system = systems[SENSOR_IDS[0]]
    for key, value in obj.items():
        system.set_param(key, value, auto_save=False)

    system.config.save_to_file()
    systems = create_systems()
    return {"updated": len(obj), "paths": list(obj.keys())}


def getParam():
    """返回主、副传感器共用的扁平化算法配置及中文注释。"""
    return systems[SENSOR_IDS[0]].config.get_all_with_comments()


def resetMessage(sensor_id=None):
    """清空指定传感器的按摩状态；未指定时同时清空主、副两路。"""
    if sensor_id is not None:
        normalized = normalize_sensor_id(sensor_id)
        return {str(normalized): systems[normalized].reset_massage(clear_history=True)}
    return {
        str(current_id): systems[current_id].reset_massage(clear_history=True)
        for current_id in SENSOR_IDS
    }


def resetSystem(sensor_id=None):
    """重建指定传感器算法实例；未指定时重建主、副两套实例。"""
    global systems

    if sensor_id is not None:
        normalized = normalize_sensor_id(sensor_id)
        systems[normalized] = create_system()
        return {"reset": True, "sensor_ids": [normalized]}

    systems = create_systems()
    return {"reset": True, "sensor_ids": list(SENSOR_IDS)}


def ping():
    """返回存活响应，供 Node.js 启动时检查 Python worker。"""
    return {"pong": True}


FUNCS = {
    "ping": ping,
    "server": server,
    "setParam": setParam,
    "getParam": getParam,
    "resetMessage": resetMessage,
    "resetSystem": resetSystem,
}


def to_json_compatible(value):
    """递归将 NumPy 返回值转换为 JSON 原生类型，不改变算法字段结构。"""
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, dict):
        return {
            str(key): to_json_compatible(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [to_json_compatible(item) for item in value]
    return value


def handle(req):
    """校验一条 JSON 请求并调用对应的算法函数。"""
    fn = req.get("fn")
    if fn not in FUNCS:
        raise ValueError(f"Unknown function: {fn}")
    args = req.get("args") or {}
    with redirect_stdout(sys.stderr):
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
            print(json.dumps(to_json_compatible({"id": rid, **res})), flush=True)
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
    systems = create_systems()
    main()
