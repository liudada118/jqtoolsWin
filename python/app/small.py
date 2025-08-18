# python/app/api.py
import sys, json, traceback

def getMatrixData(data):
    left = []
    right = []
    for idx, item in enumerate(data):
        if len(item) == 1024:
            matrix = [item[i * 32:(i + 1) * 32] for i in range(32)]
            left_matrix  = [row[:16]  for row in matrix]
            right_matrix = [row[16:]  for row in matrix]
            non_zero_left  = sum(1 for row in left_matrix  for elem in row if elem != 0)
            non_zero_right = sum(1 for row in right_matrix for elem in row if elem != 0)
            left.append(non_zero_left)
            right.append(non_zero_right)
        else:
            # 用 stderr 打日志，避免污染 stdout
            print(f"[PY] 第{idx}条数据长度={len(item)}，不是1024，跳过", file=sys.stderr, flush=True)
    return {"left": left, "right": right}

FUNCS = {
    "getMatrixData": getMatrixData,
}

def main():
    try:
        print("[PY] 等待 stdin...", file=sys.stderr, flush=True)
        line = sys.stdin.readline()
        print(f"[PY] 收到: {line!r}", file=sys.stderr, flush=True)

        payload = json.loads(line or "{}")
        fn = payload.get("fn")
        args = payload.get("args") or {}
        if fn not in FUNCS:
            raise ValueError(f"Unknown function: {fn}")
        result = FUNCS[fn](**args)

        # ✅ 只在最后一行打印 JSON 给 Node 解析
        print(json.dumps({"ok": True, "data": result}))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e), "trace": traceback.format_exc()}))
    # 进程退出让 Node 端 close 触发
if __name__ == "__main__":
    main()
