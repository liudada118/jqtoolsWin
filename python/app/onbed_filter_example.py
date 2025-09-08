"""
onbed_filter 模块调用示例
使用真实数据调用健康监测算法，并获取所有输出结果

使用方法:
    processor = OnbedFilterProcessor()
    processor.initialize()
    
    # 准备输入数据
    inputs = {
        'frameData': your_sensor_data,  # 1024个float32的传感器数据
        'tim': current_timestamp,
        # ... 其他参数
    }
    
    # 处理数据
    outputs = processor.process(inputs)
    
    # 输出包含所有算法结果
    print(f"心率: {outputs['heart_rate']}")
    # ...
    
    processor.terminate()
"""

import numpy as np
import time
import onbed_filter as ncz


class OnbedFilterProcessor:
    """
    健康监测算法处理器
    封装了onbed_filter模块的调用逻辑
    """
    
    def __init__(self):
        """初始化处理器"""
        self.is_initialized = False
        self.step_count = 0
    
    def initialize(self):
        """
        初始化算法模型
        必须在处理数据前调用
        """
        if not self.is_initialized:
            ncz.initialize()
            self.is_initialized = True
            print("算法模型已初始化")
    
    def terminate(self):
        """
        终止算法模型
        释放资源，程序结束前调用
        """
        if self.is_initialized:
            ncz.terminate()
            self.is_initialized = False
            print("算法模型已终止")
    
    def process(self, inputs):
        """
        处理传感器数据，返回健康监测结果
        
        参数:
            inputs (dict): 输入数据字典，包含以下键值对:
                'frameData' (np.ndarray): 传感器矩阵数据 [1024个float32]
                    - 通常为32x32压力传感器矩阵展平后的数据
                    - 数值范围建议0-255 (类似图像数据)
                    - 必须是numpy数组，dtype=np.float32
                
                'tim' (float): 当前时间戳
                    - 用于算法内部时间计算
                    - 可以是任意时间基准的浮点数，可以直接输入0
                
                'threshold_factor' (float): 离床阈值因子
                    - 算法敏感度调节参数
                    - 建议值: 25，值越大越不敏感
                
                'continuous_on_bed_duration_minutes' (float): 连续在床时长阈值(分钟)
                    - 判定为"持续在床"的最小时间
                    - 建议值: 1.0 分钟
                
                'unlock_sitting_alarm_duration_minutes' (float): 坐起告警解锁时长(分钟)
                    - 坐起告警触发后的静默期
                    - 建议值: 1.0 分钟
                
                'unlock_falling_alarm_duration_minutes' (float): 跌倒告警解锁时长(分钟)
                    - 跌倒告警触发后的静默期
                    - 建议值: 1.0 分钟
                
                'sosPeakThreshold' (float): SOS峰值阈值
                    - 紧急求救信号检测阈值
                    - 建议值: 25.0
                
                'points_threshold_in' (float): 点数阈值输入
                    - 算法内部点数统计阈值
                    - 建议值: 3.0
        
        返回:
            dict: 输出结果字典，包含以下键值对:
                # === 核心生理指标 ===
                'heart_rate' (float): 心率 (次/分钟)
                    - 通过压力传感器检测到的心跳频率
                    - 正常范围: 60-100 bpm
                
                'strokerisk' (float): 中风风险报警
                    - 0: 正常, 3: 中风风险
                
                'rate' (float): 实时呼吸率
                    - 身体呼吸率指标
                    - 88为检测中，其他值为呼吸率
                
                'stateInBbed' (float): 在床状态
                    - 0: 不在床, 1: 在床，3:坠床，4：坐床边
                    - 基于压力分布判断
                
                'inBedtime' (float): 实时压力系数
                    - 当前睡眠周期的实时压力系数
                
                'rateMin' (float): 分钟呼吸率
                    - 一段时间内的分钟呼吸率
                
                'strokeriskMin' (float): 清醒入睡
                    - 0: 入睡，1: 清醒
                
                # === 告警相关 ===
                'sosflag' (float): SOS紧急求救标志
                    - 0: 正常, 1: 检测到紧急情况
                
                'merged_alarm' (float): 综合告警状态
                    - 0: 无告警, 10: 离床告警，11: 上床警报，13: 坠床报警，14: 坐床边报警
                    - 综合了各种异常情况的告警
                
                'current_threshold' (float): 当前动态阈值
                    - 算法自适应调节的实时阈值，离床阈值，回传校验
                
                'sitting_alarm_duration_minutes' (float): 输入的坐起告警时长 (分钟)
                    - 输入的坐起告警时长，回传校验
                
                'falling_alarm_duration_minutes' (float): 输入的跌倒告警时长 (分钟)
                    - 输入的跌倒告警时长，回传校验
                
                'on_bed_duration_minutes' (float): 输入的离床报警触发前提时长 (分钟)
                    - 输入的离床报警触发前提时长，回传校验
                
                # === 数组数据 ===
                'bodyMovementData' (np.ndarray): 身体运动数据 [24个float32]
                    - 身体各部位的运动强度数据
                    - 可用于分析睡眠姿势和翻身情况
                
                'statesleep' (np.ndarray): 睡眠状态数据 [48个float32]
                    - 详细的睡眠阶段和状态信息
                    - 包含深浅睡眠、REM等状态
                
                'frame_img' (np.ndarray): 处理后图像帧 [160个float32]
                    - 算法处理后的传感器数据可视化
                    - 可用于调试和展示
                
                'debugValues' (np.ndarray): 调试数值 [50个float32]
                    - 算法内部调试和分析用数据
                    - 包含中间计算结果
                
                'version_info' (np.ndarray): 版本信息 [6个float32]
                    - 算法版本和配置信息
                
                'matrix_origin' (np.ndarray): 原始矩阵数据 [1024个float32]
                    - 预处理前的原始传感器数据
                    - 用于对比和调试
                
                'matrix_filter' (np.ndarray): 滤波后矩阵数据 [1024个float32]
                    - 经过滤波处理的传感器数据
                    - 去噪声后的干净数据
                
                'alarm_counter' (np.ndarray): 告警计数器 [4个float32]
                    - [离床告警次数, 坐床警报次数, 坠床报警次数, sos报警次数]
                
                'sosSignalOut' (np.ndarray): SOS信号输出 [119个float32]
                    - SOS检测算法的详细输出信号
                    - 用于分析紧急情况的具体特征
                
                'sosCoord' (np.ndarray): SOS坐标 [2个float32]
                    - 紧急情况发生的传感器坐标位置
                    - [x坐标, y坐标]，4x8区域的左上角坐标
                
                # === 时间相关 ===
                'timt' (float): 分钟矩阵压力系数
                    - 算法处理时的分钟矩阵压力系数
                
                'runtime' (float): 运行时间
                    - 当前处理周期的运行时长，单位秒
                
                'meansn' (float): 离散化的分钟在离床
                    - 5为离床，25为在床
        """
        if not self.is_initialized:
            raise RuntimeError("请先调用 initialize() 初始化算法")
        
        # 验证输入数据
        self._validate_inputs(inputs)
        
        # 调用算法处理
        outputs = ncz.step(inputs)
        
        # 增加处理次数计数
        self.step_count += 1
        
        return outputs
    
    def _validate_inputs(self, inputs):
        """
        验证输入数据的格式和类型
        
        参数:
            inputs (dict): 输入数据字典
            
        异常:
            ValueError: 输入数据格式错误
            TypeError: 输入数据类型错误
        """
        required_keys = [
            'frameData', 'tim', 'threshold_factor', 
            'continuous_on_bed_duration_minutes',
            'unlock_sitting_alarm_duration_minutes',
            'unlock_falling_alarm_duration_minutes',
            'sosPeakThreshold', 'points_threshold_in'
        ]
        
        # 检查必需键值
        for key in required_keys:
            if key not in inputs:
                raise ValueError(f"缺少必需的输入参数: {key}")
        
        # 验证frameData
        frame_data = inputs['frameData']
        if not isinstance(frame_data, np.ndarray):
            raise TypeError("frameData 必须是 numpy 数组")
        
        if frame_data.dtype != np.float32:
            raise TypeError("frameData 必须是 float32 类型")
        
        if frame_data.shape != (1024,):
            raise ValueError(f"frameData 形状必须是 (1024,)，当前形状: {frame_data.shape}")
        
        # 验证数值范围（建议0-255）
        if np.any(frame_data < 0) or np.any(frame_data > 255):
            print("警告: frameData 数值超出建议范围 [0, 255]")
    
    def get_module_info(self):
        """
        获取模块信息
        
        返回:
            dict: 模块版本、作者等信息
        """
        return ncz.get_info()


# def create_sample_inputs():
#     """
#     创建示例输入数据
#     展示正确的数据格式
    
#     返回:
#         dict: 示例输入数据
#     """
#     # 创建模拟的32x32传感器矩阵数据
#     sensor_matrix = np.random.randint(100, 200, (32, 32)).astype(np.float32)
    
#     # 在中心区域添加"人体"信号
#     center_x, center_y = 16, 16
#     for i in range(-4, 5):
#         for j in range(-8, 9):
#             x, y = center_x + i, center_y + j
#             if 0 <= x < 32 and 0 <= y < 32:
#                 sensor_matrix[x, y] += 30  # 增加压力值
    
#     # 展平为1024长度的一维数组
#     frame_data = sensor_matrix.flatten()
    
#     inputs = {
#         'frameData': frame_data,
#         'tim': time.time() % 1000,
#         'threshold_factor': 25,
#         'continuous_on_bed_duration_minutes': 1.0,
#         'unlock_sitting_alarm_duration_minutes': 1.0,
#         'unlock_falling_alarm_duration_minutes': 1.0,
#         'sosPeakThreshold': 25.0,
#         'points_threshold_in': 3.0
#     }
    
#     return inputs


# def print_outputs_summary(outputs):
#     """
#     打印输出结果摘要 - 显示所有变量及含义
    
#     参数:
#         outputs (dict): 算法输出结果
#     """
#     print("\n" + "="*80)
#     print("健康监测算法输出结果 - 完整变量列表")
#     print("="*80)
    
#     # === 核心生理指标 ===
#     print(f"\n【核心生理指标】")
#     print(f"heart_rate (心率): {outputs['heart_rate']:.2f} bpm - 通过压力传感器检测的心跳频率")
    
#     # 中风风险报警 (0: 正常, 3: 中风风险)
#     strokerisk_status = "中风风险" if outputs['strokerisk'] == 3 else "正常"
#     print(f"strokerisk (中风风险报警): {outputs['strokerisk']:.0f} ({strokerisk_status}) - 0:正常, 3:中风风险")
    
#     # 实时呼吸率 (88: 检测中, 其他值为呼吸率)
#     if outputs['rate'] == 88:
#         rate_status = "检测中"
#     elif outputs['rate'] == -1:
#         rate_status = "算法未稳定"
#     else:
#         rate_status = f"{outputs['rate']:.2f} 次/分钟"
#     print(f"rate (实时呼吸率): {outputs['rate']:.2f} ({rate_status}) - 88:检测中, -1:未稳定, 其他:呼吸率")
    
#     # 在床状态 (0: 不在床, 1: 在床, 3:坠床, 4：坐床边)
#     bed_states = {0: "不在床", 1: "在床", 3: "坠床", 4: "坐床边"}
#     bed_status = bed_states.get(int(outputs['stateInBbed']), f"未知状态({outputs['stateInBbed']:.0f})")
#     print(f"stateInBbed (在床状态): {outputs['stateInBbed']:.0f} ({bed_status}) - 0:不在床, 1:在床, 3:坠床, 4:坐床边")
    
#     print(f"inBedtime (实时压力系数): {outputs['inBedtime']:.3f} - 当前睡眠周期的实时压力系数")
#     print(f"rateMin (分钟呼吸率): {outputs['rateMin']:.2f} - 一段时间内的分钟呼吸率")
    
#     # 清醒入睡状态 (0: 入睡，1: 清醒)
#     awake_status = "清醒" if outputs['strokeriskMin'] == 1 else "入睡"
#     print(f"strokeriskMin (清醒入睡): {outputs['strokeriskMin']:.0f} ({awake_status}) - 0:入睡, 1:清醒")
    
#     # === 告警相关 ===
#     print(f"\n【告警信息】")
    
#     # SOS紧急求救 (0: 正常, 1: 检测到紧急情况)
#     sos_status = "紧急情况" if outputs['sosflag'] > 0.5 else "正常"
#     print(f"sosflag (SOS紧急求救标志): {outputs['sosflag']:.0f} ({sos_status}) - 0:正常, 1:紧急情况")
    
#     # 综合告警状态 (0: 无告警, 10: 离床告警，11: 上床警报，13: 坠床报警，14: 坐床边报警)
#     alarm_states = {
#         0: "无告警", 
#         10: "离床告警", 
#         11: "上床警报", 
#         13: "坠床报警", 
#         14: "坐床边报警"
#     }
#     alarm_status = alarm_states.get(int(outputs['merged_alarm']), f"其他告警({outputs['merged_alarm']:.0f})")
#     print(f"merged_alarm (综合告警状态): {outputs['merged_alarm']:.0f} ({alarm_status}) - 0:无告警, 10:离床, 11:上床, 13:坠床, 14:坐床边")
    
#     print(f"current_threshold (当前动态阈值): {outputs['current_threshold']:.3f} - 离床阈值，回传校验")
#     print(f"sitting_alarm_duration_minutes (坐起告警时长): {outputs['sitting_alarm_duration_minutes']:.2f} 分钟 - 输入参数回传")
#     print(f"falling_alarm_duration_minutes (跌倒告警时长): {outputs['falling_alarm_duration_minutes']:.2f} 分钟 - 输入参数回传")
#     print(f"on_bed_duration_minutes (离床报警前提时长): {outputs['on_bed_duration_minutes']:.2f} 分钟 - 输入参数回传")
    
#     # === 时间相关 ===
#     print(f"\n【时间相关】")
#     print(f"timt (分钟矩阵压力系数): {outputs['timt']:.3f} - 算法处理时的分钟矩阵压力系数")
#     print(f"runtime (运行时间): {outputs['runtime']:.3f} 秒 - 当前处理周期的运行时长")
    
#     # 离散化的分钟在离床 (5为离床，25为在床)
#     meansn_status = "离床" if outputs['meansn'] == 5 else ("在床" if outputs['meansn'] == 25 else f"其他({outputs['meansn']:.1f})")
#     print(f"meansn (离散化分钟在离床): {outputs['meansn']:.1f} ({meansn_status}) - 5:离床, 25:在床")
    
#     # === 数组数据 ===
#     print(f"\n【数组数据详情】")
    
#     print(f"bodyMovementData (身体运动数据): 长度{len(outputs['bodyMovementData'])} - 身体各部位运动强度")
#     print(f"  范围: [{outputs['bodyMovementData'].min():.3f}, {outputs['bodyMovementData'].max():.3f}]")
#     print(f"  前5个值: {outputs['bodyMovementData'][:5]}")
    
#     print(f"statesleep (睡眠状态数据): 长度{len(outputs['statesleep'])} - 详细睡眠阶段和状态信息")
#     print(f"  范围: [{outputs['statesleep'].min():.3f}, {outputs['statesleep'].max():.3f}]")
#     print(f"  前5个值: {outputs['statesleep'][:5]}")
    
#     print(f"frame_img (处理后图像帧): 长度{len(outputs['frame_img'])} - 算法处理后的传感器数据可视化")
#     print(f"  范围: [{outputs['frame_img'].min():.3f}, {outputs['frame_img'].max():.3f}]")
    
#     print(f"debugValues (调试数值): 长度{len(outputs['debugValues'])} - 算法内部调试和分析用数据")
#     print(f"  范围: [{outputs['debugValues'].min():.3f}, {outputs['debugValues'].max():.3f}]")
#     print(f"  前5个值: {outputs['debugValues'][:5]}")
    
#     print(f"version_info (版本信息): 长度{len(outputs['version_info'])} - 算法版本和配置信息")
#     print(f"  值: {outputs['version_info']}")
    
#     print(f"matrix_origin (原始矩阵数据): 长度{len(outputs['matrix_origin'])} - 预处理前的原始传感器数据")
#     print(f"  范围: [{outputs['matrix_origin'].min():.3f}, {outputs['matrix_origin'].max():.3f}]")
    
#     print(f"matrix_filter (滤波后矩阵数据): 长度{len(outputs['matrix_filter'])} - 去噪声后的干净数据")
#     print(f"  范围: [{outputs['matrix_filter'].min():.3f}, {outputs['matrix_filter'].max():.3f}]")
    
#     # 告警计数器 [离床告警次数, 坐床警报次数, 坠床报警次数, sos报警次数]
#     alarm_counts = outputs['alarm_counter']
#     print(f"alarm_counter (告警计数器): 长度{len(alarm_counts)} - 各类告警次数统计")
#     print(f"  离床告警: {alarm_counts[0]:.0f}次, 坐床警报: {alarm_counts[1]:.0f}次, 坠床报警: {alarm_counts[2]:.0f}次, SOS报警: {alarm_counts[3]:.0f}次")
    
#     print(f"sosSignalOut (SOS信号输出): 长度{len(outputs['sosSignalOut'])} - SOS检测算法的详细输出信号")
#     print(f"  范围: [{outputs['sosSignalOut'].min():.3f}, {outputs['sosSignalOut'].max():.3f}]")
    
#     # SOS坐标 [x坐标, y坐标] - 4x8区域的左上角坐标
#     print(f"sosCoord (SOS坐标): ({outputs['sosCoord'][0]:.1f}, {outputs['sosCoord'][1]:.1f}) - 紧急情况发生的传感器坐标(4x8区域左上角)")
    
#     print("="*80)


def demo_usage():
    """
    演示如何使用 OnbedFilterProcessor
    """
    print("onbed_filter 模块使用演示")
    print("="*50)
    
    # 创建处理器实例
    processor = OnbedFilterProcessor()
    
    # 显示模块信息
    print(f"模块信息: {processor.get_module_info()}")
    
    try:
        # 初始化
        processor.initialize()
        
        print("\n开始循环调用算法 (按Ctrl+C停止)")
        print("算法需要多次调用才能稳定，请等待rate不为-1时查看完整输出\n")
        
        stable_count = 0  # 稳定输出计数
        
        while True:
            # 创建示例输入数据 (每次都生成新的模拟数据)
            inputs = create_sample_inputs()
            
            # 处理数据
            outputs = processor.process(inputs)
            
            # 检查rate值
            if outputs['rate'] != -1:
                stable_count += 1
                print(f"\n--- 第{stable_count}次稳定输出 (第{processor.step_count}次调用) ---")
                print(f"输入数据范围: [{inputs['frameData'].min():.0f}, {inputs['frameData'].max():.0f}]")
                print_outputs_summary(outputs)
                print("\n" + "-"*60)
                
                # 每3次稳定输出暂停一下，避免刷屏太快
                if stable_count % 3 == 0:
                    print(f"\n已显示{stable_count}次稳定输出，暂停2秒...")
                    time.sleep(2)
                    
            else:
                # 算法稳定中，只显示基本信息
                if processor.step_count % 10 == 0:  # 每10次显示一次进度
                    print(f"第{processor.step_count}次调用: 算法稳定中 (rate = {outputs['rate']:.3f})")
            
            # 短暂延时，模拟实际应用场景
            time.sleep(0.1)
                
    except KeyboardInterrupt:
        print(f"\n\n用户停止测试")
        print(f"总共调用{processor.step_count}次，其中稳定输出{stable_count}次")
    except Exception as e:
        print(f"处理出错: {e}")
        import traceback
        traceback.print_exc()
        
    finally:
        # 清理资源
        print("\n正在清理资源...")
        processor.terminate()
        print("演示完成！")


# if __name__ == "__main__":
#     # 运行演示
#     demo_usage()
import time
import numpy as np
import onbed_filter as ncz
import sys, json, traceback

def ping():
    return {"pong": True}

def create_sample_inputs():
    """
    创建示例输入数据
    展示正确的数据格式
    
    返回:
        dict: 示例输入数据
    """
    # 创建模拟的32x32传感器矩阵数据
    sensor_matrix = np.random.randint(100, 200, (32, 32)).astype(np.float32)
   
    # 在中心区域添加"人体"信号
    center_x, center_y = 16, 16
    for i in range(-4, 5):
        for j in range(-8, 9):
            x, y = center_x + i, center_y + j
            if 0 <= x < 32 and 0 <= y < 32:
                sensor_matrix[x, y] += 30  # 增加压力值
    
    # 展平为1024长度的一维数组
    frame_data = sensor_matrix.flatten()
    # print( frame_data)

    # print(np.zeros(1024))
    inputs = {
        'frameData': frame_data,
        'tim': time.time() % 1000,
        'threshold_factor': 25,
        'continuous_on_bed_duration_minutes': 1.0,
        'unlock_sitting_alarm_duration_minutes': 1.0,
        'unlock_falling_alarm_duration_minutes': 1.0,
        'sosPeakThreshold': 25.0,
        'points_threshold_in': 3.0
    }
    
    return inputs


def getInputData(data) : 
    inputs = create_sample_inputs()
    inputs["frameData"] = np_arr = np.array(data, dtype=np.float32)
    return 

def getData(data):

 
    inputs = create_sample_inputs()
    inputs["frameData"] = np_arr = np.array(data, dtype=np.float32)
    # print(data)
    outputs = ncz.step(inputs)

    # _validate_inputs({
    #    'frameData' : data,
    #    'tim': time.time() % 1000,
    #    'threshold_factor': 25,
    #    'continuous_on_bed_duration_minutes': 1.0,
    #    'unlock_sitting_alarm_duration_minutes': 1.0,
    #    'unlock_falling_alarm_duration_minutes': 1.0,
    #    'sosPeakThreshold': 25.0,
    #    'points_threshold_in': 3.0
    # })

    # outputs = ncz.step({
    #    'frameData' : data,
    #    'tim': time.time() % 1000,
    #    'threshold_factor': 25,
    #    'continuous_on_bed_duration_minutes': 1.0,
    #    'unlock_sitting_alarm_duration_minutes': 1.0,
    #    'unlock_falling_alarm_duration_minutes': 1.0,
    #    'sosPeakThreshold': 25.0,
    #    'points_threshold_in': 3.0
    # })

    # print({
    #     "rate" : outputs["rate"] , 
    #     "heart_rate" : outputs["heart_rate"],
    #     "stateInBbed" : outputs["stateInBbed"],
    #     "sosflag" : outputs["sosflag"]
    # })
    # return {
    #     'data' : data
    # }
    return {
        "rate" : outputs["rate"] , 
        "heart_rate" : outputs["heart_rate"],
        "stateInBbed" : outputs["stateInBbed"],
        "sosflag" : outputs["sosflag"]
    }



FUNCS = {"ping": ping, "getData": getData}

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
    ncz.initialize()
    main()
  
    