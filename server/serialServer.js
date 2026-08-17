

const express = require('express')
const os = require('os')
const fs = require('fs')
const path = require('path')
const cors = require('cors');
const WebSocket = require("ws");
const HttpResult = require('./HttpResult')
const { SerialPort, DelimiterParser } = require('serialport')
const { getPort } = require('../util/serialport')
const { blue, splitArr } = require('../util/config');
const constantObj = require('../util/config');
const { bytes4ToInt10 } = require('../util/parseData');
const { initDb, dbLoadCsv, deleteDbData, dbGetData, getCsvData, changeDbName, changeDbDataName } = require('../util/db');
const { hand, jqbed, endiSit, endiBack } = require('../util/line');
const { callPy } = require('../pyWorker');
const { decryptStr } = require('../util/aes_ecb');
const { default: axios } = require('axios');
const module2 = require('../util/aes_ecb')
const {
  CAR_ADAPTIVE_SERIAL_FRAME_LENGTH,
  CAR_ADAPTIVE_MAIN_SENSOR_ID,
  CAR_ADAPTIVE_SENSOR_IDS,
  normalizeCarAdaptiveSensorId,
  parseCarAdaptiveSerialFrame,
  getCarAdaptiveSensorRole
} = require('../util/carAdaptiveProtocol')
const {
  CAR_ADAPTIVE_UI_ACTIONS,
  createCarAdaptiveUiState,
  applyCarAdaptiveUiCommand,
  applyCarAdaptiveUiReport,
  applyCarAdaptiveUiAcknowledgement
} = require('../util/carAdaptiveUiControl')
const {
  CAR_ADAPTIVE_CONTROL_MODES,
  applyCarAdaptiveControlMode,
  createCarAdaptiveControlModeState,
  getCarAdaptiveModeForView,
  isCarAdaptiveAlgorithmRunning,
  isCarAdaptiveAutoMode
} = require('../util/carAdaptiveControlMode')
const {
  CAR_ADAPTIVE_AIRBAG_COUNT,
  extractCarAdaptiveAirbagGears,
  parseCarAdaptiveAirbagDisplayInput,
  resolveCarAdaptiveAirbagDisplayState,
  restoreCarAdaptiveFeedbackCommand
} = require('../util/carAdaptiveAirbagDisplay')
const {
  appendCarAdaptiveCommandHistory,
  clearCarAdaptiveCommandHistory,
  countCarAdaptiveCommandHistory,
  listCarAdaptiveCommandHistory,
  normalizeCarAdaptiveCommandHistoryQueryLimit,
  normalizeCarAdaptiveCommandHistoryType
} = require('../util/carAdaptiveCommandHistory')
const {
  createCarAdaptiveCollectionCsv,
  createCarAdaptiveCollectionExportFileName,
  normalizeCollectionSensorId
} = require('../util/carAdaptiveCollectionExport')
const {
  createHistoryPlaybackPayload,
  getHistoryPlaybackHz
} = require('../util/collectionHistory')


console.log('userData from env:', typeof process.env.isPackaged);

let { isPackaged, appPath } = process.env
isPackaged = isPackaged == 'true'
const app = express()

const ORIGIN = 'https://sensor.bodyta.com';

// 1) 所有实际请求自动带上 CORS 头
// app.use(cors({
//   origin: ORIGIN,        // 不能是 *
//   credentials: true,
//   methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
//   allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
//   maxAge: 600,
// }));

// // 2) 统一处理预检；顺带支持 PNA（公网页面 -> 本地/内网）
// app.options('*', (req, res) => {
//   if (req.header('Access-Control-Request-Private-Network') === 'true') {
//     res.setHeader('Access-Control-Allow-Private-Network', 'true');
//   }
//   // 把常见 CORS 预检头也回上（有些环境需要显式返回）
//   res.setHeader('Access-Control-Allow-Origin', ORIGIN);
//   res.setHeader('Access-Control-Allow-Credentials', 'true');
//   res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
//   res.sendStatus(204);
// });


app.use(cors());
app.use(express.json());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const FRONTEND_BUILD_DIR = path.resolve(
  process.env.JQTOOLS_FRONTEND_BUILD_DIR ||
  process.env.JQTOOLS_MOCK_FRONTEND_DIR ||
  path.join(__dirname, '..', 'build')
)

function isFrontendRequest(pathname) {
  return pathname === '/app' ||
    pathname === '/app/' ||
    pathname === '/asset-manifest.json' ||
    pathname === '/favicon.ico' ||
    pathname === '/logo192.png' ||
    pathname === '/logo512.png' ||
    pathname === '/manifest.json' ||
    pathname === '/robots.txt' ||
    pathname === '/circle.png' ||
    pathname === '/disc.png' ||
    pathname.startsWith('/static/') ||
    pathname.startsWith('/model/')
}

function getStaticContentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.svg':
      return 'image/svg+xml'
    case '.ico':
      return 'image/x-icon'
    case '.glb':
      return 'model/gltf-binary'
    case '.gltf':
      return 'model/gltf+json'
    case '.fbx':
      return 'application/octet-stream'
    case '.obj':
      return 'text/plain; charset=utf-8'
    case '.ttf':
      return 'font/ttf'
    default:
      return 'application/octet-stream'
  }
}

function sendFrontendAsset(req, res) {
  if (!fs.existsSync(path.join(FRONTEND_BUILD_DIR, 'index.html'))) {
    res.status(404).json(new HttpResult(1, {}, `frontend-build not found: ${FRONTEND_BUILD_DIR}`))
    return
  }

  const relativePath = req.path === '/app' || req.path === '/app/'
    ? 'index.html'
    : decodeURIComponent(req.path.replace(/^\/+/, ''))
  const filePath = path.resolve(FRONTEND_BUILD_DIR, relativePath)

  if (!filePath.startsWith(FRONTEND_BUILD_DIR)) {
    res.status(403).json(new HttpResult(1, {}, 'forbidden'))
    return
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.status(404).json(new HttpResult(1, {}, 'frontend asset not found'))
    return
  }

  res.setHeader('Content-Type', getStaticContentType(filePath))
  if (req.method === 'HEAD') {
    res.status(200).end()
    return
  }

  fs.createReadStream(filePath).pipe(res)
}

app.use((req, res, next) => {
  if ((req.method === 'GET' || req.method === 'HEAD') && isFrontendRequest(req.path)) {
    sendFrontendAsset(req, res)
    return
  }
  next()
})

let dbPath = __dirname + '/../db'

console.log(isPackaged, appPath, 'app.isPackaged')

if (isPackaged) {
  if (os.platform() == 'darwin') {
    // filePath = '../..' + '/db'
    // filePath = path.join(app.getAppPath(), 'Resources/db',);
    dbPath = path.join(__dirname, '../../db')
    csvPath = path.join(__dirname, '../../data')
    nameTxt = path.join(__dirname, '../../config.txt')
    console.log(dbPath, path.join(appPath, 'Resources/db',))
    // nameTxt = 
    // csvPath = '../..' + '/data'
    // nameTxt = '../..' + "/config.txt";
  } else {

    dbPath = 'resources' + '/db'
    csvPath = 'resources' + '/data'
    nameTxt = 'resources' + "/config.txt";

    console.log(dbPath, path.join(appPath, 'Resources/db',))
  }

}

const port = Number(process.env.JQTOOLS_HTTP_PORT || process.env.JQTOOLS_MOCK_HTTP_PORT || 19245)
const wsPort = Number(process.env.JQTOOLS_WS_PORT || process.env.JQTOOLS_MOCK_WS_PORT || 19999)

const config = fs.readFileSync('./config.txt', 'utf-8',)
const result = JSON.parse(decryptStr(config))
console.log(result)
// 当前的软件系统 , 当前的波特率
var file = result.value, baudRate = 1000000, parserArr = {}, dataMap = {},
  // 发送HZ , 串口最大hz, 采集开关 , 采集命名 , 历史数据开关 , 历史播放开关 , 数据播放索引 , 回放定时器 , 保存数据最大HZ
  HZ = 30, MaxHZ, colFlag = false, colName, historyFlag = false, historyPlayFlag = false, playIndex = 0, colTimer, colMaxHZ, colplayHZ, playtimer
let splitBuffer = Buffer.from(splitArr);
let linkIngPort = [], currentDb, macInfo = {}, selectArr = []
let colSensorId = CAR_ADAPTIVE_MAIN_SENSOR_ID, colStartedAt = 0, colStoppedAt = 0, colFrameCount = 0
const ALGOR = 'algor', HANDLE = 'handle'
// controlMode 只是 carAdaptiveControlModeState 的历史命名镜像，唯一写入点是 setCarAdaptiveControlMode。
// ECU 回传帧恢复启用时，应调用 applyCarAdaptiveControlMode({mode, source: 'ecu'}) 而不是直接赋值。
var controlMode = ALGOR, oldControlMode = '', feedbackAirIndex = [1, 2, 3, 4, 5, 6, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]
// 选择数据库数据
let historyDbArr;


//对比数据
let leftDbArr, rightDbArr;


const { db } = initDb(file, dbPath)
currentDb = db

console.log(__dirname, dbPath, '__dirname')

const CAR_ADAPTIVE_TYPE = 'carAir'
const CAR_ADAPTIVE_COMMAND_INTERVAL = 500
const CAR_ADAPTIVE_REMOTE_CONTROL_TOKEN = String(
  process.env.JQTOOLS_REMOTE_CONTROL_TOKEN || ''
).trim()
const CAR_ADAPTIVE_HOME_URL = String(
  process.env.JQTOOLS_HOME_URL || ''
).trim()
// 超过该时长没有收到 ECU 回传，认为回传中断，气囊反馈置空
const CAR_ADAPTIVE_FEEDBACK_TIMEOUT = 2000
/**
 * 气囊反馈数据源。
 * `ecu`：只用 ECU 回传帧，硬件没回传就置空，前端全灭。
 * `command`：回落到最近一次写入串口的命令，仅在 ECU 确认不回传时用于兼容。
 */
const CAR_ADAPTIVE_FEEDBACK_SOURCE =
  String(process.env.JQTOOLS_AIRBAG_FEEDBACK_SOURCE || 'ecu').trim().toLowerCase() === 'command'
    ? 'command'
    : 'ecu'
const adaptiveWriteQueues = {}
let selectedCarAdaptiveSensorId = CAR_ADAPTIVE_MAIN_SENSOR_ID
let carAdaptiveCommandHistorySequence = 0
let carAdaptiveUiState = createCarAdaptiveUiState(CAR_ADAPTIVE_MAIN_SENSOR_ID)
const carAdaptiveControlModeStates = Object.fromEntries(
  CAR_ADAPTIVE_SENSOR_IDS.map((sensorId) => [
    sensorId,
    createCarAdaptiveControlModeState(process.env.JQTOOLS_CONTROL_MODE)
  ])
)
const carAdaptiveSensorStates = Object.fromEntries(
  CAR_ADAPTIVE_SENSOR_IDS.map((sensorId) => [sensorId, createCarAdaptiveSensorState(sensorId)])
)

/** 创建一路传感器的运行状态，主、副两路不会共享算法历史或控制命令。 */
function createCarAdaptiveSensorState(sensorId) {
  return {
    sensorId,
    role: getCarAdaptiveSensorRole(sensorId),
    sensorData: undefined,
    stamp: 0,
    HZ: undefined,
    portPath: undefined,
    algorData: undefined,
    controlCommand: undefined,
    algorithmCommandStamp: 0,
    algorithmSentCommand: undefined,
    algorithmSentStamp: 0,
    algorithmSentPorts: [],
    writtenCommand: undefined,
    writtenCommandStamp: 0,
    apiSerialCommand: undefined,
    apiSerialCommandStamp: 0,
    apiSerialCommandQueued: false,
    apiSerialCommandPorts: [],
    apiDisplayCommand: undefined,
    apiDisplayCommandStamp: 0,
    apiDisplayClearedAt: 0,
    displayOverrideGears: undefined,
    displayOverrideStamp: 0,
    // 以下三项只由 ECU 回传帧写入，代表气囊硬件实际状态
    feedbackGears: undefined,
    feedbackStamp: 0,
    feedbackMode: undefined,
    feedbackCommand: undefined,
    feedbackWireCommand: undefined,
    feedbackPortPath: undefined,
    airbagCommandHistory: []
  }
}

/** 返回旧版单路 WebSocket 的兼容投影选择。 */
function getCarAdaptiveSensorSelection() {
  return {
    sensorId: selectedCarAdaptiveSensorId,
    role: getCarAdaptiveSensorRole(selectedCarAdaptiveSensorId),
    displayOnly: true
  }
}

/** 返回指定传感器的运行状态。 */
function getCarAdaptiveSensorState(sensorId) {
  return carAdaptiveSensorStates[sensorId]
}

/** 返回主、副两路算法运行摘要，不传输较大的 144 点压力数组。 */
function getCarAdaptiveSensorsStatus() {
  const now = Date.now()
  return CAR_ADAPTIVE_SENSOR_IDS.map((sensorId) => {
    const state = getCarAdaptiveSensorState(sensorId)
    const display = getCarAdaptiveAirbagDisplayState(sensorId)
    return {
      sensorId,
      role: state.role,
      online: Boolean(state.stamp && now - state.stamp < 1000),
      stamp: state.stamp,
      HZ: state.HZ,
      algorithmReady: Boolean(state.algorData),
      frameCount: state.algorData?.frame_count || 0,
      feedbackOnline: isCarAdaptiveFeedbackOnline(state),
      feedbackStamp: state.feedbackStamp,
      controlMode: getCarAdaptiveControlModeState(sensorId).mode,
      airbagDisplayAvailable: display.available,
      airbagDisplaySource: display.source,
      airbagDisplayOverride: display.override
    }
  })
}

/** 把当前选中的一路投影到旧版 sitData.carAir 结构，保持前端兼容。 */
function createCarAdaptiveDisplayDataMap() {
  const displayDataMap = JSON.parse(JSON.stringify({ ...dataMap }))
  const displayState = getCarAdaptiveSensorState(selectedCarAdaptiveSensorId)

  Object.values(displayDataMap).forEach((dataItem) => {
    if (dataItem?.type !== CAR_ADAPTIVE_TYPE) return
    dataItem.arr = displayState.sensorData
    dataItem.stamp = displayState.stamp
    dataItem.HZ = displayState.HZ
    dataItem.sensorId = displayState.sensorId
  })

  return displayDataMap
}

/** 从 55 字节控制命令中提取前端使用的 24 路气囊反馈。 */
function getCarAdaptiveControlFeedback(command) {
  if (!Array.isArray(command)) return []

  const feedback = []
  for (let index = 0; index < 24; index++) {
    feedback.push(command[2 * index + 2])
  }
  return feedback
}

/** 生成一路可直接被前端缓存和渲染的完整数据快照。 */
function createCarAdaptiveSensorSnapshot(sensorId) {
  const state = getCarAdaptiveSensorState(sensorId)
  const online = Boolean(state.stamp && Date.now() - state.stamp < 1000)
  const display = getCarAdaptiveAirbagDisplayState(sensorId)

  return {
    sensorId,
    role: state.role,
    sitData: {
      carAir: {
        type: CAR_ADAPTIVE_TYPE,
        sensorId,
        status: online ? 'online' : 'offline',
        arr: state.sensorData,
        stamp: state.stamp,
        HZ: state.HZ
      }
    },
    algorData: state.algorData,
    // 兼容旧前端字段；实际来源由 airbagDisplaySource 标识，不能据此判断 ECU 是否回传。
    algorFeed: display.gears,
    feedbackOnline: isCarAdaptiveFeedbackOnline(state),
    feedbackStamp: state.feedbackStamp,
    feedbackSource: CAR_ADAPTIVE_FEEDBACK_SOURCE,
    airbagDisplayAvailable: display.available,
    airbagDisplaySource: display.source,
    airbagDisplayOverride: display.override,
    airbagDisplayStamp: display.stamp,
    airbagCommands: getCarAdaptiveAirbagCommandTelemetry(sensorId),
    controlMode: getCarAdaptiveControlModeState(sensorId).mode
  }
}

/** 返回主、副两套完整数据，前端只负责从中选择当前展示项。 */
function getCarAdaptiveSensorSnapshots() {
  return CAR_ADAPTIVE_SENSOR_IDS.map(createCarAdaptiveSensorSnapshot)
}

/** 同时广播主、副两路数据；每个前端客户端可独立选择显示通道。 */
function broadcastCarAdaptiveSensorSnapshots() {
  socketSendData(server, JSON.stringify({
    carAdaptiveSensorsData: getCarAdaptiveSensorSnapshots()
  }))
}

/** 判断网卡名称是否通常属于虚拟机、容器或隧道设备。 */
function isVirtualNetworkInterface(interfaceName) {
  return /vmware|virtualbox|vbox|vethernet|hyper-v|docker|wsl|npcap|loopback|tunnel|tap/i
    .test(interfaceName)
}

/** 判断 IPv4 地址是否位于常用局域网私有地址段。 */
function isPrivateIpv4Address(address) {
  const octets = address.split('.').map(Number)
  return octets.length === 4 && (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  )
}

/** 返回当前机器可供局域网设备访问的 IPv4 地址，物理网卡排在虚拟网卡前。 */
function getLanIpv4Addresses() {
  const candidates = []
  Object.entries(os.networkInterfaces()).forEach(([interfaceName, networks]) => {
    ;(networks || []).forEach((network) => {
      const isIpv4 = network?.family === 'IPv4' || network?.family === 4
      if (!isIpv4 || network.internal || candidates.some((item) => item.address === network.address)) {
        return
      }
      candidates.push({
        address: network.address,
        privateAddress: isPrivateIpv4Address(network.address),
        virtualInterface: isVirtualNetworkInterface(interfaceName)
      })
    })
  })

  return candidates
    .sort((left, right) =>
      Number(left.virtualInterface) - Number(right.virtualInterface) ||
      Number(right.privateAddress) - Number(left.privateAddress) ||
      left.address.localeCompare(right.address)
    )
    .map((item) => item.address)
}

/** 统计指定角色的 WebSocket 客户端数量。 */
function countCarAdaptiveUiClients(role) {
  let count = 0
  server.clients.forEach((client) => {
    if (client.jqtoolsRole === role && client.readyState === WebSocket.OPEN) count++
  })
  return count
}

/** 返回局域网控制页使用的完整状态，不暴露控制令牌。 */
function getCarAdaptiveUiPublicState() {
  return {
    ...carAdaptiveUiState,
    tokenRequired: Boolean(CAR_ADAPTIVE_REMOTE_CONTROL_TOKEN),
    homeUrlConfigured: Boolean(CAR_ADAPTIVE_HOME_URL),
    displayClients: countCarAdaptiveUiClients('ui-display'),
    webSocketClients: server.clients.size,
    lanAddresses: getLanIpv4Addresses(),
    httpPort: port,
    webSocketPort: wsPort
  }
}

/** 校验远程控制请求携带的可选令牌。 */
function isCarAdaptiveUiRequestAuthorized(req) {
  if (!CAR_ADAPTIVE_REMOTE_CONTROL_TOKEN) return true
  const headerToken = String(req.get('x-jqtools-control-token') || '').trim()
  const bodyToken = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  return headerToken === CAR_ADAPTIVE_REMOTE_CONTROL_TOKEN ||
    bodyToken === CAR_ADAPTIVE_REMOTE_CONTROL_TOKEN
}

/** 广播远程 UI 命令，并附带下发瞬间的公共状态。 */
function broadcastCarAdaptiveUiCommand(command) {
  socketSendData(server, JSON.stringify({
    carAdaptiveUiCommand: command,
    carAdaptiveUiState: getCarAdaptiveUiPublicState()
  }))
}

/**
 * ECU 回传气囊状态帧的长度。
 * 回传是一条 55 字节命令帧，其中 4 字节帧尾 [170,85,3,153] 被串口分隔符消费，
 * 因此业务层收到的是剩下的 51 字节。
 */
const CAR_ADAPTIVE_FEEDBACK_FRAME_LENGTH = 51
const SERIAL_DIAGNOSTIC_LOG_INTERVAL = 5000
const SERIAL_DIAGNOSTIC_MAX_SAMPLES = 8
const serialFrameDiagnostics = {}

/**
 * 按 55 字节控制命令协议解析一条候选 ECU 回传帧。
 * 只做解析和格式校验，不改变任何运行状态。
 *
 * @param {number[]} frame 去掉帧尾后的 51 字节数组。
 * @returns {object|null} 解析结果，长度不符时返回 null。
 */
function decodeCarAdaptiveFeedbackFrame(frame) {
  if (!Array.isArray(frame) || frame.length !== CAR_ADAPTIVE_FEEDBACK_FRAME_LENGTH) {
    return null
  }

  const airbagIds = []
  const gears = []
  for (let index = 0; index < 24; index++) {
    airbagIds.push(frame[2 * index + 1])
    gears.push(frame[2 * index + 2])
  }

  return {
    frameHeader: frame[0],
    headerMatches: frame[0] === 31,
    // 编号位应依次为 1..24，用于确认回传确实沿用下行命令的协议布局
    airbagIdsMatch: airbagIds.every((id, index) => id === index + 1),
    mode: frame[49],
    modeLabel: frame[49] === 1 ? 'manual' : 'auto',
    direction: frame[50],
    isUpstream: frame[50] === 1,
    airbagIds,
    gears
  }
}

/** 取得指定串口的诊断记录。 */
function getSerialFrameDiagnosticState(path) {
  if (!serialFrameDiagnostics[path]) {
    serialFrameDiagnostics[path] = {
      lengthCounts: {},
      samples: {},
      feedbackFrames: 0,
      lastFeedback: null,
      lastLoggedAt: 0
    }
  }
  return serialFrameDiagnostics[path]
}

/**
 * 记录一帧未被业务分支处理的串口数据。
 * 用于在真实硬件上确认 ECU 是否回传气囊状态，以及回传帧的实际长度和布局。
 *
 * @param {string} path 串口路径。
 * @param {number[]} frame 去掉帧尾后的字节数组。
 */
function recordSerialFrameDiagnostics(path, frame) {
  const state = getSerialFrameDiagnosticState(path)
  const length = frame.length
  const now = Date.now()

  state.lengthCounts[length] = (state.lengthCounts[length] || 0) + 1

  if (!state.samples[length] && Object.keys(state.samples).length < SERIAL_DIAGNOSTIC_MAX_SAMPLES) {
    state.samples[length] = { at: now, bytes: frame.slice(0, 24) }
  }

  const decoded = decodeCarAdaptiveFeedbackFrame(frame)
  if (decoded) {
    state.feedbackFrames++
    // 只有方向位为上行、帧头和编号布局都正确的帧才作为气囊真实状态使用
    const trusted = decoded.isUpstream && decoded.headerMatches && decoded.airbagIdsMatch
    const attribution = trusted ? applyCarAdaptiveFeedbackFrame(path, decoded, frame) : null
    state.lastFeedback = {
      at: now,
      ...decoded,
      trusted,
      appliedSensorIds: attribution?.sensorIds || [],
      sharedPort: Boolean(attribution?.sharedPort)
    }
  }

  // 串口帧频率很高，日志按串口节流，避免刷屏
  if (now - state.lastLoggedAt < SERIAL_DIAGNOSTIC_LOG_INTERVAL) return
  state.lastLoggedAt = now

  if (decoded) {
    console.log(
      `[car-adaptive] 可能的 ECU 回传帧 ${path}: 帧头=${decoded.frameHeader}(${decoded.headerMatches ? 'ok' : '不匹配'})` +
      ` 编号布局=${decoded.airbagIdsMatch ? 'ok' : '不匹配'}` +
      ` 模式位=${decoded.mode}(${decoded.modeLabel}) 方向位=${decoded.direction}(${decoded.isUpstream ? '上行' : '下行'})` +
      ` 累计=${state.feedbackFrames}\n            24 路档位=[${decoded.gears.join(',')}]`
    )
  } else {
    console.log(
      `[car-adaptive] 未识别串口帧 ${path}: 长度=${length} 累计=${state.lengthCounts[length]}` +
      ` 前 24 字节=[${frame.slice(0, 24).join(',')}]`
    )
  }
}

/**
 * 处理一条 ECU 回传的气囊状态帧。
 *
 * 回传帧本身不含主副驾标识，只能按来源串口归属：取 `portPath` 等于该串口的通道。
 * 主副共用同一串口时无法区分，两路都写入并在诊断中标记 `sharedPort`。
 *
 * 注意回传帧第 49 字节的模式位仅作诊断记录，不用来改 `carAdaptiveControlModeState`。
 * 当前算法和手动命令下发的模式位恒为 `0`，跟随它会把软件手动开关强行拉回自动。
 *
 * @param {string} path 收到回传帧的串口路径。
 * @param {object} decoded 已解析的回传帧。
 * @param {number[]} frame 业务层收到的 51 字节原始帧。
 * @returns {{sensorIds: number[], sharedPort: boolean}} 归属结果。
 */
function applyCarAdaptiveFeedbackFrame(path, decoded, frame) {
  const now = Date.now()
  const sensorIds = CAR_ADAPTIVE_SENSOR_IDS.filter(
    (sensorId) => getCarAdaptiveSensorState(sensorId).portPath === path
  )

  sensorIds.forEach((sensorId) => {
    const state = getCarAdaptiveSensorState(sensorId)
    state.feedbackGears = decoded.gears
    state.feedbackStamp = now
    state.feedbackMode = decoded.mode
    state.feedbackCommand = [...frame]
    state.feedbackWireCommand = restoreCarAdaptiveFeedbackCommand(frame)
    state.feedbackPortPath = path
    appendCarAdaptiveAirbagCommandHistory(sensorId, 'ecuFeedback', frame, now, {
      source: 'ecu',
      wireCommand: state.feedbackWireCommand,
      portPath: path,
      trusted: true
    })
  })

  return { sensorIds, sharedPort: sensorIds.length > 1 }
}

/** 判断一路气囊回传是否仍在更新。 */
function isCarAdaptiveFeedbackOnline(state) {
  return Boolean(state?.feedbackStamp && Date.now() - state.feedbackStamp < CAR_ADAPTIVE_FEEDBACK_TIMEOUT)
}

/**
 * 返回一路气囊的有效界面展示状态。
 * 接口展示覆盖优先于 ECU 回传；清除覆盖后自动恢复 ECU 或兼容命令回落。
 *
 * @param {number} sensorId 传感器标识。
 * @returns {{gears: number[], available: boolean, source: string, override: boolean, stamp: number}} 展示状态。
 */
function getCarAdaptiveAirbagDisplayState(sensorId) {
  const state = getCarAdaptiveSensorState(sensorId)
  return resolveCarAdaptiveAirbagDisplayState({
    overrideGears: state.displayOverrideGears,
    overrideStamp: state.displayOverrideStamp,
    feedbackOnline: isCarAdaptiveFeedbackOnline(state),
    feedbackGears: state.feedbackGears,
    feedbackStamp: state.feedbackStamp,
    allowCommandFallback: CAR_ADAPTIVE_FEEDBACK_SOURCE === 'command',
    fallbackCommand: state.writtenCommand || state.controlCommand,
    fallbackStamp: state.writtenCommandStamp || state.algorithmCommandStamp
  })
}

/** 返回旧版 WebSocket 使用的 24 路气囊展示档位。 */
function getCarAdaptiveAirbagFeedback(sensorId) {
  return getCarAdaptiveAirbagDisplayState(sensorId).gears
}

/**
 * 将一条命令整理为原始数据页可直接展示的诊断记录。
 *
 * @param {unknown} command 51 或 55 字节命令。
 * @param {number} stamp 命令时间戳。
 * @param {object} [extra] 来源、队列和串口等附加信息。
 * @returns {object|null} 命令诊断记录。
 */
function createCarAdaptiveAirbagCommandRecord(command, stamp, extra = {}) {
  if (!Array.isArray(command)) return null
  return {
    command: [...command],
    length: command.length,
    gears: extractCarAdaptiveAirbagGears(command),
    stamp: Number(stamp) || 0,
    ...extra
  }
}

/**
 * 把一路气囊命令追加到服务生命周期内的诊断历史。
 * 高频来源按类型独立裁剪，不会覆盖低频接口操作。
 *
 * @param {number} sensorId 主副传感器标识。
 * @param {string} type 历史类型。
 * @param {unknown} command 51 或 55 字节命令。
 * @param {number} stamp 命令时间戳。
 * @param {object} [extra] 来源、串口和展示状态等附加信息。
 * @returns {object|null} 已追加记录。
 */
function appendCarAdaptiveAirbagCommandHistory(sensorId, type, command, stamp, extra = {}) {
  const state = getCarAdaptiveSensorState(sensorId)
  const commandRecord = createCarAdaptiveAirbagCommandRecord(command, stamp, extra)
  if (!commandRecord) return null

  carAdaptiveCommandHistorySequence += 1
  return appendCarAdaptiveCommandHistory(state.airbagCommandHistory, {
    id: `${sensorId}-${carAdaptiveCommandHistorySequence}`,
    sequence: carAdaptiveCommandHistorySequence,
    sensorId,
    role: state.role,
    type,
    ...commandRecord
  })
}

/**
 * 判断两条气囊命令字节是否完全一致。
 *
 * @param {unknown} left 第一条命令。
 * @param {unknown} right 第二条命令。
 * @returns {boolean} 长度和每个字节都相同时返回 true。
 */
function areCarAdaptiveCommandBytesEqual(left, right) {
  return Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
}

/**
 * 返回一路可供历史弹窗读取的命令记录。
 *
 * @param {number} sensorId 主副传感器标识。
 * @param {{type?: string, limit?: number}} [options] 查询筛选项。
 * @returns {object} 历史记录、总数和分类计数。
 */
function getCarAdaptiveCommandHistoryPublicState(sensorId, options = {}) {
  const state = getCarAdaptiveSensorState(sensorId)
  const type = normalizeCarAdaptiveCommandHistoryType(options.type)
  const limit = normalizeCarAdaptiveCommandHistoryQueryLimit(options.limit)
  const counts = countCarAdaptiveCommandHistory(state.airbagCommandHistory)
  const records = listCarAdaptiveCommandHistory(state.airbagCommandHistory, { type, limit })
  return {
    sensorId,
    role: state.role,
    type: type || 'all',
    limit,
    total: type ? counts[type] : counts.all,
    counts,
    records
  }
}

/** 返回一路算法、接口和 ECU 的最近气囊命令，供原始数据页诊断。 */
function getCarAdaptiveAirbagCommandTelemetry(sensorId) {
  const state = getCarAdaptiveSensorState(sensorId)
  return {
    algorithmGenerated: createCarAdaptiveAirbagCommandRecord(
      state.controlCommand,
      state.algorithmCommandStamp,
      { source: 'algorithm', queued: false }
    ),
    algorithmSent: createCarAdaptiveAirbagCommandRecord(
      state.algorithmSentCommand,
      state.algorithmSentStamp,
      { source: 'algorithm', queued: true, portPaths: [...state.algorithmSentPorts] }
    ),
    ecuFeedback: createCarAdaptiveAirbagCommandRecord(
      state.feedbackCommand,
      state.feedbackStamp,
      {
        source: 'ecu',
        wireCommand: Array.isArray(state.feedbackWireCommand) ? [...state.feedbackWireCommand] : [],
        portPath: state.feedbackPortPath,
        trusted: true
      }
    ),
    apiSerial: createCarAdaptiveAirbagCommandRecord(
      state.apiSerialCommand,
      state.apiSerialCommandStamp,
      {
        source: 'api',
        target: 'serial',
        queued: state.apiSerialCommandQueued,
        portPaths: [...state.apiSerialCommandPorts]
      }
    ),
    apiDisplay: createCarAdaptiveAirbagCommandRecord(
      state.apiDisplayCommand,
      state.apiDisplayCommandStamp,
      {
        source: 'api',
        target: 'display',
        active: Array.isArray(state.displayOverrideGears),
        clearedAt: state.apiDisplayClearedAt
      }
    )
  }
}

/** 返回一路或全部气囊界面展示状态，明确区分展示覆盖和 ECU 回传。 */
function getCarAdaptiveAirbagDisplayPublicState(sensorId = selectedCarAdaptiveSensorId) {
  const targetSensorId = normalizeCarAdaptiveSensorId(sensorId) || selectedCarAdaptiveSensorId
  const sensors = CAR_ADAPTIVE_SENSOR_IDS.map((id) => {
    const state = getCarAdaptiveSensorState(id)
    const display = getCarAdaptiveAirbagDisplayState(id)
    return {
      sensorId: id,
      role: state.role,
      gears: display.gears,
      available: display.available,
      source: display.source,
      override: display.override,
      stamp: display.stamp,
      feedbackOnline: isCarAdaptiveFeedbackOnline(state),
      feedbackStamp: state.feedbackStamp
    }
  })
  const target = sensors.find((item) => item.sensorId === targetSensorId)
  return { ...target, independent: true, sensors }
}

/** 返回全部串口的帧诊断信息，用于确认 ECU 回传是否存在。 */
function getSerialFrameDiagnostics() {
  return {
    feedbackFrameLength: CAR_ADAPTIVE_FEEDBACK_FRAME_LENGTH,
    delimiter: splitArr,
    note: 'ECU 回传为 55 字节命令帧，4 字节帧尾被串口分隔符消费，业务层收到 51 字节',
    feedbackSource: CAR_ADAPTIVE_FEEDBACK_SOURCE,
    feedbackTimeoutMs: CAR_ADAPTIVE_FEEDBACK_TIMEOUT,
    observedFeedback: Object.values(serialFrameDiagnostics).some((item) => item.feedbackFrames > 0),
    sensors: CAR_ADAPTIVE_SENSOR_IDS.map((sensorId) => {
      const state = getCarAdaptiveSensorState(sensorId)
      return {
        sensorId,
        role: state.role,
        portPath: state.portPath,
        feedbackOnline: isCarAdaptiveFeedbackOnline(state),
        feedbackStamp: state.feedbackStamp,
        feedbackMode: state.feedbackMode,
        gears: state.feedbackGears || [],
        display: getCarAdaptiveAirbagDisplayState(sensorId),
        commands: getCarAdaptiveAirbagCommandTelemetry(sensorId)
      }
    }),
    ports: Object.fromEntries(
      Object.entries(serialFrameDiagnostics).map(([path, item]) => [path, {
        type: dataMap[path]?.type,
        portOpen: Boolean(parserArr[path]?.port?.isOpen),
        lengthCounts: item.lengthCounts,
        feedbackFrames: item.feedbackFrames,
        lastFeedback: item.lastFeedback,
        samples: item.samples
      }])
    )
  }
}

/** 返回指定主副驾的内部控制模式状态。 */
function getCarAdaptiveControlModeState(sensorId) {
  const normalizedSensorId = normalizeCarAdaptiveSensorId(sensorId)
  return carAdaptiveControlModeStates[normalizedSensorId || selectedCarAdaptiveSensorId]
}

/** 返回一路控制模式的对外状态。 */
function createCarAdaptiveControlModePublicState(sensorId) {
  const state = getCarAdaptiveControlModeState(sensorId)
  return {
    ...state,
    sensorId,
    role: getCarAdaptiveSensorRole(sensorId),
    autoWrite: isCarAdaptiveAutoMode(state),
    algorithmRunning: isCarAdaptiveAlgorithmRunning(state),
    commandIntervalMs: CAR_ADAPTIVE_COMMAND_INTERVAL,
    view: carAdaptiveUiState.view
  }
}

/** 返回目标通道及主副两路控制模式，兼容旧客户端读取顶层 mode。 */
function getCarAdaptiveControlModePublicState(sensorId = selectedCarAdaptiveSensorId) {
  const targetSensorId = normalizeCarAdaptiveSensorId(sensorId) || selectedCarAdaptiveSensorId
  const sensors = CAR_ADAPTIVE_SENSOR_IDS.map(createCarAdaptiveControlModePublicState)
  const target = sensors.find((item) => item.sensorId === targetSensorId)
  return { ...target, independent: true, sensors }
}

/** 广播当前气囊控制模式，让所有前端和业务客户端同步开关状态。 */
function broadcastCarAdaptiveControlMode() {
  socketSendData(server, JSON.stringify({
    carAdaptiveControlMode: getCarAdaptiveControlModePublicState()
  }))
}

/**
 * 应用一次气囊控制模式变更。
 * 手动切回自动时清空按摩状态，避免手动期间的拍打被算法立刻当成触发信号。
 *
 * 未传 `sensorId` 时为兼容旧客户端，同时应用到主、副两路；传入后只修改目标一路。
 *
 * @param {unknown} input 形如 `{sensorId?, mode, source, reason}` 的请求体。
 * @returns {Promise<object>} 应用结果，附带 `massageReset` 表示是否已清空按摩状态。
 */
async function setCarAdaptiveControlMode(input) {
  const hasSensorId = Object.prototype.hasOwnProperty.call(input || {}, 'sensorId')
  const requestedSensorId = hasSensorId ? normalizeCarAdaptiveSensorId(input?.sensorId) : null
  if (hasSensorId && requestedSensorId === null) {
    return { ok: false, message: 'sensorId 只允许为 1（主驾）或 2（副驾）' }
  }

  const targetSensorIds = requestedSensorId === null
    ? [...CAR_ADAPTIVE_SENSOR_IDS]
    : [requestedSensorId]
  const changes = []
  let massageReset = false
  let algorithmReset = false

  for (const sensorId of targetSensorIds) {
    const result = applyCarAdaptiveControlMode(getCarAdaptiveControlModeState(sensorId), input)
    if (!result.ok) return result
    carAdaptiveControlModeStates[sensorId] = result.state

    let sensorMassageReset = false
    let sensorAlgorithmReset = false
    if (
      result.changed &&
      result.previousMode === CAR_ADAPTIVE_CONTROL_MODES.PAUSED &&
      result.state.mode !== CAR_ADAPTIVE_CONTROL_MODES.PAUSED
    ) {
      // 仅重建恢复运行的目标算法实例，另一侧状态不受影响。
      try {
        await callPy('resetSystem', { sensor_id: sensorId })
        sensorAlgorithmReset = true
        algorithmReset = true
        const state = getCarAdaptiveSensorState(sensorId)
        state.algorData = undefined
        state.controlCommand = undefined
        state.algorithmCommandStamp = 0
      } catch (err) {
        console.error(`[car-adaptive] sensor ${sensorId} resetSystem failed:`, err.message)
      }
    } else if (
      result.changed &&
      result.previousMode === CAR_ADAPTIVE_CONTROL_MODES.MANUAL &&
      result.state.mode === CAR_ADAPTIVE_CONTROL_MODES.AUTO
    ) {
      // 手动切回自动只清目标通道的按摩状态。
      try {
        await callPy('resetMessage', { sensor_id: sensorId })
        sensorMassageReset = true
        massageReset = true
      } catch (err) {
        console.error(`[car-adaptive] sensor ${sensorId} resetMessage failed:`, err.message)
      }
    }

    if (result.changed) {
      console.log(
        `[car-adaptive] sensor ${sensorId} control mode: ${result.previousMode} -> ${result.state.mode} (${result.state.source})`
      )
    }
    changes.push({
      sensorId,
      ...result,
      massageReset: sensorMassageReset,
      algorithmReset: sensorAlgorithmReset
    })
  }

  controlMode = isCarAdaptiveAutoMode(getCarAdaptiveControlModeState(selectedCarAdaptiveSensorId))
    ? ALGOR
    : HANDLE
  const changed = changes.some((item) => item.changed)
  if (changed) {
    broadcastCarAdaptiveControlMode()
    broadcastCarAdaptiveSensorSnapshots()
  }

  return {
    ok: true,
    changed,
    massageReset,
    algorithmReset,
    sensorId: requestedSensorId,
    changes
  }
}

/**
 * 按当前 SDK 页面视图同步气囊控制模式。
 *
 * 只在视图真正发生变化时才切换：模块页内切换主副驾会重复上报 `view=module`，
 * 若每次都同步，会把页面上正在进行的手动标定强行拉回自动。
 *
 * @param {string} previousView 变化前的视图。
 * @param {string} nextView 变化后的视图。
 * @returns {Promise<void>}
 */
async function syncCarAdaptiveControlModeWithView(previousView, nextView) {
  if (!nextView || previousView === nextView) return

  const targetMode = getCarAdaptiveModeForView(nextView)
  if (targetMode === null) return

  if (targetMode === CAR_ADAPTIVE_CONTROL_MODES.PAUSED) {
    await setCarAdaptiveControlMode({
      mode: targetMode,
      source: 'view',
      reason: `离开自适应模块（${nextView}）`
    })
    return
  }

  // 返回模块时分别恢复两路暂停前的 auto/manual 状态，保持主副驾独立开关。
  for (const sensorId of CAR_ADAPTIVE_SENSOR_IDS) {
    const state = getCarAdaptiveControlModeState(sensorId)
    if (state.mode !== CAR_ADAPTIVE_CONTROL_MODES.PAUSED) continue
    const restoreMode = [CAR_ADAPTIVE_CONTROL_MODES.AUTO, CAR_ADAPTIVE_CONTROL_MODES.MANUAL]
      .includes(state.previousMode)
      ? state.previousMode
      : CAR_ADAPTIVE_CONTROL_MODES.AUTO
    await setCarAdaptiveControlMode({
      sensorId,
      mode: restoreMode,
      source: 'view',
      reason: '进入自适应模块'
    })
  }
}

/** 保存一路 145 字节串口帧解析后的 144 点压力数据。 */
function updateCarAdaptiveSensorFrame(sensorId, sensorData, stamp, portPath) {
  const state = getCarAdaptiveSensorState(sensorId)
  const previousStamp = state.stamp
  state.sensorData = sensorData
  state.stamp = stamp
  state.portPath = portPath || state.portPath
  state.HZ = previousStamp && stamp > previousStamp
    ? Math.max(1, parseInt(1000 / (stamp - previousStamp)))
    : state.HZ
  return state
}

/** 保存指定传感器的独立算法结果及其最新控制命令。 */
function updateCarAdaptiveAlgorithmResult(sensorId, result) {
  const state = getCarAdaptiveSensorState(sensorId)
  const now = Date.now()
  const previousCommand = state.controlCommand
  state.algorData = {
    ...result,
    sensor_id: sensorId,
    sensor_role: state.role
  }
  if (result?.control_command) {
    state.controlCommand = [...result.control_command]
    state.algorithmCommandStamp = now
    if (!areCarAdaptiveCommandBytesEqual(previousCommand, state.controlCommand)) {
      appendCarAdaptiveAirbagCommandHistory(
        sensorId,
        'algorithmGenerated',
        state.controlCommand,
        now,
        { source: 'algorithm', queued: false }
      )
    }
  }
  return state.algorData
}

function normalizeControlCommand(command) {
  if (!Array.isArray(command) || !command.length) {
    return null
  }

  const bytes = []
  for (const value of command) {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      console.error('[car-adaptive] invalid control byte:', value)
      return null
    }
    bytes.push(value)
  }

  return Buffer.from(bytes)
}

function getCarAdaptivePorts(sensorId) {
  const sensorPortPath = sensorId && getCarAdaptiveSensorState(sensorId)?.portPath
  if (sensorPortPath && parserArr[sensorPortPath]?.port?.isOpen) {
    return [{
      path: sensorPortPath,
      port: parserArr[sensorPortPath].port,
      type: dataMap[sensorPortPath]?.type
    }]
  }

  return Object.keys(parserArr)
    .map((path) => ({
      path,
      port: parserArr[path]?.port,
      type: dataMap[path]?.type
    }))
    .filter((item) => item.type === CAR_ADAPTIVE_TYPE && item.port?.isOpen)
}

/** 按串口排队写入命令，确保主、副两路命令不会因同一时刻写串口而被丢弃。 */
function enqueueCarAdaptiveCommand(path, port, commandBuffer) {
  const queueState = adaptiveWriteQueues[path] || {
    writing: false,
    queue: []
  }
  adaptiveWriteQueues[path] = queueState
  queueState.queue.push(commandBuffer)

  const writeNext = () => {
    if (queueState.writing || !queueState.queue.length || !port?.isOpen) return
    queueState.writing = true
    const nextCommand = queueState.queue.shift()
    port.write(nextCommand, (err) => {
      queueState.writing = false
      if (err) {
        console.error(`[car-adaptive] write failed on ${path}:`, err.message)
      }
      writeNext()
    })
  }

  writeNext()
}

/**
 * 将一路控制命令写回产生该路数据的串口，并记录算法或接口命令诊断。
 *
 * @param {number[]} command 51 或 55 字节控制命令。
 * @param {number} [sensorId] 目标传感器。
 * @param {'algorithm'|'api'} [source] 命令来源。
 * @returns {{queued: boolean, portPaths: string[], length: number}|null} 入队结果。
 */
function writeCarAdaptiveCommand(command, sensorId = selectedCarAdaptiveSensorId, source = 'api') {
  const commandBuffer = normalizeControlCommand(command)
  if (!commandBuffer) return null

  const now = Date.now()
  const commandBytes = [...commandBuffer]
  const targetPorts = getCarAdaptivePorts(sensorId)
  const portPaths = targetPorts.map((item) => item.path)
  const queued = targetPorts.length > 0
  const sensorState = getCarAdaptiveSensorState(sensorId)

  if (source === 'api') {
    sensorState.apiSerialCommand = commandBytes
    sensorState.apiSerialCommandStamp = now
    sensorState.apiSerialCommandQueued = queued
    sensorState.apiSerialCommandPorts = portPaths
    appendCarAdaptiveAirbagCommandHistory(sensorId, 'apiSerial', commandBytes, now, {
      source: 'api',
      target: 'serial',
      queued,
      portPaths
    })
  }

  if (source === 'algorithm' && queued) {
    sensorState.algorithmSentCommand = commandBytes
    sensorState.algorithmSentStamp = now
    sensorState.algorithmSentPorts = portPaths
    appendCarAdaptiveAirbagCommandHistory(sensorId, 'algorithmSent', commandBytes, now, {
      source: 'algorithm',
      queued: true,
      portPaths
    })
  }

  if (!queued) {
    return { queued: false, portPaths: [], length: commandBuffer.length }
  }

  // writtenCommand 只记录真正进入队列的命令，可供兼容模式回落展示。
  sensorState.writtenCommand = commandBytes
  sensorState.writtenCommandStamp = now

  targetPorts.forEach(({ path, port }) => {
    enqueueCarAdaptiveCommand(path, port, commandBuffer)
  })
  return { queued: true, portPaths, length: commandBuffer.length }
}

/** 只为处于 auto 的主、副通道依次写入各自最新算法命令。 */
function writeAllCarAdaptiveCommands() {
  CAR_ADAPTIVE_SENSOR_IDS.forEach((sensorId) => {
    if (!isCarAdaptiveAutoMode(getCarAdaptiveControlModeState(sensorId))) return
    const command = getCarAdaptiveSensorState(sensorId).controlCommand
    if (command) {
      writeCarAdaptiveCommand(command, sensorId, 'algorithm')
    }
  })
}

function getControlFeedback(command) {
  if (!Array.isArray(command)) return []

  const max = 24
  const controlArr = []
  for (let i = 0; i < max; i++) {
    controlArr.push(command[2 * i + 2])
  }
  return controlArr
}

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.get('/health', (req, res) => {
  res.json(new HttpResult(0, {
    service: 'jqtools-real-serial-service',
    mode: 'real',
    httpPort: port,
    webSocketPort: wsPort,
    frontendBuildDir: FRONTEND_BUILD_DIR,
    controlMode: getCarAdaptiveControlModeState(selectedCarAdaptiveSensorId).mode,
    controlModes: CAR_ADAPTIVE_SENSOR_IDS.map(createCarAdaptiveControlModePublicState)
  }, 'success'))
})

// async function demo(matrix) {
//   // 构造一条 1024 长度的测试数据

//   // console.log(matrix)
//   // const data = new Array(10).fill(new Array(1024).fill(50)); // 可以放多条
//   // const res = await callPy('cal_cop_fromData', { data : matrix });
//   const res = await callPy('cal_cop_fromData', { data: matrix });
//   // console.log(res);
//   console.log(res, new Date().getTime()); // { left: [...], right: [...] }
// }


// async function main() {
//   const data1 = await getCsvData('D:/jqtoolsWin - 副本/python/app/静态数据集1.csv')

//   const matrix = data1.map((a) => JSON.parse(a.data))
//   await demo(matrix)
//   await demo(matrix)
//   await demo(matrix)
//   await demo(matrix)
//   await demo(matrix)
//   await demo(matrix)
//   await demo(matrix)
// }

// main()


// 绑定密钥
app.post('/bindKey', (req, res) => {
  console.log(req.body.key)
  try {

    const { key } = req.body;

    res.json(new HttpResult(0, {}, '绑定成功'));
  } catch {
    res.json(new HttpResult(1, {}, '绑定失败'));
  }

})

/**
 * 1. 选择系统
 * 2. 初始化数据库
 * 3. 关闭串口
 * */
app.post('/selectSystem', (req, res) => {
  try {
    file = req.query.file;
    const { db } = initDb(file, dbPath)
    currentDb = db
    if (blue.includes(file)) {
      baudRate = 921600
    } else {
      baudRate = 1000000
    }
    res.json(new HttpResult(0, { file, baudRate }, 'success'));
  } catch (err) {
    res.json(new HttpResult(1, {}, err.message || 'select system failed'));
  }
})

// 查询系统列表和当前系统
app.get('/getSystem', async (req, res) => {

  const config = fs.readFileSync('./config.txt', 'utf-8',)
  const result = JSON.parse(decryptStr(config))
  result.value = file

  // const result = {
  //   value: "bed",
  //   typeArr: ["bed", "hand", 'foot', 'bigHand']
  // }
  baudRate = constantObj.baudRateObj[result.value] ? constantObj.baudRateObj[result.value] : 1000000

  const { db } = initDb(file, dbPath)
  currentDb = db

  res.json(new HttpResult(0, result, '获取设备列表成功'));
})

// 查询串口
app.get('/getPort', async (req, res) => {
  const ports = await SerialPort.list()
  const portsRes = getPort(ports)
  res.json(new HttpResult(0, portsRes, '获取设备列表成功'));
})

// 一键连接
app.get('/connPort', async (req, res) => {
  try {
    let port = await connectPort()
    res.json(new HttpResult(0, port, '连接成功'));

  } catch {
    res.json(new HttpResult(1, {}, '连接失败'));
  }

})

/** 返回主界面和原始数据页共享的全局采集状态。 */
function getCarAdaptiveCollectionPublicState() {
  return {
    collecting: colFlag,
    fileName: colName || '',
    sensorId: colSensorId,
    role: getCarAdaptiveSensorRole(colSensorId),
    startedAt: colStartedAt,
    stoppedAt: colStoppedAt,
    frameCount: colFrameCount
  }
}

/** 判断当前是否已经连接可用于汽车压力采集的真实串口。 */
function hasCarAdaptiveCollectionSource() {
  return Object.values(dataMap).some((item) => {
    const type = String(item?.type || '')
    return type === CAR_ADAPTIVE_TYPE || (file && type.includes(file))
  })
}

/**
 * 将旧版单路存储对象固定投影为本次采集选中的主驾或副驾。
 * @param {object} data 当前发送给旧版页面的数据对象。
 * @param {number} sensorId 本次采集的传感器标识。
 * @returns {object} 可写入 SQLite 的采集数据。
 */
function createCarAdaptiveCollectionData(data, sensorId) {
  const collectionData = JSON.parse(JSON.stringify(data || {}))
  const state = getCarAdaptiveSensorState(sensorId)
  const online = Boolean(state.stamp && Date.now() - state.stamp < 1000)
  collectionData[CAR_ADAPTIVE_TYPE] = {
    ...(collectionData[CAR_ADAPTIVE_TYPE] || {}),
    status: online ? 'online' : 'offline',
    arr: Array.isArray(state.sensorData) ? [...state.sensorData] : [],
    stamp: state.stamp,
    HZ: state.HZ,
    sensorId: state.sensorId
  }
  return collectionData
}

// 查询当前采集状态，供主界面和原始数据页同步同一个全局采集任务。
app.get('/carAdaptive/collection', (req, res) => {
  res.json(new HttpResult(0, getCarAdaptiveCollectionPublicState(), 'success'))
})

/**
 * 按采集段名称读取全部 SQLite 原始帧。
 * @param {string} fileName 采集段名称。
 * @returns {Promise<object[]>} 按时间和主键排序的采集记录。
 */
function getCarAdaptiveCollectionExportRows(fileName) {
  return new Promise((resolve, reject) => {
    currentDb.all(
      'SELECT data, timestamp, date FROM matrix WHERE date=? ORDER BY timestamp ASC, id ASC',
      [fileName],
      (error, rows) => {
        if (error) {
          reject(error)
          return
        }
        resolve(rows || [])
      }
    )
  })
}

// 下载一个采集段的真实 145 字节原始帧 CSV。
app.get('/carAdaptive/collection/export', async (req, res) => {
  try {
    const fileName = String(req.query?.fileName || colName || '').trim().slice(0, 120)
    if (!fileName) {
      res.status(400).json(new HttpResult(1, '请先完成一次数据采集', 'error'))
      return
    }

    const sensorId = normalizeCollectionSensorId(req.query?.sensorId) ||
      (fileName === colName ? colSensorId : null)
    const rows = await getCarAdaptiveCollectionExportRows(fileName)
    const exported = createCarAdaptiveCollectionCsv(rows, { sensorId })
    if (!exported.frameCount) {
      res.status(404).json(new HttpResult(1, '该采集段没有可导出的原始帧', 'error'))
      return
    }

    const downloadName = createCarAdaptiveCollectionExportFileName(
      fileName,
      exported.sensorId
    )
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="car-adaptive-raw.csv"; filename*=UTF-8''${encodeURIComponent(downloadName)}`
    )
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-JQTools-Frame-Count', String(exported.frameCount))
    res.send(exported.csv)
  } catch (error) {
    console.error('[collection] export failed:', error)
    res.status(500).json(new HttpResult(1, error.message || '导出原始数据失败', 'error'))
  }
})

// 开始采集
app.post('/startCol', async (req, res) => {
  try {
    const { fileName, select } = req.body
    if (colFlag) {
      res.json(new HttpResult(0, getCarAdaptiveCollectionPublicState(), '采集已在进行'))
      return
    }

    if (!hasCarAdaptiveCollectionSource()) {
      res.json(new HttpResult(1, '没有可采集的汽车传感器，请先连接串口', 'error'))
      return
    }

    const sensorId = normalizeCarAdaptiveSensorId(req.body?.sensorId) || selectedCarAdaptiveSensorId
    selectArr = select && typeof select === 'object' ? select : []
    colFlag = true
    colName = String(fileName || `${Date.now()}`).trim().slice(0, 120) || `${Date.now()}`
    colSensorId = sensorId
    colStartedAt = Date.now()
    colStoppedAt = 0
    colFrameCount = 0

    // 开始新采集时退出历史回放，保证实时串口帧能够进入 storageData。
    historyFlag = false
    historyPlayFlag = false
    if (colTimer) {
      clearInterval(colTimer)
      colTimer = null
    }

    res.json(new HttpResult(0, getCarAdaptiveCollectionPublicState(), '开始采集'))
  } catch (err) {
    console.error('[collection] start failed:', err)
    res.status(500).json(new HttpResult(1, err.message || '开始采集失败', 'error'))
  }
})

// 停止采集
app.get('/endCol', async (req, res) => {
  colFlag = false
  colStoppedAt = Date.now()
  res.json(new HttpResult(0, getCarAdaptiveCollectionPublicState(), '停止采集'))
})

// 获取数据库所有存取列表
app.get('/getColHistory', async (req, res) => {
  // const selectQuery =
  //   "select DISTINCT date,timestamp, `select` from matrix ORDER BY timestamp DESC LIMIT ?,?";

  const selectQuery = `
  SELECT m.date, m.timestamp, m.\`select\`
  FROM matrix m
  INNER JOIN (
    SELECT date, MAX(timestamp) AS max_ts
    FROM matrix
    GROUP BY date
  ) t
  ON m.date = t.date  AND m.timestamp = t.max_ts
  ORDER BY m.timestamp DESC
  LIMIT ?, ?
`;

  const params = [0, 500];

  historyFlag = true

  currentDb.all(selectQuery, params, (err, rows) => {
    if (err) {
      console.error(err);
      res.status(500).json(new HttpResult(1, err.message || '读取采集历史失败', 'error'))
    } else {

      let jsonData;
      let sitTimeArr = rows;
      console.log(rows, '1111')
      let timeArr = rows;


      jsonData = JSON.stringify({
        timeArr: timeArr,
        // index: nowIndex,
        sitData: new Array(4096).fill(0),
      });

      res.json(new HttpResult(0, timeArr, 'success'));

      // socketSendData(server, jsonData)


    }
  });
  socketSendData(server, JSON.stringify({ sitData: {} }))
})

// app.post('/changeSelect', async (req, res) => {
//   try {
//     const { select } = req.body
//     selectArr = select
//     console.log(first)
//     // if (!selectArr.length) {
//     //   res.json(new HttpResult(555, '请选择先数据', 'error'));
//     // }
//     // const params = selectArr;
//     // const data = await dbLoadCsv({ db: currentDb, params, file, isPackaged })
//     // res.json(new HttpResult(0, data, '下载'));
//   } catch {

//   }
// })

// 下载成csv
app.post('/downlaod', async (req, res) => {
  try {
    const fileArr = Array.isArray(req.body?.fileArr) ? req.body.fileArr : []
    if (!fileArr.length) {
      res.json(new HttpResult(555, '请先选择数据', 'error'));
      return
    }
    const params = fileArr;
    const data = await dbLoadCsv({ db: currentDb, params, file, isPackaged })
    res.json(new HttpResult(0, data, '下载'));
  } catch (err) {
    console.error('[history] download failed:', err)
    res.status(500).json(new HttpResult(1, err.message || '下载历史数据失败', 'error'))
  }
})

// 删除数据库某个文件
app.post('/delete', async (req, res) => {
  try {
    const { fileArr } = req.body

    const params = fileArr;
    const data = await deleteDbData({ db: currentDb, params })
    console.log(data)
    res.json(new HttpResult(0, data, '删除成功'));
  } catch {

  }
})

app.post('/changeDbName', async (req, res) => {
  try {
    const { newDate, oldDate } = req.body

    console.log([newDate, oldDate])
    const data = await changeDbName({ db: currentDb, params: [newDate, oldDate] })
    console.log(data)
    res.json(new HttpResult(0, data, '删除成功'));
  } catch {

  }
})

// 获取数据库某个时间的所有数据
app.post('/getDbHistory', async (req, res) => {
  try {
    const time = String(req.body?.time || '')
    const { length, pressArr, areaArr, rows, skippedRows } = await dbGetData({
      db: currentDb,
      params: [time]
    })
    if (!length) {
      res.status(404).json(new HttpResult(1, '该采集段没有可回放的有效数据', 'error'))
      return
    }

    historyDbArr = rows
    colMaxHZ = getHistoryPlaybackHz(historyDbArr)
    colplayHZ = colMaxHZ
    historyFlag = true
    historyPlayFlag = false
    playIndex = 0
    socketSendData(server, JSON.stringify({
      carAdaptiveHistoryState: { active: true, name: time, length }
    }))
    socketSendData(server, JSON.stringify(createHistoryPlaybackPayload(historyDbArr[0], 0)))

    res.json(new HttpResult(0, {
      length,
      pressArr,
      areaArr,
      skippedRows,
      playbackHz: colMaxHZ
    }, 'success'));
  } catch (err) {
    console.error('[history] load failed:', err)
    res.status(500).json(new HttpResult(1, err.message || '载入回放失败', 'error'))
  }
})

app.post('/getContrastData', async (req, res) => {
  const { left, right } = req.body

  const selectQuery = "select * from matrix WHERE date=?";

  const params = [left];
  const params1 = [right]

  const { length: lengthL, pressArr: pressArrL, areaArr: areaArrL, rows: rowsL } = await dbGetData({ db: currentDb, params })
  const { length, pressArr, areaArr, rows } = await dbGetData({ db: currentDb, params: params1 })

  leftDbArr = rowsL
  rightDbArr = rows

  const data = { left: { length: lengthL, pressArr: pressArrL, areaArr: areaArrL, }, right: { length, pressArr, areaArr, } }

  socketSendData(server, JSON.stringify({
    contrastData: { left: JSON.parse(leftDbArr[0].data), right: JSON.parse(rightDbArr[0].data) },
    // index: playIndex,
    // timestamp: JSON.parse(historyDbArr[playIndex].timestamp)
  }))

  res.json(new HttpResult(0, data, 'success'));

})


app.post('/changeDbDataName', async (req, res) => {
  try {
    const { oldName, newName } = req.body
    await changeDbDataName({ db: currentDb, params: [oldName, newName] })
    res.json(new HttpResult(0, {}, 'success'));
  } catch (err) {
    res.json(new HttpResult(1, {}, err.message || 'change data name failed'));
  }
})

// 取消播放
app.post('/cancalDbPlay', async (req, res) => {
  // 将回放flag置为false 并且将当前数据数组置为空
  historyFlag = false
  historyPlayFlag = false
  historyDbArr = null

  if (colTimer) {
    clearInterval(colTimer)
    colTimer = null
  }

  socketSendData(server, JSON.stringify({
    carAdaptiveHistoryState: { active: false }
  }))

  res.json(new HttpResult(0, {}, 'success'));
})

// 开始播放
app.post('/getDbHistoryPlay', async (req, res) => {


  if (historyDbArr) {


    if (playIndex == historyDbArr.length - 1) {
      playIndex = 0
    }
    // 播放flag打开
    historyPlayFlag = true

    if (colTimer) {
      clearInterval(colTimer)
    }

    socketSendData(server, JSON.stringify({ playEnd: true }))

    colTimer = setInterval(() => {
      if (historyPlayFlag && historyDbArr) {

        socketSendData(server, JSON.stringify(
          createHistoryPlaybackPayload(historyDbArr[playIndex], playIndex)
        ))
        if (playIndex < historyDbArr.length - 1) {
          playIndex++
        } else {
          historyPlayFlag = false
          socketSendData(server, JSON.stringify({ playEnd: false }))
          clearInterval(colTimer)
        }
      }
    }, 1000 / colplayHZ)
    res.json(new HttpResult(0, {}, 'success'));

  } else {
    res.json(new HttpResult(1, '请选择回放时间段', 'error'));
  }
})

// 修改播放速度
app.post('/changeDbplaySpeed', async (req, res) => {
  const { speed } = req.body
  // historyPlayFlag = true
  colplayHZ = colMaxHZ * speed
  if (historyPlayFlag) {
    if (colTimer) {
      clearInterval(colTimer)
    }
    colTimer = setInterval(() => {
      if (historyPlayFlag) {

        socketSendData(server, JSON.stringify(
          createHistoryPlaybackPayload(historyDbArr[playIndex], playIndex)
        ))
        if (playIndex < historyDbArr.length - 1) {
          playIndex++
        } else {
          socketSendData(server, JSON.stringify({ playEnd: false }))
          historyPlayFlag = false
          clearInterval(colTimer)
        }
      }
    }, 1000 / (colplayHZ))
  }

  res.json(new HttpResult(0, {}, 'success'));
})

// 修改系统类型
app.post('/changeSystemType', async (req, res) => {
  const { system } = req.body
  file = system
  baudRate = constantObj.baudRateObj[system] ? constantObj.baudRateObj[system] : 1000000
  const { db } = initDb(file, dbPath)
  currentDb = db
  console.log(baudRate)
  // stopPort()
  socketSendData(server, JSON.stringify({ sitData: {} }))

  res.json(new HttpResult(0, { optimalObj: result.optimalObj[file], maxObj: result.maxObj[file] }, 'success'));
})


// 取消播放
app.post('/getDbHistoryStop', async (req, res) => {
  historyPlayFlag = false
  res.json(new HttpResult(0, {}, 'success'));
})

// 获取某个时间的数据的某个索引数据
app.post('/getDbHistoryIndex', async (req, res) => {
  const index = Number(req.body?.index)

  if (!historyDbArr) {
    res.json(new HttpResult(555, '请选择回放时间段', 'error'));
    return
  }

  if (!Number.isInteger(index) || index < 0 || index >= historyDbArr.length) {
    res.status(400).json(new HttpResult(1, '回放索引超出范围', 'error'))
    return
  }

  playIndex = index
  socketSendData(server, JSON.stringify(
    createHistoryPlaybackPayload(historyDbArr[playIndex], playIndex)
  ))
  res.json(new HttpResult(0, historyDbArr[index], 'success'));
})

// 读取csv
app.post('/getCsvData', async (req, res) => {
  try {
    const { fileName } = req.body
    const data = await getCsvData(fileName)
    console.log(data)
    csvArr = data
    res.json(new HttpResult(0, data, 'success'));
  } catch (err) {
    res.json(new HttpResult(1, {}, err.message || 'read csv failed'));
  }
})

function portWirte(port) {
  return new Promise((resolve, reject) => {
    // const command = 'AT\r\n';
    const command = Buffer.from('41542B4E414D453D45535033320d0a', 'hex')

    port.write(command, err => {
      if (err) {
        return console.error('err2:', err.message);
      }
      // console.log('send:', command.trim());
      // resolve(command.trim())

      console.log('send:', 11);
      resolve(11)
    });
  })
}

app.get('/sendMac', async (req, res) => {

  if (Object.keys(parserArr).length) {
    const task = []
    for (let i = 0; i < Object.keys(parserArr).length; i++) {
      const key = Object.keys(parserArr)[i]
      const port = parserArr[key].port

      // const command = 'AT\r\n';
      // port.write(command, err => {
      //   if (err) {
      //     return console.error('err2:', err.message);
      //   }
      //   console.log('send:', command.trim());

      // });

      // task.push(portWirte(port))
    }
    const results = await Promise.all(task);
    sendMacNum++
    console.log('sendTotal:', sendMacNum, '-----', 'success:', successNum)
    res.json(new HttpResult(0, {}, '发送成功'));
  } else {
    res.json(new HttpResult(0, {}, '请先连接串口'));
  }
})

app.post('/getSysconfig', async (req, res) => {
  const { config } = req.body
  // const data = getCsvData(fileName)
  const result = JSON.stringify(config)

  let str = module2.encStr(`${result}`);
  const data = str
  //   console.log(data)
  // csvArr = data
  res.json(new HttpResult(0, data, 'success'));
})

// 查找pyConfig
app.get('/getPyConfig', async (req, res) => {

  const obj = await callPy('getParam',)
  res.json(new HttpResult(0, obj, 'success'));
})

// 获取当前 Python 算法参数及 YAML 中的中文注释。
app.get('/algorithm/config', async (req, res) => {
  try {
    const config = await callPy('getParam')
    res.json(new HttpResult(0, config, 'success'))
  } catch (err) {
    res.json(new HttpResult(1, {}, err.message || '读取算法参数失败'))
  }
})

// 批量保存算法参数；Python 会在落盘后重建算法实例，使所有参数立即生效。
app.post('/algorithm/config', async (req, res) => {
  try {
    const { changes } = req.body || {}
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).length === 0) {
      res.json(new HttpResult(1, {}, 'changes 必须是非空参数对象'))
      return
    }

    const result = await callPy('setParam', { obj: changes })
    const config = await callPy('getParam')
    res.json(new HttpResult(0, { result, config }, '算法参数已保存并生效'))
  } catch (err) {
    res.json(new HttpResult(1, {}, err.message || '保存算法参数失败'))
  }
})

// 获取旧版单路 WebSocket 的兼容投影：1 为主传感器，2 为副传感器。
app.get('/carAdaptive/sensor', (req, res) => {
  res.json(new HttpResult(0, getCarAdaptiveSensorSelection(), 'success'))
})

// 获取主、副两路实时运行摘要；两路算法始终独立运行。
app.get('/carAdaptive/sensors', (req, res) => {
  res.json(new HttpResult(0, getCarAdaptiveSensorsStatus(), 'success'))
})

// 诊断接口：确认 ECU 是否回传气囊状态帧，以及回传帧的实际长度和协议布局。
// 前端气囊亮暗最终应由回传驱动，这里用于在真实硬件上先验证回传是否存在。
app.get('/carAdaptive/feedbackDiagnostics', (req, res) => {
  res.json(new HttpResult(0, getSerialFrameDiagnostics(), 'success'))
})

// 查询一路气囊指令历史；可按 type 筛选，默认返回最新 200 条。
app.get('/carAdaptive/commands/history', (req, res) => {
  const sensorId = normalizeCarAdaptiveSensorId(
    req.query?.sensorId ?? selectedCarAdaptiveSensorId
  )
  const type = normalizeCarAdaptiveCommandHistoryType(req.query?.type)
  if (sensorId === null) {
    res.status(400).json(new HttpResult(1, {}, 'sensorId 只允许为 1（主驾）或 2（副驾）'))
    return
  }
  if (type === null) {
    res.status(400).json(new HttpResult(1, {}, '气囊指令历史类型不合法'))
    return
  }

  res.json(new HttpResult(0, getCarAdaptiveCommandHistoryPublicState(sensorId, {
    type,
    limit: req.query?.limit
  }), 'success'))
})

// 清空一路全部历史或指定类型历史，不改变算法、串口和展示状态。
app.delete('/carAdaptive/commands/history/:sensorId', (req, res) => {
  const sensorId = normalizeCarAdaptiveSensorId(req.params?.sensorId)
  const type = normalizeCarAdaptiveCommandHistoryType(req.query?.type)
  if (sensorId === null) {
    res.status(400).json(new HttpResult(1, {}, 'sensorId 只允许为 1（主驾）或 2（副驾）'))
    return
  }
  if (type === null) {
    res.status(400).json(new HttpResult(1, {}, '气囊指令历史类型不合法'))
    return
  }

  const state = getCarAdaptiveSensorState(sensorId)
  const removed = clearCarAdaptiveCommandHistory(state.airbagCommandHistory, type)
  res.json(new HttpResult(0, {
    ...getCarAdaptiveCommandHistoryPublicState(sensorId, { type, limit: req.query?.limit }),
    removed
  }, '气囊指令历史已清空'))
})

// 查询当前气囊控制模式：auto 为算法自动写串口，manual 为只接受手动下发。
app.get('/carAdaptive/mode', (req, res) => {
  const hasSensorId = req.query?.sensorId !== undefined
  const sensorId = hasSensorId
    ? normalizeCarAdaptiveSensorId(req.query.sensorId)
    : selectedCarAdaptiveSensorId
  if (sensorId === null) {
    res.status(400).json(new HttpResult(1, {}, 'sensorId 只允许为 1（主驾）或 2（副驾）'))
    return
  }
  res.json(new HttpResult(0, getCarAdaptiveControlModePublicState(sensorId), 'success'))
})

// 切换气囊控制模式。手动模式只停止算法自动写串口，两路算法继续运行并继续推送数据。
app.post('/carAdaptive/mode', async (req, res) => {
  const result = await setCarAdaptiveControlMode(req.body)
  if (!result.ok) {
    res.status(400).json(new HttpResult(1, {}, result.message))
    return
  }

  const responseSensorId = normalizeCarAdaptiveSensorId(req.body?.sensorId) || selectedCarAdaptiveSensorId
  res.json(new HttpResult(0, {
    ...getCarAdaptiveControlModePublicState(responseSensorId),
    changed: result.changed,
    massageReset: result.massageReset,
    algorithmReset: result.algorithmReset,
    changes: result.changes
  }, result.changed ? '控制模式已切换' : '控制模式未变化'))
})

// 查询接口覆盖、ECU 回传或兼容命令回落后的气囊界面展示状态。
app.get('/carAdaptive/display', (req, res) => {
  const hasSensorId = req.query?.sensorId !== undefined
  const sensorId = hasSensorId
    ? normalizeCarAdaptiveSensorId(req.query.sensorId)
    : selectedCarAdaptiveSensorId
  if (sensorId === null) {
    res.status(400).json(new HttpResult(1, {}, 'sensorId 只允许为 1（主驾）或 2（副驾）'))
    return
  }
  res.json(new HttpResult(0, getCarAdaptiveAirbagDisplayPublicState(sensorId), 'success'))
})

// 只覆盖前端气囊展示，不写串口，也不伪造 ECU feedbackOnline。
app.post('/carAdaptive/display', (req, res) => {
  const sensorId = normalizeCarAdaptiveSensorId(req.body?.sensorId)
  if (sensorId === null) {
    res.status(400).json(new HttpResult(1, {}, 'sensorId 只允许为 1（主驾）或 2（副驾）'))
    return
  }

  const parsed = parseCarAdaptiveAirbagDisplayInput(req.body)
  if (!parsed.ok) {
    res.status(400).json(new HttpResult(1, {}, parsed.message))
    return
  }

  const state = getCarAdaptiveSensorState(sensorId)
  const now = Date.now()
  state.displayOverrideGears = parsed.gears
  state.displayOverrideStamp = now
  state.apiDisplayCommand = parsed.command
  state.apiDisplayCommandStamp = now
  state.apiDisplayClearedAt = 0
  appendCarAdaptiveAirbagCommandHistory(sensorId, 'apiDisplay', parsed.command, now, {
    source: 'api',
    target: 'display',
    active: true,
    clearedAt: 0
  })
  broadcastCarAdaptiveSensorSnapshots()
  res.json(new HttpResult(0, getCarAdaptiveAirbagDisplayPublicState(sensorId), '气囊展示状态已覆盖'))
})

// 清除一路接口展示覆盖，界面重新跟随 ECU 回传或配置的命令回落。
app.delete('/carAdaptive/display/:sensorId', (req, res) => {
  const sensorId = normalizeCarAdaptiveSensorId(req.params?.sensorId)
  if (sensorId === null) {
    res.status(400).json(new HttpResult(1, {}, 'sensorId 只允许为 1（主驾）或 2（副驾）'))
    return
  }

  const state = getCarAdaptiveSensorState(sensorId)
  const previousDisplayCommand = state.apiDisplayCommand
  state.displayOverrideGears = undefined
  state.displayOverrideStamp = 0
  state.apiDisplayClearedAt = Date.now()
  if (Array.isArray(previousDisplayCommand)) {
    appendCarAdaptiveAirbagCommandHistory(
      sensorId,
      'apiDisplay',
      previousDisplayCommand,
      state.apiDisplayClearedAt,
      {
        source: 'api',
        target: 'display',
        active: false,
        clearedAt: state.apiDisplayClearedAt
      }
    )
  }
  broadcastCarAdaptiveSensorSnapshots()
  res.json(new HttpResult(0, getCarAdaptiveAirbagDisplayPublicState(sensorId), '气囊展示覆盖已清除'))
})

// 查询当前 SDK 页面、主副驾选择和最近一次远程命令执行状态。
app.get('/carAdaptive/ui/state', (req, res) => {
  res.json(new HttpResult(0, getCarAdaptiveUiPublicState(), 'success'))
})

// 从局域网设备下发返回主页、打开模块或主副驾切换命令。
app.post('/carAdaptive/ui/command', async (req, res) => {
  if (!isCarAdaptiveUiRequestAuthorized(req)) {
    res.status(401).json(new HttpResult(1, {}, '远程控制令牌错误'))
    return
  }

  const previousView = carAdaptiveUiState.view
  const result = applyCarAdaptiveUiCommand(carAdaptiveUiState, req.body)
  if (!result.ok) {
    res.status(400).json(new HttpResult(1, {}, result.message))
    return
  }

  carAdaptiveUiState = result.state
  // 进入自适应模块让算法接管，离开则暂停算法
  await syncCarAdaptiveControlModeWithView(previousView, carAdaptiveUiState.view)
  if (
    result.command.action === CAR_ADAPTIVE_UI_ACTIONS.RETURN_HOME &&
    CAR_ADAPTIVE_HOME_URL
  ) {
    result.command.homeUrl = CAR_ADAPTIVE_HOME_URL
  }
  broadcastCarAdaptiveUiCommand(result.command)
  res.json(new HttpResult(0, {
    command: result.command,
    state: getCarAdaptiveUiPublicState()
  }, '远程 UI 命令已广播'))
})

// 切换旧版单路兼容投影，不停止、不清空也不重置任何一路算法。
app.post('/carAdaptive/sensor', (req, res) => {
  const sensorId = normalizeCarAdaptiveSensorId(req.body?.sensorId)
  if (sensorId === null) {
    res.json(new HttpResult(1, {}, 'sensorId 只允许为 1（主）或 2（副）'))
    return
  }

  selectedCarAdaptiveSensorId = sensorId
  const selection = getCarAdaptiveSensorSelection()
  socketSendData(server, JSON.stringify({ carAdaptiveSensor: selection }))
  res.json(new HttpResult(0, selection, '兼容投影切换成功，主副算法继续运行'))
})

// Car adaptive: submit a 144-point frame to the specified independent Python algorithm.
app.post('/carAdaptive/processFrame', async (req, res) => {
  try {
    const { sensorData, writeSerial = false } = req.body
    const sensorId = normalizeCarAdaptiveSensorId(
      req.body?.sensorId ?? selectedCarAdaptiveSensorId
    )

    if (!Array.isArray(sensorData) || sensorData.length !== 144) {
      res.json(new HttpResult(1, {}, 'sensorData must be an array with 144 numbers'));
      return
    }

    if (sensorId === null) {
      res.json(new HttpResult(1, {}, 'sensorId must be 1 (main) or 2 (secondary)'));
      return
    }

    updateCarAdaptiveSensorFrame(sensorId, sensorData, Date.now())
    const result = await callPy('server', {
      sensor_data: sensorData,
      sensor_id: sensorId
    })
    const sensorAlgorithmData = updateCarAdaptiveAlgorithmResult(sensorId, result)

    if (writeSerial && result?.control_command) {
      writeCarAdaptiveCommand(result.control_command, sensorId, 'algorithm')
    }

    broadcastCarAdaptiveSensorSnapshots()
    res.json(new HttpResult(0, sensorAlgorithmData, 'success'));
  } catch (err) {
    res.json(new HttpResult(1, {}, err.message || 'car adaptive algorithm failed'));
  }
})

// Car adaptive: write an existing Python control_command to the target serial port.
app.post('/carAdaptive/writeCommand', async (req, res) => {
  try {
    const { controlCommand } = req.body
    const sensorId = normalizeCarAdaptiveSensorId(
      req.body?.sensorId ?? selectedCarAdaptiveSensorId
    )
    const commandBuffer = normalizeControlCommand(controlCommand)

    if (!commandBuffer) {
      res.json(new HttpResult(1, {}, 'controlCommand must be a byte array'));
      return
    }

    if (sensorId === null) {
      res.json(new HttpResult(1, {}, 'sensorId must be 1 (main) or 2 (secondary)'));
      return
    }

    const commandSource = req.body?.source === 'algorithm' ? 'algorithm' : 'api'
    const writeResult = writeCarAdaptiveCommand(controlCommand, sensorId, commandSource)
    broadcastCarAdaptiveSensorSnapshots()
    // 返回当前模式：自动模式下该命令会在下一个 500ms 周期被算法命令覆盖。
    res.json(new HttpResult(0, {
      length: commandBuffer.length,
      sensorId,
      controlMode: getCarAdaptiveControlModeState(sensorId).mode,
      queued: Boolean(writeResult?.queued),
      portPaths: writeResult?.portPaths || []
    }, 'success'));
  } catch (err) {
    res.json(new HttpResult(1, {}, err.message || 'car adaptive write command failed'));
  }
})

app.post('/changePy', async (req, res) => {
  const { path, value } = req.body
  let object = {}
  object[path] = JSON.parse(value)
  console.log(object, 'object')
  const obj = await callPy('setParam', { obj: object })
  res.json(new HttpResult(0, obj, 'success'));
})

// 计算cop 
// let arr = []
// app.post('/getCop', async (req, res) => {
//   const { MatrixList } = req.body
//   // console.log(MatrixList)
//   const data = await callPy('cal_cop_fromData', { data: MatrixList })
//   // console.log(data)
//   // csvArr = data

//   // arr.push({ MatrixList, data })
//   // fs.writeFile('D:/jqtoolsWin - 副本/server/data.txt', JSON.stringify(arr), 'utf8', (err) => {
//   //   if (err) {
//   //     console.error('追加失败:', err);
//   //   } else {
//   //     console.log('追加成功');
//   //   }
//   // });
//   res.json(new HttpResult(0, data, 'success'));
// })



app.listen(port, () => {
  process.send?.({ type: 'ready', port });
  console.log(`Example app listening on port ${port}`)
})


const server = new WebSocket.Server({ port: wsPort });

server.on("open", function open() {
  console.log("connected");
});

server.on("close", function close() {
  console.log("disconnected");
});

server.on("connection", function connection(ws, req) {
  const ip = req.connection.remoteAddress;
  const port = req.connection.remotePort;
  const clientName = ip + port;
  const requestUrl = new URL(req.url || '/', 'ws://127.0.0.1')
  ws.jqtoolsRole = requestUrl.searchParams.get('role') || 'data'
  ws.jqtoolsClientId = requestUrl.searchParams.get('clientId') || clientName
  console.log("%s is connected", clientName);

  socketSendData(server, JSON.stringify({}))
  socketSendData(server, JSON.stringify({ carAdaptiveSensor: getCarAdaptiveSensorSelection() }))
  socketSendData(server, JSON.stringify({ carAdaptiveSensors: getCarAdaptiveSensorsStatus() }))
  broadcastCarAdaptiveControlMode()
  broadcastCarAdaptiveSensorSnapshots()
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      carAdaptiveHistoryState: {
        active: Boolean(historyFlag && historyDbArr?.length),
        name: historyDbArr?.[0]?.date || '',
        length: historyDbArr?.length || 0
      }
    }))
  }

  ws.on("message", (rawMessage) => {
    let message
    try {
      message = JSON.parse(rawMessage.toString())
    } catch (_error) {
      return
    }

    if (message?.type === 'carAdaptiveUiReport') {
      const previousView = carAdaptiveUiState.view
      carAdaptiveUiState = applyCarAdaptiveUiReport(carAdaptiveUiState, {
        ...message,
        clientId: ws.jqtoolsClientId
      })
      // 只在视图真正变化时同步，模块页内切换主副驾会重复上报同一视图
      syncCarAdaptiveControlModeWithView(previousView, carAdaptiveUiState.view)
        .catch((err) => console.error('[car-adaptive] 视图模式同步失败:', err.message))
    } else if (message?.type === 'carAdaptiveUiAcknowledgement') {
      carAdaptiveUiState = applyCarAdaptiveUiAcknowledgement(carAdaptiveUiState, {
        ...message,
        clientId: ws.jqtoolsClientId
      })
    }
  });
});

/**
 * 
 * @param {obj} server websocket服务器
 * @param {JSON} data 发送的数据
 */
const socketSendData = (server, data) => {
  server.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

/**
 * 将串口跟 parser连接起来
 */
const newSerialPortLink = ({ path, parser, baudRate = 1000000 }) => {
  let port
  console.log(path, baudRate)
  try {
    port = new SerialPort(
      {
        path,
        baudRate: baudRate,
        autoOpen: true,
      },
      function (err) {
        console.log(err, "err");
      }
    );
    //管道添加解析器
    port.pipe(parser);
  } catch (e) {
    console.log(e, "e");
  }
  return port
}

/**
 * 
 * @param {Array} parserArr 
 * @param {object} objs 
 * @returns 解析蓝牙分包数据
 */
function parseData(parserArr, objs, type) {

  let json = {}
  Object.keys(objs).forEach((key) => {
    const obj = parserArr[key]
    const data = objs[key]
    if (obj.port.isOpen) {
      let blueArr = []

      if (type == 'blue') {
        const { order } = constantObj
        const lastData = data[order[1]]
        const nextData = data[order[2]]

        if (lastData && lastData.length && nextData && nextData.length) {
          blueArr = [...lastData, ...nextData]
        }
      } else if (type == 'highHZ') {
        blueArr = data.arr
      }
      // 当前时间戳与发数据时间戳之差
      const dataStamp = new Date().getTime() - data.stamp
      json[data.type] = {}

      // 根据发送时间与最新时间戳的差值  判断设备的在离线状态
      if (dataStamp < 1000) {

        json[data.type].status = 'online'
        // console.log(first)
        // if (data.type.includes(file)) json[data.type].arr = blueArr
        json[data.type].arr = blueArr
        json[data.type].rotate = data.rotate
        json[data.type].stamp = data.stamp
        json[data.type].HZ = data.HZ
        if (data.sensorId) json[data.type].sensorId = data.sensorId
        if (data.cop) json[data.type].cop = data.cop
        if (data.breatheData) json[data.type].cop = data.breatheData
        // json[data.type].stampDiff = new Date().getTime() - data.stamp
      } else {
        json[data.type].status = 'offline'
      }
    } else {
      json[data.type] = {}
      json[data.type].status = 'offline'
    }

  })
  return json
}

/**
 * 连接成功并且发送数据
 * @returns 
 * 
 */

var sendMacNum = 0, successNum = 0, sendDataLength = 0
const oldTimeObj = {}
async function connectPort() {
  macInfo = {}
  let ports = await SerialPort.list()
  ports = getPort(ports)
  // console.log(ports, 'ports')
  // 创建并连接数据通道并且设置回调
  for (let i = 0; i < ports.length; i++) {

    const portInfo = ports[i]




    const { path } = portInfo
    // parserArr[path]
    const parserItem = parserArr[path] = parserArr[path] ? parserArr[path] : {}
    const dataItem = dataMap[path] = dataMap[path] ? dataMap[path] : {}
    // parserItem 
    parserItem.parser = new DelimiterParser({ delimiter: splitBuffer })

    const { parser } = parserItem

    // if()

    if (!(parserItem.port && parserItem.port.isOpen)) {
      const port = newSerialPortLink({ path, parser: parserItem.parser, baudRate })

      // linkIngPort.push(port)

      // port.open(err => {
      //   if (err) {
      //     return console.error('err1:', err.message);
      //   }
      //   console.log('open');

      //   // 发送 AT 指令
      //   const command = 'AT\r\n';
      //   port.write(command, err => {
      //     if (err) {
      //       return console.error('err2:', err.message);
      //     }
      //     console.log('已发送:', command.trim());
      //   });
      // });

      // const command = 'AT\r\n';
      // const command = Buffer.from('41542B4E414D453D45535033320d0a', 'hex')
      // port.write(command, err => {
      //   if (err) {
      //     return console.error('err2:', err.message);
      //   }
      //   console.log('send:', 22);
      //   sendMacNum++
      // });

      parserItem.port = port
      parser.on("data", async function (data) {



        let buffer = Buffer.from(data);

        pointArr = new Array();

        if (![18, 1024, 130, 146].includes(buffer.length)) {

          // console.log(JSON.stringify(buffer) , path,pointArr, pointArr.length, new Date().getTime())
          // console.log(pointArr)
        }

        for (var i = 0; i < buffer.length; i++) {
          pointArr[i] = buffer.readUInt8(i);
        }


        if (buffer.toString().includes('Unique ID')) {
          console.log(buffer.toString())
          const str = buffer.toString()
          if (str.includes('Unique ID')) {

            const uniqueIdMatch = str.match(/Unique ID:\s*([^\s-]+)/);
            const versionMatch = str.match(/Versions:\s*([^\s-]+)/);

            const uniqueId = uniqueIdMatch ? uniqueIdMatch[1] : null;
            const version = versionMatch ? versionMatch[1] : null;

            console.log("Unique ID:", uniqueId);  // 34463730155032138F
            console.log("Versions:", version);    // C40510
            successNum++

            console.log('sendTotal:', sendMacNum, '-----', 'success:', successNum)
            macInfo[path] = {
              uniqueId,
              version
            }

            try {


              const response = await axios.get(`${constantObj.backendAddress}/device-manage/device/getDetail/${uniqueId}`)
              const time = await axios.get(`http://sensor.bodyta.com:8080/rcv/login/getSystemTime`)


              // 截至时间
              if (!response.data.data) {
                dataItem.premission = false
              } else {
                const expireTime = response.data.data.expireTime
                const nowTime = time.data.time
                if (nowTime < expireTime) {
                  dataItem.premission = true
                }
                dataItem.type = JSON.parse(response.data.data.typeInfo)[0]
              }
            } catch (err) {
              console.log(err, 'err')
            }


            if (Object.keys(macInfo).length == ports.length) {
              // console.log(macInfo)
              // return macInfo

              socketSendData(server, JSON.stringify({ macInfo }))
            }
          }
        }
        // console.log(pointArr.length)
        // 陀螺仪
        if (pointArr.length == 18) {
          const length = pointArr.length
          const arr = pointArr.splice(2, length)
          dataItem.rotate = bytes4ToInt10(arr)
        }
        // 256矩阵分包
        else if (pointArr.length == 130) {
          // 解析包数据  类型+前后帧类型+128矩阵
          const length = pointArr.length
          const order = pointArr[0]
          const type = pointArr[1]
          // console.log(constantObj.type[type], order, path, pointArr.length, new Date().getTime())

          const arr = pointArr.splice(2, length)
          const orderName = constantObj.order[order]
          // 前后帧赋值,类型赋值
          dataItem[orderName] = arr
          dataItem.type = constantObj.type[type]
          dataItem.stamp = new Date().getTime()
        } else if (pointArr.length == 1024) {
          // ret
          if (!dataItem.premission) return
          // dataItem.type = 'hand'
          // dataItem[path]
          // dataItem.type = 'sit'
          let matrix
          if (dataItem.type == 'hand') {
            matrix = hand(pointArr)
          } else if (dataItem.type == 'bed') {
            matrix = jqbed(pointArr)
          } else if (dataItem.type == 'car-back') {
            matrix = jqbed(pointArr)
          } else {
            matrix = pointArr
          }

          // 设备型号跟传感器类型匹配上

          dataItem.arr = matrix



          // 如果是脚垫  添加算法包COP数据
          if (file == 'foot') {
            // console.log(matrix)
            if (!dataItem.arrList) {
              dataItem.arrList = []
            } else {
              if (dataItem.arrList.length < 60) {
                dataItem.arrList.push(matrix)
              } else {
                dataItem.arrList.shift()
                dataItem.arrList.push(matrix)
              }

              // dataItem.cop = await callPy('cal_cop_fromData', { data: dataItem.arrList })
            }

            // console.log(dataItem.cop)
          }


          const stamp = new Date().getTime()
          dataItem.stamp = stamp

          if (oldTimeObj[dataItem.type]) {
            dataItem.HZ = stamp - oldTimeObj[dataItem.type]
            if (dataItem.HZ < 50) {
              return
            }
            if (!MaxHZ && oldTimeObj[dataItem.type]) {
              MaxHZ = Math.floor(1000 / dataItem.HZ)
              HZ = MaxHZ
              console.log('playtimer', HZ)
              if (playtimer) {
                clearInterval(playtimer)
              }
              playtimer = setInterval(() => {
                colAndSendData()
              }, 80)
            }
            // if(!playtimer){
            //      playtimer = setInterval(() => {
            //     colAndSendData()
            //   }, 80)
            // }
          }
          // console.log(stamp, oldTimeObj[dataItem.type],dataItem.HZ,HZ,playtimer)
          // if (!oldTimeObj[dataItem.type]) {
          oldTimeObj[dataItem.type] = dataItem.stamp
          // } else {

          // }


        } else if (pointArr.length == 1025) {
          const type = pointArr.shift()
          dataItem.premission = true

          if (!Object.keys(constantObj.typeConfig).includes(String(type))) {
            dataItem.premission = false
            return
          }
          let matrix
          dataItem.type = constantObj.typeConfig[type]

          if (constantObj.typeConfig[type] == 'car-back') {
            matrix = jqbed(pointArr)
          } else if (constantObj.typeConfig[type] == 'car-sit') {
            matrix = jqbed(pointArr)
          } else if (constantObj.typeConfig[type] == 'bed') {
            matrix = jqbed(pointArr)
          }
          dataItem.arr = matrix

          const stamp = new Date().getTime()
          dataItem.stamp = stamp

          if (oldTimeObj[dataItem.type]) {
            dataItem.HZ = stamp - oldTimeObj[dataItem.type]
            if (dataItem.HZ < 50) {
              return
            }
            if (!MaxHZ && oldTimeObj[dataItem.type]) {
              MaxHZ = Math.floor(1000 / dataItem.HZ)
              HZ = MaxHZ
              console.log('playtimer', HZ)
              if (playtimer) {
                clearInterval(playtimer)
              }
              playtimer = setInterval(() => {
                colAndSendData()
              }, 80)
            }
          }

          oldTimeObj[dataItem.type] = dataItem.stamp


        }

        else if (pointArr.length == 146) {
          const length = pointArr.length
          const arr = pointArr.splice(length - 16, length)
          pointArr.splice(0, 2)
          // 下一帧赋值  时间戳赋值 四元数赋值
          dataItem.next = pointArr
          const stamp = new Date().getTime()
          dataItem.stamp = stamp
          dataItem.rotate = bytes4ToInt10(arr)
        } else if (pointArr.length == 4096) {
          // if (!dataItem.premission) return
          // dataItem.type = 'sit'
          if (!dataItem.premission) {
            dataItem.status = 'expired'
          } else {
            if (dataItem.type == 'endi-sit') {
              dataItem.arr = endiSit(pointArr)
            } else if (dataItem.type == 'endi-back') {
              dataItem.arr = endiBack(pointArr)
            } else {
              dataItem.arr = pointArr
            }
          }
          // console.log(444)
          const stamp = new Date().getTime()
          if (sendDataLength < 20) {
            sendDataLength++
          }
          if (oldTimeObj[dataItem.type]) {
            dataItem.HZ = stamp - oldTimeObj[dataItem.type]
            if (!MaxHZ && sendDataLength == 20) {
              MaxHZ = Math.floor(1000 / dataItem.HZ)
              HZ = MaxHZ
              playtimer = setInterval(() => {
                colAndSendData()
              }, 1000 / HZ)
              sendDataLength = 0
            }
          }
          dataItem.stamp = stamp
          // if (!oldTimeObj[dataItem.type]) {
          oldTimeObj[dataItem.type] = dataItem.stamp
          // } else {

          // }

          if (!dataItem.arrList) {
            dataItem.arrList = []
          } else {
            if (dataItem.arrList.length < 3) {
              dataItem.arrList.push(pointArr)
            } else {
              dataItem.arrList.shift()
              dataItem.arrList.push(pointArr)
            }

            // dataItem.cop = await callPy('cal_cop_fromData', { data_array: dataItem.arrList })
            // console.log(dataItem.arrList, pointArr.length, dataItem.cop)
          }

        } else if (pointArr.length == 4097) {
          // if (!dataItem.premission) return
          // dataItem.type = 'sit'

          const type = pointArr.shift()
          dataItem.premission = true

          if (!Object.keys(constantObj.typeConfig).includes(String(type))) {
            dataItem.premission = false
            return
          }

          dataItem.type = constantObj.typeConfig[type]

          if (dataItem.type == 'endi-sit') {
            dataItem.arr = endiSit(pointArr)
          } else if (dataItem.type == 'endi-back') {
            dataItem.arr = endiBack(pointArr)
          } else {
            dataItem.arr = pointArr
          }

          const stamp = new Date().getTime()
          if (oldTimeObj[dataItem.type]) {
            dataItem.HZ = stamp - oldTimeObj[dataItem.type]
            if (!MaxHZ) {
              MaxHZ = Math.floor(1000 / dataItem.HZ)
              HZ = MaxHZ
              playtimer = setInterval(() => {
                colAndSendData()
              }, 1000 / HZ)
            }
          }
          dataItem.stamp = stamp
          // if (!oldTimeObj[dataItem.type]) {
          oldTimeObj[dataItem.type] = dataItem.stamp
          // } else {

          // }

          if (!dataItem.arrList) {
            dataItem.arrList = []
          } else {
            if (dataItem.arrList.length < 3) {
              dataItem.arrList.push(pointArr)
            } else {
              dataItem.arrList.shift()
              dataItem.arrList.push(pointArr)
            }

            // dataItem.cop = await callPy('cal_cop_fromData', { data_array: dataItem.arrList })
            // console.log(dataItem.arrList, pointArr.length, dataItem.cop)
          }

        } else if (pointArr.length == CAR_ADAPTIVE_SERIAL_FRAME_LENGTH) {

          const frame = parseCarAdaptiveSerialFrame(pointArr)
          if (!frame) {
            console.warn('[car-adaptive] ignored invalid 145-byte frame')
            return
          }

          const { sensorId, sensorData } = frame
          const stamp = new Date().getTime()
          const sensorState = updateCarAdaptiveSensorFrame(sensorId, sensorData, stamp, path)
          dataItem.stamp = stamp
          dataItem.type = 'carAir'
          dataItem.sensorId = sensorId
          // if (!dataItem.premission) {
          //   dataItem.status = 'expired'
          // } else {
          dataItem.arr = sensorData
          // }




          // console.log(444)

          if (sendDataLength < 1) {
            sendDataLength++
          }
          const sensorTimeKey = `${dataItem.type}:${sensorId}`
          if (oldTimeObj[sensorTimeKey]) {
            dataItem.HZ = sensorState.HZ
            if (!MaxHZ && sendDataLength == 1) {
              MaxHZ = dataItem.HZ
              HZ = MaxHZ
              playtimer = setInterval(() => {
                colAndSendData()
              }, 87)
              sendDataLength = 0
            }
          }

          oldTimeObj[sensorTimeKey] = dataItem.stamp
          // 暂停模式只停算法，上面的串口采集、压力数据和 HZ 统计照常进行
          if (isCarAdaptiveAlgorithmRunning(getCarAdaptiveControlModeState(sensorId))) {
            try {
              const result = await callPy('server', {
                sensor_data: sensorData,
                sensor_id: sensorId
              })
              updateCarAdaptiveAlgorithmResult(sensorId, result)
            } catch (err) {
              console.error(`[car-adaptive] sensor ${sensorId} algorithm failed:`, err.message)
            }
          }
          // console.log(algorData?.frame_count)

        }

        // else if (pointArr.length == 51) {
        //   // 收到ecu发送数据
        //   console.log('pointArr', pointArr)
        //   console.log('buffer', buffer)
        //   if (pointArr[50] == 1) {

        //     // 手动模式
        //     if (pointArr[49] == 1) {

        //       controlMode = HANDLE

        //       let max = 24, controlArr = []
        //       for (let i = 0; i < max; i++) {
        //         controlArr.push(pointArr[2 * i + 2])
        //       }


        //       server.clients.forEach(function each(client) {
        //         if (port?.isOpen) {

        //           if (client.readyState === WebSocket.OPEN) {
        //             client.send(JSON.stringify({ handle: controlArr }));
        //           }
        //         }
        //       });

        //     }
        //     // 自动模式
        //     else {



        //       controlMode = ALGOR

        //       if (oldControlMode == HANDLE && controlMode == ALGOR) {
        //         await callPy('resetMessage')
        //       }

        //       let max = 24, controlArr = []
        //       for (let i = 0; i < max; i++) {
        //         controlArr.push(pointArr[2 * i + 2])
        //       }


        //       server.clients.forEach(function each(client) {
        //         if (port?.isOpen) {

        //           if (client.readyState === WebSocket.OPEN) {
        //             client.send(JSON.stringify({ algorFeed: controlArr }));
        //           }
        //         }
        //       });
        //     }

        //     oldControlMode = controlMode
        //   }
        // }


        else if (![18, 1024, 130].includes(pointArr.length)) {
          // 未被业务分支处理的帧。ECU 回传的气囊状态帧会落在这里（预期 51 字节），
          // 记录下来供 /carAdaptive/feedbackDiagnostics 确认回传是否存在及其实际布局。
          recordSerialFrameDiagnostics(path, pointArr)
        }
      })
    }

  }

  return ports
}

// 关闭正在连接的串口
async function stopPort() {
  // let ports = await SerialPort.list()

  // 关闭串口
  const portArr = Object.keys(parserArr).map((path) => {
    return parserArr[path].port
  })


  // 关闭串口,并且清除本地缓存数据
  portArr.forEach((port, index) => {
    if (port?.isOpen) {
      port.close((err) => {
        if (!err) {
          // linkIngPort.splice(index, 1)
          const path = Object.keys(parserArr)[index];
          // parserArr[path] = null;
          delete parserArr[path]
          delete dataMap[path]
          console.log(parserArr, 'delte')
        }
      });
    }
  })

  // 清除发送数据定时器
  clearInterval(playtimer)

  // 将hz清除掉
  MaxHZ = undefined
}

function colAndSendData() {
  if (!historyFlag && Object.keys(parserArr).length) {
    const obj = sendData()
    // selectArr
    if (selectArr && Object.keys(selectArr).length) {
      for (let i = 0; i < Object.keys(selectArr).length; i++) {
        const key = Object.keys(selectArr)[i]
        obj[key].select = selectArr[key]
      }
    }

    if (colFlag) {
      storageData(createCarAdaptiveCollectionData(obj, colSensorId))
    }
  }

  // else {
  //   if (historyPlayFlag) {
  //     console.log(historyDbArr[playIndex])
  //     socketSendData(server, JSON.stringify({
  //       sitData: JSON.parse(historyDbArr[playIndex].data),
  //       index: playIndex,
  //       timestamp: JSON.parse(historyDbArr[playIndex].timestamp)
  //     }))
  //     if (playIndex < historyDbArr.length - 1) {
  //       playIndex++
  //     } else {
  //       historyPlayFlag = false
  //     }
  //   }
  // }
}


// if (file == 'sit') {
//   if(playtimer){
//     clearInterval(playtimer)
//   }
//   playtimer = setInterval(() => {
//     colAndSendData()
//   }, 80)
// }


// setInterval(async () => {
//   // console.log(dataMap)
//   const keyArr = Object.keys(dataMap)
//   const equipArr = {}
//   for (let i = 0; i < keyArr.length; i++) {
//     const key = keyArr[i]
//     // console.log(key)
//     // equipArr.push(dataMap[key].type)
//     equipArr[dataMap[key].type] = key
//   }

//   if (Object.keys(equipArr).includes('bed')) {
//     const dataObj = dataMap[equipArr['bed']]

//     // console.log(dataObj.arr, )
//     if (dataObj.arr) {


//       // const data = await callPy('getData', { data: dataObj.arr })
//       // if (data.rate != -1) {
//       //   dataMap[equipArr['bed']].breatheData = data
//       // }


//     }
//     // console.log(dataMap)
//   }
// }, 125);


/**
 * 发送数据给前端
 */
function sendData() {
  let obj
  if (baudRate == 921600) {
    // 将采集到的串口数据转化成前端需要的数据
    obj = parseData(parserArr, JSON.parse(JSON.stringify({ ...dataMap })))

    // 如果机器人所有type都不包含这个type  便删除这个type
    for (let i = 0; i < Object.keys(obj).length; i++) {
      const key = Object.keys(obj)[i]
      if (!Object.values(constantObj.type).includes(key)) {
        delete obj[key]
      }
    }
    // 如果obj里面包含  机器人type 发送数据
    if (Object.keys(obj).filter((a) => Object.values(constantObj.type).includes(a)).length) {
      socketSendData(server, JSON.stringify({ data: obj }))
    }
  } else {
    // 如果串口发送数据
    const arr = []

    broadcastCarAdaptiveSensorSnapshots()
    obj = parseData(parserArr, createCarAdaptiveDisplayDataMap(), 'highHZ')
    for (let i = 0; i < 4096; i++) {
      arr.push(Math.floor(Math.random() * 100))
    }

    // const dataMap = {
    //   com3: {
    //     data: arr
    //   }
    // }
    socketSendData(server, JSON.stringify({ sitData: obj }))
  }
  return obj
}

/**
 * 将收到的
 */
function storageData(data) {
  const timestamp = Date.now(); // 获取当前时间的时间戳
  // const date = saveTime;


  // const newData = Object.keys(data)
  const newData = { ...data }
  for (let i = 0; i < Object.keys(data).length; i++) {
    const key = Object.keys(data)[i]
    if (newData[key].status) delete newData[key].status
  }

  const insertQuery =
    "INSERT INTO matrix (data, timestamp,date ,`select`) VALUES (?, ?,? ,?)";

  currentDb.run(
    insertQuery,
    [JSON.stringify(newData), timestamp, colName, JSON.stringify(selectArr)],
    function (err) {
      if (err) {
        console.error(err);
        return;
      }
      colFrameCount++
      console.log(`Event inserted with ID ${this.lastID}`);
    }
  );
}

// 做一个定时器任务  监听是否存在意外情况串口断开连接 然后重新连接 
setInterval(() => {
  if (Object.keys(parserArr).length) {
    Object.keys(parserArr).map((path) => {
      // parserArr[path].port
      if (parserArr[path] && !parserArr[path].port.isOpen) {
        parserArr[path].port = new SerialPort(
          {
            path: path,
            baudRate: baudRate,
            autoOpen: true,
          },
          function (err) {
            console.log(err, "err");
          }
        );
        //管道添加解析器
        parserArr[path].port.pipe(parserArr[path].parser);
      }
    })

  }

}, 3000)


setInterval(async () => {
  // 每路独立判断 auto/manual/paused，只自动写入处于 auto 的通道。
  writeAllCarAdaptiveCommands()

  socketSendData(server, JSON.stringify({ carAdaptiveSensors: getCarAdaptiveSensorsStatus() }))
  broadcastCarAdaptiveSensorSnapshots()
  const displayState = getCarAdaptiveSensorState(selectedCarAdaptiveSensorId)
  const displayAlgorithmData = displayState.algorData
  const displayAirbagFeedback = getCarAdaptiveAirbagFeedback(selectedCarAdaptiveSensorId)
  const portArr = Object.keys(parserArr).map((path) => {
    return parserArr[path].port
  })


  // 关闭串口,并且清除本地缓存数据
  portArr.forEach((port, index) => {
    // console.log(port.isOpen)
    if (port?.isOpen) {
      server.clients.forEach(function each(client) {
        if (port?.isOpen) {

          // 兼容单路推送：气囊反馈来自 ECU 回传，代表硬件实际状态。
          // 实际写串口由 writeAllCarAdaptiveCommands 按通道排队完成，不在这里发送。
          if (displayAirbagFeedback.length) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ algorFeed: displayAirbagFeedback }));
            }
          }


          // const arr = [170, 85, 3, 153];




          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ algorData: displayAlgorithmData }));
          }
        }
      });
    }
  })


}, CAR_ADAPTIVE_COMMAND_INTERVAL)


// setInterval(async () => {
//   console.log('first', 111)
//   const pointArr = new Array(144).fill(50)
//   algorData = await callPy('server', { sensor_data: pointArr })
//   // console.log('frame_count:' , algorData?.frame_count)
// }, 2)
