'use strict';

const { spawn } = require('child_process');
const path = require('path');

const DEFAULT_BASE_URL = 'http://127.0.0.1:19245';
const DEFAULT_WS_URL = 'ws://127.0.0.1:19999';
const DEFAULT_ALGORITHM_SCRIPT = path.join(__dirname, 'python', 'app', 'server.py');

/**
 * SDK 统一错误类型。
 * 请求超时、HTTP 请求失败、后端业务错误都会封装成 JqToolsError。
 */
class JqToolsError extends Error {
  /** 创建 SDK 错误，并把额外上下文挂到错误对象上。 */
  constructor(message, details = {}) {
    super(message);
    this.name = 'JqToolsError';
    Object.assign(this, details);
  }
}

/**
 * SDK 内部的 Python 算法常驻进程管理器。
 * 负责启动 `server.py`，通过 stdin/stdout 的 JSON 行协议调用算法函数，
 * 并把 Python 普通日志与 JSON 响应区分开。
 */
class PythonAlgorithmWorker {
  /**
   * @param {Object} [options]
   * @param {string} [options.pythonPath] Python 可执行文件路径。
   * @param {string} [options.scriptPath] Python 算法入口 `server.py` 路径。
   * @param {number} [options.timeout=15000] Python 单次调用超时时间，单位毫秒。
   * @param {Object} [options.env] 传给 Python 进程的额外环境变量。
   * @param {Function} [options.onLog] 接收 Python stdout/stderr 中非协议日志的回调。
   */
  constructor(options = {}) {
    this.pythonPath = options.pythonPath || process.env.JQTOOLS_PYTHON || 'python';
    this.scriptPath = options.scriptPath || DEFAULT_ALGORITHM_SCRIPT;
    this.timeout = options.timeout || 15000;
    this.env = options.env || {};
    this.onLog = options.onLog;
    this.child = null;
    this.buffer = '';
    this.nextId = 1;
    this.pending = new Map();
    this.stderrTail = '';
  }

  /**
   * 调用 Python `server.py` 中暴露的函数。
   * 请求会写入 Python stdin，响应按 id 从 stdout 的 JSON 行中匹配回来。
   *
   * @param {string} fn Python 端函数名，例如 `server`、`getParam`、`setParam`。
   * @param {Object} [args] 传给 Python 函数的参数对象。
   * @param {Object} [options]
   * @param {number} [options.timeout] 覆盖本次 Python 调用超时时间。
   * @returns {Promise<*>} Python 函数返回的 data。
   */
  call(fn, args = {}, options = {}) {
    this.ensureStarted();

    const id = this.nextId++;
    const timeout = options.timeout || this.timeout;
    const payload = JSON.stringify({ id, fn, args }) + '\n';

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new JqToolsError(`Python algorithm timed out after ${timeout}ms`, {
          stderr: this.stderrTail
        }));
      }, timeout);

      this.pending.set(id, { resolve, reject, timer });

      this.child.stdin.write(payload, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new JqToolsError(`Python stdin write failed: ${error.message}`, { cause: error }));
      });
    });
  }

  /**
   * 确保 Python 算法进程已启动。
   * 如果尚未启动，会创建子进程并绑定 stdout、stderr、exit、error 事件。
   */
  ensureStarted() {
    if (this.child) return;

    this.child = spawn(this.pythonPath, ['-u', this.scriptPath], {
      cwd: path.dirname(this.scriptPath),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        ...this.env,
        PYTHONUNBUFFERED: '1',
        PYTHONNOUSERSITE: '1'
      }
    });

    this.child.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split(/\r?\n/);
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        this.handleStdoutLine(line);
      }
    });

    this.child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      this.stderrTail = (this.stderrTail + text).slice(-4000);
      if (typeof this.onLog === 'function') {
        this.onLog(text, 'stderr');
      }
    });

    this.child.on('exit', (code, signal) => {
      const error = new JqToolsError(`Python algorithm exited: code=${code} signal=${signal}`, {
        code,
        signal,
        stderr: this.stderrTail
      });

      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }

      this.pending.clear();
      this.child = null;
      this.buffer = '';
    });

    this.child.on('error', (error) => {
      const wrapped = new JqToolsError(`Python algorithm failed to start: ${error.message}`, {
        cause: error,
        pythonPath: this.pythonPath,
        scriptPath: this.scriptPath
      });

      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(wrapped);
      }

      this.pending.clear();
      this.child = null;
    });
  }

  /**
   * 处理 Python stdout 输出的一行文本。
   * JSON 协议行会按 id 唤醒对应 Promise；普通 print 日志会转给 onLog。
   */
  handleStdoutLine(line) {
    if (!line.trim()) return;

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      if (typeof this.onLog === 'function') {
        this.onLog(line, 'stdout');
      }
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(message.id);

    if (message.ok === false) {
      pending.reject(new JqToolsError(message.error || 'Python algorithm returned an error.', {
        trace: message.trace
      }));
    } else {
      pending.resolve(message.data);
    }
  }

  /** 停止当前 Python 算法进程。 */
  stop() {
    if (!this.child) return;
    this.child.kill();
    this.child = null;
  }
}

/**
 * JQTools 汽车自适应 SDK 客户端。
 *
 * 对外业务方法只保留汽车自适应相关能力：
 * 串口连接、实时算法数据流、本地 Python 算法调用和 Python 参数管理。
 */
class JqToolsCarClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.baseUrl] 后端 REST API 基础地址。
   * @param {string} [options.wsUrl] 实时数据 WebSocket 地址。
   * @param {number} [options.timeout=15000] HTTP 请求超时时间，单位毫秒。
   * @param {Function} [options.fetch] 自定义 fetch 实现，用于兼容较旧运行环境。
   * @param {boolean} [options.unwrap=false] 是否直接返回 HttpResult.data，并在 code 非 0 时抛错。
   * @param {string} [options.pythonPath] Python 可执行文件路径，默认读取 JQTOOLS_PYTHON 或使用 python。
   * @param {string} [options.algorithmScriptPath] Python 算法 server.py 路径。
   * @param {number} [options.pythonTimeout] Python 调用超时时间，单位毫秒。
   * @param {Function} [options.onPythonLog] 接收算法 stdout/stderr 中非 JSON 的日志。
   */
  constructor(options = {}) {
    this.baseUrl = trimTrailingSlash(options.baseUrl || DEFAULT_BASE_URL);
    this.wsUrl = options.wsUrl || DEFAULT_WS_URL;
    this.timeout = options.timeout || 15000;
    this.fetch = options.fetch || globalThis.fetch;
    this.unwrap = Boolean(options.unwrap);
    this.pythonWorker = new PythonAlgorithmWorker({
      pythonPath: options.pythonPath,
      scriptPath: options.algorithmScriptPath,
      timeout: options.pythonTimeout || this.timeout,
      env: options.pythonEnv,
      onLog: options.onPythonLog
    });

    if (typeof this.fetch !== 'function') {
      throw new JqToolsError('fetch is not available. Use Node.js 18+ or pass a fetch implementation.');
    }
  }

  /**
   * 底层 HTTP 请求方法。
   * 当后端新增接口还没有封装成具名方法时，可以先用这个方法调用。
   */
  async request(method, pathname, options = {}) {
    const url = buildUrl(this.baseUrl, pathname, options.query);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || this.timeout);
    const headers = Object.assign({}, options.headers);
    const init = {
      method,
      headers,
      signal: options.signal || controller.signal
    };

    if (options.body !== undefined) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      init.body = headers['Content-Type'].includes('application/json')
        ? JSON.stringify(options.body)
        : options.body;
    }

    try {
      const response = await this.fetch(url, init);
      const payload = await parseResponse(response);

      if (!response.ok) {
        // 参数校验失败会同时带 HTTP 400 和 HttpResult，优先抛出后端写明的原因。
        throw new JqToolsError(
          isHttpResult(payload) && payload.message
            ? payload.message
            : `JQTools backend returned HTTP ${response.status}`,
          {
            status: response.status,
            code: isHttpResult(payload) ? payload.code : undefined,
            payload
          }
        );
      }

      return this.unwrapResult(payload, options);
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new JqToolsError(`JQTools request timed out after ${options.timeout || this.timeout}ms`, {
          cause: error
        });
      }
      if (error instanceof JqToolsError) {
        throw error;
      }
      throw new JqToolsError(`JQTools request failed: ${error.message}`, { cause: error });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** 在开启 unwrap 时，将后端 HttpResult 转换为 data。 */
  unwrapResult(payload, options = {}) {
    const shouldUnwrap = options.unwrap !== undefined ? options.unwrap : this.unwrap;
    if (!shouldUnwrap || !isHttpResult(payload)) {
      return payload;
    }

    if (payload.code !== 0) {
      throw new JqToolsError(payload.message || 'JQTools backend returned an error result.', {
        code: payload.code,
        payload
      });
    }

    return payload.data;
  }

  /** 检查后端 REST 服务是否可访问。 */
  health() {
    return this.request('GET', '/');
  }

  /** 获取后端所在机器识别到的串口列表。 */
  listPorts() {
    return this.request('GET', '/getPort');
  }

  /**
   * 连接后端识别到的串口设备。
   * 后端会按 145 字节帧首字节区分主副传感器，并把后 144 字节分别送入两套独立 Python 算法。
   */
  connectPorts() {
    return this.request('GET', '/connPort');
  }

  /** 语义化别名，便于客户代码表达“连接汽车自适应串口”。 */
  connectCarAdaptivePorts() {
    return this.connectPorts();
  }

  /** 获取后端旧版单路兼容投影；新版前端应使用双路 WebSocket 数据本地切换。 */
  getCarAdaptiveSensor() {
    return this.request('GET', '/carAdaptive/sensor');
  }

  /** 获取主、副两路的在线状态、频率和算法帧计数。 */
  getCarAdaptiveSensors() {
    return this.request('GET', '/carAdaptive/sensors');
  }

  /** 查询主界面和原始数据页共享的全局采集状态。 */
  getCarAdaptiveCollection() {
    return this.request('GET', '/carAdaptive/collection');
  }

  /**
   * 开始采集指定主副驾的真实串口压力数据。
   * 当前后端同一时间只运行一个全局采集任务。
   *
   * @param {Object} [options]
   * @param {1|2} [options.sensorId=1] 采集主驾或副驾。
   * @param {string} [options.fileName] 采集段名称，省略时由后端生成时间戳。
   * @param {Object|Array} [options.select] 随采集帧保存的兼容元数据。
   */
  startCarAdaptiveCollection(options = {}) {
    const sensorId = Number(options.sensorId ?? 1);
    if (![1, 2].includes(sensorId)) {
      throw new JqToolsError('sensorId must be 1 (main) or 2 (secondary).');
    }
    return this.request('POST', '/startCol', {
      body: {
        sensorId,
        fileName: options.fileName,
        select: options.select || []
      }
    });
  }

  /** 停止并保存当前全局采集任务。 */
  stopCarAdaptiveCollection() {
    return this.request('GET', '/endCol');
  }

  /**
   * 生成原始采集段 CSV 的下载地址。
   * fileName 省略时由后端使用当前或最近一次采集段。
   *
   * @param {Object} [options]
   * @param {string} [options.fileName] 采集段名称。
   * @param {1|2} [options.sensorId] 只导出主驾或副驾。
   * @returns {string} CSV 下载地址。
   */
  getCarAdaptiveCollectionExportUrl(options = {}) {
    const query = {};
    const fileName = String(options.fileName || '').trim();
    if (fileName) query.fileName = fileName;
    if (options.sensorId !== undefined) {
      const sensorId = Number(options.sensorId);
      if (![1, 2].includes(sensorId)) {
        throw new JqToolsError('sensorId must be 1 (main) or 2 (secondary).');
      }
      query.sensorId = sensorId;
    }
    return buildUrl(this.baseUrl, '/carAdaptive/collection/export', query);
  }

  /**
   * 直接读取一个采集段的原始 145 字节帧 CSV。
   * 返回 Uint8Array，由调用方决定保存路径或继续上传处理。
   *
   * @param {Object} [options]
   * @param {string} [options.fileName] 采集段名称。
   * @param {1|2} [options.sensorId] 只导出主驾或副驾。
   * @returns {Promise<{fileName:string,contentType:string,frameCount:number,data:Uint8Array}>} CSV 数据。
   */
  async exportCarAdaptiveCollection(options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || this.timeout);
    try {
      const response = await this.fetch(this.getCarAdaptiveCollectionExportUrl(options), {
        method: 'GET',
        signal: options.signal || controller.signal
      });
      if (!response.ok) {
        const payload = await parseResponse(response);
        throw new JqToolsError(
          payload?.data || payload?.message || `Collection export failed with HTTP ${response.status}`,
          { status: response.status, payload }
        );
      }

      const fallbackName = 'car-adaptive-raw.csv';
      return {
        fileName: resolveDownloadFileName(
          response.headers.get('content-disposition'),
          fallbackName
        ),
        contentType: response.headers.get('content-type') || 'text/csv; charset=utf-8',
        frameCount: Number(response.headers.get('x-jqtools-frame-count')) || 0,
        data: new Uint8Array(await response.arrayBuffer())
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new JqToolsError(`JQTools request timed out after ${options.timeout || this.timeout}ms`, {
          cause: error
        });
      }
      if (error instanceof JqToolsError) throw error;
      throw new JqToolsError(`JQTools collection export failed: ${error.message}`, { cause: error });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 切换后端旧版单路兼容投影；不会影响主、副两路算法持续运行。
   *
   * @param {1|2} sensorId 1 表示主传感器，2 表示副传感器。
   */
  selectCarAdaptiveSensor(sensorId) {
    if (![1, 2].includes(Number(sensorId))) {
      throw new JqToolsError('sensorId must be 1 (main) or 2 (secondary).');
    }
    return this.request('POST', '/carAdaptive/sensor', {
      body: { sensorId: Number(sensorId) }
    });
  }

  /**
   * 提交一帧汽车自适应传感器数据给 SDK 内置 Python 算法。
   *
   * @param {number[]} sensorData 144 个传感器值，每个值应在 0-255 范围内。
   * @param {Object} [options]
   * @param {1|2} [options.sensorId=1] 指定使用主传感器或副传感器的独立算法实例。
   * @param {boolean} [options.writeSerial=false] 是否将返回的 control_command 写入汽车自适应串口。
   * @returns {Promise<*>} 本地 Python 算法结果，通常包含 control_command、living_status、body_type、seat_state、frame_count。
   */
  async processCarAdaptiveFrame(sensorData, options = {}) {
    if (!Array.isArray(sensorData) || sensorData.length !== 144) {
      throw new JqToolsError('sensorData must be an array with 144 numbers.');
    }

    const sensorId = Number(options.sensorId ?? 1);
    if (![1, 2].includes(sensorId)) {
      throw new JqToolsError('sensorId must be 1 (main) or 2 (secondary).');
    }

    // 需要写串口时交给真实后端完成“算法 + 写入”，避免算法命令误走客户手动白名单接口。
    const result = options.writeSerial
      ? await this.request('POST', '/carAdaptive/processFrame', {
        body: { sensorData, sensorId, writeSerial: true },
        timeout: options.timeout,
        unwrap: true
      })
      : await this.pythonWorker.call('server', {
        sensor_data: sensorData,
        sensor_id: sensorId
      }, {
        timeout: options.timeout
      });

    return {
      ...result,
      sensor_id: sensorId,
      sensor_role: sensorId === 1 ? '主' : '副'
    };
  }

  /** 查询目标主副驾的气囊控制模式；不传 sensorId 时返回当前展示通道和两路状态。 */
  getControlMode(sensorId) {
    if (sensorId !== undefined && ![1, 2].includes(Number(sensorId))) {
      throw new JqToolsError('sensorId must be 1 (main) or 2 (secondary).');
    }
    const query = sensorId === undefined ? '' : `?sensorId=${Number(sensorId)}`;
    return this.request('GET', `/carAdaptive/mode${query}`);
  }

  /**
   * 切换气囊控制模式。
   *
   * - `auto`：算法接管，每 500ms 自动把控制命令写回串口。
   * - `manual`：算法继续运行但不写串口，只接受显式下发的命令。
   * - `paused`：暂停算法调用，气囊冻结在当前充气量。
   *
   * 三种模式都不影响串口采集和压力数据推送。从 `manual` 恢复到 `auto` 会清空按摩状态，
   * 从 `paused` 恢复会重建两路算法实例。
   *
   * @param {'auto'|'manual'|'paused'} mode 目标模式。
   * @param {Object} [options]
   * @param {1|2} [options.sensorId] 只切换指定通道；不传时兼容旧接口并同时切换两路。
   * @param {string} [options.reason] 变更原因，便于现场排查是谁切换的。
   */
  setControlMode(mode, options = {}) {
    if (!['auto', 'manual', 'paused'].includes(String(mode).trim().toLowerCase())) {
      throw new JqToolsError("mode must be 'auto', 'manual' or 'paused'.");
    }
    if (options.sensorId !== undefined && ![1, 2].includes(Number(options.sensorId))) {
      throw new JqToolsError('sensorId must be 1 (main) or 2 (secondary).');
    }
    return this.request('POST', '/carAdaptive/mode', {
      body: {
        mode: String(mode).trim().toLowerCase(),
        source: 'api',
        reason: options.reason,
        ...(options.sensorId === undefined ? {} : { sensorId: Number(options.sensorId) })
      }
    });
  }

  /** 查询 API 专属 3–6 号与 ECU 其余 20 路按固定归属合并后的气囊展示状态。 */
  getAirbagDisplay(sensorId) {
    if (sensorId !== undefined && ![1, 2].includes(Number(sensorId))) {
      throw new JqToolsError('sensorId must be 1 (main) or 2 (secondary).');
    }
    const query = sensorId === undefined ? '' : `?sensorId=${Number(sensorId)}`;
    return this.request('GET', `/carAdaptive/display${query}`);
  }

  /**
   * 用 24 项数组提交 3、4、5、6 号的界面档位，不写串口、不伪造 ECU 回传。
   * 其余 20 项必须为 0，界面继续使用 ECU 回传；调用 clearAirbagDisplay 后 3–6 号熄灭。
   */
  setAirbagDisplay(gears, sensorId = 1) {
    if (![1, 2].includes(Number(sensorId))) {
      throw new JqToolsError('sensorId must be 1 (main) or 2 (secondary).');
    }
    if (!Array.isArray(gears) || gears.length !== 24 || gears.some((gear) => !Number.isInteger(gear) || gear < 0 || gear > 4)) {
      throw new JqToolsError('gears must be an array with 24 integers between 0 and 4.');
    }
    const unsupportedIndex = gears.findIndex((gear, index) => gear !== 0 && ![2, 3, 4, 5].includes(index));
    if (unsupportedIndex >= 0) {
      throw new JqToolsError(`airbag display API only allows airbags 3, 4, 5 and 6; airbag ${unsupportedIndex + 1} must be 0.`);
    }
    return this.request('POST', '/carAdaptive/display', {
      body: { sensorId: Number(sensorId), gears }
    });
  }

  /** 清除目标通道 3–6 号的 API 展示状态并熄灭；其余 20 路继续使用 ECU 或兼容命令回落。 */
  clearAirbagDisplay(sensorId = 1) {
    if (![1, 2].includes(Number(sensorId))) {
      throw new JqToolsError('sensorId must be 1 (main) or 2 (secondary).');
    }
    return this.request('DELETE', `/carAdaptive/display/${Number(sensorId)}`);
  }

  /**
   * 查询一路气囊指令历史。
   * type 可选 algorithmGenerated、algorithmSent、ecuFeedback、apiSerial、apiDisplay 或 all。
   */
  getAirbagCommandHistory(options = {}) {
    const sensorId = options.sensorId === undefined ? 1 : Number(options.sensorId);
    if (![1, 2].includes(sensorId)) {
      throw new JqToolsError('sensorId must be 1 (main) or 2 (secondary).');
    }
    const allowedTypes = [
      'all',
      'algorithmGenerated',
      'algorithmSent',
      'ecuFeedback',
      'apiSerial',
      'apiDisplay'
    ];
    const type = String(options.type || 'all').trim();
    if (!allowedTypes.includes(type)) {
      throw new JqToolsError(`unsupported airbag command history type: ${type}`);
    }
    const query = new URLSearchParams({ sensorId: String(sensorId) });
    if (type !== 'all') query.set('type', type);
    if (options.limit !== undefined) {
      const limit = Number(options.limit);
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new JqToolsError('limit must be a positive integer.');
      }
      query.set('limit', String(limit));
    }
    return this.request('GET', `/carAdaptive/commands/history?${query.toString()}`);
  }

  /**
   * 清空一路全部或指定类型的气囊指令历史。
   * 该操作只清理诊断记录，不会改变算法、串口、气囊和界面展示状态。
   */
  clearAirbagCommandHistory(options = {}) {
    const sensorId = options.sensorId === undefined ? 1 : Number(options.sensorId);
    if (![1, 2].includes(sensorId)) {
      throw new JqToolsError('sensorId must be 1 (main) or 2 (secondary).');
    }
    const allowedTypes = [
      'all',
      'algorithmGenerated',
      'algorithmSent',
      'ecuFeedback',
      'apiSerial',
      'apiDisplay'
    ];
    const type = String(options.type || 'all').trim();
    if (!allowedTypes.includes(type)) {
      throw new JqToolsError(`unsupported airbag command history type: ${type}`);
    }
    const query = type === 'all' ? '' : `?type=${encodeURIComponent(type)}`;
    return this.request('DELETE', `/carAdaptive/commands/history/${sensorId}${query}`);
  }

  /** 通过客户手动接口写入只允许 3、4、5、6 号动作的完整 55 字节命令。 */
  writeCarAdaptiveCommand(controlCommand, sensorId = 1) {
    if (![1, 2].includes(Number(sensorId))) {
      throw new JqToolsError('sensorId must be 1 (main) or 2 (secondary).');
    }
    return this.request('POST', '/carAdaptive/writeCommand', {
      body: {
        controlCommand,
        sensorId: Number(sensorId)
      }
    });
  }

  /** 从 SDK 本地 Python worker 获取算法参数和注释。 */
  getPythonConfig() {
    return this.pythonWorker.call('getParam');
  }

  /**
   * 修改一个 Python 算法参数。
   * value 可以是 JavaScript 值，会直接传给 SDK 本地 Python worker。
   */
  setPythonParam(path, value) {
    const obj = {};
    obj[path] = value;
    return this.pythonWorker.call('setParam', { obj });
  }

  /** 调用 SDK 本地 Python server.py 暴露的原始函数。 */
  callPythonFunction(fn, args = {}, options = {}) {
    return this.pythonWorker.call(fn, args, options);
  }

  /** 停止 SDK 本地 Python worker 进程。 */
  stopPythonAlgorithm() {
    this.pythonWorker.stop();
  }

  /**
   * 连接原始 WebSocket 实时数据流。
   * 后端可能推送 algorData、algorFeed、sitData、data、macInfo 等诊断消息。
   */
  connectStream(handlers = {}) {
    const WebSocketImpl = resolveWebSocket();
    const socket = new WebSocketImpl(this.wsUrl);

    socket.onopen = handlers.onOpen || null;
    socket.onclose = handlers.onClose || null;
    socket.onerror = handlers.onError || null;
    socket.onmessage = (event) => {
      const value = parseStreamMessage(event.data);
      if (typeof handlers.onMessage === 'function') {
        handlers.onMessage(value, event);
      }
    };

    return socket;
  }

  /**
   * 连接 WebSocket 实时数据流，并按汽车自适应消息类型分发回调。
   *
   * @param {Object} [handlers]
   * @param {Function} [handlers.onAlgorithmData] 收到 algorData 消息时触发。
     * @param {Function} [handlers.onControlFeedback] 收到 algorFeed 消息时触发。
     * @param {Function} [handlers.onSensorChange] 主副传感器选择发生变化时触发。
     * @param {Function} [handlers.onSensorStatus] 收到主副两路运行摘要时触发。
     * @param {Function} [handlers.onSensorData] 同时收到主副两套完整数据时触发。
     * @param {Function} [handlers.onControlModeChange] 气囊控制模式变化时触发。
   * @param {Function} [handlers.onRawMessage] 每条已解析 WebSocket 消息都会触发。
   * @param {Function} [handlers.onOpen] WebSocket 连接建立回调。
   * @param {Function} [handlers.onClose] WebSocket 连接关闭回调。
   * @param {Function} [handlers.onError] WebSocket 错误回调。
   */
  connectCarAdaptiveStream(handlers = {}) {
    return this.connectStream({
      onOpen: handlers.onOpen,
      onClose: handlers.onClose,
      onError: handlers.onError,
      onMessage: (message, event) => {
        if (typeof handlers.onRawMessage === 'function') {
          handlers.onRawMessage(message, event);
        }
        if (message && typeof message === 'object' && 'algorData' in message && typeof handlers.onAlgorithmData === 'function') {
          handlers.onAlgorithmData(message.algorData, event);
        }
        if (message && typeof message === 'object' && 'algorFeed' in message && typeof handlers.onControlFeedback === 'function') {
          handlers.onControlFeedback(message.algorFeed, event);
        }
        if (message && typeof message === 'object' && 'carAdaptiveSensor' in message && typeof handlers.onSensorChange === 'function') {
          handlers.onSensorChange(message.carAdaptiveSensor, event);
        }
        if (message && typeof message === 'object' && 'carAdaptiveSensors' in message && typeof handlers.onSensorStatus === 'function') {
          handlers.onSensorStatus(message.carAdaptiveSensors, event);
        }
        if (message && typeof message === 'object' && 'carAdaptiveSensorsData' in message && typeof handlers.onSensorData === 'function') {
          handlers.onSensorData(message.carAdaptiveSensorsData, event);
        }
        if (message && typeof message === 'object' && 'carAdaptiveControlMode' in message && typeof handlers.onControlModeChange === 'function') {
          handlers.onControlModeChange(message.carAdaptiveControlMode, event);
        }
      }
    });
  }
}

/** 创建汽车自适应 SDK 客户端。 */
function createClient(options) {
  return new JqToolsCarClient(options);
}

const JqToolsClient = JqToolsCarClient;

/** 移除 URL 末尾多余的斜杠，避免拼接接口路径时出现双斜杠。 */
function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

/** 根据基础地址、接口路径和查询参数拼出完整请求 URL。 */
function buildUrl(baseUrl, pathname, query) {
  const url = new URL(pathname, `${baseUrl}/`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

/** 从 Content-Disposition 中解析 UTF-8 文件名。 */
function resolveDownloadFileName(disposition, fallbackName) {
  const utf8Match = String(disposition || '').match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      // 非法转义时继续尝试普通 filename。
    }
  }
  const plainMatch = String(disposition || '').match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] || fallbackName;
}

/** 解析 HTTP 响应；优先按 JSON 处理，无法解析时返回原始文本。 */
async function parseResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return JSON.parse(text);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** 解析 WebSocket 消息；能转 JSON 就返回对象，否则返回原始字符串。 */
function parseStreamMessage(data) {
  const text = typeof data === 'string' ? data : data.toString();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** 判断一个对象是否符合后端 HttpResult 统一响应结构。 */
function isHttpResult(value) {
  return value && typeof value === 'object' && 'code' in value && 'data' in value && 'message' in value;
}

/** 获取 WebSocket 实现；浏览器用全局 WebSocket，Node.js 用 ws 包。 */
function resolveWebSocket() {
  if (typeof globalThis.WebSocket === 'function') {
    return globalThis.WebSocket;
  }
  return require('ws');
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_WS_URL,
  JqToolsCarClient,
  JqToolsClient,
  JqToolsError,
  createClient
};
