def process_frame_realtime(data_4096):
    """
    实时函数：传入一个4096数组，输出左右脚 面积、压力、COP、脚印数组
    严格遵循文件中的基础处理逻辑 (无时域依赖)
    """
    import numpy as np
    import cv2

    # ================= 内部封装算法 =================
    PITCH_MM = 14.0

    def _calculate_cop_internal(frame):
        total = np.sum(frame)
        if total <= 10: return (np.nan, np.nan)
        rows, cols = frame.shape
        y_coords, x_coords = np.mgrid[0:rows, 0:cols]
        cy = np.sum(frame * y_coords) / total
        cx = np.sum(frame * x_coords) / total
        return (cx, cy)

    def _get_centers_realtime(frame):
        # 默认解剖学位置
        c_l, c_r = 16.0, 48.0
        if np.max(frame) <= 5: return c_l, c_r
        
        # 尝试获取当前帧的重心分布
        mask = (frame > 5).astype(np.uint8)
        num, _, _, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
        
        cols = [centroids[i][0] for i in range(1, num)]
        if not cols: return c_l, c_r

        # 简易聚类 (2-Means思路)
        centers = [min(cols), max(cols)]
        for _ in range(3):
            g0 = [x for x in cols if abs(x - centers[0]) < abs(x - centers[1])]
            g1 = [x for x in cols if abs(x - centers[0]) >= abs(x - centers[1])]
            if g0: centers[0] = np.mean(g0)
            if g1: centers[1] = np.mean(g1)
            
        centers.sort()
        # 安全检查：如果两点过近，回退到默认
        if abs(centers[1] - centers[0]) < 10: return c_l, c_r
        return centers[0], centers[1]

    # ================= 主处理流程 =================
    try:
        mat = np.array(data_4096, dtype=np.float32)
        if mat.size != 4096: return None
        frame = mat.reshape(64, 64)
    except: return None

    # 1. 基础去噪 (文件逻辑: <=4 置0)
    frame[frame <= 4] = 0

    # 2. 动态计算中心 (无历史数据的实时策略)
    cl, cr = _get_centers_realtime(frame)

    # 3. 左右脚分割
    mask_l = np.zeros_like(frame, dtype=np.uint8)
    mask_r = np.zeros_like(frame, dtype=np.uint8)
    
    if np.max(frame) > 0:
        binary = (frame > 0).astype(np.uint8)
        num, labels, _, cents = cv2.connectedComponentsWithStats(binary, connectivity=8)
        for i in range(1, num):
            col = cents[i][0]
            if abs(col - cl) <= abs(col - cr): mask_l[labels == i] = 1
            else: mask_r[labels == i] = 1

    # 4. 计算指标与提取数组
    res = {}
    for side, mask in [('left', mask_l), ('right', mask_r)]:
        foot_frame = frame * mask
        pressure = float(np.sum(foot_frame))
        area = float(np.count_nonzero(foot_frame) * (PITCH_MM**2) / 100.0)
        cop = _calculate_cop_internal(foot_frame)
        
        res[side] = {
            "pressure": float(pressure),
            "area": float(area),
            "cop": cop,
            "array": foot_frame.tolist() # 输出该脚的独立数组(64x64)
        }
        
    return res

def process_playback_batch(matrix_2d):
    """
    回放函数：传入二维4096矩阵，输出包含左右脚所有指标及数组序列的字典
    严格遵循文件中的高级去噪、修复与旋转逻辑
    """
    import numpy as np
    import cv2
    import scipy.ndimage
    from scipy.spatial.distance import cdist

    # ================= 内部封装算法 (源自文件) =================
    PITCH_MM = 14.0

    def _unite_broken_arch(binary_map, dist_threshold=3.0):
        """ 足底专用：高足弓断裂修复 """
        binary_map = (binary_map > 0).astype(np.uint8)
        num, labels, stats, centroids = cv2.connectedComponentsWithStats(binary_map, connectivity=8)
        if num <= 2: return num, labels, stats, centroids

        label_points = {l: np.argwhere(labels == l) for l in range(1, num)}
        parent = list(range(num))

        def find(i):
            if parent[i] == i: return i
            parent[i] = find(parent[i])
            return parent[i]

        keys = list(label_points.keys())
        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                l1, l2 = keys[i], keys[j]
                d = np.min(cdist(label_points[l1], label_points[l2]))
                if d < dist_threshold:
                    parent[find(l1)] = find(l2)

        new_labels = np.zeros_like(labels)
        current_new_id = 1
        mapping = {}
        for l in range(1, num):
            root = find(l)
            if root not in mapping:
                mapping[root] = current_new_id
                current_new_id += 1
            new_labels[labels == l] = mapping[root]
        
        return current_new_id, new_labels, None, None # Stats暂时不需要重新算

    def _calculate_cop(frame):
        total = np.sum(frame)
        if total <= 10: return (np.nan, np.nan)
        rows, cols = frame.shape
        y, x = np.indices((rows, cols))
        return (np.sum(frame * x) / total, np.sum(frame * y) / total)

    def _get_foot_mask(frame, is_right, cl, cr):
        if np.max(frame) <= 0: return np.zeros_like(frame, dtype=np.uint8)
        mask = np.zeros_like(frame, dtype=np.uint8)
        binary = (frame > 0).astype(np.uint8)
        num, labels, _, cents = cv2.connectedComponentsWithStats(binary, connectivity=8)
        for i in range(1, num):
            col = cents[i][0]
            dist_l, dist_r = abs(col - cl), abs(col - cr)
            if is_right:
                if dist_r < dist_l: mask[labels == i] = 1
            else:
                if dist_l <= dist_r: mask[labels == i] = 1
        return mask

    # ================= 主处理流程 =================
    
    # 1. 数据准备
    raw_data = np.array(matrix_2d, dtype=np.float32)
    if raw_data.ndim == 1: raw_data = raw_data.reshape(1, -1)
    frames = raw_data.reshape(-1, 64, 64)
    
    # 2. 全局时域去噪 (文件 Step 1 & 2)
    frames[frames <= 4] = 0
    pixel_max = np.max(frames, axis=0)
    pixel_min = np.min(frames, axis=0)
    keep_mask = (pixel_max - pixel_min) > 25
    frames = frames * keep_mask

    # 3. 活跃序列过滤 (文件 Step 3)
    max_series = np.max(frames.reshape(len(frames), -1), axis=1)
    is_active = (max_series > 4).astype(int)
    labeled_arr, num_feats = scipy.ndimage.label(is_active)
    for lid in range(1, num_feats + 1):
        indices = np.where(labeled_arr == lid)[0]
        if max_series[indices].max() <= 150: frames[indices] = 0

    # 4. 逐帧精细处理 (旋转 + 修复 + 滤波)
    cleaned_frames = []
    neighbor_kernel = np.ones((3, 3), dtype=np.float32)

    for frame in frames:
        # 【关键】文件中的旋转逻辑: rot90 + fliplr
        processed_frame = np.rot90(np.fliplr(frame), k=1)

        if np.max(processed_frame) > 0:
            mask = (processed_frame > 0).astype(np.uint8)
            # 断裂修复
            num_l, labels, _, _ = _unite_broken_arch(mask, dist_threshold=3.0)
            
            # 过滤 (边缘接触, 小面积, 低峰值)
            h, w = processed_frame.shape
            clean_mask = np.zeros_like(processed_frame)
            
            for l in range(1, num_l):
                comp_mask = (labels == l)
                ys, xs = np.where(comp_mask)
                if len(ys) == 0: continue
                
                # 统计
                x_min, x_max = np.min(xs), np.max(xs)
                blob_max = np.max(processed_frame[comp_mask])
                area_pix = len(ys)
                is_touching = (x_min <= 5) or (x_max >= w - 5)
                
                # 文件中的保留条件
                if not (area_pix < 15 or blob_max < 100 or is_touching):
                    clean_mask[comp_mask] = 1
            
            processed_frame *= clean_mask
            
            # 邻域滤波
            if np.max(processed_frame) > 0:
                bin_f = (processed_frame > 0).astype(np.float32)
                cts = cv2.filter2D(bin_f, -1, neighbor_kernel, borderType=cv2.BORDER_CONSTANT)
                processed_frame *= (cts >= 4).astype(np.float32)
                
        cleaned_frames.append(processed_frame)
    
    cleaned_frames = np.array(cleaned_frames)

    # 5. 全局左右脚中心计算 (analyze_foot_centers)
    all_centroids = []
    for f in cleaned_frames:
        if np.max(f) <= 0: continue
        num, _, _, cents = cv2.connectedComponentsWithStats((f>0).astype(np.uint8))
        for k in range(1, num): all_centroids.append(cents[k][0])
    
    c_l, c_r = 16.0, 48.0
    if all_centroids:
        centers = [min(all_centroids), max(all_centroids)]
        for _ in range(10): # 迭代优化
            g0 = [x for x in all_centroids if abs(x-centers[0]) < abs(x-centers[1])]
            g1 = [x for x in all_centroids if abs(x-centers[0]) >= abs(x-centers[1])]
            nc = list(centers)
            if g0: nc[0] = np.mean(g0)
            if g1: nc[1] = np.mean(g1)
            if abs(nc[0]-centers[0]) < 0.1 and abs(nc[1]-centers[1]) < 0.1: break
            centers = nc
        centers.sort()
        c_l, c_r = centers[0], centers[1]

    # 6. 计算最终结果
    res = {
        "left":  {"pressure": [], "area": [], "cop": [], "array": []},
        "right": {"pressure": [], "area": [], "cop": [], "array": []}
    }
    
    for f in cleaned_frames:
        # 分割Mask
        ml = _get_foot_mask(f, False, c_l, c_r)
        mr = _get_foot_mask(f, True, c_l, c_r)
        
        # 左脚
        fl = f * ml
        res["left"]["pressure"].append(np.sum(fl))
        res["left"]["area"].append(np.count_nonzero(fl) * (PITCH_MM**2) / 100.0)
        res["left"]["cop"].append(_calculate_cop(fl))
        res["left"]["array"].append(fl.copy())
        
        # 右脚
        fr = f * mr
        res["right"]["pressure"].append(np.sum(fr))
        res["right"]["area"].append(np.count_nonzero(fr) * (PITCH_MM**2) / 100.0)
        res["right"]["cop"].append(_calculate_cop(fr))
        res["right"]["array"].append(fr.copy())

    # 转numpy
    for s in ["left", "right"]:
        for k in res[s]:
            res[s][k] = np.array(res[s][k])
            
    return res


def convert_output(outputs):
    """批量转换所有输出字段"""
    result = {}
    for key, value in outputs.items():
        if isinstance(value, np.ndarray):
            # NumPy数组转列表
            result[key] = value.tolist()
        elif isinstance(value, (np.integer, np.floating)):
            # NumPy标量转Python类型
            result[key] = float(value)
        elif isinstance(value, list):
            # 确保列表中的元素也是可序列化的
            result[key] = [float(x) if isinstance(x, (np.integer, np.floating)) else x for x in value]
        else:
            result[key] = value
    return result

