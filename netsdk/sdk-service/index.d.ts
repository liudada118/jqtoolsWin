export const DEFAULT_BASE_URL: string;
export const DEFAULT_WS_URL: string;

/** 后端统一响应结构。 */
export interface HttpResult<T = unknown> {
  code: number;
  data: T;
  message: string;
}

/** SDK 初始化配置。 */
export interface JqToolsClientOptions {
  /** 后端 REST API 基础地址，默认 http://127.0.0.1:19245。 */
  baseUrl?: string;
  /** 实时数据 WebSocket 地址，默认 ws://127.0.0.1:19999。 */
  wsUrl?: string;
  /** HTTP 请求超时时间，单位毫秒，默认 15000。 */
  timeout?: number;
  /** 自定义 fetch 实现，用于兼容较旧运行环境。 */
  fetch?: (input: string | URL, init?: unknown) => Promise<unknown>;
  /** 是否直接返回 HttpResult.data，并在 code 非 0 时抛错。 */
  unwrap?: boolean;
  /** Python 可执行文件路径，默认读取 JQTOOLS_PYTHON 或使用 python。 */
  pythonPath?: string;
  /** SDK 内置或自定义 Python server.py 路径。 */
  algorithmScriptPath?: string;
  /** Python 函数调用超时时间，单位毫秒。 */
  pythonTimeout?: number;
  /** 传给 Python 进程的额外环境变量。 */
  pythonEnv?: Record<string, string>;
  /** 接收 Python 算法 stdout/stderr 中非 JSON 的日志。 */
  onPythonLog?: (line: string, stream: 'stdout' | 'stderr') => void;
}

/** 原始 WebSocket 回调。 */
export interface StreamHandlers {
  onOpen?: (event: unknown) => void;
  onClose?: (event: unknown) => void;
  onError?: (event: unknown) => void;
  /** 接收每条已解析的 WebSocket 消息。 */
  onMessage?: (data: unknown, event: unknown) => void;
}

/** 汽车自适应 WebSocket 回调。 */
export interface CarAdaptiveStreamHandlers {
  onOpen?: (event: unknown) => void;
  onClose?: (event: unknown) => void;
  onError?: (event: unknown) => void;
  /** 接收每条已解析的 WebSocket 消息。 */
  onRawMessage?: (data: unknown, event: unknown) => void;
  /** 接收 Python 算法返回的 algorData 消息。 */
  onAlgorithmData?: (data: unknown, event: unknown) => void;
  /** 接收从 control_command 中提取的 algorFeed 控制反馈。 */
  onControlFeedback?: (data: unknown, event: unknown) => void;
  /** 接收主副传感器选择变化，sensorId=1 为主，sensorId=2 为副。 */
  onSensorChange?: (data: CarAdaptiveSensorSelection, event: unknown) => void;
  /** 接收主副两路在线状态、频率和算法帧计数。 */
  onSensorStatus?: (data: CarAdaptiveSensorStatus[], event: unknown) => void;
  /** 同时接收主副两套完整数据，调用方可在本地选择展示通道。 */
  onSensorData?: (data: CarAdaptiveSensorSnapshot[], event: unknown) => void;
}

/** 汽车自适应前端展示通道。 */
export interface CarAdaptiveSensorSelection {
  /** 1 为主传感器，2 为副传感器。 */
  sensorId: 1 | 2;
  /** 当前传感器的中文角色。 */
  role: '主' | '副';
  /** 表示该选择只影响前端显示，不影响两路算法运行。 */
  displayOnly: true;
}

/** 一路传感器的实时算法运行摘要。 */
export interface CarAdaptiveSensorStatus {
  /** 1 为主传感器，2 为副传感器。 */
  sensorId: 1 | 2;
  /** 传感器中文角色。 */
  role: '主' | '副';
  /** 最近一秒是否收到该路串口帧。 */
  online: boolean;
  /** 最近一帧的毫秒时间戳。 */
  stamp: number;
  /** 当前接收频率。 */
  HZ?: number;
  /** 是否已经得到该路算法结果。 */
  algorithmReady: boolean;
  /** 该路算法内部帧计数。 */
  frameCount: number;
}

/** 一路传感器的完整前端数据快照。 */
export interface CarAdaptiveSensorSnapshot {
  sensorId: 1 | 2;
  role: '主' | '副';
  /** 与现有前端兼容的压力数据结构。 */
  sitData: {
    carAir: {
      type: 'carAir';
      sensorId: 1 | 2;
      status: 'online' | 'offline';
      arr?: number[];
      stamp: number;
      HZ?: number;
    };
  };
  /** 对应传感器的独立 Python 算法结果。 */
  algorData?: unknown;
  /** 从该路 control_command 提取的 24 路气囊反馈。 */
  algorFeed: number[];
}

/** 单次显式 Python 算法调用配置。 */
export interface ProcessCarAdaptiveFrameOptions {
  /** 指定主或副传感器的独立算法实例，默认主传感器 1。 */
  sensorId?: 1 | 2;
  /** 为 true 时，后端会把返回的 control_command 写入汽车自适应串口。 */
  writeSerial?: boolean;
  /** 覆盖本次调用的 unwrap 行为。 */
  unwrap?: boolean;
}

/** SDK 统一错误类型。 */
export class JqToolsError extends Error {
  code?: number;
  status?: number;
  payload?: unknown;
  cause?: unknown;
}

/** 汽车自适应 SDK 客户端。 */
export class JqToolsCarClient {
  /** 创建汽车自适应 SDK 客户端实例。 */
  constructor(options?: JqToolsClientOptions);

  /** 底层 HTTP 请求方法，用于自定义接口或未来新增接口。 */
  request<T = unknown>(method: string, pathname: string, options?: {
    query?: Record<string, string | number | boolean | null | undefined>;
    body?: unknown;
    headers?: Record<string, string>;
    timeout?: number;
    signal?: AbortSignal;
    unwrap?: boolean;
  }): Promise<T>;

  /** 检查后端 REST 服务是否可访问。 */
  health(): Promise<unknown>;

  /** 获取后端所在机器识别到的串口列表。 */
  listPorts(): Promise<HttpResult | unknown>;

  /** 连接后端识别到的串口设备。 */
  connectPorts(): Promise<HttpResult | unknown>;

  /** connectPorts 的语义化别名，用于客户汽车自适应场景。 */
  connectCarAdaptivePorts(): Promise<HttpResult | unknown>;

  /** 获取后端旧版单路兼容投影。 */
  getCarAdaptiveSensor(): Promise<HttpResult<CarAdaptiveSensorSelection> | CarAdaptiveSensorSelection>;

  /** 获取主、副两路实时算法运行摘要。 */
  getCarAdaptiveSensors(): Promise<HttpResult<CarAdaptiveSensorStatus[]> | CarAdaptiveSensorStatus[]>;

  /** 选择后端旧版单路兼容投影，不停止任何一路算法。 */
  selectCarAdaptiveSensor(sensorId: 1 | 2): Promise<HttpResult<CarAdaptiveSensorSelection> | CarAdaptiveSensorSelection>;

  /**
   * 提交一帧 144 点汽车自适应传感器数据给 SDK 本地 Python 算法。
   * 设置 writeSerial=true 时，会把返回的 control_command 写入汽车自适应串口。
   */
  processCarAdaptiveFrame(sensorData: number[], options?: ProcessCarAdaptiveFrameOptions): Promise<unknown>;

  /** 通过后端把已有的 Python control_command 写入汽车自适应串口。 */
  writeCarAdaptiveCommand(controlCommand: number[], sensorId?: 1 | 2): Promise<HttpResult | unknown>;

  /** 获取 SDK 本地 Python 算法参数和注释。 */
  getPythonConfig(): Promise<unknown>;

  /** 修改一个 SDK 本地 Python 算法参数。 */
  setPythonParam(path: string, value: unknown): Promise<unknown>;

  /** 调用 SDK 本地 Python server.py 暴露的原始函数。 */
  callPythonFunction(fn: string, args?: Record<string, unknown>, options?: { timeout?: number }): Promise<unknown>;

  /** 停止 SDK 本地 Python worker 进程。 */
  stopPythonAlgorithm(): void;

  /** 连接原始 WebSocket 实时数据流。 */
  connectStream(handlers?: StreamHandlers): unknown;

  /** 连接 WebSocket 实时数据流，并按汽车自适应消息类型分发回调。 */
  connectCarAdaptiveStream(handlers?: CarAdaptiveStreamHandlers): unknown;
}

/** 向后兼容的类名别名。 */
export class JqToolsClient extends JqToolsCarClient {}

/** 创建汽车自适应 SDK 客户端。 */
export function createClient(options?: JqToolsClientOptions): JqToolsCarClient;
