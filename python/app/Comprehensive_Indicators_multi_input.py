import sys, json, traceback

import math
import statistics
import matplotlib.pyplot as plt
import cv2
import pandas as pd
import ast
import numpy as np
from scipy.spatial.distance import euclidean, cdist
from matplotlib.colors import ListedColormap

# 设置matplotlib支持中文显示 - macOS适配
plt.rcParams['font.family'] = ['Arial Unicode MS', 'Helvetica', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False


# def load_csv_data(file_path):
#     """独立的CSV数据读取方法"""
#     print(f"正在读取CSV文件: {file_path}")
#     df = pd.read_csv(file_path)

#     # 预处理数据
#     processed_data = []
#     for _, row in df.iterrows():
#         # 解析数据并进行阈值过滤
#         data_array = ast.literal_eval(row['data'])
#         filtered_data = [value if value >= 4 else 0 for value in data_array]
#         processed_data.append(filtered_data)

#     print(f"成功读取 {len(processed_data)} 行数据")
#     return processed_data

def ping():
    return {"pong": True}

def preprocess_data_array(data_array):
    """预处理数据数组，创建类似DataFrame的结构"""
    processed_df = pd.DataFrame({'data': data_array})
    return processed_df


def extract_pressure_curves(data_array):
    """提取左右区域压力点数随时间变化的曲线"""
    left = []
    right = []

    for item in data_array:
        if len(item) == 4096:
            matrix = [item[i * 64:(i + 1) * 64] for i in range(64)]
            matrix = [[0 if value <= 4 else value for value in row] for row in matrix]

            left_matrix = [row[:32] for row in matrix]
            right_matrix = [row[32:] for row in matrix]

            non_zero_count_left = sum(1 for row in left_matrix for elem in row if elem != 0)
            non_zero_count_right = sum(1 for row in right_matrix for elem in row if elem != 0)

            left.append(non_zero_count_left)
            right.append(non_zero_count_right)
        else:
            print("数据长度不为4096，无法转换为64×64矩阵。")

    return left, right


def find_pressure_peak_interval(pressure_curve, threshold_ratio=0.8):
    """在压力曲线中找到峰值区间"""
    peak_value = max(pressure_curve)
    peak_index = pressure_curve.index(peak_value)
    threshold = peak_value * threshold_ratio

    left_index = peak_index
    while left_index > 0 and pressure_curve[left_index] >= threshold:
        left_index -= 1

    right_index = peak_index
    while right_index < len(pressure_curve) - 1 and pressure_curve[right_index] >= threshold:
        right_index += 1

    if left_index > 0:
        left_index += 1
    if right_index < len(pressure_curve) - 1:
        right_index -= 1

    return left_index, right_index


def calculate_cop_corrected(pressure_grid, isRight):
    """计算COP位置"""
    total_pressure = 0
    weighted_x = 0
    weighted_y = 0
    rows = len(pressure_grid)
    cols = len(pressure_grid[0])

    if isRight:
        for x in range(rows):
            for y in range(cols):
                pressure = pressure_grid[x][y]
                total_pressure += pressure
                weighted_x += pressure * x
                weighted_y += pressure * (y + 32)
    else:
        for x in range(rows):
            for y in range(cols):
                pressure = pressure_grid[x][y]
                total_pressure += pressure
                weighted_x += pressure * x
                weighted_y += pressure * y

    if total_pressure <= 0:
        raise ValueError("当前无压力值")

    cop_x = weighted_x / total_pressure
    cop_y = weighted_y / total_pressure
    return cop_x, cop_y


def calculate_cop_trajectories(df, left_curve, right_curve, threshold_ratio):
    """计算左右脚的COP轨迹"""
    left_left_index, left_right_index = find_pressure_peak_interval(left_curve, threshold_ratio)
    right_left_index, right_right_index = find_pressure_peak_interval(right_curve, threshold_ratio)

    left_serial_matrix_cop = []
    right_serial_matrix_cop = []

    for index in range(left_left_index, left_right_index + 1):
        matrix = [df.iloc[index]['data'][i * 64:(i + 1) * 64] for i in range(64)]
        left_matrix = [row[:32] for row in matrix]
        leftIn, rightIn = calculate_cop_corrected(left_matrix, False)
        left_serial_matrix_cop.append([leftIn, rightIn])

    for index in range(right_left_index, right_right_index + 1):
        matrix = [df.iloc[index]['data'][i * 64:(i + 1) * 64] for i in range(64)]
        right_matrix = [row[32:] for row in matrix]
        leftIn, rightIn = calculate_cop_corrected(right_matrix, True)
        right_serial_matrix_cop.append([leftIn, rightIn])

    return left_serial_matrix_cop, right_serial_matrix_cop


def dfs(data, x, y, visited, axias):
    """深度优先搜索算法"""
    if x < 0 or y < 0 or x >= data.shape[0] or y >= data.shape[1]:
        return
    if data[x][y] == 0 or visited[x][y] == 1:
        return
    visited[x][y] = 1
    axias.append([x, y])
    data[x][y] = 0
    dfs(data, x - 1, y, visited, axias)
    dfs(data, x + 1, y, visited, axias)
    dfs(data, x, y - 1, visited, axias)
    dfs(data, x, y + 1, visited, axias)
    return axias


def detect_heel_for_frame(frame_data, isRight):
    """检测单帧的脚跟区域"""
    area = []
    x_heel = []
    y_heel = []

    res_axias = []
    matrix = [frame_data[i * 64:(i + 1) * 64] for i in range(64)]

    if isRight:
        half_matrix = [row[32:] for row in matrix]
    else:
        half_matrix = [row[:32] for row in matrix]
    half_matrix = np.array(half_matrix)

    # 检查是否有压力数据
    if not np.any(half_matrix):
        return None, None, None

    for i in range(half_matrix.shape[0]):
        for j in range(half_matrix.shape[1]):
            if half_matrix[i][j] != 0:
                visited = np.zeros_like(half_matrix)
                axias = []
                axias = dfs(half_matrix.copy(), i, j, visited, axias)
                if axias:
                    res_axias.append(axias)

    if not res_axias:
        return None, None, None

    areaLen = [len(area) for area in res_axias]
    maxIndex = areaLen.index(max(areaLen))

    if isRight:
        maxArea = res_axias[maxIndex]
        adjusted_maxArea = [[x, y + 32] for x, y in maxArea]
        maxArea = adjusted_maxArea
    else:
        maxArea = res_axias[maxIndex]

    area.append(maxArea)
    x_values = [coord[0] for coord in maxArea]
    max_x = max(x_values)
    x_heel.append(max_x)
    filtered_data = [item for item in maxArea if item[0] == max_x]
    y_values = [item[1] for item in filtered_data]
    median_y = statistics.median(y_values)

    if isRight:
        y_heel.append(median_y + 32)
    else:
        y_heel.append(median_y)

    return area, x_heel, y_heel


def detect_heel(pressure_curve, isShow, isRight, df):
    """检测脚跟区域 - 使用峰值帧"""
    peak_value = max(pressure_curve)
    print(peak_value)
    PointsMaxIndex = pressure_curve.index(peak_value)

    frame_data = df.iloc[PointsMaxIndex]['data']
    return detect_heel_for_frame(frame_data, isRight)


def divide_x_regions(half_max_area):
    """将足部区域按比例3:4:4:4划分"""
    x_value = [coord[0] for coord in half_max_area]
    min_x = min(x_value)
    max_x = max(x_value)
    total_range = max_x - min_x

    section_boundaries = []
    current = min_x
    ratios = [3, 4, 4, 4]
    total_ratio = sum(ratios)

    for i, ratio in enumerate(ratios):
        if i == len(ratios) - 1:
            end = max_x
        else:
            end = current + (ratio / total_ratio) * total_range
        section_boundaries.append((current, end))
        current = end

    section_coords = [[] for _ in range(4)]
    for coord in half_max_area:
        x = coord[0]
        for i, (start, end) in enumerate(section_boundaries):
            if start <= x < end or (i == 3 and x == end):
                section_coords[i].append(coord)
                break

    return section_coords


def calculate_region_areas(section_coords):
    """计算足弓指数"""
    areas = [len(section) for section in section_coords]
    areaA = areas[3]
    areaB = areas[2]
    areaC = areas[1]
    total_area = areaA + areaB + areaC
    area_AI = areaB / total_area if total_area > 0 else 0

    if area_AI < 0.21:
        return area_AI, "高足弓(high arch)"
    elif 0.21 <= area_AI <= 0.26:
        return area_AI, "正常足弓(normal arch)"
    else:
        return area_AI, "扁平足(flat foot)"


def calculate_2d_angle(A, B, C):
    """计算二维坐标下角ACB"""
    if len(A) != 2 or len(B) != 2 or len(C) != 2:
        raise ValueError("所有点必须是二维坐标(x, y)")

    Ax, Ay = A[0], A[1]
    Bx, By = B[0], B[1]
    Cx, Cy = C[0], C[1]

    ca_x = Ax - Cx
    ca_y = Ay - Cy
    cb_x = Bx - Cx
    cb_y = By - Cy

    dot_product = ca_x * cb_x + ca_y * cb_y
    len_ca = math.sqrt(ca_x ** 2 + ca_y ** 2)
    len_cb = math.sqrt(cb_x ** 2 + cb_y ** 2)

    if len_ca == 0 or len_cb == 0:
        raise ValueError("点C不能与点A或点B重合")

    cos_theta = max(min(dot_product / (len_ca * len_cb), 1.0), -1.0)
    angle_rad = math.acos(cos_theta)
    angle_deg = math.degrees(angle_rad)

    return round(angle_deg, 2)


def get_b_point(b_region, isRight):
    """获取B点"""
    if not b_region:
        return None

    sorted_by_x = sorted(b_region, key=lambda coord: coord[0])
    x_groups = {}
    for coord in sorted_by_x:
        x_val = coord[0]
        if x_val not in x_groups:
            x_groups[x_val] = []
        x_groups[x_val].append(coord)

    first_points = []
    for x_val in sorted(x_groups.keys()):
        group = sorted(x_groups[x_val], key=lambda coord: coord[1])
        if group:
            if isRight:
                first_points.append(group[0])
            else:
                first_points.append(group[-1])

    if first_points:
        if isRight:
            b_point = max(first_points, key=lambda coord: coord[1])
        else:
            b_point = min(first_points, key=lambda coord: coord[1])
        return b_point
    else:
        return None


def calculate_clarke(section_coords, isRight):
    """计算Clarke角"""
    a_region = section_coords[3]
    if not a_region:
        return None, None

    a_x_median = np.percentile([coord[0] for coord in a_region], 50, method='lower')
    a_candidates = [coord for coord in a_region if coord[0] == a_x_median]
    if isRight:
        a_point = min(a_candidates, key=lambda coord: coord[1])
    else:
        a_point = max(a_candidates, key=lambda coord: coord[1])

    b_region = section_coords[2]
    b_point = get_b_point(b_region, isRight)
    if b_point is None:
        return None, None

    c_region = section_coords[1]
    if not c_region:
        return None, None

    c_x_median = np.percentile([coord[0] for coord in c_region], 50, method='lower')
    c_candidates = [coord for coord in c_region if coord[0] == c_x_median]
    if isRight:
        c_point = min(c_candidates, key=lambda coord: coord[1])
    else:
        c_point = max(c_candidates, key=lambda coord: coord[1])

    try:
        clarke_angle = calculate_2d_angle(a_point, b_point, c_point)
    except:
        return None, None

    if clarke_angle < 42:
        return clarke_angle, "扁平足(flat foot)"
    elif 42 <= clarke_angle <= 48:
        return clarke_angle, "正常足(normal foot)"
    else:
        return clarke_angle, "高弓足(high arch foot)"


def calculate_distance_to_line(line_point_a, line_point_b, point_c):
    """计算点c到直线ab的距离"""
    x1, y1 = line_point_a
    x2, y2 = line_point_b
    xc, yc = point_c

    if x2 == x1:
        A = 1
        B = 0
        C = -x1
    else:
        A = y2 - y1
        B = -(x2 - x1)
        C = (x2 - x1) * y1 - (y2 - y1) * x1

    denominator = math.sqrt(A * A + B * B)
    distance_c = abs(A * xc + B * yc + C) / denominator
    return distance_c


def get_perpendicular_line_equation(line_point_a, line_point_b, point_c):
    """计算通过点C和其到直线AB垂足的直线方程"""
    x1, y1 = line_point_a
    x2, y2 = line_point_b
    xc, yc = point_c

    if x1 == x2:
        foot_point = (x1, yc)
        return foot_point, (0, 1, -yc)
    elif y1 == y2:
        foot_point = (xc, y1)
        return foot_point, (1, 0, -xc)
    else:
        k_ab = (y2 - y1) / (x2 - x1)
        b_ab = y1 - k_ab * x1
        k_perp = -1 / k_ab

        x_foot = (k_ab * xc - k_perp * xc + yc - b_ab) / (k_ab - k_perp)
        y_foot = k_ab * x_foot + b_ab
        foot_point = (x_foot, y_foot)

        if math.isclose(x_foot, xc, abs_tol=1e-8):
            return foot_point, (1, 0, -xc)
        else:
            k_new = (y_foot - yc) / (x_foot - xc)
            b_new = yc - k_new * xc
            return foot_point, (k_new, -1, b_new)


def find_closest_point_to_foot(region, line_point_a, line_point_b, point_c, isRight):
    """在region中查找距离点C到直线AB的垂足最近的点"""
    if line_point_a[1] == line_point_b[1]:
        foot_point = [point_c[0], line_point_a[1]]
        same_x_points = [p for p in region if p[0] == foot_point[0]]
        if same_x_points:
            if isRight:
                closest_point = min(same_x_points, key=lambda p: p[1])
            else:
                closest_point = max(same_x_points, key=lambda p: p[1])
            return closest_point

    foot_point, _ = get_perpendicular_line_equation(line_point_a, line_point_b, point_c)

    min_distance = float('inf')
    closest_point = None
    for point in region:
        distance = math.sqrt((point[0] - foot_point[0]) ** 2 + (point[1] - foot_point[1]) ** 2)
        if distance < min_distance:
            min_distance = distance
            closest_point = point

    return closest_point


def calculate_staheli(section_coords, isRight):
    """计算Staheli指数"""
    a_region = section_coords[3]
    b_region = section_coords[2]
    c_region = section_coords[1]

    if not a_region or not b_region or not c_region:
        return None, None, None

    try:
        if isRight:
            sorted_a_region = sorted(a_region, key=lambda point: (point[0], point[1]))
            a_left_point = sorted_a_region[0]
            for a in sorted_a_region:
                if a_left_point[1] >= a[1]:
                    a_left_point = a

            a_x_min = min(a_region, key=lambda x: x[0])[0]
            a_x_max = max(a_region, key=lambda x: x[0])[0]
            a_x_mid = math.ceil((a_x_min + a_x_max) / 2)
            a_mid_right_point = max([p for p in a_region if a_x_mid == p[0]])

            c_left_point = min(c_region, key=lambda point: point[1])

            b_x_min = min(b_region, key=lambda x: x[0])[0]
            b_x_max = max(b_region, key=lambda x: x[0])[0]
            b_x_mid = math.ceil((b_x_min + b_x_max) / 2)
            b_mid_right_point = max([p for p in b_region if b_x_mid == p[0]])

            distance_heel = calculate_distance_to_line(a_left_point, c_left_point, a_mid_right_point)
            b_feet_point = find_closest_point_to_foot(b_region, a_left_point, c_left_point, b_mid_right_point, True)
            distance_middle = math.sqrt(
                (b_mid_right_point[0] - b_feet_point[0]) ** 2 + (b_mid_right_point[1] - b_feet_point[1]) ** 2)
            staheli_distance = distance_middle / distance_heel
        else:
            sorted_a_region = sorted(a_region, key=lambda point: (point[0], point[1]))
            a_left_point = sorted_a_region[0]
            for a in sorted_a_region:
                if a_left_point[1] <= a[1]:
                    a_left_point = a

            a_x_min = min(a_region, key=lambda x: x[0])[0]
            a_x_max = max(a_region, key=lambda x: x[0])[0]
            a_x_mid = math.ceil((a_x_min + a_x_max) / 2)
            a_mid_right_point = min([p for p in a_region if a_x_mid == p[0]])

            c_left_point = max(c_region, key=lambda point: point[1])

            b_x_min = min(b_region, key=lambda x: x[0])[0]
            b_x_max = max(b_region, key=lambda x: x[0])[0]
            b_x_mid = math.ceil((b_x_min + b_x_max) / 2)
            b_mid_right_point = min([p for p in b_region if b_x_mid == p[0]])

            distance_heel = calculate_distance_to_line(a_left_point, c_left_point, a_mid_right_point)
            b_feet_point = find_closest_point_to_foot(b_region, a_left_point, c_left_point, b_mid_right_point, False)
            distance_middle = math.sqrt(
                (b_mid_right_point[0] - b_feet_point[0]) ** 2 + (b_mid_right_point[1] - b_feet_point[1]) ** 2)
            staheli_distance = distance_middle / distance_heel

        return staheli_distance, distance_middle, distance_heel
    except:
        return None, None, None


def calculate_single_frame_arch_features(frame_data):
    """计算单帧的足弓特征"""
    try:
        # 检测左右脚跟区域
        left_area, left_x_heel, left_y_heel = detect_heel_for_frame(frame_data, False)
        right_area, right_x_heel, right_y_heel = detect_heel_for_frame(frame_data, True)

        if left_area is None or right_area is None:
            return None

        # 划分区域
        left_max_area = left_area[0]
        right_max_area = right_area[0]
        left_section_coords = divide_x_regions(left_max_area)
        right_section_coords = divide_x_regions(right_max_area)

        # 计算各种足弓指标
        left_area_ai, left_area_type = calculate_region_areas(left_section_coords)
        right_area_ai, right_area_type = calculate_region_areas(right_section_coords)

        left_clarke_angle, left_clarke_type = calculate_clarke(left_section_coords, False)
        right_clarke_angle, right_clarke_type = calculate_clarke(right_section_coords, True)

        left_staheli, left_distance_middle, left_distance_heel = calculate_staheli(left_section_coords, False)
        right_staheli, right_distance_middle, right_distance_heel = calculate_staheli(right_section_coords, True)

        return {
            'left_foot': {
                'area_index': left_area_ai,
                'area_type': left_area_type,
                'clarke_angle': left_clarke_angle,
                'clarke_type': left_clarke_type,
                'staheli_ratio': left_staheli,
                'distance_middle': left_distance_middle,
                'distance_heel': left_distance_heel,
                'section_coords': left_section_coords,
                'max_area': left_max_area
            },
            'right_foot': {
                'area_index': right_area_ai,
                'area_type': right_area_type,
                'clarke_angle': right_clarke_angle,
                'clarke_type': right_clarke_type,
                'staheli_ratio': right_staheli,
                'distance_middle': right_distance_middle,
                'distance_heel': right_distance_heel,
                'section_coords': right_section_coords,
                'max_area': right_max_area
            }
        }
    except:
        return None


def calculate_multi_frame_arch_features(data_array):
    """计算多帧的足弓特征并取平均"""
    print(f"检测到多帧数据 ({len(data_array)} 帧)，开始计算每帧足弓特征...")

    all_frame_results = []
    valid_frames = 0

    # 计算每一帧的足弓特征
    for idx, frame_data in enumerate(data_array):
        if idx % 50 == 0:
            print(f"处理进度: {idx}/{len(data_array)}")

        frame_result = calculate_single_frame_arch_features(frame_data)

        if frame_result is not None:
            all_frame_results.append(frame_result)
            valid_frames += 1

    print(f"有效帧数: {valid_frames}")

    if not all_frame_results:
        print("没有有效的足弓特征数据")
        return None

    # 计算平均值
    left_area_indices = [r['left_foot']['area_index'] for r in all_frame_results if
                         r['left_foot']['area_index'] is not None]
    right_area_indices = [r['right_foot']['area_index'] for r in all_frame_results if
                          r['right_foot']['area_index'] is not None]

    left_clarke_angles = [r['left_foot']['clarke_angle'] for r in all_frame_results if
                          r['left_foot']['clarke_angle'] is not None]
    right_clarke_angles = [r['right_foot']['clarke_angle'] for r in all_frame_results if
                           r['right_foot']['clarke_angle'] is not None]

    left_staheli_ratios = [r['left_foot']['staheli_ratio'] for r in all_frame_results if
                           r['left_foot']['staheli_ratio'] is not None]
    right_staheli_ratios = [r['right_foot']['staheli_ratio'] for r in all_frame_results if
                            r['right_foot']['staheli_ratio'] is not None]

    left_distance_middles = [r['left_foot']['distance_middle'] for r in all_frame_results if
                             r['left_foot']['distance_middle'] is not None]
    right_distance_middles = [r['right_foot']['distance_middle'] for r in all_frame_results if
                              r['right_foot']['distance_middle'] is not None]

    left_distance_heels = [r['left_foot']['distance_heel'] for r in all_frame_results if
                           r['left_foot']['distance_heel'] is not None]
    right_distance_heels = [r['right_foot']['distance_heel'] for r in all_frame_results if
                            r['right_foot']['distance_heel'] is not None]

    # 计算平均值和判断类型
    def get_average_and_type(values, type_func):
        if not values:
            return None, "无数据"
        avg_val = np.mean(values)
        return avg_val, type_func(avg_val)

    def area_type_func(ai):
        if ai < 0.21:
            return "高足弓(high arch)"
        elif 0.21 <= ai <= 0.26:
            return "正常足弓(normal arch)"
        else:
            return "扁平足(flat foot)"

    def clarke_type_func(angle):
        if angle < 42:
            return "扁平足(flat foot)"
        elif 42 <= angle <= 48:
            return "正常足(normal foot)"
        else:
            return "高弓足(high arch foot)"

    # 使用第一帧的区域划分信息用于显示
    first_frame_result = all_frame_results[0]

    # 计算平均足弓特征
    left_avg_area_index, left_avg_area_type = get_average_and_type(left_area_indices, area_type_func)
    right_avg_area_index, right_avg_area_type = get_average_and_type(right_area_indices, area_type_func)

    left_avg_clarke_angle, left_avg_clarke_type = get_average_and_type(left_clarke_angles, clarke_type_func)
    right_avg_clarke_angle, right_avg_clarke_type = get_average_and_type(right_clarke_angles, clarke_type_func)

    left_avg_staheli = np.mean(left_staheli_ratios) if left_staheli_ratios else None
    right_avg_staheli = np.mean(right_staheli_ratios) if right_staheli_ratios else None

    left_avg_distance_middle = np.mean(left_distance_middles) if left_distance_middles else None
    right_avg_distance_middle = np.mean(right_distance_middles) if right_distance_middles else None

    left_avg_distance_heel = np.mean(left_distance_heels) if left_distance_heels else None
    right_avg_distance_heel = np.mean(right_distance_heels) if right_distance_heels else None

    return {
        'left_foot': {
            'area_index': left_avg_area_index,
            'area_type': left_avg_area_type,
            'clarke_angle': left_avg_clarke_angle,
            'clarke_type': left_avg_clarke_type,
            'staheli_ratio': left_avg_staheli,
            'distance_middle': left_avg_distance_middle,
            'distance_heel': left_avg_distance_heel,
            # 'section_coords': first_frame_result['left_foot']['section_coords'],  # 用于显示
            'max_area': first_frame_result['left_foot']['max_area']  # 用于显示
        },
        'right_foot': {
            'area_index': right_avg_area_index,
            'area_type': right_avg_area_type,
            'clarke_angle': right_avg_clarke_angle,
            'clarke_type': right_avg_clarke_type,
            'staheli_ratio': right_avg_staheli,
            'distance_middle': right_avg_distance_middle,
            'distance_heel': right_avg_distance_heel,
            # 'section_coords': first_frame_result['right_foot']['section_coords'],  # 用于显示
            'max_area': first_frame_result['right_foot']['max_area']  # 用于显示
        },
        'frame_count': valid_frames,
        'is_multi_frame': True
    }


def calculate_complete_arch_features(data_array, left_curve, right_curve, show_plots=False):
    """计算完整的足弓特征 - 自动判断单帧还是多帧"""

    # 判断是否为多帧数据
    if len(data_array) > 1:
        print(f"检测到多帧数据 ({len(data_array)} 帧)")
        return calculate_multi_frame_arch_features(data_array)
    else:
        print("检测到单帧数据")
        # 创建单帧的DataFrame用于兼容原有代码
        df = preprocess_data_array(data_array)

        # 使用原来的单帧计算方法
        left_area, left_x_heel, left_y_heel = detect_heel(left_curve, False, False, df)
        right_area, right_x_heel, right_y_heel = detect_heel(right_curve, False, True, df)

        # 划分区域
        left_max_area = left_area[0]
        right_max_area = right_area[0]
        left_section_coords = divide_x_regions(left_max_area)
        right_section_coords = divide_x_regions(right_max_area)

        # 计算各种足弓指标
        left_area_ai, left_area_type = calculate_region_areas(left_section_coords)
        right_area_ai, right_area_type = calculate_region_areas(right_section_coords)

        left_clarke_angle, left_clarke_type = calculate_clarke(left_section_coords, False)
        right_clarke_angle, right_clarke_type = calculate_clarke(right_section_coords, True)

        left_staheli, left_distance_middle, left_distance_heel = calculate_staheli(left_section_coords, False)
        right_staheli, right_distance_middle, right_distance_heel = calculate_staheli(right_section_coords, True)

        return {
            'left_foot': {
                'area_index': left_area_ai,
                'area_type': left_area_type,
                'clarke_angle': left_clarke_angle,
                'clarke_type': left_clarke_type,
                'staheli_ratio': left_staheli,
                'distance_middle': left_distance_middle,
                'distance_heel': left_distance_heel,
                'section_coords': left_section_coords,
                'max_area': left_max_area
            },
            'right_foot': {
                'area_index': right_area_ai,
                'area_type': right_area_type,
                'clarke_angle': right_clarke_angle,
                'clarke_type': right_clarke_type,
                'staheli_ratio': right_staheli,
                'distance_middle': right_distance_middle,
                'distance_heel': right_distance_heel,
                'section_coords': right_section_coords,
                'max_area': right_max_area
            },
            'frame_count': 1,
            'is_multi_frame': False
        }


def sample_entropy(time_series, m=2, r=0.2):
    """计算样本熵"""
    N = len(time_series)
    if N <= m + 1:
        return 0

    ts = (time_series - np.mean(time_series)) / np.std(time_series)

    def get_vectors(m):
        return np.array([ts[i:i + m] for i in range(N - m)])

    vecs_m = get_vectors(m)
    dist_m = np.abs(vecs_m[:, None] - vecs_m[None, :])
    max_dist_m = np.max(dist_m, axis=2)
    sim_m = np.sum(max_dist_m <= r, axis=1) - 1

    total_m1_sim = 0
    for i in range(len(vecs_m)):
        mask = (max_dist_m[i] <= r) & (np.arange(len(vecs_m)) != i)
        if not np.any(mask):
            continue
        for j in np.where(mask)[0]:
            if np.abs(ts[i + m] - ts[j + m]) <= r:
                total_m1_sim += 1

    B = np.sum(sim_m)
    A = total_m1_sim
    ratio = A / B if B > 0 else 0
    return -np.log(ratio) if ratio > 0 else 0


def calculate_cop_metrics(cop_trajectory, dt=0.08):
    """计算COP轨迹的关键生物力学指标"""
    cop_array = np.array(cop_trajectory)
    x = cop_array[:, 0]
    y = cop_array[:, 1]
    n = len(x)

    if n < 1:
        return None

    center = np.mean(cop_array, axis=0)

    # 位置相关指标
    range_x = np.ptp(x)
    range_y = np.ptp(y)

    # 置信椭圆面积
    centered_cop = cop_array - center
    if n > 2:
        cov = np.cov(centered_cop, rowvar=False)
        eigenvalues = np.linalg.eigvalsh(cov)
        lambda1, lambda2 = sorted(eigenvalues, reverse=True)
        ellipse_area = np.pi * 5.991 * np.sqrt(lambda1 * lambda2)
    else:
        ellipse_area = 0.0

    # 速度相关指标
    if n > 1:
        vx = np.diff(x) / dt
        vy = np.diff(y) / dt
        v_total = np.sqrt(vx ** 2 + vy ** 2)
        rms_vx = np.sqrt(np.mean(vx ** 2))
        rms_vy = np.sqrt(np.mean(vy ** 2))
        rms_v = np.sqrt(np.mean(v_total ** 2))
    else:
        vx, vy, v_total = np.array([0.0]), np.array([0.0]), np.array([0.0])
        rms_vx = rms_vy = rms_v = 0.0

    # 加速度相关指标
    if n > 2:
        ax = np.diff(vx) / dt
        ay = np.diff(vy) / dt
        a_total = np.sqrt(ax ** 2 + ay ** 2)
        rms_ax = np.sqrt(np.mean(ax ** 2))
        rms_ay = np.sqrt(np.mean(ay ** 2))
        rms_a = np.sqrt(np.mean(a_total ** 2))
    else:
        ax, ay, a_total = np.array([0.0]), np.array([0.0]), np.array([0.0])
        rms_ax = rms_ay = rms_a = 0.0

    # 样本熵指标
    displacement = np.sqrt((x - center[0]) ** 2 + (y - center[1]) ** 2)
    min_samples = 30

    sampen_x = sample_entropy(x) if n > min_samples else 0.0
    sampen_y = sample_entropy(y) if n > min_samples else 0.0
    sampen_disp = sample_entropy(displacement) if n > min_samples else 0.0
    sampen_vx = sample_entropy(vx) if len(vx) > min_samples else 0.0
    sampen_vy = sample_entropy(vy) if len(vy) > min_samples else 0.0
    sampen_v = sample_entropy(v_total) if len(v_total) > min_samples else 0.0

    return {
        "横向偏移（range）": float(range_x),
        "纵向偏移（range）": float(range_y),
        "置信椭圆面积": float(ellipse_area),
        "横向速度（RMS）": float(rms_vx),
        "纵向速度（RMS）": float(rms_vy),
        "合速度（RMS）": float(rms_v),
        "横向加速度（RMS）": float(rms_ax),
        "纵向加速度（RMS）": float(rms_ay),
        "合加速度（RMS）": float(rms_a),
        "横向偏移（SampEn）": float(sampen_x),
        "纵向偏移（SampEn）": float(sampen_y),
        "合偏移（SampEn）": float(sampen_disp),
        "横向速度（SampEn）": float(sampen_vx),
        "纵向速度（SampEn）": float(sampen_vy),
        "合速度（SampEn）": float(sampen_v)
    }


def calculate_sway_features(cop_trajectory, fps=12.5, r_radius=0.1, time_window=0.5):
    """计算摇摆特征"""
    n = len(cop_trajectory)
    if n < int(fps * 0.5):
        return None

    cop = np.array(cop_trajectory)
    center = np.mean(cop, axis=0)
    centered_cop = cop - center

    # 摇摆密度曲线
    window_size = int(fps * time_window)
    density_curve = np.zeros(n)
    for i in range(n):
        start = max(0, i - window_size // 2)
        end = min(n, i + window_size // 2)
        dists = cdist([centered_cop[i]], centered_cop[start:end])[0]
        density_curve[i] = np.sum(dists <= r_radius)

    # 摇摆长度曲线
    length_curve = np.zeros(n)
    window_points = int(fps * time_window)
    for i in range(n):
        start = max(0, i - window_points // 2)
        end = min(n, i + window_points // 2)
        center_point = centered_cop[i]
        points_in_window = centered_cop[start:end]
        dists = cdist([center_point], points_in_window)[0]
        mask = dists <= r_radius
        in_radius_points = points_in_window[mask]
        segment_length = 0
        if len(in_radius_points) > 1:
            for j in range(1, len(in_radius_points)):
                segment_length += euclidean(in_radius_points[j], in_radius_points[j - 1])
        length_curve[i] = segment_length

    # 摇摆半径曲线
    window_points = int(fps * time_window)
    radius_curve = []
    for i in range(window_points // 2, n - window_points // 2):
        window = centered_cop[i - window_points // 2: i + window_points // 2]
        if len(window) >= 3:
            _, radius = cv2.minEnclosingCircle(window.astype(np.float32))
            radius_curve.append(radius)
        else:
            radius_curve.append(0)

    features = {
        "摇摆密度_峰值": float(np.max(density_curve)),
        "摇摆密度_均值": float(np.mean(density_curve)),
        "摇摆密度_标准差": float(np.std(density_curve)),
        "摇摆长度_峰值": float(np.max(length_curve)),
        "摇摆长度_均值": float(np.mean(length_curve)),
        "摇摆长度_标准差": float(np.std(length_curve)),
        "摇摆半径_峰值": float(np.max(radius_curve)) if radius_curve else 0.0,
        "摇摆半径_均值": float(np.mean(radius_curve)) if radius_curve else 0.0,
        "摇摆半径_标准差": float(np.std(radius_curve)) if radius_curve else 0.0
    }
    return features


def visualize_foot_regions(ax, section_coords, max_area, colors, section_names, title):
    """可视化单脚的区域划分"""
    all_x = [coord[0] for coord in max_area]
    all_y = [coord[1] for coord in max_area]
    x_min, x_max = min(all_x), max(all_x)
    y_min, y_max = min(all_y), max(all_y)

    x_range_extended = (x_min - 5, x_max + 5)
    y_range_extended = (y_min - 5, y_max + 5)

    ax.set_xlim(x_range_extended)
    ax.set_ylim(y_range_extended)
    ax.grid(True, alpha=0.3, linestyle='--')

    grid_size = 1.0
    x_bins = np.arange(x_range_extended[0], x_range_extended[1] + grid_size, grid_size)
    y_bins = np.arange(y_range_extended[0], y_range_extended[1] + grid_size, grid_size)

    heatmap_data = np.zeros((len(y_bins) - 1, len(x_bins) - 1))

    for i, coords in enumerate(section_coords):
        for coord in coords:
            x, y = coord
            x_idx = np.digitize(x, x_bins) - 1
            y_idx = np.digitize(y, y_bins) - 1
            if 0 <= x_idx < heatmap_data.shape[1] and 0 <= y_idx < heatmap_data.shape[0]:
                heatmap_data[y_idx, x_idx] = i + 1

    cmap_colors = ['white'] + colors
    cmap = ListedColormap(cmap_colors)

    im = ax.imshow(heatmap_data,
                   extent=[x_range_extended[0], x_range_extended[1],
                           y_range_extended[0], y_range_extended[1]],
                   origin='lower',
                   cmap=cmap,
                   aspect='auto',
                   alpha=0.6)

    for i, (coords, color) in enumerate(zip(section_coords, colors)):
        if coords:
            x_vals = [coord[0] for coord in coords]
            y_vals = [coord[1] for coord in coords]
            ax.scatter(x_vals, y_vals, color=color, s=50, alpha=0.8,
                       label=section_names[i], edgecolors='black', linewidth=0.5)

    ratios = [3, 4, 4, 4]
    total_ratio = sum(ratios)
    total_x_range = x_max - x_min

    x_boundaries = [x_min]
    current_x = x_min
    for ratio in ratios:
        next_x = current_x + (ratio / total_ratio) * total_x_range
        x_boundaries.append(next_x)
        ax.axvline(x=next_x, color='red', linestyle='--', linewidth=2, alpha=0.8)
        current_x = next_x

    for i in range(len(x_boundaries) - 1):
        center_x = (x_boundaries[i] + x_boundaries[i + 1]) / 2
        ax.text(center_x, y_max + 2, section_names[i], ha='center', va='bottom',
                fontsize=10, fontweight='bold', backgroundcolor='white',
                bbox=dict(boxstyle="round,pad=0.3", facecolor='lightgray', alpha=0.8))

    for i, coords in enumerate(section_coords):
        if coords:
            x_vals = [coord[0] for coord in coords]
            y_vals = [coord[1] for coord in coords]
            center_x = np.mean(x_vals)
            center_y = np.mean(y_vals)

            ax.text(center_x, center_y, f'Region{i + 1}\n{len(coords)}pts',
                    ha='center', va='center', fontsize=9, fontweight='bold', color='white',
                    bbox=dict(boxstyle="circle,pad=0.3", facecolor=colors[i], alpha=0.9))

    ax.set_xlabel('X Coordinate', fontsize=12)
    ax.set_ylabel('Y Coordinate', fontsize=12)
    ax.set_title(f'{title}\n(Ratio 3:4:4:4)', fontsize=14, fontweight='bold')
    ax.legend(loc='upper right')
    ax.set_xticks(np.arange(int(x_min), int(x_max) + 1, 5))
    ax.set_yticks(np.arange(int(y_min), int(y_max) + 1, 5))


def create_comprehensive_plot(left_cop, right_cop, arch_results, save_path=None):
    """创建一个综合的分析图表"""
    # 创建2x3的子图布局，给表格更多空间
    fig = plt.figure(figsize=(22, 16))
    gs = fig.add_gridspec(2, 3, hspace=0.3, wspace=0.25, width_ratios=[1, 1, 1.2])

    # 1. COP轨迹图 (左上)
    ax1 = fig.add_subplot(gs[0, 0])
    if left_cop:
        x_coords = [point[0] for point in left_cop]
        y_coords = [point[1] for point in left_cop]
        n_points = len(x_coords)

        scatter1 = ax1.scatter(x_coords, y_coords, c=range(n_points),
                               cmap='viridis', s=50, alpha=0.8,
                               edgecolors='white', linewidth=0.5)
        ax1.plot(x_coords, y_coords, 'gray', linewidth=2, alpha=0.5)

        ax1.set_title('COP-Left Trajectory', fontsize=14, fontweight='bold')
        ax1.set_xlabel('X-axis (Lateral Position)', fontsize=10)
        ax1.set_ylabel('Y-axis (Anterior-Posterior Position)', fontsize=10)
        ax1.grid(True, alpha=0.3)

        # 添加小的颜色条
        cbar1 = plt.colorbar(scatter1, ax=ax1, shrink=0.6)
        cbar1.set_label('Time Sequence', fontsize=8)

    # 2. COP轨迹图 (右上)
    ax2 = fig.add_subplot(gs[0, 1])
    if right_cop:
        x_coords = [point[0] for point in right_cop]
        y_coords = [point[1] for point in right_cop]
        n_points = len(x_coords)

        scatter2 = ax2.scatter(x_coords, y_coords, c=range(n_points),
                               cmap='viridis', s=50, alpha=0.8,
                               edgecolors='white', linewidth=0.5)
        ax2.plot(x_coords, y_coords, 'gray', linewidth=2, alpha=0.5)

        ax2.set_title('COP-Right Trajectory', fontsize=14, fontweight='bold')
        ax2.set_xlabel('X-axis (Lateral Position)', fontsize=10)
        ax2.set_ylabel('Y-axis (Anterior-Posterior Position)', fontsize=10)
        ax2.grid(True, alpha=0.3)

        # 添加小的颜色条
        cbar2 = plt.colorbar(scatter2, ax=ax2, shrink=0.6)
        cbar2.set_label('Time Sequence', fontsize=8)

    # 3. 足弓特征指标表格 (右侧) - 精确对齐
    ax3 = fig.add_subplot(gs[:, 2])
    ax3.axis('off')

    # 准备表格数据
    def safe_format(value, decimal_places=4):
        if value is None:
            return "N/A"
        return f'{value:.{decimal_places}f}'

    # 添加多帧信息到标题
    title_suffix = ""
    if arch_results.get('is_multi_frame', False):
        title_suffix = f" ({arch_results.get('frame_count', 0)}帧平均值)"

    table_data = [
        ['指标', '左脚', '右脚'],
        ['足弓指数', safe_format(arch_results["left_foot"]["area_index"]),
         safe_format(arch_results["right_foot"]["area_index"])],
        ['足弓类型', arch_results["left_foot"]["area_type"], arch_results["right_foot"]["area_type"]],
        ['Clarke角度', safe_format(arch_results["left_foot"]["clarke_angle"], 2) + '°',
         safe_format(arch_results["right_foot"]["clarke_angle"], 2) + '°'],
        ['Clarke类型', arch_results["left_foot"]["clarke_type"], arch_results["right_foot"]["clarke_type"]],
        ['Staheli比值', safe_format(arch_results["left_foot"]["staheli_ratio"]),
         safe_format(arch_results["right_foot"]["staheli_ratio"])],
        ['足中宽度', safe_format(arch_results["left_foot"]["distance_middle"], 2),
         safe_format(arch_results["right_foot"]["distance_middle"], 2)],
        ['足跟宽度', safe_format(arch_results["left_foot"]["distance_heel"], 2),
         safe_format(arch_results["right_foot"]["distance_heel"], 2)],
    ]

    # 🔥 关键修改：让表格完全占满整个子图区域
    table = ax3.table(cellText=table_data[1:],
                      colLabels=table_data[0],
                      cellLoc='center',
                      loc='center',
                      bbox=[0.0, 0.0, 1.0, 1.0])  # 完全占满整个ax3区域

    # 设置表格样式
    table.auto_set_font_size(False)
    table.set_fontsize(12)  # 增大字体
    table.scale(1.0, 3.0)  # 🔥 显著增加行高

    # 配色方案
    header_color = '#F9A602'
    label_color = '#F9A602'
    data_color = '#FFF8DC'

    # 设置标题行样式
    for i in range(3):
        table[(0, i)].set_facecolor(header_color)
        table[(0, i)].set_text_props(weight='bold', color='white', fontsize=13)

    # 设置数据行样式
    data_rows = len(table_data) - 1
    for i in range(1, data_rows + 1):
        for j in range(3):
            if j == 0:
                table[(i, j)].set_facecolor(label_color)
                table[(i, j)].set_text_props(weight='bold', fontsize=12, color='white')
            else:
                table[(i, j)].set_facecolor(data_color)
                table[(i, j)].set_text_props(fontsize=12, color='#B8860B')

    # 添加边框
    for key, cell in table.get_celld().items():
        cell.set_linewidth(1)
        cell.set_edgecolor('#DDD')

    # 4. 左脚足弓区域划分 (左下)
    ax4 = fig.add_subplot(gs[1, 0])
    colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#F9A602']
    section_names = ['Region 1', 'Region 2', 'Region 3', 'Region 4']

    visualize_foot_regions(ax4, arch_results['left_foot']['section_coords'],
                           arch_results['left_foot']['max_area'],
                           colors, section_names, "Left Foot Regions")

    # 5. 右脚足弓区域划分 (右下)
    ax5 = fig.add_subplot(gs[1, 1])
    visualize_foot_regions(ax5, arch_results['right_foot']['section_coords'],
                           arch_results['right_foot']['max_area'],
                           colors, section_names, "Right Foot Regions")

    # 添加总标题
    fig.suptitle('(闭眼)足底压力综合分析报告', fontsize=24, fontweight='bold', y=0.98, color='#B8860B')

    # 保存或显示图像
    # if save_path:
    #     plt.savefig(save_path, dpi=300, bbox_inches='tight')
    #     print(f"图像已保存到: {save_path}")

    plt.show()
    plt.close()


def cal_cop_fromData(data_array, threshold_ratio=0.8, fps=12.5, r_radius=0.1, time_window=0.5, show_plots=True,
                     save_path=None):
    """
    分析数组中的足底压力数据（主函数）

    参数:
    data_array: 足底压力数据数组，每个元素是一个包含4096个数值的列表
    threshold_ratio: 峰值阈值比例
    fps: 采样频率
    r_radius: 摇摆半径
    time_window: 时间窗口
    show_plots: 是否显示图表
    save_path: 图像保存路径
    """
    print(f"正在分析数据数组，共 {len(data_array)} 行数据")
    # print(len(data_array(0)))
    # 2. 提取左右区域压力点数曲线
    left_curve, right_curve = extract_pressure_curves(data_array)
    
    # 3. 创建DataFrame用于COP轨迹计算
    df = preprocess_data_array(data_array)

    # 4. 计算COP轨迹（使用峰值区间）
    left_cop, right_cop = calculate_cop_trajectories(df, left_curve, right_curve, threshold_ratio)
    
    # 5. 计算足弓特征（自动判断单帧还是多帧）
    arch_results = calculate_complete_arch_features(data_array, left_curve, right_curve, False)
    
    if arch_results is None:
        print("无法计算足弓特征")
        return None

    # 6. 计算COP指标
    left_cop_metrics = calculate_cop_metrics(left_cop)
    right_cop_metrics = calculate_cop_metrics(right_cop)

    # 7. 计算摇摆特征
    left_sway_features = calculate_sway_features(left_cop, fps, r_radius, time_window)
    right_sway_features = calculate_sway_features(right_cop, fps, r_radius, time_window)

    # 8. 组织结果
    results = {
        'left_cop_metrics': left_cop_metrics,
        'right_cop_metrics': right_cop_metrics,
        'left_sway_features': left_sway_features,
        'right_sway_features': right_sway_features,
        'arch_features': arch_results
    }

    print(results)

    # 9. 打印足弓特征结果
    # if arch_results.get('is_multi_frame', False):
    #     print(f"\n=== 多帧数据分析结果 ({arch_results.get('frame_count')}帧平均) ===")
    # else:
    #     print(f"\n=== 单帧数据分析结果 ===")
    #
    # print(f"足弓指数： {arch_results['left_foot']['area_index']:.4f}")
    # print(f"左脚: {arch_results['left_foot']['area_type']}")
    # print(f"足弓指数： {arch_results['right_foot']['area_index']:.4f}")
    # print(f"右脚: {arch_results['right_foot']['area_type']}")
    #
    # print("基于角度clarke计算的足弓指数：")
    # print(f"Clarke角度为： {arch_results['left_foot']['clarke_angle']:.2f}")
    # print(f"左脚: {arch_results['left_foot']['clarke_type']}")
    # print(f"Clarke角度为： {arch_results['right_foot']['clarke_angle']:.2f}")
    # print(f"右脚: {arch_results['right_foot']['clarke_type']}")
    #
    # print("基于中足宽度和足跟宽度的比值")
    # print(
    #     f"足中宽度： {arch_results['left_foot']['distance_middle']:.2f} 足跟宽度： {arch_results['left_foot']['distance_heel']:.2f} staheli比值 {arch_results['left_foot']['staheli_ratio']:.4f}")
    # print(f"左脚: {arch_results['left_foot']['staheli_ratio']:.4f}")
    # print(
    #     f"足中宽度： {arch_results['right_foot']['distance_middle']:.2f} 足跟宽度： {arch_results['right_foot']['distance_heel']:.2f} staheli比值 {arch_results['right_foot']['staheli_ratio']:.4f}")
    # print(f"右脚: {arch_results['right_foot']['staheli_ratio']:.4f}")

    # 10. 显示综合图表
    # if show_plots:
    #     create_comprehensive_plot(left_cop, right_cop, arch_results, save_path)

    return results


# 使用示例
# if __name__ == "__main__":
    # 方法1: 从CSV文件读取数据然后分析
    # file_path = "D:\AA前端工作文档\AA前端工作文档\JQtools\算法包\911\/1.csv"
    # # save_path = '/Users/xupeirong/juqiao/results/comprehensive_analysis.png'
    # save_path = None
    # # 读取CSV数据
    # # data_array = load_csv_data(file_path)

    # # 分析数据
    # results = cal_cop_fromData(data_array, show_plots=True)
    # print(results)
    # 方法2: 如果您已经有数据数组，可以直接使用
    # your_data_array = [[...], [...], ...]  # 您的数据数组
    # results = cal_cop_fromData(your_data_array, show_plots=True)

# def getData():
#     your_data_array = [[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,2,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,2,2,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,3,0,3,0,0,0,0,0,0,0,0,0,0,1,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,22,8,58,3,0,0,0,0,0,0,0,0,0,12,44,6,19,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,15,13,10,62,12,0,0,0,0,0,0,0,0,0,7,26,2,3,24,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,20,7,3,6,38,7,0,0,0,0,0,0,0,0,0,1,25,14,8,2,26,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,4,19,17,19,27,1,0,0,0,0,0,0,0,0,0,11,25,21,26,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,12,25,22,16,21,6,0,0,0,0,0,0,0,0,0,9,18,14,20,19,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,22,17,22,17,13,0,0,0,0,0,0,0,0,0,0,0,12,14,22,26,22,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,34,20,11,11,2,0,0,0,0,0,0,0,0,0,0,0,2,5,22,37,34,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,41,34,14,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,27,30,23,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,26,57,29,2,0,0,0,0,0,0,0,0,0,0,0,0,1,1,11,29,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,44,40,4,1,0,0,0,0,0,0,0,0,0,0,0,1,7,33,21,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,33,32,7,2,0,0,0,0,0,0,0,0,0,0,1,2,29,45,8,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,32,28,7,0,0,0,0,0,0,0,0,0,0,2,26,36,24,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,33,26,15,0,0,0,0,0,0,0,0,0,0,33,42,34,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,24,35,25,0,0,0,0,0,0,0,0,0,0,28,44,40,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,21,33,18,7,0,0,0,0,0,0,0,0,12,38,32,40,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,25,34,29,10,0,0,0,0,0,0,0,0,12,32,39,19,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,47,50,2,0,0,0,0,0,0,0,0,0,50,35,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,2,2,0,0,0,0,0,0,0,0,0,0,3,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,3,2,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,6,4,0,1,0,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,1,0,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,2,1,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,2,4,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,2,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0] , [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,2,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,2,0,2,0,0,0,0,0,0,0,0,0,0,2,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,20,8,54,3,0,0,0,0,0,0,0,0,0,17,46,8,24,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,15,12,10,60,15,0,0,0,0,0,0,0,0,0,9,29,2,3,24,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,17,7,3,7,37,7,0,0,0,0,0,0,0,0,0,1,27,14,11,4,28,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,4,19,17,19,26,2,0,0,0,0,0,0,0,0,0,11,24,21,27,12,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,12,24,21,16,21,7,0,0,0,0,0,0,0,0,0,9,19,14,21,20,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,20,16,22,16,13,0,0,0,0,0,0,0,0,0,0,0,13,15,23,27,23,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,32,19,12,11,3,0,0,0,0,0,0,0,0,0,0,0,2,7,23,37,35,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,39,32,15,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,30,32,27,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,27,55,27,2,0,0,0,0,0,0,0,0,0,0,0,0,1,1,14,34,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,41,36,3,1,0,0,0,0,0,0,0,0,0,0,0,1,12,35,31,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,31,8,2,0,0,0,0,0,0,0,0,0,0,1,3,34,47,8,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,30,29,7,0,0,0,0,0,0,0,0,0,0,2,27,37,28,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,33,26,16,0,0,0,0,0,0,0,0,0,0,32,41,35,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,24,35,25,0,0,0,0,0,0,0,0,0,0,27,42,40,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,22,35,18,7,0,0,0,0,0,0,0,0,10,38,31,39,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,25,37,31,10,0,0,0,0,0,0,0,0,9,31,38,18,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,49,53,2,0,0,0,0,0,0,0,0,0,47,30,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,2,3,0,0,0,0,0,0,0,0,0,0,3,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,0,0,0,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,3,2,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,6,4,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,1,0,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,2,1,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,2,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,2,4,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,2,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]]
#     results = cal_cop_fromData(your_data_array, show_plots=True)
#     # print(results)
#     return results

FUNCS = {"ping": ping, "cal_cop_fromData": cal_cop_fromData}

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
    main()
