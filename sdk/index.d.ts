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
  /** 接收当前有效的 algorFeed 展示档位；具体来源见快照 airbagDisplaySource。 */
  onControlFeedback?: (data: unknown, event: unknown) => void;
  /** 接收主副传感器选择变化，sensorId=1 为主，sensorId=2 为副。 */
  onSensorChange?: (data: CarAdaptiveSensorSelection, event: unknown) => void;
  /** 接收主副两路在线状态、频率和算法帧计数。 */
  onSensorStatus?: (data: CarAdaptiveSensorStatus[], event: unknown) => void;
  /** 同时接收主副两套完整数据，调用方可在本地选择展示通道。 */
  onSensorData?: (data: CarAdaptiveSensorSnapshot[], event: unknown) => void;
  /** 接收气囊控制模式变化。 */
  onControlModeChange?: (data: CarAdaptiveControlModeState, event: unknown) => void;
}

/**
 * 气囊控制模式。
 * `auto` 算法接管并自动写串口，`manual` 算法运行但只接受手动下发，
 * `paused` 暂停算法且气囊冻结。三者都不影响串口采集。
 */
export type CarAdaptiveControlMode = 'auto' | 'manual' | 'paused';

/** 一路主驾或副驾的气囊控制模式状态。 */
export interface CarAdaptiveSensorControlModeState {
  /** 1 为主驾，2 为副驾。 */
  sensorId: 1 | 2;
  /** 当前通道中文角色。 */
  role: '主' | '副';
  /** 当前模式。 */
  mode: CarAdaptiveControlMode;
  /** 上一个模式，从未切换过时为 null。 */
  previousMode: CarAdaptiveControlMode | null;
  /** 变更来源：default 启动默认值，api 接口调用，view 页面视图切换，ecu 整车回传。 */
  source: 'default' | 'api' | 'view' | 'ecu';
  /** 变更原因，最长 120 字符。 */
  reason: string;
  /** 变更次数，可用于判断状态是否比本地缓存更新。 */
  sequence: number;
  /** 最近一次变更的毫秒时间戳。 */
  changedAt: number;
  /** 当前是否在自动写串口，等价于 mode === 'auto'。 */
  autoWrite: boolean;
  /** 算法是否在处理串口帧，等价于 mode !== 'paused'。 */
  algorithmRunning: boolean;
  /** 自动写入周期，单位毫秒。 */
  commandIntervalMs: number;
  /** 当前 SDK 页面视图，控制模式跟随它自动切换。 */
  view: string;
}

/** 气囊控制模式查询结果，顶层为目标通道并附带主副两路状态。 */
export interface CarAdaptiveControlModeState extends CarAdaptiveSensorControlModeState {
  /** 表示主、副通道采用独立控制状态。 */
  independent: true;
  /** 主、副两路完整控制模式。 */
  sensors: CarAdaptiveSensorControlModeState[];
}

/** 切换控制模式后的返回状态，在模式状态之上附带本次切换的结果。 */
export interface CarAdaptiveControlModeChange extends CarAdaptiveControlModeState {
  /** 本次调用是否真的改变了模式。重复设置同一模式为 false。 */
  changed: boolean;
  /** 从 manual 恢复到 auto 时是否成功清空了按摩状态。 */
  massageReset: boolean;
  /** 从 paused 恢复到 auto 时是否成功重建了算法实例。 */
  algorithmReset: boolean;
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

/** 主界面和原始数据页共享的全局采集状态。 */
export interface CarAdaptiveCollectionState {
  /** 是否正在把真实串口压力帧写入 SQLite。 */
  collecting: boolean;
  /** 当前采集段名称。 */
  fileName: string;
  /** 本次采集固定使用的主副驾通道。 */
  sensorId: 1 | 2;
  /** 当前采集通道中文角色。 */
  role: '主' | '副';
  /** 开始采集的毫秒时间戳。 */
  startedAt: number;
  /** 停止采集的毫秒时间戳，采集中为 0。 */
  stoppedAt: number;
  /** 已成功写入 SQLite 的帧数。 */
  frameCount: number;
}

/** 原始采集段 CSV 导出结果。 */
export interface CarAdaptiveCollectionExport {
  /** Content-Disposition 返回的下载文件名。 */
  fileName: string;
  /** 响应内容类型。 */
  contentType: string;
  /** CSV 中实际包含的原始帧数。 */
  frameCount: number;
  /** UTF-8 CSV 字节，含 BOM。 */
  data: Uint8Array;
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
  /** 最近是否收到该路 ECU 气囊状态回传，中断超过 2000ms 为 false。 */
  feedbackOnline: boolean;
  /** 最近一条 ECU 回传的毫秒时间戳。 */
  feedbackStamp: number;
  /** 该通道独立的算法控制模式。 */
  controlMode: CarAdaptiveControlMode;
  /** 当前是否有可供界面展示的气囊档位。 */
  airbagDisplayAvailable: boolean;
  /** 当前展示来源。 */
  airbagDisplaySource: 'api' | 'ecu' | 'command' | 'none';
  /** 是否正由接口覆盖界面展示。 */
  airbagDisplayOverride: boolean;
}

/** 原始数据页使用的一条气囊命令诊断记录。 */
export interface CarAdaptiveAirbagCommandRecord {
  command: number[];
  length: number;
  gears: number[];
  stamp: number;
  source: 'algorithm' | 'api' | 'ecu';
  target?: 'serial' | 'display';
  queued?: boolean;
  active?: boolean;
  trusted?: boolean;
  portPath?: string;
  portPaths?: string[];
  wireCommand?: number[];
  clearedAt?: number;
}

/** 气囊指令历史的来源类型。 */
export type CarAdaptiveAirbagCommandHistoryType =
  | 'all'
  | 'algorithmGenerated'
  | 'algorithmSent'
  | 'ecuFeedback'
  | 'apiSerial'
  | 'apiDisplay';

/** 带主副驾、类型和顺序号的气囊指令历史记录。 */
export interface CarAdaptiveAirbagCommandHistoryRecord extends CarAdaptiveAirbagCommandRecord {
  id: string;
  sequence: number;
  sensorId: 1 | 2;
  role: '主' | '副';
  type: Exclude<CarAdaptiveAirbagCommandHistoryType, 'all'>;
}

/** 气囊指令历史查询结果。 */
export interface CarAdaptiveAirbagCommandHistoryState {
  sensorId: 1 | 2;
  role: '主' | '副';
  type: CarAdaptiveAirbagCommandHistoryType;
  limit: number;
  total: number;
  counts: Record<CarAdaptiveAirbagCommandHistoryType, number>;
  records: CarAdaptiveAirbagCommandHistoryRecord[];
  /** 清空接口返回本次删除数量。 */
  removed?: number;
}

/** 一路算法下发、ECU 回传和接口控制命令。 */
export interface CarAdaptiveAirbagCommandTelemetry {
  algorithmGenerated: CarAdaptiveAirbagCommandRecord | null;
  algorithmSent: CarAdaptiveAirbagCommandRecord | null;
  ecuFeedback: CarAdaptiveAirbagCommandRecord | null;
  apiSerial: CarAdaptiveAirbagCommandRecord | null;
  apiDisplay: CarAdaptiveAirbagCommandRecord | null;
}

/** 一路气囊界面展示状态。 */
export interface CarAdaptiveSensorAirbagDisplayState {
  sensorId: 1 | 2;
  role: '主' | '副';
  gears: number[];
  available: boolean;
  source: 'api' | 'ecu' | 'command' | 'none';
  override: boolean;
  stamp: number;
  feedbackOnline: boolean;
  feedbackStamp: number;
}

/** 气囊展示查询结果，顶层为目标通道并附带主副两路状态。 */
export interface CarAdaptiveAirbagDisplayState extends CarAdaptiveSensorAirbagDisplayState {
  independent: true;
  sensors: CarAdaptiveSensorAirbagDisplayState[];
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
  /**
   * 24 路当前有效展示档位，可能来自接口覆盖、ECU 回传或命令回落。
   * 必须结合 airbagDisplaySource 判断来源。
   */
  algorFeed: number[];
  /** 该路 ECU 回传是否在线，只表示真实硬件回传，不受展示覆盖影响。 */
  feedbackOnline: boolean;
  /** 最近一条 ECU 回传的毫秒时间戳。 */
  feedbackStamp: number;
  /** 反馈数据源，ecu 为 ECU 回传，command 为回落到已下发命令。 */
  feedbackSource: 'ecu' | 'command';
  /** 当前是否有可展示的气囊状态。 */
  airbagDisplayAvailable: boolean;
  /** 当前展示来源。 */
  airbagDisplaySource: 'api' | 'ecu' | 'command' | 'none';
  /** 是否正由接口覆盖界面展示。 */
  airbagDisplayOverride: boolean;
  /** 当前展示状态的毫秒时间戳。 */
  airbagDisplayStamp: number;
  /** 最近算法、接口和 ECU 气囊命令诊断。 */
  airbagCommands: CarAdaptiveAirbagCommandTelemetry;
  /** 生成该快照时的气囊控制模式。 */
  controlMode: CarAdaptiveControlMode;
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

  /** 查询主界面和原始数据页共享的全局采集状态。 */
  getCarAdaptiveCollection(): Promise<HttpResult<CarAdaptiveCollectionState> | CarAdaptiveCollectionState>;

  /** 开始采集指定主副驾的真实串口压力数据。 */
  startCarAdaptiveCollection(options?: {
    sensorId?: 1 | 2;
    fileName?: string;
    select?: Record<string, unknown> | unknown[];
  }): Promise<HttpResult<CarAdaptiveCollectionState> | CarAdaptiveCollectionState>;

  /** 停止并保存当前全局采集任务。 */
  stopCarAdaptiveCollection(): Promise<HttpResult<CarAdaptiveCollectionState> | CarAdaptiveCollectionState>;

  /** 生成指定采集段的原始 145 字节帧 CSV 下载地址。 */
  getCarAdaptiveCollectionExportUrl(options?: {
    fileName?: string;
    sensorId?: 1 | 2;
  }): string;

  /** 直接读取指定采集段的原始 145 字节帧 CSV 字节。 */
  exportCarAdaptiveCollection(options?: {
    fileName?: string;
    sensorId?: 1 | 2;
    timeout?: number;
    signal?: AbortSignal;
  }): Promise<CarAdaptiveCollectionExport>;

  /** 选择后端旧版单路兼容投影，不停止任何一路算法。 */
  selectCarAdaptiveSensor(sensorId: 1 | 2): Promise<HttpResult<CarAdaptiveSensorSelection> | CarAdaptiveSensorSelection>;

  /**
   * 提交一帧 144 点汽车自适应传感器数据给 SDK 本地 Python 算法。
   * 设置 writeSerial=true 时，会把返回的 control_command 写入汽车自适应串口。
   */
  processCarAdaptiveFrame(sensorData: number[], options?: ProcessCarAdaptiveFrameOptions): Promise<unknown>;

  /** 通过后端把已有的 Python control_command 写入汽车自适应串口。 */
  writeCarAdaptiveCommand(
    controlCommand: number[],
    sensorId?: 1 | 2,
    options?: { source?: 'api' | 'algorithm' }
  ): Promise<HttpResult | unknown>;

  /** 查询目标通道和主副两路独立气囊控制模式。 */
  getControlMode(sensorId?: 1 | 2): Promise<HttpResult<CarAdaptiveControlModeState> | CarAdaptiveControlModeState>;

  /**
   * 切换气囊控制模式。
   * `manual` 只停自动写串口，算法继续运行；`paused` 暂停算法且气囊冻结。
   * 从 `manual` 恢复到 `auto` 清空按摩状态，从 `paused` 恢复重建两路算法实例。
   */
  setControlMode(
    mode: CarAdaptiveControlMode,
    options?: { sensorId?: 1 | 2; reason?: string }
  ): Promise<HttpResult<CarAdaptiveControlModeChange> | CarAdaptiveControlModeChange>;

  /** 查询当前有效气囊展示状态及其来源。 */
  getAirbagDisplay(sensorId?: 1 | 2): Promise<HttpResult<CarAdaptiveAirbagDisplayState> | CarAdaptiveAirbagDisplayState>;

  /** 用 24 路档位覆盖目标通道的界面展示，不写串口。 */
  setAirbagDisplay(
    gears: number[],
    sensorId?: 1 | 2
  ): Promise<HttpResult<CarAdaptiveAirbagDisplayState> | CarAdaptiveAirbagDisplayState>;

  /** 清除目标通道的接口展示覆盖。 */
  clearAirbagDisplay(
    sensorId?: 1 | 2
  ): Promise<HttpResult<CarAdaptiveAirbagDisplayState> | CarAdaptiveAirbagDisplayState>;

  /** 查询一路全部或指定类型的气囊指令历史，默认返回最新 200 条。 */
  getAirbagCommandHistory(options?: {
    sensorId?: 1 | 2;
    type?: CarAdaptiveAirbagCommandHistoryType;
    limit?: number;
  }): Promise<HttpResult<CarAdaptiveAirbagCommandHistoryState> | CarAdaptiveAirbagCommandHistoryState>;

  /** 清空一路全部或指定类型的气囊指令历史，不改变业务运行状态。 */
  clearAirbagCommandHistory(options?: {
    sensorId?: 1 | 2;
    type?: CarAdaptiveAirbagCommandHistoryType;
  }): Promise<HttpResult<CarAdaptiveAirbagCommandHistoryState> | CarAdaptiveAirbagCommandHistoryState>;

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
