"""
座椅压力传感器控制系统
用于压力数据处理和气囊控制逻辑的主控制模块
"""
import numpy as np
from typing import Optional, Tuple, Dict
from enum import Enum
from collections import deque
from config import Config


class ControlAction(Enum):
    """控制动作枚举"""
    HOLD = 0  # 保持
    INFLATE = 1  # 充气
    DEFLATE = 2  # 放气


class LivingDetector:
    """
    活体检测器

    通过分析压力传感器数据的CoP（压力中心）晃动和SAD（帧差）形变来判断
    座椅上是否为活体（人）还是静物（物品）

    特征:
    1. CoP特征: 活体会有持续的重心微小移动（坐姿调整、呼吸等）
    2. SAD特征: 活体会有持续的压力微小变化（呼吸、肌肉活动等）

    判定策略: 加权融合两个特征的分数，与阈值比较得出置信度
    """

    def __init__(self, config: Config):
        """
        初始化活体检测器

        Args:
            config: 配置对象
        """
        self.config = config

        # 时间窗口参数
        self.window_size = config.get('living_detection.window_size_frames', 130)
        self.detection_interval = config.get('living_detection.detection_interval_frames', 130)

        # 历史数据窗口（存储完整矩阵）
        self.cushion_window = deque(maxlen=self.window_size)
        self.backrest_window = deque(maxlen=self.window_size)

        # SAD历史
        self.sad_history_cushion = deque(maxlen=self.window_size)
        self.sad_history_backrest = deque(maxlen=self.window_size)

        # 上一帧数据（用于计算SAD）
        self.prev_cushion = None
        self.prev_backrest = None

        # 检测计数器
        self.frame_count = 0
        self.detection_count = 0

        # 最新检测结果
        self.latest_result = None

        print(f"[活体检测器] 初始化完成")
        print(f"  - 时间窗口: {self.window_size} 帧")
        print(f"  - 检测周期: {self.detection_interval} 帧")
        print(f"  - SAD判定阈值: {config.get('living_detection.sad_threshold', 0.6)}")

    def update(self, cushion_matrix: np.ndarray, backrest_matrix: np.ndarray) -> Optional[Dict]:
        """
        更新检测器（每帧调用）

        Args:
            cushion_matrix: 坐垫压力矩阵 (10x6)
            backrest_matrix: 靠背压力矩阵 (10x6)

        Returns:
            如果触发检测周期，返回检测结果字典；否则返回None
        """
        self.frame_count += 1

        # 1. 计算当前帧的SAD
        sad_cushion = self._calculate_sad(cushion_matrix, self.prev_cushion)
        sad_backrest = self._calculate_sad(backrest_matrix, self.prev_backrest)

        # 2. 更新历史数据
        self.cushion_window.append(cushion_matrix.copy())
        self.backrest_window.append(backrest_matrix.copy())
        self.sad_history_cushion.append(sad_cushion)
        self.sad_history_backrest.append(sad_backrest)

        # 3. 保存当前帧用于下一次SAD计算
        self.prev_cushion = cushion_matrix.copy()
        self.prev_backrest = backrest_matrix.copy()

        # 4. 检查是否触发检测周期
        if self.frame_count % self.detection_interval == 0 and len(self.cushion_window) >= self.window_size:
            result = self._detect_living()
            self.latest_result = result
            self.detection_count += 1

            # 打印调试信息
            if self.config.get('living_detection.debug.print_every_n_detections', 1) > 0:
                if self.detection_count % self.config.get('living_detection.debug.print_every_n_detections', 1) == 0:
                    self._print_detection_result(result)

            return result

        return None

    def _calculate_sad(self, current_matrix: np.ndarray, prev_matrix: Optional[np.ndarray]) -> float:
        """
        计算帧差能量（Sum of Absolute Differences）

        Args:
            current_matrix: 当前帧矩阵
            prev_matrix: 上一帧矩阵

        Returns:
            SAD能量值
        """
        if prev_matrix is None:
            return 0.0

        diff = np.abs(current_matrix - prev_matrix)
        sad_energy = np.mean(diff)

        return sad_energy

    def _calculate_features(self) -> Dict[str, float]:
        """
        计算特征分数

        Returns:
            特征字典，包含原始值和归一化分数
        """
        # 计算SAD能量均值（坐垫和靠背取最大值）
        sad_mean_cushion = np.mean(list(self.sad_history_cushion)) if len(self.sad_history_cushion) > 0 else 0.0
        sad_mean_backrest = np.mean(list(self.sad_history_backrest)) if len(self.sad_history_backrest) > 0 else 0.0
        sad_energy = max(sad_mean_cushion, sad_mean_backrest)

        # 归一化到 [0, 1]
        sad_normalize_scale = self.config.get('living_detection.sad.normalize_scale', 100.0)
        sad_score = min(1.0, sad_energy / sad_normalize_scale)

        return {
            'sad_energy': sad_energy,
            'sad_cushion': sad_mean_cushion,
            'sad_backrest': sad_mean_backrest,
            'sad_score': sad_score
        }

    def _detect_living(self) -> Dict:
        """
        执行活体检测

        Returns:
            检测结果字典
        """
        # 计算特征分数
        features = self._calculate_features()
        sad_score = features['sad_score']

        # 直接使用SAD分数作为置信度
        confidence = sad_score

        # 判定是否为活体
        threshold = self.config.get('living_detection.sad_threshold', 0.6)
        is_living = confidence >= threshold

        return {
            'is_living': is_living,
            'confidence': confidence,
            'threshold': threshold,
            'sad_score': sad_score,
            'sad_energy': features['sad_energy'],
            'sad_cushion': features['sad_cushion'],
            'sad_backrest': features['sad_backrest'],
            'frame_count': self.frame_count,
            'detection_count': self.detection_count
        }

    def _print_detection_result(self, result: Dict):
        """打印检测结果"""
        status = "活体" if result['is_living'] else "静物"
        confidence = result['confidence']
        threshold = result['threshold']

        print(f"\n[活体检测] 帧{result['frame_count']} | 检测周期#{result['detection_count']}")
        print(f"  → 状态: {status} | 置信度: {confidence:.3f}")

        if self.config.get('living_detection.debug.log_features', True):
            print(f"  → SAD能量: 坐垫={result['sad_cushion']:.2f}, "
                  f"靠背={result['sad_backrest']:.2f}, "
                  f"最大值={result['sad_energy']:.2f}")
            print(f"  → SAD分数: {result['sad_score']:.3f}")
            print(f"  → 判定: {status}（阈值: {threshold:.2f}）")

    def get_status(self) -> Optional[Dict]:
        """
        获取当前检测状态

        Returns:
            最新的检测结果，如果还未进行检测则返回None
        """
        return self.latest_result

    def reset(self):
        """重置检测器"""
        self.cushion_window.clear()
        self.backrest_window.clear()
        self.sad_history_cushion.clear()
        self.sad_history_backrest.clear()
        self.prev_cushion = None
        self.prev_backrest = None
        self.frame_count = 0
        self.detection_count = 0
        self.latest_result = None
        print("[活体检测器] 已重置")


class BodyTypeDetector:
    """
    体型检测器

    通过分析压力传感器数据矩阵的形态学特征来判断体型特征

    算法流程:
    1. 矩阵预处理: 滤除阈值以下的点，生成二值掩码
    2. 连通区域滤波: 移除小于指定大小的连通区域（8联通）
    3. 最大连通区域检测: 8联通，找最大连通区域
    4. 特征提取: 有效点数、均值、sum等统计特征
    """

    def __init__(self, config: Config):
        """
        初始化体型检测器

        Args:
            config: 配置对象
        """
        self.config = config

        # 检测参数
        self.threshold = config.get('body_type_detection.threshold', 20)
        self.min_component_size = config.get('body_type_detection.min_component_size', 6)

        # 体型判断阈值
        self.body_size_adult_threshold = config.get('body_type_detection.body_size_adult_threshold', 3000)
        self.body_size_child_threshold = config.get('body_type_detection.body_size_child_threshold', 1000)

        # 检测间隔（新增）
        self.detection_interval = config.get('body_type_detection.detection_interval_frames', 13)

        # 检测计数器
        self.frame_count = 0
        self.detection_count = 0  # 新增：检测次数计数

        # 最新检测结果
        self.latest_result = None

        print(f"[体型检测器] 初始化完成")
        print(f"  - 检测间隔: {self.detection_interval} 帧")
        print(f"  - 压力阈值: {self.threshold}")
        print(f"  - 最小连通区域: {self.min_component_size} 点")
        print(f"  - 体型判断: 大人>={self.body_size_adult_threshold}, 小孩>={self.body_size_child_threshold}")

    def update(self, cushion_matrix: np.ndarray, backrest_matrix: np.ndarray) -> Optional[Dict]:
        """
        更新检测器（每帧调用）

        Args:
            cushion_matrix: 坐垫压力矩阵 (10x6)
            backrest_matrix: 靠背压力矩阵 (10x6)

        Returns:
            如果触发检测周期，返回检测结果字典；否则返回None
        """
        self.frame_count += 1

        # 检查是否触发检测周期
        if self.frame_count % self.detection_interval != 0:
            return None

        # 触发检测
        self.detection_count += 1

        # 分别检测坐垫和靠背
        cushion_features = self._detect_body_type(cushion_matrix, "cushion")
        backrest_features = self._detect_body_type(backrest_matrix, "backrest")

        # 根据坐垫滤波后sum判断体型
        cushion_filtered_sum = cushion_features['filtered_sum']
        body_size_type = self._classify_body_size(cushion_filtered_sum)
        body_size_raw = cushion_filtered_sum  # 原始评分值

        # 合并结果
        result = {
            'cushion': cushion_features,
            'backrest': backrest_features,
            'body_size_type': body_size_type,
            'body_size_raw': body_size_raw,
            'frame_count': self.frame_count,
            'detection_count': self.detection_count
        }

        self.latest_result = result

        # 打印调试信息（可配置）
        if self.config.get('body_type_detection.debug.print_every_n_detections', 0) > 0:
            if self.detection_count % self.config.get('body_type_detection.debug.print_every_n_detections') == 0:
                self._print_detection_result(result)

        return result

    def _classify_body_size(self, cushion_filtered_sum: float) -> str:
        """
        根据坐垫滤波后sum判断体型

        Args:
            cushion_filtered_sum: 坐垫滤波后的压力总和

        Returns:
            体型类型: "大人", "小孩", "未判断"
        """
        if cushion_filtered_sum >= self.body_size_adult_threshold:
            return "大人"
        elif cushion_filtered_sum >= self.body_size_child_threshold:
            return "小孩"
        else:
            return "未判断"

    def _detect_body_type(self, matrix: np.ndarray, region_name: str) -> Dict[str, float]:
        """
        对单个矩阵执行体型检测

        Args:
            matrix: 压力矩阵 (10x6)
            region_name: 区域名称 (cushion/backrest)

        Returns:
            特征字典
        """
        # 1. 生成二值掩码（滤除阈值以下的点）
        original_mask = (matrix >= self.threshold).astype(np.uint8)

        # 2. 滤除小于指定大小的连通区域
        filtered_mask = self._remove_small_components(original_mask, min_size=self.min_component_size)

        # 3. 计算最大连通区域（8联通）
        max_component_size, labeled_matrix = self._find_largest_connected_component(filtered_mask)

        # 4. 提取特征
        # 基于原始掩码的特征
        original_valid_points = np.sum(original_mask)
        original_sum = np.sum(matrix[original_mask == 1]) if original_valid_points > 0 else 0.0
        original_mean = original_sum / original_valid_points if original_valid_points > 0 else 0.0

        # 基于滤波后掩码的特征
        filtered_valid_points = np.sum(filtered_mask)
        filtered_sum = np.sum(matrix[filtered_mask == 1]) if filtered_valid_points > 0 else 0.0
        filtered_mean = filtered_sum / filtered_valid_points if filtered_valid_points > 0 else 0.0

        return {
            'original_mask_points': int(original_valid_points),
            'original_sum': float(original_sum),
            'original_mean': float(original_mean),
            'filtered_mask_points': int(filtered_valid_points),
            'filtered_sum': float(filtered_sum),
            'filtered_mean': float(filtered_mean),
            'max_connected_component_size': int(max_component_size)
        }

    def _remove_small_components(self, mask: np.ndarray, min_size: int = 6) -> np.ndarray:
        """
        移除小于指定大小的连通区域（8联通）

        Args:
            mask: 二值掩码
            min_size: 最小连通区域大小（小于此值的区域会被移除）

        Returns:
            滤波后的掩码（只保留大连通区域）
        """
        rows, cols = mask.shape
        labeled = np.zeros_like(mask, dtype=np.int32)
        result = np.zeros_like(mask)
        label = 0

        # 8联通的8个方向
        directions = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]

        def dfs(r, c, current_label, points):
            """深度优先搜索标记连通区域，并记录所有点的坐标"""
            if r < 0 or r >= rows or c < 0 or c >= cols:
                return
            if mask[r, c] == 0 or labeled[r, c] != 0:
                return

            labeled[r, c] = current_label
            points.append((r, c))

            # 8联通
            for dr, dc in directions:
                dfs(r + dr, c + dc, current_label, points)

        # 遍历所有点，进行连通区域标记
        for i in range(rows):
            for j in range(cols):
                if mask[i, j] == 1 and labeled[i, j] == 0:
                    label += 1
                    points = []
                    dfs(i, j, label, points)

                    # 只保留大小 >= min_size 的连通区域
                    if len(points) >= min_size:
                        for r, c in points:
                            result[r, c] = 1

        return result

    def _find_largest_connected_component(self, mask: np.ndarray) -> Tuple[int, np.ndarray]:
        """
        查找最大连通区域（8联通）

        Args:
            mask: 二值掩码

        Returns:
            (最大连通区域大小, 标记矩阵)
        """
        rows, cols = mask.shape
        labeled = np.zeros_like(mask, dtype=np.int32)
        label = 0
        component_sizes = []

        # 8联通的8个方向
        directions = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]

        def dfs(r, c, current_label):
            """深度优先搜索标记连通区域"""
            if r < 0 or r >= rows or c < 0 or c >= cols:
                return 0
            if mask[r, c] == 0 or labeled[r, c] != 0:
                return 0

            labeled[r, c] = current_label
            size = 1

            # 8联通
            for dr, dc in directions:
                size += dfs(r + dr, c + dc, current_label)

            return size

        # 遍历所有点，进行连通区域标记
        for i in range(rows):
            for j in range(cols):
                if mask[i, j] == 1 and labeled[i, j] == 0:
                    label += 1
                    size = dfs(i, j, label)
                    component_sizes.append(size)

        # 找到最大连通区域
        max_size = max(component_sizes) if component_sizes else 0

        return max_size, labeled

    def _print_detection_result(self, result: Dict):
        """打印检测结果"""
        print(f"\n[体型检测] 帧{result['frame_count']}")
        print(f"  ★ 体型判断: {result['body_size_type']}")

        for region in ['cushion', 'backrest']:
            features = result[region]
            region_name = "坐垫" if region == "cushion" else "靠背"

            print(f"  → {region_name}:")
            print(f"     原始掩码点数: {features['original_mask_points']}")
            print(f"     原始sum: {features['original_sum']:.2f}, 均值: {features['original_mean']:.2f}")
            print(f"     滤波后点数: {features['filtered_mask_points']}")
            print(f"     滤波后sum: {features['filtered_sum']:.2f}, 均值: {features['filtered_mean']:.2f}")
            print(f"     最大连通区域: {features['max_connected_component_size']} 点")

    def get_status(self) -> Optional[Dict]:
        """
        获取当前检测状态

        Returns:
            最新的检测结果，如果还未进行检测则返回None
        """
        return self.latest_result

    def reset(self):
        """重置检测器"""
        self.frame_count = 0
        self.latest_result = None
        print("[体型检测器] 已重置")
