"""
拍打按摩检测模块

实现通过检测右侧翼拍打动作来控制按摩气囊的智能开关系统。
使用帧差法+scipy寻峰算法识别连续拍打动作。
"""

import numpy as np
from collections import deque
from typing import Dict, Tuple, Optional
from scipy.signal import find_peaks


class TapMassageDetector:
    """
    拍打按摩检测器

    职责：
    1. 维护右侧翼压力数据历史窗口（靠背+坐垫）
    2. 计算帧差（只保留正向压力增加）
    3. 使用scipy寻峰算法检测拍打动作
    4. 管理按摩开关状态
    5. 防止重复触发
    """

    def __init__(self, config):
        """
        初始化拍打检测器

        Args:
            config: Config对象，包含配置参数
        """
        # 配置参数
        self.window_size = config.get('tap_massage.window_size_frames', 78)  # 6秒 × 13Hz
        self.tap_threshold = config.get('tap_massage.tap_threshold', 50.0)  # 帧差均值阈值
        self.min_peak_distance = config.get('tap_massage.min_peak_distance', 3)  # 峰间隔
        self.required_taps = config.get('tap_massage.required_taps', 3)  # 需要拍打次数
        self.control_check_interval = config.get('control.check_interval_frames', 4)  # 控制周期

        # 历史缓冲（deque，自动限制长度）
        self.backrest_right_history = deque(maxlen=self.window_size)  # 靠背右侧原始数据
        self.backrest_frame_diff_history = deque(maxlen=self.window_size)  # 靠背帧差历史
        self.cushion_right_history = deque(maxlen=self.window_size)  # 坐垫右侧原始数据
        self.cushion_frame_diff_history = deque(maxlen=self.window_size)  # 坐垫帧差历史

        # 按摩状态
        self.backrest_massage_active = False  # 靠背按摩是否开启
        self.cushion_massage_active = False  # 坐垫按摩是否开启

        # 防抖机制（记录上次触发的帧数）
        self.last_backrest_trigger_frame = -100
        self.last_cushion_trigger_frame = -100
        self.trigger_cooldown_frames = 26  # 2秒冷却时间（26帧 @ 13Hz）

        # 拍打事件历史（用于可视化和调试）
        self.backrest_tap_events = []  # [(frame_num, tap_count, peaks), ...]
        self.cushion_tap_events = []

        # 当前帧计数（由外部传入）
        self.current_frame = 0

        print(f"[拍打按摩] 检测器初始化完成")
        print(f"  - 窗口大小: {self.window_size}帧")
        print(f"  - 拍打阈值: {self.tap_threshold}")
        print(f"  - 峰间隔: {self.min_peak_distance}帧")
        print(f"  - 需要拍打: {self.required_taps}次")

    def update(self, backrest_right_rect: np.ndarray, cushion_right_rect: np.ndarray,
               frame_count: int) -> Dict:
        """
        每帧调用的主方法

        Args:
            backrest_right_rect: 靠背右侧小矩形（6个元素）
            cushion_right_rect: 坐垫右侧小矩形（6个元素）
            frame_count: 当前帧数

        Returns:
            检测结果字典：
            {
                'backrest_massage_active': bool,
                'cushion_massage_active': bool,
                'backrest_tap_triggered': bool,  # 本帧是否触发
                'cushion_tap_triggered': bool,
                'backrest_command': 'TOGGLE_ON'/'TOGGLE_OFF'/None,
                'cushion_command': str/None,
                'backrest_tap_count': int,  # 窗口内拍打次数
                'cushion_tap_count': int,
                'frame_count': int
            }
        """
        self.current_frame = frame_count

        # 1. 计算帧差并追加到历史
        self._update_frame_diff(backrest_right_rect, cushion_right_rect)

        # 2. 初始化返回结果
        result = {
            'backrest_massage_active': self.backrest_massage_active,
            'cushion_massage_active': self.cushion_massage_active,
            'backrest_tap_triggered': False,
            'cushion_tap_triggered': False,
            'backrest_command': None,
            'cushion_command': None,
            'backrest_tap_count': 0,
            'cushion_tap_count': 0,
            'frame_count': frame_count
        }

        # 3. 每4帧检测一次（对齐控制周期）
        if frame_count % self.control_check_interval == 0:
            # 检测靠背拍打
            backrest_tap_count, backrest_peaks = self._detect_taps(self.backrest_frame_diff_history)
            result['backrest_tap_count'] = backrest_tap_count

            # 检测坐垫拍打
            cushion_tap_count, cushion_peaks = self._detect_taps(self.cushion_frame_diff_history)
            result['cushion_tap_count'] = cushion_tap_count

            # 判断靠背是否触发
            if self._check_tap_trigger(backrest_tap_count, backrest_peaks,
                                        self.last_backrest_trigger_frame, frame_count):
                result['backrest_tap_triggered'] = True
                # 切换状态
                self.backrest_massage_active = not self.backrest_massage_active
                result['backrest_massage_active'] = self.backrest_massage_active
                result['backrest_command'] = 'TOGGLE_ON' if self.backrest_massage_active else 'TOGGLE_OFF'
                self.last_backrest_trigger_frame = frame_count

                # 记录事件
                self.backrest_tap_events.append((frame_count, backrest_tap_count, list(backrest_peaks)))
                print(f"[拍打按摩] 靠背拍打触发 | 帧{frame_count} | 拍打{backrest_tap_count}次 | "
                      f"状态: {'开启' if self.backrest_massage_active else '关闭'}")

            # 判断坐垫是否触发
            if self._check_tap_trigger(cushion_tap_count, cushion_peaks,
                                        self.last_cushion_trigger_frame, frame_count):
                result['cushion_tap_triggered'] = True
                # 切换状态
                self.cushion_massage_active = not self.cushion_massage_active
                result['cushion_massage_active'] = self.cushion_massage_active
                result['cushion_command'] = 'TOGGLE_ON' if self.cushion_massage_active else 'TOGGLE_OFF'
                self.last_cushion_trigger_frame = frame_count

                # 记录事件
                self.cushion_tap_events.append((frame_count, cushion_tap_count, list(cushion_peaks)))
                print(f"[拍打按摩] 坐垫拍打触发 | 帧{frame_count} | 拍打{cushion_tap_count}次 | "
                      f"状态: {'开启' if self.cushion_massage_active else '关闭'}")

        return result

    def _update_frame_diff(self, backrest_right_rect: np.ndarray, cushion_right_rect: np.ndarray):
        """
        计算帧差并更新历史缓冲

        Args:
            backrest_right_rect: 靠背右侧小矩形（6个元素）
            cushion_right_rect: 坐垫右侧小矩形（6个元素）
        """
        # 追加当前数据到历史
        self.backrest_right_history.append(backrest_right_rect.copy())
        self.cushion_right_history.append(cushion_right_rect.copy())

        # 需要至少2帧才能计算帧差
        if len(self.backrest_right_history) >= 2:
            # 靠背帧差
            backrest_diff_mean = self._calculate_frame_diff(
                self.backrest_right_history[-1],
                self.backrest_right_history[-2]
            )
            self.backrest_frame_diff_history.append(backrest_diff_mean)

            # 坐垫帧差
            cushion_diff_mean = self._calculate_frame_diff(
                self.cushion_right_history[-1],
                self.cushion_right_history[-2]
            )
            self.cushion_frame_diff_history.append(cushion_diff_mean)
        else:
            # 第一帧，帧差为0
            self.backrest_frame_diff_history.append(0.0)
            self.cushion_frame_diff_history.append(0.0)

    def _calculate_frame_diff(self, current: np.ndarray, prev: np.ndarray) -> float:
        """
        计算帧差均值（只保留正向压力增加）

        Args:
            current: 当前帧数据（6个元素）
            prev: 前一帧数据（6个元素）

        Returns:
            帧差均值（0-255范围）
        """
        # 计算差值
        diff = current.astype(np.float32) - prev.astype(np.float32)

        # 只保留正向（压力增加）
        diff_positive = np.maximum(diff, 0)

        # 返回均值
        return float(np.mean(diff_positive))

    def _detect_taps(self, frame_diff_history: deque) -> Tuple[int, np.ndarray]:
        """
        使用scipy寻峰算法检测拍打次数

        Args:
            frame_diff_history: 帧差历史（deque）

        Returns:
            (拍打次数, 峰值索引数组)
        """
        # 需要足够的历史数据
        if len(frame_diff_history) < self.min_peak_distance * 2:
            return 0, np.array([])

        # 转换为numpy数组
        signal = np.array(list(frame_diff_history))

        # 使用scipy寻峰
        peaks, properties = find_peaks(
            signal,
            height=self.tap_threshold,  # 峰高度阈值
            distance=self.min_peak_distance  # 相邻峰最小间隔
        )

        return len(peaks), peaks

    def _check_tap_trigger(self, tap_count: int, peaks: np.ndarray,
                           last_trigger_frame: int, current_frame: int) -> bool:
        """
        判断是否触发拍打事件

        条件：
        1. 找到连续的required_taps次拍打（相邻峰间隔<=2秒=26帧）
        2. 最后一次峰在最近的控制周期内
        3. 距离上次触发超过冷却时间

        Args:
            tap_count: 拍打次数
            peaks: 峰值索引数组
            last_trigger_frame: 上次触发的帧数
            current_frame: 当前帧数

        Returns:
            是否触发
        """
        # 条件0：至少有required_taps个峰
        if tap_count < self.required_taps or len(peaks) < self.required_taps:
            return False

        # 条件1：从最后一个峰开始倒序检查，找连续的required_taps个峰
        max_gap_frames = 26  # 2秒 @ 13Hz，相邻峰最大间隔

        # 从最后一个峰开始倒序找连续的峰
        consecutive_peaks = [peaks[-1]]  # 最后一个峰

        for i in range(len(peaks) - 2, -1, -1):  # 倒序遍历剩余峰
            current_peak = peaks[i]
            last_consecutive_peak = consecutive_peaks[0]  # consecutive_peaks第一个是最近加入的

            gap = last_consecutive_peak - current_peak

            if gap <= max_gap_frames:
                # 相邻峰间隔满足要求，加入连续序列
                consecutive_peaks.insert(0, current_peak)

                if len(consecutive_peaks) >= self.required_taps:
                    # 找到足够的连续峰
                    break
            else:
                # 间隔太大，重新开始计数
                consecutive_peaks = [current_peak]

        # 检查是否找到足够的连续峰
        if len(consecutive_peaks) < self.required_taps:
            return False

        # 条件2：最后一次峰在最近的控制周期内
        last_peak_index = peaks[-1]
        window_threshold = self.window_size - self.control_check_interval
        if last_peak_index < window_threshold:
            return False  # 最后一次峰不在最近的控制周期内

        # 条件3：冷却时间检查
        if current_frame - last_trigger_frame < self.trigger_cooldown_frames:
            return False  # 还在冷却期

        return True

    def get_visualization_data(self) -> Dict:
        """
        返回可视化所需数据

        Returns:
            {
                'backrest_signal': list,  # 靠背帧差信号
                'cushion_signal': list,   # 坐垫帧差信号
                'backrest_massage_active': bool,
                'cushion_massage_active': bool,
                'backrest_tap_count': int,
                'cushion_tap_count': int,
                'backrest_tap_events': list,  # [(frame, count, peaks), ...]
                'cushion_tap_events': list,
                'threshold': float,
                'window_size': int
            }
        """
        # 当前窗口内的拍打次数
        backrest_tap_count, _ = self._detect_taps(self.backrest_frame_diff_history) if len(self.backrest_frame_diff_history) > 0 else (0, np.array([]))
        cushion_tap_count, _ = self._detect_taps(self.cushion_frame_diff_history) if len(self.cushion_frame_diff_history) > 0 else (0, np.array([]))

        return {
            'backrest_signal': list(self.backrest_frame_diff_history),
            'cushion_signal': list(self.cushion_frame_diff_history),
            'backrest_massage_active': self.backrest_massage_active,
            'cushion_massage_active': self.cushion_massage_active,
            'backrest_tap_count': backrest_tap_count,
            'cushion_tap_count': cushion_tap_count,
            'backrest_tap_events': self.backrest_tap_events[-10:],  # 最近10次
            'cushion_tap_events': self.cushion_tap_events[-10:],
            'threshold': self.tap_threshold,
            'window_size': self.window_size
        }

    def reset(self):
        """重置检测器"""
        self.backrest_right_history.clear()
        self.backrest_frame_diff_history.clear()
        self.cushion_right_history.clear()
        self.cushion_frame_diff_history.clear()

        self.backrest_massage_active = False
        self.cushion_massage_active = False

        self.last_backrest_trigger_frame = -100
        self.last_cushion_trigger_frame = -100

        self.backrest_tap_events.clear()
        self.cushion_tap_events.clear()

        print("[拍打按摩] 检测器已重置")
