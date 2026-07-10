#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const DEFAULT_HTTP_PORT = 19345;
const DEFAULT_WS_PORT = 19399;
const DEBUG_HTML_PATH = path.join(__dirname, 'mock-debug.html');
const WS_OPEN = 1;

const host = process.env.JQTOOLS_MOCK_HOST || '127.0.0.1';
const httpPort = Number(process.env.JQTOOLS_MOCK_HTTP_PORT || process.env.PORT || DEFAULT_HTTP_PORT);
const wsPort = Number(process.env.JQTOOLS_MOCK_WS_PORT || DEFAULT_WS_PORT);

const state = {
  connected: false,
  adaptiveEnabled: false,
  frameCount: 0,
  sensorTimer: null,
  airbag: new Array(24).fill(0),
  lastCommand: null,
  lastSerial: null,
  lastAlgorithm: null,
  clients: 0
};

/** HTTP 服务：提供假连接、假算法、气囊控制和调试页面接口。 */
const httpServer = http.createServer(async (req, res) => {
  try {
    if (handleCors(req, res)) return;
    await routeHttp(req, res);
  } catch (error) {
    sendJson(res, 500, fail(error.message || 'internal server error'));
  }
});

/** WebSocket 服务：假连接后持续推送传感器帧、算法结果和气囊状态。 */
const wsServer = new WebSocketServer({ host, port: wsPort });

wsServer.on('connection', (socket) => {
  state.clients = wsServer.clients.size;
  socket.send(JSON.stringify({
    type: 'ready',
    service: 'jqtools-car-adaptive-mock',
    data: getStatus()
  }));

  socket.on('close', () => {
    state.clients = wsServer.clients.size;
  });
});

httpServer.listen(httpPort, host, () => {
  console.log(`[mock] HTTP service listening at http://${host}:${httpPort}`);
  console.log(`[mock] WebSocket service listening at ws://${host}:${wsPort}`);
  console.log(`[mock] Debug page: http://${host}:${httpPort}/debug`);
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

/** 根据 HTTP 方法和路径分发调试接口。 */
async function routeHttp(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${host}:${httpPort}`}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    sendJson(res, 200, ok({
      service: 'jqtools-car-adaptive-mock',
      httpPort,
      wsPort,
      ...getStatus()
    }));
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/debug' || url.pathname === '/debug.html')) {
    sendHtml(res, fs.readFileSync(DEBUG_HTML_PATH, 'utf8'));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/status') {
    sendJson(res, 200, ok(getStatus()));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/getPort') {
    sendJson(res, 200, ok(getFakePorts()));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/connPort') {
    connectFake();
    sendJson(res, 200, ok({
      connected: state.connected,
      port: getFakePorts()[0]
    }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/fake/connect') {
    connectFake();
    sendJson(res, 200, ok(getStatus()));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/fake/serialFrame') {
    const serialFrame = emitFakeSerialFrame();
    sendJson(res, 200, ok(serialFrame));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/fake/disconnect') {
    disconnectFake();
    sendJson(res, 200, ok(getStatus()));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/adaptive/switch') {
    const body = await readJsonBody(req);
    state.adaptiveEnabled = Boolean(body.enabled);
    broadcast({
      type: 'adaptive',
      adaptiveEnabled: state.adaptiveEnabled,
      timestamp: Date.now()
    });
    sendJson(res, 200, ok(getStatus()));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/airbag/send') {
    const body = await readJsonBody(req);
    const result = sendAirbagCommand(body);
    sendJson(res, 200, ok(result));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/carAdaptive/processFrame') {
    const body = await readJsonBody(req);
    const sensorData = normalizeSensorData(body.sensorData || body.sensor_data || createFakeSensorData());
    const algorithm = createFakeAlgorithmData(sensorData);
    state.lastAlgorithm = algorithm;
    broadcastAlgorithm(sensorData, algorithm);
    sendJson(res, 200, ok(algorithm));
    return;
  }

  sendJson(res, 404, fail(`not found: ${req.method} ${url.pathname}`));
}

/** 建立假连接，并开始推送假传感器和算法数据。 */
function connectFake() {
  if (state.connected) {
    pushFakeFrame();
    return;
  }
  state.connected = true;
  state.frameCount = 0;
  state.sensorTimer = setInterval(pushFakeFrame, 500);
  broadcast({
    type: 'connection',
    connected: true,
    port: getFakePorts()[0],
    timestamp: Date.now()
  });
  pushFakeFrame();
}

/** 断开假连接，并停止推送假数据。 */
function disconnectFake() {
  state.connected = false;
  if (state.sensorTimer) {
    clearInterval(state.sensorTimer);
    state.sensorTimer = null;
  }
  broadcast({
    type: 'connection',
    connected: false,
    timestamp: Date.now()
  });
}

/** 推送一帧假传感器数据；自适应开关打开时同步推送假算法数据。 */
function pushFakeFrame() {
  if (!state.connected) return;
  emitFakeSerialFrame();
}

/** 生成并广播一帧假串口数据，字段结构尽量贴近真实后端 WebSocket 推送。 */
function emitFakeSerialFrame() {
  const sensorData = createFakeSensorData();
  const payload = createFakeSerialPayload(sensorData);
  state.lastSerial = payload.serialData;
  broadcast(payload);

  const algorithm = createFakeAlgorithmData(sensorData);
  state.lastAlgorithm = algorithm;
  broadcastAlgorithm(sensorData, algorithm);

  if (state.adaptiveEnabled) {
    if (algorithm.control_command) {
      sendAirbagCommand({
        source: 'adaptive',
        controlCommand: algorithm.control_command
      });
    }
  }

  return payload;
}

/** 生成一帧 144 点假压力数据。 */
function createFakeSensorData() {
  state.frameCount += 1;
  const phase = state.frameCount / 6;
  return Array.from({ length: 144 }, (_, index) => {
    const wave = Math.sin(phase + index / 9) * 18;
    const seatZone = index >= 72 ? 22 : 8;
    const noise = Math.round(Math.random() * 8);
    return clampByte(35 + seatZone + wave + noise);
  });
}

/** 组装假串口帧，兼容 serialData、sitData、data 三种前端常见读取方式。 */
function createFakeSerialPayload(sensorData) {
  const timestamp = Date.now();
  const carAirFrame = {
    type: 'carAir',
    arr: sensorData,
    stamp: timestamp,
    HZ: 2,
    mock: true
  };

  return {
    type: 'serial',
    frameCount: state.frameCount,
    sensorData,
    serialData: {
      path: 'COM_FAKE_CAR',
      baudRate: 1000000,
      frameLength: sensorData.length,
      sensorType: 'carAir',
      frameData: sensorData,
      timestamp,
      mock: true
    },
    sitData: {
      carAir: carAirFrame
    },
    data: {
      carAir: carAirFrame
    },
    timestamp
  };
}

/** 根据假传感器数据生成假算法结果。 */
function createFakeAlgorithmData(sensorData) {
  const total = sensorData.reduce((sum, value) => sum + value, 0);
  const avg = total / sensorData.length;
  const activePoints = sensorData.filter((value) => value > 45).length;
  const maxPressure = Math.max(...sensorData);
  const minPressure = Math.min(...sensorData);
  const seatState = activePoints > 80 ? 'ADAPTIVE_LOCKED' : activePoints > 30 ? 'CUSHION_ONLY' : 'OFF_SEAT';
  const bodyType = avg > 70 ? 'adult' : avg > 55 ? 'child' : 'unknown';
  const livingStatus = avg > 50 ? 'living_confirmed' : 'detecting';
  const controlCommand = createControlCommand(avg);
  const normalizedPressure = sensorData.map((value) => Number((value / 255).toFixed(3)));
  const balance = calcPressureBalance(sensorData);

  return {
    control_command: controlCommand,
    control_command_51: controlCommand,
    sensor_data_144: sensorData,
    pressure_map_144: sensorData,
    normalized_pressure_144: normalizedPressure,
    sensor_length: sensorData.length,
    control_length: controlCommand.length,
    is_new_command: true,
    control_decision_data: {
      averagePressure: Number(avg.toFixed(2)),
      activePoints,
      maxPressure,
      minPressure,
      balance,
      adaptiveEnabled: state.adaptiveEnabled,
      targetCommandLength: 51
    },
    algorithms: {
      pressure_map: {
        name: 'pressure_map',
        length: 144,
        data: sensorData
      },
      living_detection: {
        name: 'living_detection',
        status: livingStatus,
        score: Number(Math.min(1, avg / 90).toFixed(3))
      },
      body_type: {
        name: 'body_type',
        type: bodyType,
        confidence: Number(Math.min(0.98, 0.45 + activePoints / 180).toFixed(3))
      },
      seat_state: {
        name: 'seat_state',
        state: seatState,
        activePoints
      },
      adaptive_adjustment: {
        name: 'adaptive_adjustment',
        enabled: state.adaptiveEnabled,
        control_command_51: controlCommand,
        airbag_feedback_24: getControlFeedback(controlCommand)
      }
    },
    living_status: livingStatus,
    body_type: bodyType,
    seat_state: seatState,
    frame_count: state.frameCount,
    mock: true,
    timestamp: Date.now()
  };
}

/** 计算 144 点压力图的左右和前后平衡，供算法假数据展示使用。 */
function calcPressureBalance(sensorData) {
  let left = 0;
  let right = 0;
  let front = 0;
  let back = 0;

  sensorData.forEach((value, index) => {
    const column = index % 12;
    const row = Math.floor(index / 12);
    if (column < 6) left += value;
    else right += value;
    if (row < 6) front += value;
    else back += value;
  });

  return {
    left: Number(left.toFixed(2)),
    right: Number(right.toFixed(2)),
    front: Number(front.toFixed(2)),
    back: Number(back.toFixed(2)),
    leftRightDelta: Number((left - right).toFixed(2)),
    frontBackDelta: Number((front - back).toFixed(2))
  };
}

/** 生成 51 字节风格的假 control_command。 */
function createControlCommand(avg) {
  const command = new Array(51).fill(0);
  command[0] = 31;

  for (let i = 0; i < 24; i++) {
    const action = avg > 68 ? 1 : avg < 48 ? 2 : 0;
    command[2 * i + 1] = i + 1;
    command[2 * i + 2] = action;
  }

  command[49] = state.adaptiveEnabled ? 1 : 0;
  command[50] = command.slice(0, 50).reduce((sum, value) => (sum + value) % 256, 0);
  return command;
}

/** 发送气囊控制命令，并立即返回假硬件回包。 */
function sendAirbagCommand(body) {
  const controlCommand = normalizeControlCommand(body.controlCommand || body.command || createControlCommand(60));
  state.lastCommand = controlCommand;

  for (let i = 0; i < 24; i++) {
    const action = controlCommand[2 * i + 2] || 0;
    if (action === 1) state.airbag[i] = Math.min(100, state.airbag[i] + 8);
    if (action === 2) state.airbag[i] = Math.max(0, state.airbag[i] - 8);
  }

  const response = {
    accepted: true,
    source: body.source || 'manual',
    sentCommand: controlCommand,
    receivedFrame: createAirbagAck(controlCommand),
    airbagState: state.airbag,
    timestamp: Date.now()
  };

  broadcast({
    type: 'airbag',
    airbagResponse: response
  });

  return response;
}

/** 生成气囊控制的假硬件回包。 */
function createAirbagAck(command) {
  return {
    header: [170, 85],
    commandId: command[0],
    status: 0,
    message: 'mock airbag command accepted',
    checksum: command.reduce((sum, value) => (sum + value) % 256, 0)
  };
}

/** 广播算法结果和控制反馈。 */
function broadcastAlgorithm(sensorData, algorithm) {
  broadcast({
    type: 'algorithm',
    sensorData,
    sensorLength: sensorData.length,
    controlCommand51: algorithm.control_command_51,
    controlLength: algorithm.control_command_51.length,
    algorithms: algorithm.algorithms,
    algorData: algorithm,
    algorFeed: getControlFeedback(algorithm.control_command),
    airbagState: state.airbag
  });
}

/** 返回假串口列表。 */
function getFakePorts() {
  return [
    {
      path: 'COM_FAKE_CAR',
      manufacturer: 'JQTools Mock',
      serialNumber: 'MOCK-CAR-ADAPTIVE-001',
      type: 'carAir',
      mock: true
    }
  ];
}

/** 返回当前调试服务状态。 */
function getStatus() {
  return {
    connected: state.connected,
    adaptiveEnabled: state.adaptiveEnabled,
    frameCount: state.frameCount,
    clients: wsServer?.clients?.size || 0,
    airbagState: state.airbag,
    lastSerial: state.lastSerial,
    lastAlgorithm: state.lastAlgorithm,
    hasTimer: Boolean(state.sensorTimer)
  };
}

/** 从 control_command 提取 24 路控制反馈。 */
function getControlFeedback(command) {
  if (!Array.isArray(command)) return [];
  return Array.from({ length: 24 }, (_, index) => command[2 * index + 2] || 0);
}

/** 读取请求体 JSON。 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString();
      if (raw.length > 10 * 1024 * 1024) {
        reject(new Error('request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error(`invalid JSON body: ${error.message}`));
      }
    });
    req.on('error', reject);
  });
}

/** 处理跨域预检请求。 */
function handleCors(req, res) {
  if (req.method !== 'OPTIONS') return false;
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  });
  res.end();
  return true;
}

/** 广播 WebSocket 消息。 */
function broadcast(payload) {
  const message = JSON.stringify(payload);
  wsServer.clients.forEach((socket) => {
    if (socket.readyState === WS_OPEN) socket.send(message);
  });
}

/** 发送 JSON 响应。 */
function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  });
  res.end(JSON.stringify(payload));
}

/** 返回 HTML 页面。 */
function sendHtml(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(html);
}

/** 生成成功响应结构。 */
function ok(data) {
  return { code: 0, data, message: 'success' };
}

/** 生成失败响应结构。 */
function fail(message) {
  return { code: 1, data: {}, message };
}

/** 标准化 144 点传感器数据。 */
function normalizeSensorData(sensorData) {
  if (!Array.isArray(sensorData) || sensorData.length !== 144) {
    throw new Error('sensorData must be an array with 144 numbers');
  }
  return sensorData.map((value) => clampByte(Number(value)));
}

/** 标准化气囊控制命令。 */
function normalizeControlCommand(command) {
  if (!Array.isArray(command)) {
    throw new Error('controlCommand must be an array');
  }
  const normalized = command.map((value) => clampByte(Number(value)));
  if (normalized.length < 51) {
    return normalized.concat(new Array(51 - normalized.length).fill(0));
  }
  return normalized.slice(0, 51);
}

/** 将数值限制到单字节范围。 */
function clampByte(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** 停止调试服务。 */
function shutdown() {
  console.log('[mock] shutting down');
  disconnectFake();
  wsServer.close();
  httpServer.close(() => process.exit(0));
}
