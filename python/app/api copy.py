
# import pandas as pd
import numpy as np
import sys, json, traceback


# file_path = './静态数据集1.csv'
# df = pd.read_csv(file_path)
# df['data'] = df['data'].apply(lambda x: ast.literal_eval(x))

#获取矩阵数据的相应格式
def getMatrixData(data) :
    left = list()
    right = list()
    for item in data:
        # 确保列表长度为1024
        if len(item) == 1024:
            matrix = [item[i * 32:(i + 1) * 32] for i in range(32)]
            # 拆分为两个16x32矩阵(即左右两个矩阵)
            left_matrix = [row[:16] for row in matrix]
            right_matrix = [row[16:] for row in matrix]
            # 统计左半部分（16x32矩阵）不为0的元素个数
            non_zero_count_left = sum(1 for row in left_matrix for elem in row if elem != 0)
            left.append(non_zero_count_left)
            # 统计右半部分（16x32矩阵）不为0的元素个数
            non_zero_count_right = sum(1 for row in right_matrix for elem in row if elem != 0)
            right.append(non_zero_count_right)
        else:
            print("数据长度不为1024，无法转换为32x32矩阵。")
    return left, right

# 这里直接拿到左右半区的压力点数曲线,计算相应的左右指针索引
# 统计计算的起始点和终止点，即超过最大值的80%的点数值才是有效数值，阈值可以自己设定，这里设置为0.8
def find_pressure_peak_interval(pressure_curve, threshold_ratio=0.8):
    """
    在压力曲线中找到峰值区间
    :param pressure_curve: 压力值列表
    :param threshold_ratio: 阈值比例（默认为0.8，即80%）
    :return: (left_index, right_index)
    """
    # 找到最大压力值及其对应索引
    peak_value = max(pressure_curve)
    peak_index = pressure_curve.index(peak_value)
    # 计算阈值
    threshold = peak_value * threshold_ratio
    # 向左移动直到找到阈值点
    left_index = peak_index
    while left_index > 0 and pressure_curve[left_index] >= threshold:
        left_index -= 1
    # 向右移动直到找到阈值点
    right_index = peak_index
    while right_index < len(pressure_curve) - 1 and pressure_curve[right_index] >= threshold:
        right_index += 1
    # 调整边界（确保在阈值点外侧）
    if left_index > 0:
        left_index += 1  # 回退到最后一个满足条件的点
    if right_index < len(pressure_curve) - 1:
        right_index -= 1  # 回退到最后一个满足条件的点
    return left_index, right_index

# 计算COP位置（直接传入一个包含多个半区matrix的列表）
def calculate_cop_corrected(pressure_grid, isRight):
    """
    计算32×16足底压力网格的COP坐标
    :param pressure_grid: 32×16二维列表
                        行索引(0-31)对应x坐标
                        列索引(0-15)对应y坐标
            isRight: 表示是否是右半区矩阵，右半区矩阵需要在x的基础上加上16
    :return: (cop_x, cop_y) 压力中心坐标
    """
    total_pressure = 0
    weighted_x = 0
    weighted_y = 0
    rows = len(pressure_grid)  # 32行
    cols = len(pressure_grid[0])  # 16列
    # 遍历整个压力网格
    # 因为矩阵分割了，所以要对右矩阵的索引加上半个分区的长度16
    if isRight:
        for x in range(rows):
            for y in range(cols - 16, cols):
                pressure = pressure_grid[x][y]
                total_pressure += pressure
                weighted_x += pressure * x
                weighted_y += pressure * (y + 16)
    else:
        for x in range(rows):
            for y in range(cols):
                pressure = pressure_grid[x][y]
                total_pressure += pressure
                weighted_x += pressure * x
                weighted_y += pressure * y
    if total_pressure <= 0: raise ValueError("当前无压力值")
    # 计算COP坐标
    cop_x = weighted_x / total_pressure
    cop_y = weighted_y / total_pressure
    return cop_x, cop_y


#计算左右脚COP
def get_serial_matrix_cop(left_left_index, left_right_index , right_left_index, right_right_index , data) :
    left_serial_matrix_cop = list()
    right_serial_matrix_cop = list()
    for index in range(left_left_index, left_right_index + 1):
        matrix = [data[index][i * 32:(i + 1) * 32] for i in range(32)]
        left_matrix = [row[:16] for row in matrix]
        leftIn, rightIn = calculate_cop_corrected(left_matrix, False)
        left_serial_matrix_cop.append([leftIn, rightIn])
    for index in range(right_left_index, right_right_index + 1):
        matrix = [data[index][i * 32:(i + 1) * 32] for i in range(32)]
        right_matrix = [row[16:] for row in matrix]
        leftIn, rightIn = calculate_cop_corrected(right_matrix, True)
        right_serial_matrix_cop.append([leftIn, rightIn])
    return left_serial_matrix_cop, right_serial_matrix_cop


# 样本熵相关指标（标准化后的容差阈值设置为0.2,即r，m表示模板长度）
def sample_entropy(time_series, m=2, r=0.2):
    N = len(time_series)
    if N <= m + 1:
        return 0
    # 标准化
    ts = (time_series - np.mean(time_series)) / np.std(time_series)

    # 给定的模板数
    def _get_vectors(m):
        return np.array([ts[i:i + m] for i in range(N - m)])

    # 获取向量组
    vecs_m = _get_vectors(m)
    vecs_m1 = _get_vectors(m + 1)
    # 计算m维距离矩阵
    dist_m = np.abs(vecs_m[:, None] - vecs_m[None, :])
    max_dist_m = np.max(dist_m, axis=2)
    # 统计m维相似度 (排除自身)
    sim_m = np.sum(max_dist_m <= r, axis=1) - 1
    # 计算m+1维相似度 (需满足m维相似)
    total_m1_sim = 0
    for i in range(len(vecs_m)):
        # 找到满足m维相似的点j
        mask = (max_dist_m[i] <= r) & (np.arange(len(vecs_m)) != i)
        if not np.any(mask):
            continue
        # 检查对应m+1维是否相似
        for j in np.where(mask)[0]:
            if np.abs(ts[i + m] - ts[j + m]) <= r:  # 检查新增点
                total_m1_sim += 1
    # 计算概率比
    B = np.sum(sim_m)
    A = total_m1_sim
    ratio = A / B if B > 0 else 0
    return -np.log(ratio) if ratio > 0 else 0




def calculate_cop_metrics(cop_trajectory, dt=0.08):
    """
    计算COP轨迹的关键生物力学指标
    参数:
        cop_trajectory: COP轨迹列表，格式为[[x1,y1], [x2,y2], ...]
        dt: 采样时间间隔（秒），默认0.08（对应12.5Hz）
    返回:
        dict: 包含15个指标的字典
    """
    # === 1. 数据预处理 ===
    cop_array = np.array(cop_trajectory)  # 转换为NumPy数组
    x = cop_array[:, 0]  # 提取所有点的X坐标（横向）
    y = cop_array[:, 1]  # 提取所有点的Y坐标（纵向）
    n = len(x)  # 数据点数量

    if n < 1:  # 无数据点
        return None

    # 计算轨迹的几何中心（平均位置）
    center = np.mean(cop_array, axis=0)
    # === 2. 位置相关指标 ===
    # 横向位移范围（最大X - 最小X）
    range_x = np.ptp(x)  # ptp = peak-to-peak
    # 纵向位移范围（最大Y - 最小Y）
    range_y = np.ptp(y)
    # 置信椭圆面积（95%置信区间的椭圆面积）
    centered_cop = cop_array - center  # 去中心化
    if n > 2:  # 至少3点才能计算协方差
        # 计算协方差矩阵
        cov = np.cov(centered_cop, rowvar=False)  # 修正：明确设置rowvar参数
        # 计算特征值
        eigenvalues = np.linalg.eigvalsh(cov)  # 使用hermitian矩阵特征值计算
        lambda1, lambda2 = sorted(eigenvalues, reverse=True)  # 确保正确排序
        # 95%置信椭圆对应卡方值 5.991 ≈ χ²(2, 0.95)
        ellipse_area = np.pi * 5.991 * np.sqrt(lambda1 * lambda2)
    else:
        ellipse_area = 0.0

    # === 3. 速度相关指标 ===
    if n > 1:  # 至少2点才能计算速度
        # 计算每一帧的瞬时速度（单位时间位移）
        vx = np.diff(x) / dt  # X方向速度
        vy = np.diff(y) / dt  # Y方向速度
        v_total = np.sqrt(vx ** 2 + vy ** 2)  # 合速度
        # RMS速度计算（速度信号的均方根）
        rms_vx = np.sqrt(np.mean(vx ** 2))
        rms_vy = np.sqrt(np.mean(vy ** 2))
        rms_v = np.sqrt(np.mean(v_total ** 2))
    else:  # 数据点不足时处理
        vx, vy, v_total = np.array([0.0]), np.array([0.0]), np.array([0.0])
        rms_vx = rms_vy = rms_v = 0.0
    # === 4. 加速度相关指标 ===
    if n > 2:  # 至少3点才能计算加速度
        # 计算每一帧的瞬时加速度（速度变化率）
        ax = np.diff(vx) / dt  # X方向加速度
        ay = np.diff(vy) / dt  # Y方向加速度
        a_total = np.sqrt(ax ** 2 + ay ** 2)  # 合加速度
        # RMS加速度计算
        rms_ax = np.sqrt(np.mean(ax ** 2))
        rms_ay = np.sqrt(np.mean(ay ** 2))
        rms_a = np.sqrt(np.mean(a_total ** 2))
    else:  # 数据点不足时处理
        ax, ay, a_total = np.array([0.0]), np.array([0.0]), np.array([0.0])
        rms_ax = rms_ay = rms_a = 0.0

    # === 5. 样本熵指标 ===
    # 位移指标（到中心的距离）
    displacement = np.sqrt((x - center[0]) ** 2 + (y - center[1]) ** 2)
    # 各维度的样本熵计算（需足够的数据点）
    min_samples = 30  # 样本熵要求的最小样本数
    # X方向的样本熵
    sampen_x = sample_entropy(x) if n > min_samples else 0.0
    # Y方向的样本熵
    sampen_y = sample_entropy(y) if n > min_samples else 0.0
    # 到中心距离的样本熵
    sampen_disp = sample_entropy(displacement) if n > min_samples else 0.0
    # 速度维度样本熵
    sampen_vx = sample_entropy(vx) if len(vx) > min_samples else 0.0
    sampen_vy = sample_entropy(vy) if len(vy) > min_samples else 0.0
    sampen_v = sample_entropy(v_total) if len(v_total) > min_samples else 0.0

    # === 返回结果 ===
    return {
        "range_x": float(range_x),
        "range_y": float(range_y),
        "ellipse_area": float(ellipse_area),
        "rms_vx": float(rms_vx),
        "rms_vy": float(rms_vy),
        "rms_v": float(rms_v),
        "rms_ax": float(rms_ax),
        "rms_ay": float(rms_ay),
        "rms_a": float(rms_a),
        "sampen_x": float(sampen_x),
        "sampen_y": float(sampen_y),
        "sampen_disp": float(sampen_disp),
        "sampen_vx": float(sampen_vx),
        "sampen_vy": float(sampen_vy),
        "sampen_v": float(sampen_v)
    }


def cal_cop_fromData(data):
    # print(data)
    left_data , right_data = getMatrixData(data)
    left_data_left_index , left_data_right_index = find_pressure_peak_interval(left_data , 0.8)
    right_data_left_index , right_data_right_index = find_pressure_peak_interval(right_data , 0.8)
    left_data_serial_matrix_cop, right_data_serial_matrix_cop = get_serial_matrix_cop(left_data_left_index, left_data_right_index, right_data_left_index, right_data_right_index , data)
    left_cop = calculate_cop_metrics(left_data_serial_matrix_cop)
    right_cop = calculate_cop_metrics(right_data_serial_matrix_cop)
    return {"left": left_cop, "right" :right_cop}

FUNCS = {"cal_cop_fromData": cal_cop_fromData,}

# left_cop, right_cop = cal_cop_fromData(df['data'])
# print("左区COP特征：", left_cop ,'sdk_____________')
# print("右区COP特征：", right_cop,'sdk_____________')

def main():
    try:
        print("[PY] waiting for stdin...", flush=True)
        for line in sys.stdin:            # ✅ 常驻：持续读取多条请求
            line = line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
                rid = req.get("id")
                fn  = req.get("fn")
                args = req.get("args") or {}
                if fn not in FUNCS:
                    raise ValueError(f"Unknown function: {fn}")
                data = FUNCS[fn](**args)
        # ✅ 只把最终 JSON 打到 stdout
                print(json.dumps({"id": rid, "ok": True, "data": data}), flush=True)
            except Exception as e:
                print(json.dumps({
                    "id": req.get("id") if 'req' in locals() else None,
                    "ok": False, "error": str(e), "trace": traceback.format_exc()
            }), flush=True)
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e), "trace": traceback.format_exc()}))

if __name__ == "__main__":
    main()


