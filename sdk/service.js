#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createClient } = require('./index');

const DEFAULT_HTTP_PORT = 19245;
const DEFAULT_WS_PORT = 19999;
const DEBUG_HTML_PATH = path.join(__dirname, 'debug.html');
const WS_OPEN = 1;

const host = process.env.JQTOOLS_SDK_HOST || '127.0.0.1';
const httpPort = Number(process.env.JQTOOLS_SDK_HTTP_PORT || process.env.PORT || DEFAULT_HTTP_PORT);
const wsPort = Number(process.env.JQTOOLS_SDK_WS_PORT || DEFAULT_WS_PORT);
const serialBackendUrl = trimTrailingSlash(process.env.JQTOOLS_SERIAL_BACKEND_URL || '');
let selectedSensorId = 1;
const sensorStates = {
  1: createSensorState(1),
  2: createSensorState(2)
};

const client = createClient({
  pythonPath: process.env.JQTOOLS_PYTHON,
  algorithmScriptPath: process.env.JQTOOLS_ALGORITHM_SCRIPT,
  pythonTimeout: Number(process.env.JQTOOLS_PYTHON_TIMEOUT || 30000),
  onPythonLog(line, stream) {
    if (process.env.JQTOOLS_SDK_SHOW_PYTHON_LOG === '1') {
      console.log(`[python:${stream}]`, String(line).trim());
    }
  }
});

/** HTTP 算法服务：接收客户请求，调用 SDK 内置 Python 算法。 */
const httpServer = http.createServer(async (req, res) => {
  try {
    if (handleCors(req, res)) return;
    await routeHttp(req, res);
  } catch (error) {
    sendJson(res, 500, {
      code: 1,
      data: {},
      message: error.message || 'internal server error'
    });
  }
});

/** WebSocket 实时服务：广播算法结果和控制反馈。 */
const wsServer = new WebSocketServer({ port: wsPort, host });

wsServer.on('connection', (socket) => {
  socket.send(JSON.stringify({
    type: 'ready',
    service: 'jqtools-car-adaptive-sdk',
    message: 'connected'
  }));
  socket.send(JSON.stringify({ carAdaptiveSensor: getSensorSelection() }));
  socket.send(JSON.stringify({ carAdaptiveSensors: getSensorStatuses() }));
  socket.send(JSON.stringify({ carAdaptiveSensorsData: getSensorSnapshots() }));
});

httpServer.listen(httpPort, host, () => {
  console.log(`[sdk] HTTP service listening at http://${host}:${httpPort}`);
  console.log(`[sdk] WebSocket service listening at ws://${host}:${wsPort}`);
  console.log(`[sdk] Python algorithm: ${process.env.JQTOOLS_ALGORITHM_SCRIPT || 'sdk/python/app/server.py'}`);
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

/** 根据路径分发 HTTP 请求。 */
async function routeHttp(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${host}:${httpPort}`}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    sendJson(res, 200, ok({
      service: 'jqtools-car-adaptive-sdk',
      httpPort,
      wsPort,
      serialBackendUrl: serialBackendUrl || null
    }));
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/debug' || url.pathname === '/debug.html')) {
    sendHtml(res, fs.readFileSync(DEBUG_HTML_PATH, 'utf8'));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/getPort') {
    const result = await proxySerialBackend('GET', '/getPort');
    sendJson(res, result.httpStatus, result.payload);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/connPort') {
    const result = await proxySerialBackend('GET', '/connPort');
    sendJson(res, result.httpStatus, result.payload);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/carAdaptive/sensor') {
    sendJson(res, 200, ok(getSensorSelection()));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/carAdaptive/sensor') {
    const body = await readJsonBody(req);
    selectedSensorId = normalizeSensorId(body.sensorId);
    broadcast({ carAdaptiveSensor: getSensorSelection() });
    sendJson(res, 200, ok(getSensorSelection()));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/carAdaptive/sensors') {
    sendJson(res, 200, ok(getSensorStatuses()));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/carAdaptive/processFrame') {
    const body = await readJsonBody(req);
    const result = await processFrame(body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/carAdaptive/writeCommand') {
    const body = await readJsonBody(req);
    const result = await writeCommand(
      body.controlCommand,
      normalizeSensorId(body.sensorId ?? selectedSensorId)
    );
    sendJson(res, result.code === 0 ? 200 : 501, result);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/callPython') {
    const body = await readJsonBody(req);
    const result = await client.callPythonFunction(body.fn, body.args || {}, {
      timeout: body.timeout
    });
    sendJson(res, 200, ok(result));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/getPyConfig') {
    const config = await client.getPythonConfig();
    sendJson(res, 200, ok(config));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/changePy') {
    const body = await readJsonBody(req);
    const value = typeof body.value === 'string' ? JSON.parse(body.value) : body.value;
    const result = await client.setPythonParam(body.path, value);
    sendJson(res, 200, ok(result));
    return;
  }

  sendJson(res, 404, {
    code: 1,
    data: {},
    message: `not found: ${req.method} ${url.pathname}`
  });
}

/** 处理一帧 144 点汽车自适应数据，并把算法结果广播到 WebSocket。 */
async function processFrame(body) {
  const sensorData = body.sensorData || body.sensor_data;
  const writeSerial = Boolean(body.writeSerial);
  const sensorId = normalizeSensorId(body.sensorId ?? selectedSensorId);

  validateSensorData(sensorData);

  const result = await client.callPythonFunction('server', {
    sensor_data: sensorData,
    sensor_id: sensorId
  }, {
    timeout: body.timeout
  });

  const responseData = {
    ...result,
    sensor_id: sensorId,
    sensor_role: sensorId === 1 ? '主' : '副',
    serialWrite: null
  };
  const sensorState = sensorStates[sensorId];
  sensorState.stamp = Date.now();
  sensorState.algorithmReady = true;
  sensorState.frameCount = result?.frame_count || sensorState.frameCount + 1;
  sensorState.sensorData = sensorData;
  sensorState.algorData = responseData;
  sensorState.controlCommand = result?.control_command;

  if (writeSerial && result?.control_command) {
    responseData.serialWrite = await writeCommand(result.control_command, sensorId);
  }

  if (sensorId === selectedSensorId) {
    broadcast({
      algorData: responseData,
      algorFeed: getControlFeedback(result?.control_command)
    });
  }
  broadcast({ carAdaptiveSensors: getSensorStatuses() });
  broadcast({ carAdaptiveSensorsData: getSensorSnapshots() });

  return ok(responseData);
}

/** 将已有 control_command 写入串口；实际串口写入由原后端代理完成。 */
async function writeCommand(controlCommand, sensorId) {
  if (!serialBackendUrl) {
    return {
      code: 1,
      data: {},
      message: 'JQTOOLS_SERIAL_BACKEND_URL is not set; serial write is unavailable in standalone SDK service'
    };
  }

  if (!Array.isArray(controlCommand)) {
    return {
      code: 1,
      data: {},
      message: 'controlCommand must be an array'
    };
  }

  const response = await fetch(`${serialBackendUrl}/carAdaptive/writeCommand`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ controlCommand, sensorId })
  });

  return response.json();
}

/** 转发串口相关接口到原后端服务。 */
async function proxySerialBackend(method, pathname, body) {
  if (!serialBackendUrl) {
    return {
      httpStatus: 501,
      payload: {
        code: 1,
        data: {},
        message: 'JQTOOLS_SERIAL_BACKEND_URL is not set; serial backend is unavailable'
      }
    };
  }

  const init = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${serialBackendUrl}${pathname}`, init);
  return {
    httpStatus: response.status,
    payload: await response.json()
  };
}

/** 从请求体读取 JSON。 */
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

/** 处理跨域预检，让客户网页可以直接调用 SDK HTTP 服务。 */
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

/** 创建一路 SDK 算法运行摘要。 */
function createSensorState(sensorId) {
  return {
    sensorId,
    stamp: 0,
    algorithmReady: false,
    frameCount: 0,
    sensorData: undefined,
    algorData: undefined,
    controlCommand: undefined
  };
}

/** 校验主副传感器标识符。 */
function normalizeSensorId(value) {
  const sensorId = Number(value);
  if (![1, 2].includes(sensorId)) {
    throw new Error('sensorId must be 1 (main) or 2 (secondary)');
  }
  return sensorId;
}

/** 返回 SDK 服务当前页面展示通道。 */
function getSensorSelection() {
  return {
    sensorId: selectedSensorId,
    role: selectedSensorId === 1 ? '主' : '副',
    displayOnly: true
  };
}

/** 返回 SDK 服务中主副两套独立算法的运行摘要。 */
function getSensorStatuses() {
  const now = Date.now();
  return [1, 2].map((sensorId) => {
    const sensorState = sensorStates[sensorId];
    return {
      sensorId,
      role: sensorId === 1 ? '主' : '副',
      online: Boolean(sensorState.stamp && now - sensorState.stamp < 1000),
      stamp: sensorState.stamp,
      algorithmReady: sensorState.algorithmReady,
      frameCount: sensorState.frameCount
    };
  });
}

/** 返回前端可分别缓存的主副两套算法数据。 */
function getSensorSnapshots() {
  return [1, 2].map((sensorId) => {
    const sensorState = sensorStates[sensorId];
    const online = Boolean(sensorState.stamp && Date.now() - sensorState.stamp < 1000);
    return {
      sensorId,
      role: sensorId === 1 ? '主' : '副',
      sitData: {
        carAir: {
          type: 'carAir',
          sensorId,
          status: online ? 'online' : 'offline',
          arr: sensorState.sensorData,
          stamp: sensorState.stamp
        }
      },
      algorData: sensorState.algorData,
      algorFeed: getControlFeedback(sensorState.controlCommand)
    };
  });
}

/** 校验汽车自适应算法输入必须是 144 个 0-255 数字。 */
function validateSensorData(sensorData) {
  if (!Array.isArray(sensorData) || sensorData.length !== 144) {
    throw new Error('sensorData must be an array with 144 numbers');
  }

  const invalid = sensorData.find((value) => !Number.isFinite(value) || value < 0 || value > 255);
  if (invalid !== undefined) {
    throw new Error('sensorData values must be numbers between 0 and 255');
  }
}

/** 从 control_command 中提取前端展示用的 24 路控制反馈。 */
function getControlFeedback(command) {
  if (!Array.isArray(command)) return [];

  const feedback = [];
  for (let i = 0; i < 24; i++) {
    feedback.push(command[2 * i + 2]);
  }
  return feedback;
}

/** 向所有 WebSocket 客户端广播消息。 */
function broadcast(payload) {
  const message = JSON.stringify(payload);
  wsServer.clients.forEach((socket) => {
    if (socket.readyState === WS_OPEN) {
      socket.send(message);
    }
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

/** 生成后端兼容的成功响应结构。 */
/** 返回 HTML 页面。 */
function sendHtml(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(html);
}

function ok(data) {
  return {
    code: 0,
    data,
    message: 'success'
  };
}

/** 去除 URL 末尾斜杠。 */
function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

/** 停止 HTTP、WebSocket 和本地 Python worker。 */
function shutdown() {
  console.log('[sdk] shutting down');
  client.stopPythonAlgorithm();
  wsServer.close();
  httpServer.close(() => process.exit(0));
}
