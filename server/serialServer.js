

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
const multer = require('multer')


console.log('userData from env:', typeof process.env.isPackaged);

let { isPackaged, appPath } = process.env
isPackaged = isPackaged == 'true'
const app = express()
const userDataDir =
  typeof process.env.userData === 'string' && process.env.userData.trim()
    ? process.env.userData.trim()
    : null
const resourcesBase =
  process.env.resourcesPath ||
  process.resourcesPath ||
  (appPath ? path.dirname(appPath) : __dirname)
const storageBase = isPackaged ? (userDataDir || resourcesBase) : path.join(__dirname, '..')

let pdfDir = path.join(storageBase, 'OneStep')
let uploadDir = path.join(storageBase, 'img')
if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true })
}
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '')
    const tempName = `${Date.now()}-${Math.floor(Math.random() * 1e9)}${ext}`
    cb(null, tempName)
  },
})
const upload = multer({ storage })

function sanitizeFilename(name) {
  if (typeof name !== 'string') return ''
  let safe = name.trim()
  // disallow path traversal
  safe = safe.replace(/[\\/]/g, '')
  // remove control chars and Windows reserved chars: <>:"/\\|?*
  safe = safe.replace(/[\x00-\x1F<>:"|?*]/g, '')
  // trim trailing dots/spaces (Windows)
  safe = safe.replace(/[.\s]+$/g, '')
  return safe
}

function buildReportBaseName({ assessmentId, name, sampleType, fallback }) {
  const idStr = assessmentId ? String(assessmentId) : ''
  const nameStr = name ? String(decodeField(name)).trim() : ''
  const sampleDigits = sampleType ? String(sampleType).replace(/\D/g, '') : ''
  const parts = []
  if (idStr) parts.push(idStr)
  if (nameStr) parts.push(nameStr)
  if (sampleDigits) parts.push(sampleDigits)
  let raw = parts.join('_')
  // if (sampleDigits === '4') raw += 'OneStepReport'
  if (!raw) raw = fallback ? String(fallback) : ''
  const safe = sanitizeFilename(raw)
  return safe || sanitizeFilename(String(fallback || 'report')) || 'report'
}

function pickName(dbName, reqName) {
  const a = decodeField(dbName)
  const b = decodeField(reqName)
  const aStr = typeof a === 'string' ? a.trim() : ''
  const bStr = typeof b === 'string' ? b.trim() : ''
  return aStr || bStr || ''
}

function fixMojibake(value) {
  if (typeof value !== 'string') return value
  if (/[\u3400-\u9FFF]/.test(value)) return value
  try {
    const buf = Buffer.from(value, 'latin1')
    const utf = buf.toString('utf8')
    // If the roundtrip matches, it's likely latin1-decoded UTF-8 and should be fixed
    if (Buffer.from(utf, 'utf8').equals(buf)) {
      return utf
    }
  } catch { }
  return value
}

function decodeMaybeUri(value) {
  if (typeof value !== 'string') return value
  let result = value
  for (let i = 0; i < 2; i++) {
    try {
      const decoded = decodeURIComponent(result)
      if (decoded === result) break
      result = decoded
    } catch {
      break
    }
  }
  return result
}

function decodeField(value) {
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8')
  }
  if (typeof value !== 'string') return value
  return decodeMaybeUri(fixMojibake(value))
}

function normalizeAssessmentId(value) {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str ? str : null
}

async function resolveAssessmentContext(db, req, rawTimestamp) {
  let assessmentId = normalizeAssessmentId(
    req?.body?.assessmentId ?? req?.query?.assessmentId
  )
  const tsNum = Number(rawTimestamp)
  let matchedDate = null
  let matchedTimestamp = null

  const pickRow = async (sql, params) =>
    new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) return reject(err)
        resolve(row || null)
      })
    })

  if (Number.isFinite(tsNum)) {
    let row = await pickRow(
      "select date, timestamp, assessment_id from matrix WHERE timestamp = ?",
      [tsNum]
    )
    if (!row) {
      row = await pickRow(
        "select date, timestamp, assessment_id from matrix ORDER BY ABS(timestamp - ?) ASC LIMIT 1",
        [tsNum]
      )
    }
    if (row) {
      matchedDate = row.date || null
      matchedTimestamp = row.timestamp || null
      if (!assessmentId) assessmentId = normalizeAssessmentId(row.assessment_id)
    }
  } else if (rawTimestamp) {
    const row = await pickRow(
      "select date, timestamp, assessment_id from matrix WHERE date = ? ORDER BY timestamp DESC LIMIT 1",
      [String(rawTimestamp)]
    )
    if (row) {
      matchedDate = row.date || null
      matchedTimestamp = row.timestamp || null
      if (!assessmentId) assessmentId = normalizeAssessmentId(row.assessment_id)
    }
  }

  return { assessmentId, matchedDate, matchedTimestamp, tsNum }
}

function flipFoot64x64Horizontal(arr) {
  if (!Array.isArray(arr) || arr.length !== 4096) return arr
  const size = 64
  const out = new Array(arr.length)
  for (let r = 0; r < size; r++) {
    const rowStart = r * size
    for (let c = 0; c < size; c++) {
      out[rowStart + c] = arr[rowStart + (size - 1 - c)]
    }
  }
  return out
}

function zeroBelowThreshold(arr, threshold) {
  if (!Array.isArray(arr)) return arr
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < threshold) arr[i] = 0
  }
  return arr
}

function removeSmallIslands64x64(arr, minSize = 9) {
  if (!Array.isArray(arr) || arr.length !== 4096) return arr
  const size = 64
  const visited = new Array(arr.length).fill(false)
  const dirs = [-1, 0, 1]
  for (let idx = 0; idx < arr.length; idx++) {
    if (visited[idx] || arr[idx] <= 0) continue
    const stack = [idx]
    const component = []
    visited[idx] = true
    while (stack.length) {
      const cur = stack.pop()
      component.push(cur)
      const r = Math.floor(cur / size)
      const c = cur - r * size
      for (let dr of dirs) {
        const nr = r + dr
        if (nr < 0 || nr >= size) continue
        for (let dc of dirs) {
          const nc = c + dc
          if (nc < 0 || nc >= size) continue
          if (dr === 0 && dc === 0) continue
          const ni = nr * size + nc
          if (!visited[ni] && arr[ni] > 0) {
            visited[ni] = true
            stack.push(ni)
          }
        }
      }
    }
    if (component.length < minSize) {
      for (let i = 0; i < component.length; i++) {
        arr[component[i]] = 0
      }
    }
  }
  return arr
}


function parseSerialTypeMap(raw) {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw !== 'string') return {}
  let text = raw.trim()
  if (!text) return {}

  if (text.includes('"key"') && text.includes('"orgName"')) {
    const keyIdx = text.indexOf('"key"')
    if (keyIdx !== -1) {
      const afterKey = text.slice(keyIdx)
      const colonIdx = afterKey.indexOf(':')
      if (colonIdx !== -1) {
        let rest = afterKey.slice(colonIdx + 1)
        const orgIdx = rest.indexOf('"orgName"')
        if (orgIdx !== -1) rest = rest.slice(0, orgIdx)
        rest = rest.replace(/^[\s,]+/, '').replace(/[\s,]+$/, '')
        if (
          (rest.startsWith('"') && rest.endsWith('"')) ||
          (rest.startsWith("'") && rest.endsWith("'"))
        ) {
          rest = rest.slice(1, -1)
        }
        text = rest.trim()
      }
    }
  }

  const tryParse = (value) => {
    try {
      const obj = JSON.parse(value)
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj
    } catch { }
    return null
  }

  let obj = tryParse(text)
  if (obj) return obj

  const normalized = text.replace(/'/g, '"')
  obj = tryParse(normalized)
  if (obj) return obj

  const map = {}
  normalized.split(/[,;\n]+/).forEach((part) => {
    const m = part.match(/^\s*"?([^":=]+)"?\s*[:=]\s*"?([^"]+)"?\s*$/)
    if (m) {
      map[m[1].trim()] = m[2].trim()
    }
  })
  return map
}

function getTypeFromSerialCache(uniqueId) {
  if (!uniqueId) return null
  const cache = readSerialCache()
  const map = parseSerialTypeMap(cache && cache.key)
  const target = String(uniqueId).trim().toUpperCase()
  for (const key of Object.keys(map || {})) {
    if (String(key).trim().toUpperCase() === target) {
      return map[key]
    }
  }
  return null
}

function normalizeActiveTypes(value) {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) {
    const list = value.map((v) => String(v).trim()).filter(Boolean)
    return list.length ? list : null
  }
  if (typeof value === 'string') {
    const list = value
      .split(/[,;\s]+/)
      .map((v) => v.trim())
      .filter(Boolean)
    return list.length ? list : null
  }
  return null
}

function filterDataByTypes(data, types) {
  if (!types || !Array.isArray(types) || !types.length) return data
  if (!data || typeof data !== 'object') return data
  const out = {}
  types.forEach((type) => {
    if (data[type]) out[type] = data[type]
  })
  return out
}


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

// serial.txt cache
const serialPath = (() => {
  if (isPackaged) {
    const base = appPath ? path.dirname(appPath) : (process.resourcesPath || __dirname)
    return path.join(base, 'serial.txt')
  }
  return path.join(__dirname, '../serial.txt')
})()

function readSerialCache() {
  try {
    if (!fs.existsSync(serialPath)) return null
    const raw = fs.readFileSync(serialPath, 'utf-8').trim()
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return { key: raw }
    }
  } catch {
    return null
  }
}

function writeSerialCache(payload) {
  const data = {
    key: payload.key || '',
    orgName: payload.orgName || '',
    updatedAt: new Date().toISOString(),
  }
  fs.writeFileSync(serialPath, JSON.stringify(data, null, 2), 'utf-8')
  return data
}


let dbPath = path.join(__dirname, '../db')
let pdfPath = path.join(__dirname, "../OneStep");
let imgPath = path.join(__dirname, '../img')

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
    pdfPath = 'resources' + "/OneStep";
    imgPath = 'resources' + '/img'
    nameTxt = 'resources' + "/config.txt";

    console.log(dbPath, path.join(appPath, 'Resources/db',))
  }

}

const port = 19245

function resolveConfigPath() {
  const candidates = [
    path.join(dbPath, 'config.txt'),
    path.join(__dirname, '../config.txt'),
    path.join(process.cwd(), 'config.txt'),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {}
  }
  return candidates[0]
}

const configPath = resolveConfigPath()
const config = fs.readFileSync(configPath, 'utf-8',)
const result = JSON.parse(decryptStr(config))
console.log(result)
// 当前的软件系统 , 当前的波特率
var file = result.value, baudRate = 1000000, parserArr = {}, dataMap = {},
  // 发送HZ , 串口最大hz, 采集开关 , 采集命名 , 历史数据开关 , 历史播放开关 , 数据播放索引 , 回放定时器 , 保存数据最大HZ
  HZ = 30, MaxHZ, colFlag = false, colName, historyFlag = false, historyPlayFlag = false, playIndex = 0, colTimer, colMaxHZ, colplayHZ, playtimer
let splitBuffer = Buffer.from(splitArr);
let linkIngPort = [], currentDb, macInfo = {}, selectArr = []
let activeSendTypes = null
let activeAssessmentId = null
let activeSampleType = null
let currentSendIntervalMs = null
const DEFAULT_SEND_MS = 80
const MIN_SEND_INTERVAL_MS = 5
const HZ_CACHE_UPDATE_MS = 500
const MODE_TYPE_MAP = {
  1: ['HL'],
  2: ['HR'],
  3: ['sit', 'foot1'],
  4: ['foot1'],
  5: ['foot1', 'foot2', 'foot3', 'foot4'],
}
let sensorHzCache = {}
let sensorHzLocked = false
let sensorTypeSignature = ''
let lastHzCacheUpdateTs = 0

function getConnectedTypes() {
  const types = new Set()
  Object.keys(dataMap).forEach((key) => {
    const item = dataMap[key]
    const parser = parserArr[key]
    if (!item || !item.type) return
    if (!parser || !parser.port || !parser.port.isOpen) return
    if (item.premission === false) return
    types.add(item.type)
  })
  return Array.from(types).sort()
}

function updateSensorTypeSignature() {
  const types = getConnectedTypes()
  const signature = types.join('|')
  if (signature !== sensorTypeSignature) {
    sensorTypeSignature = signature
    sensorHzLocked = false
    sensorHzCache = {}
    lastHzCacheUpdateTs = 0
  }
  return types
}

function getTypeHz(type) {
  let hz = null
  Object.keys(dataMap).forEach((key) => {
    const item = dataMap[key]
    const parser = parserArr[key]
    if (!item || item.type !== type) return
    if (!parser || !parser.port || !parser.port.isOpen) return
    const ms = Number(item.HZ)
    if (!Number.isFinite(ms) || ms <= 0) return
    if (hz === null || ms < hz) hz = ms
  })
  return hz
}

function maybeLockSensorHz() {
  const now = Date.now()
  if (now - lastHzCacheUpdateTs < HZ_CACHE_UPDATE_MS) return
  const types = updateSensorTypeSignature()
  if (!types.length) return
  const next = {}
  for (let i = 0; i < types.length; i++) {
    const type = types[i]
    const hz = getTypeHz(type)
    if (!hz) return
    next[type] = Math.max(MIN_SEND_INTERVAL_MS, hz)
  }
  const changed = Object.keys(next).some((key) => next[key] !== sensorHzCache[key])
  if (changed || !sensorHzLocked) {
    sensorHzCache = next
    sensorHzLocked = true
    // console.log('[hz] locked', sensorHzCache)
  }
  lastHzCacheUpdateTs = now
}

function resetSensorHzCache() {
  sensorHzCache = {}
  sensorHzLocked = false
  sensorTypeSignature = ''
  lastHzCacheUpdateTs = 0
}
const ALGOR = 'algor', HANDLE = 'handle'
var algorData, control_command, controlMode = ALGOR, oldControlMode = '', feedbackAirIndex = [1, 2, 3, 4, 5, 6, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]
let lastRealtimeLogTs = 0
let colPersonName = ''
// 选择数据库数据
let historyDbArr;
let lastFootPointArr = [], pdfArrData = [], pdfReportName = '', pdfReport = '', pdfReportSex = ''
let pdfReportMeta = { assessmentId: '', name: '', sampleType: '', fallback: '' }

function getActiveSendIntervalMs() {
  if (!activeSendTypes || !Array.isArray(activeSendTypes) || !activeSendTypes.length) return null
  updateSensorTypeSignature()
  if (sensorHzLocked && sensorHzCache && Object.keys(sensorHzCache).length) {
    let min = null
    for (let i = 0; i < activeSendTypes.length; i++) {
      const type = activeSendTypes[i]
      const ms = Number(sensorHzCache[type])
      if (!Number.isFinite(ms) || ms <= 0) continue
      if (min === null || ms < min) min = ms
    }
    if (min !== null) return min
  }
  let min = null
  Object.keys(dataMap).forEach((key) => {
    const item = dataMap[key]
    if (!item || !item.type || !activeSendTypes.includes(item.type)) return
    let ms = Number(item.HZ)
    if (!Number.isFinite(ms) || ms <= 0) return
    if (min === null || ms < min) min = ms
  })
  return min
}

function updateSendTimerForActiveTypes() {
  const interval = getActiveSendIntervalMs()
  if (!activeSendTypes || !Array.isArray(activeSendTypes) || !activeSendTypes.length) return
  const ms = Math.max(MIN_SEND_INTERVAL_MS, Math.floor(interval ?? DEFAULT_SEND_MS))
  if (currentSendIntervalMs === ms && playtimer) return
  if (playtimer) {
    clearInterval(playtimer)
  }
  // console.log('[hz] current interval', ms, 'activeTypes', activeSendTypes, 'cache', sensorHzCache)
  currentSendIntervalMs = ms
  playtimer = setInterval(() => {
    colAndSendData()
  }, ms)
}

function resetSendTimer() {
  if (playtimer) {
    clearInterval(playtimer)
  }
  playtimer = null
  currentSendIntervalMs = null
}

function setActiveSendTypes(types, sampleType = undefined) {
  activeSendTypes = types
  if (sampleType !== undefined) {
    activeSampleType = sampleType
  }
  resetSendTimer()
  if (activeSendTypes && activeSendTypes.length) {
    updateSendTimerForActiveTypes()
  }
}

function applyActiveMode(mode) {
  if (mode === null || mode === undefined || mode === '') {
    setActiveSendTypes(null, null)
    return { activeTypes: null, sampleType: null }
  }
  const modeNum = parseInt(mode, 10)
  const types = MODE_TYPE_MAP[modeNum]
  if (!types) return null
  setActiveSendTypes(types, String(modeNum))
  return { activeTypes: types, sampleType: String(modeNum) }
}

const BAUD_CANDIDATES = [921600, 1000000, 3000000]

function bufferContainsSequence(buffer, sequence) {
  if (!buffer || buffer.length < sequence.length) return false
  for (let i = 0; i <= buffer.length - sequence.length; i++) {
    let match = true
    for (let j = 0; j < sequence.length; j++) {
      if (buffer[i + j] !== sequence[j]) {
        match = false
        break
      }
    }
    if (match) return true
  }
  return false
}

async function detectBaudRate(path, timeoutMs = 800) {
  for (let i = 0; i < BAUD_CANDIDATES.length; i++) {
    const baudRate = BAUD_CANDIDATES[i]
    const ok = await new Promise((resolve) => {
      let cache = Buffer.alloc(0)
      let timer = null
      let port = null

      const cleanup = (result) => {
        if (timer) clearTimeout(timer)
        if (port) {
          port.off('data', onData)
          port.off('error', onError)
          if (port.isOpen) {
            port.close(() => resolve(result))
            return
          }
        }
        resolve(result)
      }

      const onData = (data) => {
        cache = Buffer.concat([cache, Buffer.from(data)])
        if (cache.length > 1024) {
          cache = cache.slice(-1024)
        }
        if (bufferContainsSequence(cache, splitArr)) {
          cleanup(true)
        }
      }

      const onError = () => cleanup(false)

      try {
        port = new SerialPort({ path, baudRate, autoOpen: true })
        port.on('data', onData)
        port.on('error', onError)
      } catch (e) {
        cleanup(false)
        return
      }

      timer = setTimeout(() => cleanup(false), timeoutMs)
    })

    if (ok) return baudRate
  }
  return null
}


//对比数据
let leftDbArr, rightDbArr;


const { db } = initDb(file, dbPath)
currentDb = db
ensureMatrixNameColumn(currentDb)

console.log(__dirname, dbPath, '__dirname')

app.get('/', (req, res) => {
  res.send('Hello World!')
})

// GET /OneStep/<filename> -> send pdf file
app.get('/OneStep/:name', (req, res) => {
  try {
    const rawName = req.params.name || ''
    const decodedName = decodeURIComponent(rawName)
    const safeName = decodedName.replace(/[\\/]/g, '')
    if (!safeName || safeName !== decodedName) {
      res.status(400).send('Invalid file name')
      return
    }
    const filePath = path.join(pdfDir, safeName)
    const resolvedPath = path.resolve(filePath)
    const resolvedBase = path.resolve(pdfDir) + path.sep
    if (!resolvedPath.startsWith(resolvedBase)) {
      res.status(403).send('Forbidden')
      return
    }
    const ext = path.extname(safeName).toLowerCase()
    let contentType = 'application/octet-stream'
    if (ext === '.pdf') contentType = 'application/pdf'
    else if (ext === '.mp4') contentType = 'video/mp4'
    else if (ext === '.json') contentType = 'application/json'
    else if (ext === '.png') contentType = 'image/png'
    res.setHeader('Content-Type', contentType)
    if (ext === '.pdf') {
      res.setHeader('Content-Disposition', 'inline')
    }
    res.sendFile(resolvedPath, (err) => {
      if (err) {
        res.status(err.statusCode || 404).send('Not Found')
      }
    })
  } catch (e) {
    res.status(500).send('Server Error')
  }
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

// serial.txt cache APIs
app.get('/serialCache', (req, res) => {
  const data = readSerialCache()
  if (data && data.key && data.orgName) {
    res.json(new HttpResult(0, { hasCache: true, ...data }, 'success'))
    return
  }
  res.json(new HttpResult(0, { hasCache: false }, 'empty'))
})

app.post('/serialCache', (req, res) => {
  try {
    const { key, orgName } = req.body || {}
    if (!key || !orgName) {
      res.json(new HttpResult(1, {}, 'missing key or orgName'))
      return
    }
    const saved = writeSerialCache({ key, orgName })
    res.json(new HttpResult(0, saved, 'success'))
  } catch (err) {
    res.json(new HttpResult(1, {}, 'save failed'))
  }
})

app.post('/uploadCanvas', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.json(new HttpResult(1, {}, 'missing file'));
      return
    }
    if (typeof req.body.filename === 'string') req.body.filename = decodeField(req.body.filename)
    if (typeof req.body.collectName === 'string') req.body.collectName = decodeField(req.body.collectName)
    if (typeof req.body.date === 'string') req.body.date = decodeField(req.body.date)
    console.log('[uploadCanvas]', {
      collectName: req.body.collectName,
      age: req.body.age,
      gender: req.body.gender,
    })
    const requestedDate =
      (typeof req.body.date === 'string' && req.body.date.trim()) ||
      (typeof req.query.date === 'string' && req.query.date.trim()) ||
      ''
    const sanitizedRequested = sanitizeFilename(requestedDate)
    const resolvedName = pickName(pdfReportMeta.name, req.body.collectName)
    const baseName = buildReportBaseName({
      assessmentId: pdfReportMeta.assessmentId || req.body.assessmentId,
      name: resolvedName,
      sampleType: pdfReportMeta.sampleType || req.body.sample_type || req.body.sampleType,
      fallback: sanitizedRequested || requestedDate
    })
    if (!baseName) {
      fs.unlinkSync(req.file.path)
      res.json(new HttpResult(1, {}, 'missing date'));
      return
    }
    const finalName = `${baseName}.png`
    const newPath = path.join(uploadDir, finalName)
    fs.renameSync(req.file.path, newPath)
    req.file.filename = finalName
    req.file.path = newPath
    req.file.destination = uploadDir
    const absolutePath = path.resolve(req.file.path)
    const name = `${pdfPath}/${baseName}`
    console.log(pdfArrData[0], name, `${imgPath}/${baseName}.png`)
    const pdf = await callPy('generate_foot_pressure_report', {
      data_array: pdfArrData,
      name: name,
      heatmap_png_path: `${imgPath}/${baseName}.png`,
      user_name: resolvedName,
      user_age: req.body.age,
      user_gender: req.body.gender,
      user_id: req.body.userId || 9527,
    })
    res.json(new HttpResult(0, { file: req.file, body: req.body, absolutePath }, 'success'));
  } catch {
    res.json(new HttpResult(1, {}, 'upload failed'));
  }
})

app.post('/getHandPdf' , async (req , res) => {
  try {
    const rawTimestamp =
      req.body?.timestamp ??
      req.body?.time ??
      req.body?.date ??
      req.query?.timestamp ??
      req.query?.time ??
      req.query?.date ??
      ''

    const { assessmentId, matchedDate, matchedTimestamp, tsNum } =
      await resolveAssessmentContext(currentDb, req, rawTimestamp)

    if (!assessmentId) {
      res.json(new HttpResult(1, {}, 'missing assessment_id'))
      return
    }

    const { dataArr, rows } = await dbGetData({
      db: currentDb,
      params: [assessmentId],
      byAssessmentId: true
    })

    if (!rows || !rows.length) {
      res.json(new HttpResult(1, {}, 'no data for assessment_id'))
      return
    }

    const targetTs = Number(matchedTimestamp ?? tsNum)
    const bestRow = Array.isArray(rows) && rows.length
      ? rows.reduce((best, row) => {
          const t = Number(row?.timestamp)
          if (!Number.isFinite(t)) return best
          if (!best) return row
          const bestT = Number(best?.timestamp)
          if (!Number.isFinite(bestT)) return row
          return Math.abs(t - targetTs) < Math.abs(bestT - targetTs) ? row : best
        }, null)
      : null
    const keys = Object.keys(dataArr || {})
    const leftKey = keys.find((k) => k === 'HL' || /left|lhand|handl|左/i.test(k))
    const rightKey = keys.find((k) => k === 'HR' || /right|rhand|handr|右/i.test(k))

    const leftArr = leftKey ? dataArr[leftKey] : null
    const rightArr = rightKey ? dataArr[rightKey] : null

    if (!leftArr && !rightArr) {
      res.json(new HttpResult(1, { keys }, 'no hand data'))
      return
    }

    const safeDate =
      sanitizeFilename(String(matchedDate || bestRow?.date || rawTimestamp || Date.now())) ||
      String(Date.now())
    const resolvedName = pickName(
      bestRow ? bestRow.name : '',
      req.body?.collectName || req.body?.userName || ''
    )
    const baseName = buildReportBaseName({
      assessmentId: bestRow ? bestRow.assessment_id : '',
      name: resolvedName,
      sampleType: '',
      fallback: safeDate
    })
    const basePath = path.join(pdfPath, baseName)

    const userName = resolvedName || ''
    const userAge = req.body?.age ?? req.body?.userAge ?? ''
    const userGender = req.body?.gender ?? req.body?.userGender ?? ''
    const userId = req.body?.userId ?? 9527

    const leftResult = leftArr
      ? await callPy('process_glove_data_from_array', {
          sensor_array: leftArr,
          hand_type: '左手',
          name: `${basePath}_1`,
          user_name: userName,
          user_age: userAge,
          user_gender: userGender,
          user_id: userId,
        })
      : null

    const rightResult = rightArr
      ? await callPy('process_glove_data_from_array', {
          sensor_array: rightArr,
          hand_type: '右手',
          name: `${basePath}_2`,
          user_name: userName,
          user_age: userAge,
          user_gender: userGender,
          user_id: userId,
        })
      : null


    try {
      const formatTimestamp = (ts) => {
        const d = new Date(Number(ts))
        const pad = (n, len = 2) => String(n).padStart(len, '0')
        return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}:${pad(d.getMilliseconds(), 3)}`
      }
      const sortedRows = Array.isArray(rows)
        ? rows.slice().sort((a, b) => Number(a?.timestamp || 0) - Number(b?.timestamp || 0))
        : []
      const leftSeq = []
      const leftTimes = []
      const rightSeq = []
      const rightTimes = []
      sortedRows.forEach((row) => {
        let dataObj = {}
        try {
          dataObj = JSON.parse(row.data || '{}')
        } catch {}
        const ts = formatTimestamp(row.timestamp)
        if (leftKey) {
          const v = dataObj[leftKey]?.arr || dataObj[leftKey]
          if (Array.isArray(v)) {
            leftSeq.push(v)
            leftTimes.push(ts)
          }
        }
        if (rightKey) {
          const v = dataObj[rightKey]?.arr || dataObj[rightKey]
          if (Array.isArray(v)) {
            rightSeq.push(v)
            rightTimes.push(ts)
          }
        }
      })

      if (leftSeq.length && leftTimes.length) {
        await callPy('generate_glove_video', {
          data_seq: leftSeq,
          time_seq: leftTimes,
          output_file: `${basePath}_1_glove.mp4`
        })
      }
      if (rightSeq.length && rightTimes.length) {
        await callPy('generate_glove_video', {
          data_seq: rightSeq,
          time_seq: rightTimes,
          output_file: `${basePath}_2_glove.mp4`
        })
      }
    } catch (e) {
      console.error('generate_glove_video failed:', e)
    }
    res.json(
      new HttpResult(
        0,
        {
          date: matchedDate || bestRow?.date || rawTimestamp,
          timestamp: matchedTimestamp ?? tsNum,
          left: leftResult,
          right: rightResult,
        },
        'success'
      )
    )
  } catch (e) {
    console.error(e)
    res.json(new HttpResult(1, {}, 'getHandPdf failed'))
  }
})

app.post('/getSitAndFootPdf', async (req, res) => {
  try {
    const rawTimestamp =
      req.body?.timestamp ??
      req.body?.time ??
      req.body?.date ??
      req.query?.timestamp ??
      req.query?.time ??
      req.query?.date ??
      ''

    const { assessmentId, matchedDate, matchedTimestamp, tsNum } =
      await resolveAssessmentContext(currentDb, req, rawTimestamp)

    if (!assessmentId) {
      res.json(new HttpResult(1, {}, 'missing assessment_id'))
      return
    }

    const sampleType = '3'
    const rows = await new Promise((resolve, reject) => {
      currentDb.all(
        "select * from matrix WHERE assessment_id=? AND sample_type=?",
        [assessmentId, sampleType],
        (err, data) => {
          if (err) return reject(err)
          resolve(data || [])
        }
      )
    })

    console.log(rows)

    if (!rows || !rows.length) {
      res.json(new HttpResult(1, {}, 'no data for assessment_id'))
      return
    }

    const targetTs = Number(matchedTimestamp ?? tsNum)
    const bestRow = rows.reduce((best, row) => {
      const t = Number(row?.timestamp)
      if (!Number.isFinite(t)) return best
      if (!best) return row
      const bestT = Number(best?.timestamp)
      if (!Number.isFinite(bestT)) return row
      return Math.abs(t - targetTs) < Math.abs(bestT - targetTs) ? row : best
    }, null)

    const firstObj = (() => {
      try {
        return JSON.parse(rows[0].data || '{}')
      } catch {
        return {}
      }
    })()
    const keys = Object.keys(firstObj || {})

    const pickKey = (list, regexes) => {
      for (const k of list) {
        if (keys.includes(k)) return k
      }
      for (const re of regexes) {
        const found = keys.find((k) => re.test(k))
        if (found) return found
      }
      return null
    }

    const sitKey = pickKey(
      ['sit'],
      [/sit/i]
    )
    const standKey = pickKey(
      ['foot1'],
      [/foot1/i, /foot/i, /stand/i, /back/i]
    )

    const formatTimestamp = (ts) => {
      const d = new Date(ts)
      const pad = (n, len = 2) => String(n).padStart(len, '0')
      return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}:${pad(d.getMilliseconds(), 3)}`
    }

    const standData = []
    const standTimes = []
    const sitData = []
    const sitTimes = []

    rows.forEach((row) => {
      let dataObj = {}
      try {
        dataObj = JSON.parse(row.data || '{}')
      } catch {}
      if (standKey && dataObj[standKey]) {
        const d = dataObj[standKey]
        const arr = Array.isArray(d) ? d : d.arr
        if (Array.isArray(arr)) {
          standData.push(arr)
          standTimes.push(formatTimestamp(row.timestamp))
        }
      }
      if (sitKey && dataObj[sitKey]) {
        const d = dataObj[sitKey]
        const arr = Array.isArray(d) ? d : d.arr
        if (Array.isArray(arr)) {
          sitData.push(arr)
          sitTimes.push(formatTimestamp(row.timestamp))
        }
      }
    })

    if (!standData.length || !sitData.length) {
      res.json(new HttpResult(1, { keys }, 'missing stand or sit data'))
      return
    }

    const safeDate =
      sanitizeFilename(String(matchedDate || bestRow?.date || rawTimestamp || Date.now())) ||
      String(Date.now())
    const resolvedName = pickName(
      bestRow ? bestRow.name : '',
      req.body?.collectName || req.body?.userName || ''
    )
    const baseName = buildReportBaseName({
      assessmentId: bestRow ? bestRow.assessment_id : '',
      name: resolvedName,
      sampleType: sampleType,
      fallback: safeDate
    })
    const pdfName = `${baseName}.pdf`

    console.log('[getSitAndFootPdf] frame lengths:', {
      standFrames: standData.length,
      sitFrames: sitData.length,
      standFrameSize: Array.isArray(standData[0]) ? standData[0].length : null,
      sitFrameSize: Array.isArray(sitData[0]) ? sitData[0].length : null,
      standTimes: standTimes.length,
      sitTimes: sitTimes.length
    })

    const pdfResult = await callPy('process_and_generate_report', {
      stand_data_seq: standData,
      stand_time_seq: standTimes,
      sit_data_seq: sitData,
      sit_time_seq: sitTimes,
      output_dir: pdfPath,
      pdf_name: pdfName
    })

    try {
      const videoName = `${baseName}_combined_dashboard.mp4`
      await callPy('generate_combined_dashboard', {
        d_stand: standData,
        t_stand: standTimes,
        d_sit: sitData,
        t_sit: sitTimes,
        output_filename: path.join(pdfPath, videoName)
      })
    } catch (e) {
      console.error('generate_combined_dashboard failed:', e)
    }

    res.json(
      new HttpResult(
        0,
        {
          date: matchedDate || bestRow?.date || rawTimestamp,
          timestamp: matchedTimestamp ?? tsNum,
          pdf_name: pdfName,
          result: pdfResult
        },
        'success'
      )
    )
  } catch (e) {
    console.error(e)
    res.json(new HttpResult(1, {}, 'getSitAndFootPdf failed'))
  }
})

app.post('/getFootPdf', async (req, res) => {
  try {
    const rawTimestamp =
      req.body?.timestamp ??
      req.body?.time ??
      req.body?.date ??
      req.query?.timestamp ??
      req.query?.time ??
      req.query?.date ??
      ''

    const { assessmentId, matchedDate, matchedTimestamp, tsNum } =
      await resolveAssessmentContext(currentDb, req, rawTimestamp)

    if (!assessmentId) {
      res.json(new HttpResult(1, {}, 'missing assessment_id'))
      return
    }

    const sampleTypeRaw = '5'
    const rows = await new Promise((resolve, reject) => {
      currentDb.all(
        "select * from matrix WHERE assessment_id=? AND sample_type=?",
        [assessmentId, sampleTypeRaw],
        (err, data) => {
          if (err) return reject(err)
          resolve(data || [])
        }
      )
    })

    if (!rows || !rows.length) {
      res.json(new HttpResult(1, {}, 'no data for assessment_id'))
      return
    }

    const targetTs = Number(matchedTimestamp ?? tsNum)
    const bestRow = rows.reduce((best, row) => {
      const t = Number(row?.timestamp)
      if (!Number.isFinite(t)) return best
      if (!best) return row
      const bestT = Number(best?.timestamp)
      if (!Number.isFinite(bestT)) return row
      return Math.abs(t - targetTs) < Math.abs(bestT - targetTs) ? row : best
    }, null)

    const formatTimestamp = (ts) => {
      const d = new Date(ts)
      const pad = (n, len = 2) => String(n).padStart(len, '0')
      return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}:${pad(d.getMilliseconds(), 3)}`
    }

    const data1 = []
    const data2 = []
    const data3 = []
    const data4 = []
    const t1 = []
    const t2 = []
    const t3 = []
    const t4 = []

    const requiredKeys = ['foot1', 'foot2', 'foot3', 'foot4']
    rows.forEach((row) => {
      let dataObj = {}
      try {
        dataObj = JSON.parse(row.data || '{}')
      } catch {}
      const v1 = dataObj.foot1?.arr || dataObj.foot1
      const v2 = dataObj.foot2?.arr || dataObj.foot2
      const v3 = dataObj.foot3?.arr || dataObj.foot3
      const v4 = dataObj.foot4?.arr || dataObj.foot4
      if (
        Array.isArray(v1) && Array.isArray(v2) &&
        Array.isArray(v3) && Array.isArray(v4)
      ) {
        data1.push(v1)
        data2.push(v2)
        data3.push(v3)
        data4.push(v4)
        const ts = formatTimestamp(row.timestamp)
        t1.push(ts)
        t2.push(ts)
        t3.push(ts)
        t4.push(ts)
      }
    })

    if (!data1.length || !data2.length || !data3.length || !data4.length) {
      res.json(new HttpResult(1, { keys: requiredKeys }, 'missing foot data'))
      return
    }

    const safeDate =
      sanitizeFilename(String(matchedDate || bestRow?.date || rawTimestamp || Date.now())) ||
      String(Date.now())
    const resolvedName = pickName(
      bestRow ? bestRow.name : '',
      req.body?.collectName || req.body?.userName || ''
    )
    const baseName = buildReportBaseName({
      assessmentId: bestRow ? bestRow.assessment_id : '',
      name: resolvedName,
      sampleType: sampleTypeRaw,
      fallback: safeDate
    })
    const pdfPathOut = path.join(pdfPath, `${baseName}.pdf`)
    const csvPathOut = path.join(pdfPath, `${baseName}_input.csv`)
    const bodyWeightKg = Number(req.body?.body_weight_kg ?? req.body?.bodyWeightKg ?? 80)

    // try {
    //   const csvEscape = (value) => {
    //     const s = value === null || value === undefined ? '' : String(value)
    //     const escaped = s.replace(/"/g, '""')
    //     return `"${escaped}"`
    //   }
    //   const lines = []
    //   lines.push('time1,time2,time3,time4,foot1,foot2,foot3,foot4')
    //   const n = Math.min(data1.length, data2.length, data3.length, data4.length, t1.length, t2.length, t3.length, t4.length)
    //   for (let i = 0; i < n; i++) {
    //     lines.push([
    //       csvEscape(t1[i]),
    //       csvEscape(t2[i]),
    //       csvEscape(t3[i]),
    //       csvEscape(t4[i]),
    //       csvEscape(JSON.stringify(data1[i])),
    //       csvEscape(JSON.stringify(data2[i])),
    //       csvEscape(JSON.stringify(data3[i])),
    //       csvEscape(JSON.stringify(data4[i]))
    //     ].join(','))
    //   }
    //   fs.writeFileSync(csvPathOut, lines.join('\n'), 'utf-8')
    //   console.log(csvPathOut)
    // } catch (e) {
    //   console.error('write foot csv failed', e)
    // }

    console.log('[getFootPdf] frame lengths:', {
      d1: data1.length,
      d2: data2.length,
      d3: data3.length,
      d4: data4.length,
      t1: t1.length,
      t2: t2.length,
      t3: t3.length,
      t4: t4.length
    })
    const pdfResult = await callPy('analyze_gait_and_build_report', {
      d1: data1,
      d2: data2,
      d3: data3,
      d4: data4,
      t1,
      t2,
      t3,
      t4,
      body_weight_kg: bodyWeightKg,
      output_pdf: pdfPathOut
    })

    try {
      const videoName = `${baseName}_dashboard.mp4`
      const videoPathOut = path.join(pdfPath, videoName)
      await callPy('generate_dashboard_video', {
        d1: data1,
        d2: data2,
        d3: data3,
        d4: data4,
        t1,
        t2,
        t3,
        t4,
        output_filename: videoPathOut
      })
    } catch (e) {
      console.error('generate_dashboard_video failed:', e)
    }

    res.json(
      new HttpResult(
        0,
        {
          date: matchedDate || bestRow?.date || rawTimestamp,
          timestamp: matchedTimestamp ?? tsNum,
          pdf_path: pdfPathOut,
          csv_path: csvPathOut,
          result: pdfResult
        },
        'success'
      )
    )
  } catch (e) {
    console.error(e)
    res.json(new HttpResult(1, {}, 'getFootPdf failed'))
  }
})

app.post('/uploadCanvas_old', (req, res) => {
  console.log(req)
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
  file = req.query.file;
  const { db } = initDb(file, dbPath)
  currentDb = db
  ensureMatrixNameColumn(currentDb)
  if (blue.includes(file)) {
    baudRate = 921600
  } else {
    baudRate = 1000000
  }
})

// 查询系统列表和当前系统
app.get('/getSystem', async (req, res) => {

  const config = fs.readFileSync(configPath, 'utf-8',)
  const result = JSON.parse(decryptStr(config))
  result.value = 'foot'

  // const result = {
  //   value: "bed",
  //   typeArr: ["bed", "hand", 'foot', 'bigHand']
  // }
  baudRate = constantObj.baudRateObj[result.value] ? constantObj.baudRateObj[result.value] : 1000000

  const { db } = initDb(file, dbPath)
  currentDb = db
  ensureMatrixNameColumn(currentDb)

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

// 开始采集
app.post('/startCol', async (req, res) => {
  try {
    const { fileName, select, name, collectName, date } = req.body
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'assessmentId')) {
      const v = req.body.assessmentId
      activeAssessmentId = v === null || v === undefined || v === '' ? null : String(v)
    }
    selectArr = select
    if (typeof req.body.fileName === 'string') req.body.fileName = decodeField(req.body.fileName)
    if (typeof req.body.name === 'string') req.body.name = decodeField(req.body.name)
    if (typeof req.body.collectName === 'string') req.body.collectName = decodeField(req.body.collectName)
    if (typeof req.body.date === 'string') req.body.date = decodeField(req.body.date)
    if (typeof req.body.colName === 'string') req.body.colName = decodeField(req.body.colName)

    const sensorArr = Object.keys(dataMap).map((a) => dataMap[a].type)

    const length = sensorArr.filter((a) => a.includes(file)).length
    console.log(sensorArr, file, length)
    if (length > 0) {
      colFlag = true
      colName = (req.body.date || req.body.colName || '')
      colPersonName = req.body.fileName || req.body.name || req.body.collectName || ''
      res.json(new HttpResult(0, port, '开始采集'));
    } else {
      res.json(new HttpResult(0, '请选择正确传感器类型', 'error'));
    }

  } catch {

  }

})

// 设置当前评估模式（控制 WS 发送与存储的数据类型）
app.post('/setActiveMode', (req, res) => {
  try {
    const { mode } = req.body || {}
    const result = applyActiveMode(mode)
    if (!result) {
      res.json(new HttpResult(1, {}, 'invalid mode'))
      return
    }
    res.json(new HttpResult(0, result, 'success'))
  } catch (e) {
    res.json(new HttpResult(1, {}, 'setActiveMode failed'))
  }
})


// 停止采集
app.get('/endCol', async (req, res) => {
  colFlag = false
  res.json(new HttpResult(0, 'success', '停止采集'));
})

// 获取数据库所有存取列表
app.get('/getColHistory', async (req, res) => {
  // const selectQuery =
  //   "select DISTINCT date,timestamp, `select` from matrix ORDER BY timestamp DESC LIMIT ?,?";

  const selectQuery = `
  SELECT m.assessment_id, m.date, m.timestamp, m.name, m.\`select\`
  FROM matrix m
  INNER JOIN (
    SELECT COALESCE(NULLIF(assessment_id,''), date) AS grp, MAX(timestamp) AS max_ts
    FROM matrix
    GROUP BY grp
  ) t
  ON COALESCE(NULLIF(m.assessment_id,''), m.date) = t.grp AND m.timestamp = t.max_ts
  ORDER BY m.timestamp DESC
  LIMIT ?, ?
`;

  const params = [0, 500];

  historyFlag = true

  currentDb.all(selectQuery, params, (err, rows) => {
    if (err) {
      console.error(err);
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
    const { fileArr, assessmentIds } = req.body || {}
    const params = (assessmentIds && assessmentIds.length) ? assessmentIds : fileArr
    if (!params || !params.length) {
      res.json(new HttpResult(555, 'missing data', 'error'));
      return
    }
    const data = await dbLoadCsv({
      db: currentDb,
      params,
      file,
      isPackaged,
      byAssessmentId: true
    })
    res.json(new HttpResult(0, data, '下载'));
  } catch {

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
  const rawTimestamp =
    req.body?.assessmentId ??
    req.body?.time ??
    req.body?.date ??
    req.query?.assessmentId ??
    req.query?.time ??
    req.query?.date ??
    ''

  const { assessmentId } = await resolveAssessmentContext(currentDb, req, rawTimestamp)
  if (!assessmentId) {
    res.json(new HttpResult(1, {}, 'missing assessment_id'))
    return
  }

  const { length, pressArr, areaArr, rows, dataArr } = await dbGetData({
    db: currentDb,
    params: [assessmentId],
    byAssessmentId: true
  })

  const data = { length, pressArr, areaArr, dataArr }

  historyDbArr = rows
  colMaxHZ = 1000 / (historyDbArr[1].timestamp - historyDbArr[0].timestamp)
  colplayHZ = colMaxHZ
  historyFlag = true
  playIndex = 0

  if (dataArr['foot']) {
    // const peak_frame = await callPy("get_peak_frame", { sensor_data: dataArr['foot'] })
    // console.log(peak_frame)
    const copData = await callPy("replay_server", { sensor_data: dataArr['foot'] })
    copData.length = length
    res.json(new HttpResult(0, copData, 'success'));
    return
  }

  res.json(new HttpResult(0, data, 'success'));
})

app.post('/getDbHeatmap', async (req, res) => {
  try {
    const rawTimestamp =
      req.body?.timestamp ??
      req.body?.time ??
      req.body?.date ??
      req.query?.timestamp ??
      req.query?.time ??
      req.query?.date ??
      ''

    const { assessmentId, matchedDate, matchedTimestamp, tsNum } =
      await resolveAssessmentContext(currentDb, req, rawTimestamp)

    if (!assessmentId) {
      res.json(new HttpResult(1, {}, 'missing assessment_id'))
      return
    }

    const sampleType = '4'
    const rows = await new Promise((resolve, reject) => {
      currentDb.all(
        "select * from matrix WHERE assessment_id=? AND sample_type=?",
        [assessmentId, sampleType],
        (err, data) => {
          if (err) return reject(err)
          resolve(data || [])
        }
      )
    })

    if (!rows || !rows.length) {
      res.json(new HttpResult(1, {}, 'no data for assessment_id'))
      return
    }

    const targetTs = Number(matchedTimestamp ?? tsNum)
    const bestRow = rows.reduce((best, row) => {
      const t = Number(row?.timestamp)
      if (!Number.isFinite(t)) return best
      if (!best) return row
      const bestT = Number(best?.timestamp)
      if (!Number.isFinite(bestT)) return row
      return Math.abs(t - targetTs) < Math.abs(bestT - targetTs) ? row : best
    }, null)

    pdfReportMeta = {
      assessmentId: bestRow?.assessment_id || '',
      name: pickName(bestRow?.name || '', req.body?.collectName || req.body?.userName || ''),
      sampleType: bestRow?.sample_type || sampleType,
      fallback: matchedDate || bestRow?.date || rawTimestamp
    }

    const dataArr = {}
    rows.forEach((row) => {
      let dataObj = {}
      try {
        dataObj = JSON.parse(row.data || '{}')
      } catch {}
      Object.keys(dataObj).forEach((key) => {
        const item = dataObj[key]
        const arr = Array.isArray(item) ? item : item?.arr
        if (!Array.isArray(arr)) return
        if (!dataArr[key]) dataArr[key] = []
        dataArr[key].push(arr)
      })
    })

    if (dataArr['foot'] || dataArr['foot1']) {
      const sensor = dataArr['foot'] || dataArr['foot1']
      pdfArrData = sensor
      const peak_frame = await callPy("get_peak_frame", { processed_data: sensor })
      res.json(new HttpResult(0, peak_frame, 'success'))
      return
    }

    res.json(new HttpResult(0, {}, 'error'))
  } catch (e) {
    console.error(e)
    res.json(new HttpResult(1, {}, 'getDbHeatmap failed'))
  }
})

app.post('/getContrastData', async (req, res) => {
  const { left, right } = req.body

  const params = [left];
  const params1 = [right]

  const { length: lengthL, pressArr: pressArrL, areaArr: areaArrL, rows: rowsL } = await dbGetData({
    db: currentDb,
    params,
    byAssessmentId: true
  })
  const { length, pressArr, areaArr, rows } = await dbGetData({
    db: currentDb,
    params: params1,
    byAssessmentId: true
  })

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
  const { oldName, newName } = req.body

  changeDbDataName({ db: currentDb, params: [oldName, newName] })
})

// 取消播放
app.post('/cancalDbPlay', async (req, res) => {
  // 将回放flag置为false 并且将当前数据数组置为空
  historyFlag = false
  historyDbArr = null

  if (colTimer) {
    console.log('clean', colTimer)
    clearInterval(colTimer)
  }

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

        socketSendData(server, JSON.stringify({
          sitDataPlay: JSON.parse(historyDbArr[playIndex].data),
          index: playIndex,
          timestamp: JSON.parse(historyDbArr[playIndex].timestamp)
        }))
        if (playIndex < historyDbArr.length - 1) {
          playIndex++
        } else {
          console.log(colTimer)
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

        socketSendData(server, JSON.stringify({
          sitData: JSON.parse(historyDbArr[playIndex].data),
          index: playIndex,
          timestamp: JSON.parse(historyDbArr[playIndex].timestamp)
        }))
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
  ensureMatrixNameColumn(currentDb)
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
  const { index } = req.body

  if (!historyDbArr) {
    res.json(new HttpResult(555, '请选择回放时间段', 'error'));
    return
  }

  playIndex = index
  socketSendData(server, JSON.stringify({
    sitData: JSON.parse(historyDbArr[playIndex].data),
    index: playIndex,
    timestamp: JSON.parse(historyDbArr[playIndex].timestamp)
  }))
  res.json(new HttpResult(0, historyDbArr[index], 'success'));
})

// 读取csv
app.post('/getCsvData', async (req, res) => {
  const { fileName } = req.body
  const data = getCsvData(fileName)
  console.log(data)
  csvArr = data
  res.json(new HttpResult(0, data, 'success'));
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

function sendMacCommand(port, path, baudRate, parserItem) {
  if (!port) return
  const run = () => {
    if (baudRate === 3000000) {
      if (parserItem?.macTimer) return
      const sendOnce = () => {
        portWirte(port)
          .then(() => {
            sendMacNum++
            console.log(`[sendAT] ${path} total=${sendMacNum} success=${successNum}`)
          })
          .catch((err) => {
            console.log(`[sendAT] ${path} failed`, err)
          })
      }
      sendOnce()
      parserItem.macTimer = setInterval(() => {
        if (parserItem.macReady) {
          clearInterval(parserItem.macTimer)
          parserItem.macTimer = null
          return
        }
        sendOnce()
      }, 300)
      return
    }

    const times = baudRate === 921600 ? 1 : 3
    for (let i = 0; i < times; i++) {
      setTimeout(() => {
        portWirte(port)
          .then(() => {
            sendMacNum++
            console.log(`[sendAT] ${path} total=${sendMacNum} success=${successNum}`)
          })
          .catch((err) => {
            console.log(`[sendAT] ${path} failed`, err)
          })
      }, i * 120)
    }
  }
  if (port.isOpen) {
    run()
  } else {
    port.once('open', run)
  }
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


const server = new WebSocket.Server({ port: 19999 });

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
  console.log("%s is connected", clientName);

  socketSendData(server, JSON.stringify({}))

  ws.on("message", (msg) => {
    let text = ''
    if (Buffer.isBuffer(msg)) {
      text = msg.toString('utf8')
    } else if (typeof msg === 'string') {
      text = msg
    } else {
      return
    }
    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      return
    }
    if (payload && payload.clearActiveTypes) {
      setActiveSendTypes(null, null)
    }
    const incomingMode =
      payload?.mode ??
      payload?.current ??
      payload?.activeMode ??
      payload?.activeModeId ??
      payload?.activeModeType
    if (incomingMode !== undefined) {
      applyActiveMode(incomingMode)
    } else {
      const incoming =
        payload?.activeTypes ??
        payload?.activeType ??
        payload?.filterTypes ??
        payload?.filterType ??
        payload?.onlyTypes ??
        payload?.onlyType
      if (incoming !== undefined) {
        const types = normalizeActiveTypes(incoming)
        setActiveSendTypes(types)
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'sampleType')) {
      const v = payload.sampleType
      activeSampleType = v === null || v === undefined || v === '' ? null : String(v)
      if (activeSendTypes && activeSendTypes.length) {
        resetSendTimer()
        updateSendTimerForActiveTypes()
      }
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
      if (!obj || !obj.port || !obj.port.isOpen) {
        if (data && data.type) {
          json[data.type] = { status: 'offline' }
        }
        return
      }
      if (obj.port.isOpen) {
      let blueArr = []
      // console.log(data.type)
      if (data.type && (data.type == 'HL' || data.type == 'HR')) {

        const { order } = constantObj
        const lastData = data[order[1]]
        const nextData = data[order[2]]

        if (lastData && lastData.length && nextData && nextData.length) {
          blueArr = [...lastData, ...nextData]
        }
      }
      else if (type == 'blue') {
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
  if (json.foot) {
    if (!json.foot4) {
      json.foot4 = json.foot
    }
    delete json.foot
  }
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
  console.log(ports, 'ports')
  // 创建并连接数据通道并且设置回调
  for (let i = 0; i < ports.length; i++) {

      const portInfo = ports[i]




      const { path } = portInfo
      const manufacturer = (portInfo.manufacturer || '').toLowerCase()
      const friendlyName = (portInfo.friendlyName || '').toLowerCase()
      const isCh340 = friendlyName.includes('ch340')
      let portBaudRate = baudRate
      if (manufacturer.includes('wch.cn')) {
        portBaudRate = 921600
      }
    // parserArr[path]
      const parserItem = parserArr[path] = parserArr[path] ? parserArr[path] : {}
      const dataItem = dataMap[path] = dataMap[path] ? dataMap[path] : {}
      if (isCh340) {
        dataItem.type = 'sit'
        parserItem.typeLocked = true
      }
      parserItem.baudRate = portBaudRate
      // parserItem 
      parserItem.parser = new DelimiterParser({ delimiter: splitBuffer })

    const { parser } = parserItem

    // if()

      if (!(parserItem.port && parserItem.port.isOpen)) {
        const detectedBaud = await detectBaudRate(path)
        if (detectedBaud) {
          portBaudRate = detectedBaud
        }
        console.log('[baud]', path, '=>', portBaudRate, detectedBaud ? '(detected)' : '')
        parserItem.baudRate = portBaudRate
        const port = newSerialPortLink({ path, parser: parserItem.parser, baudRate: portBaudRate })

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
      // connection established -> send AT to query device info
      sendMacCommand(port, path, portBaudRate, parserItem)
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
            console.log(`[mac] ${path} ${uniqueId || 'n/a'}`)
            successNum++
            parserItem.macReady = true
            if (parserItem.macTimer) {
              clearInterval(parserItem.macTimer)
              parserItem.macTimer = null
            }

            console.log('sendTotal:', sendMacNum, '-----', 'success:', successNum)
            macInfo[path] = {
              uniqueId,
              version
            }

            if (parserItem.typeLocked) {
              dataItem.premission = true
            } else {
              const mappedType = parserItem.baudRate === 921600 ? null : getTypeFromSerialCache(uniqueId)
              if (mappedType) {
                dataItem.type = String(mappedType).trim()
                dataItem.premission = true
              } else {
                try {
                  const response = await axios.get(`${constantObj.backendAddress}/device-manage/device/getDetail/${uniqueId}`)
                  const time = await axios.get(`http://sensor.bodyta.com:8080/rcv/login/getSystemTime`)

                  // ??????
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
              }
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
          // if (!dataItem.premission) return
          // dataItem.type = 'hand'
          // dataItem[path]
            if (!dataItem.type) {
              dataItem.type = 'sit'
            }
            let matrix
          if (dataItem.type == 'hand' || dataItem.type == 'sit') {
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
              if (!activeSendTypes || !activeSendTypes.length) {
                if (playtimer) {
                  clearInterval(playtimer)
                }
                playtimer = setInterval(() => {
                  colAndSendData()
                }, 80)
              }
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
          maybeLockSensorHz()
          if (activeSendTypes && activeSendTypes.includes(dataItem.type)) {
            updateSendTimerForActiveTypes()
          }
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
              if (!activeSendTypes || !activeSendTypes.length) {
                if (playtimer) {
                  clearInterval(playtimer)
                }
                playtimer = setInterval(() => {
                  colAndSendData()
                }, 80)
              }
            }
          }

          oldTimeObj[dataItem.type] = dataItem.stamp
          maybeLockSensorHz()
          if (activeSendTypes && activeSendTypes.includes(dataItem.type)) {
            updateSendTimerForActiveTypes()
          }


        }

        else if (pointArr.length == 146) {
          const length = pointArr.length
          const arr = pointArr.splice(length - 16, length)
          // console.log(pointArr[0], pointArr[1])
          
          // dataItem.type = pointArr[1] == 1 ? 'leftHand' : 'rightHand'
          pointArr.splice(0, 2)
          // 下一帧赋值  时间戳赋值 四元数赋值

          const stamp = new Date().getTime()

          if (sendDataLength < 30) {
            sendDataLength++
          }
          if (oldTimeObj[dataItem.type]) {
            dataItem.HZ = stamp - oldTimeObj[dataItem.type]
            // console.log(dataItem.HZ , 'hz')
            if (!MaxHZ && sendDataLength == 30) {
              MaxHZ = Math.floor(1000 / dataItem.HZ)
              console.log(MaxHZ)
              HZ = MaxHZ
              if (!activeSendTypes || !activeSendTypes.length) {
                playtimer = setInterval(() => {
                  colAndSendData()
                }, 1000 / HZ)
              }
              sendDataLength = 0
            }
          }
          dataItem.stamp = stamp

          // if (!oldTimeObj[dataItem.type]) {
          oldTimeObj[dataItem.type] = dataItem.stamp
          maybeLockSensorHz()
          if (activeSendTypes && activeSendTypes.includes(dataItem.type)) {
            updateSendTimerForActiveTypes()
          }

          dataItem.next = pointArr
          // const stamp = new Date().getTime()
          dataItem.stamp = stamp
          dataItem.rotate = bytes4ToInt10(arr)
        } else if (pointArr.length == 4096) {
          // if (!dataItem.premission) return
          dataItem.premission = true
            if (!dataItem.type) {
              dataItem.type = 'foot'
            }
          if (!dataItem.premission) {
            dataItem.status = 'expired'
          } else {
            if (parserItem.baudRate === 3000000) {
              zeroBelowThreshold(pointArr, 8)
              removeSmallIslands64x64(pointArr, 12)
            }
            if (dataItem.type == 'endi-sit') {
              dataItem.arr = endiSit(pointArr)
            } else if (dataItem.type == 'endi-back') {
              dataItem.arr = endiBack(pointArr)
            } else if (dataItem.type == 'foot') {
              dataItem.arr = pointArr
              if (lastFootPointArr.length) {
                dataItem.cop = await callPy('realtime_server', { sensor_data: pointArr, data_prev: lastFootPointArr })
              }

            } else if (dataItem.type === 'foot1' || dataItem.type === 'foot2' || dataItem.type === 'foot3' || dataItem.type === 'foot4') {
              dataItem.arr = flipFoot64x64Horizontal(pointArr)
            } else {
              dataItem.arr = pointArr
            }
            lastFootPointArr = pointArr
          }
          // console.log(444)
          const stamp = new Date().getTime()

          if (sendDataLength < 30) {
            sendDataLength++
          }
          if (oldTimeObj[dataItem.type]) {
            dataItem.HZ = stamp - oldTimeObj[dataItem.type]
            // console.log(dataItem.HZ , 'hz')
            if (!MaxHZ && sendDataLength == 30) {
              MaxHZ = Math.floor(1000 / dataItem.HZ)
              console.log(MaxHZ)
              HZ = MaxHZ
              if (!activeSendTypes || !activeSendTypes.length) {
                playtimer = setInterval(() => {
                  colAndSendData()
                }, 1000 / HZ)
              }
              sendDataLength = 0
            }
          }
          dataItem.stamp = stamp

          // if (!oldTimeObj[dataItem.type]) {
          oldTimeObj[dataItem.type] = dataItem.stamp
          maybeLockSensorHz()
          if (activeSendTypes && activeSendTypes.includes(dataItem.type)) {
            updateSendTimerForActiveTypes()
          }
          // } else {

          // }

          // if (!dataItem.arrList) {
          //   dataItem.arrList = []
          // } else {
          //   if (dataItem.arrList.length < 3) {
          //     dataItem.arrList.push(pointArr)
          //   } else {
          //     dataItem.arrList.shift()
          //     dataItem.arrList.push(pointArr)
          //   }

          //   // dataItem.cop = await callPy('cal_cop_fromData', { data_array: dataItem.arrList })
          //   // console.log(dataItem.arrList, pointArr.length, dataItem.cop)
          // }

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

          if (parserItem.baudRate === 3000000) {
            zeroBelowThreshold(pointArr, 5)
            removeSmallIslands64x64(pointArr, 9)
          }

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
              if (!activeSendTypes || !activeSendTypes.length) {
                playtimer = setInterval(() => {
                  colAndSendData()
                }, 1000 / HZ)
              }
            }
          }
          dataItem.stamp = stamp
          // if (!oldTimeObj[dataItem.type]) {
          oldTimeObj[dataItem.type] = dataItem.stamp
          maybeLockSensorHz()
          if (activeSendTypes && activeSendTypes.includes(dataItem.type)) {
            updateSendTimerForActiveTypes()
          }
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

        } else if (pointArr.length == 144) {

          const stamp = new Date().getTime()
          dataItem.stamp = stamp
          dataItem.type = 'carAir'
          // if (!dataItem.premission) {
          //   dataItem.status = 'expired'
          // } else {
          dataItem.arr = pointArr
          // }




          // console.log(444)

          if (sendDataLength < 1) {
            sendDataLength++
          }
          if (oldTimeObj[dataItem.type]) {
            dataItem.HZ = parseInt(1000 / (stamp - oldTimeObj[dataItem.type]))
            if (!MaxHZ && sendDataLength == 1) {
              MaxHZ = dataItem.HZ
              HZ = MaxHZ
              if (!activeSendTypes || !activeSendTypes.length) {
                playtimer = setInterval(() => {
                  colAndSendData()
                }, 87)
              }
              sendDataLength = 0
            }
          }

          oldTimeObj[dataItem.type] = dataItem.stamp
          maybeLockSensorHz()
          if (activeSendTypes && activeSendTypes.includes(dataItem.type)) {
            updateSendTimerForActiveTypes()
          }
          algorData = await callPy('server', { sensor_data: pointArr })
          if (algorData.control_command) {
            control_command = algorData.control_command
          }
          // console.log(algorData?.frame_count)

        } else if (pointArr.length == 51) {
          // 收到ecu发送数据
          console.log('pointArr', pointArr)
          console.log('buffer', buffer)
          if (pointArr[50] == 1) {

            // 手动模式
            if (pointArr[49] == 1) {

              controlMode = HANDLE

              let max = 24, controlArr = []
              for (let i = 0; i < max; i++) {
                controlArr.push(pointArr[2 * i + 2])
              }


              server.clients.forEach(function each(client) {
                if (port?.isOpen) {

                  if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ handle: controlArr }));
                  }
                }
              });

            }
            // 自动模式
            else {



              controlMode = ALGOR

              if (oldControlMode == HANDLE && controlMode == ALGOR) {
                await callPy('resetMessage')
              }

              let max = 24, controlArr = []
              for (let i = 0; i < max; i++) {
                controlArr.push(pointArr[2 * i + 2])
              }


              server.clients.forEach(function each(client) {
                if (port?.isOpen) {

                  if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ algorFeed: controlArr }));
                  }
                }
              });
            }

            oldControlMode = controlMode
          }
        }


        else if (![18, 1024, 130].includes(pointArr.length)) {

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
  resetSensorHzCache()
}

function colAndSendData() {
  // console.log(historyFlag)

  if (!historyFlag && Object.keys(parserArr).length) {
    const obj = sendData()
    // selectArr
    if (selectArr && Object.keys(selectArr).length && obj) {
      for (let i = 0; i < Object.keys(selectArr).length; i++) {
        const key = Object.keys(selectArr)[i]
        if (obj[key]) {
          obj[key].select = selectArr[key]
        }
      }
    }

    if (colFlag && obj && Object.keys(obj).length) {
      storageData(obj)
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
    obj = filterDataByTypes(obj, activeSendTypes)
    // 如果obj里面包含  机器人type 发送数据
    if (Object.keys(obj).filter((a) => Object.values(constantObj.type).includes(a)).length) {
      socketSendData(server, JSON.stringify({ data: obj }))
    }
  } else {
    // 如果串口发送数据
    const arr = []

    obj = parseData(parserArr, JSON.parse(JSON.stringify({ ...dataMap })), 'highHZ')
    for (let i = 0; i < 4096; i++) {
      arr.push(Math.floor(Math.random() * 100))
    }

    // const dataMap = {
    //   com3: {
    //     data: arr
    //   }
    // }
    // console.log(obj)
    obj = filterDataByTypes(obj, activeSendTypes)
    socketSendData(server, JSON.stringify({ sitData: obj }))
  }

  // const now = Date.now()
  // if (now - lastRealtimeLogTs >= 1000) {
  //   lastRealtimeLogTs = now
  //   const typeArr = Object.keys(obj || {})
  //   typeArr.forEach((type) => {
  //     let latestStamp = null
  //     Object.keys(dataMap).forEach((key) => {
  //       const item = dataMap[key]
  //       if (item && item.type === type && typeof item.stamp === 'number') {
  //         if (latestStamp === null || item.stamp > latestStamp) {
  //           latestStamp = item.stamp
  //         }
  //       }
  //     })
  //     const objStamp = obj[type] && typeof obj[type].stamp === 'number' ? obj[type].stamp : null
  //     const ageObj = objStamp === null ? 'n/a' : now - objStamp
  //     const ageMap = latestStamp === null ? 'n/a' : now - latestStamp
  //     console.log(`[realtime] type=${type} now=${now} objAge=${ageObj}ms dataMapAge=${ageMap}ms`)
  //   })
  // }

  return obj
}

function ensureMatrixNameColumn(db) {
  db.all("PRAGMA table_info(matrix)", (err, rows) => {
    if (err) {
      console.error('PRAGMA table_info failed:', err)
      return
    }
    const hasName = rows.some((r) => r.name === 'name')
    if (!hasName) {
      db.run('ALTER TABLE matrix ADD COLUMN name TEXT', (e) => {
        if (e) console.error('ALTER TABLE add name failed:', e)
      })
    }
    const hasAssessmentId = rows.some((r) => r.name === 'assessment_id')
    if (!hasAssessmentId) {
      db.run('ALTER TABLE matrix ADD COLUMN assessment_id TEXT', (e) => {
        if (e) console.error('ALTER TABLE add assessment_id failed:', e)
      })
    }
    const hasSampleType = rows.some((r) => r.name === 'sample_type')
    if (!hasSampleType) {
      db.run('ALTER TABLE matrix ADD COLUMN sample_type TEXT', (e) => {
        if (e) console.error('ALTER TABLE add sample_type failed:', e)
      })
    }
  })
}

/**
 * 将收到的
 */
function storageData(data) {
  const rawAssessmentId = activeAssessmentId
  const parsedAssessmentId = rawAssessmentId !== null && rawAssessmentId !== undefined ? Number(rawAssessmentId) : NaN
  const timestamp = Date.now()
  // const date = saveTime;


  // const newData = Object.keys(data)
  const newData = { ...data }
  for (let i = 0; i < Object.keys(data).length; i++) {
    const key = Object.keys(data)[i]
    if (newData[key].status) delete newData[key].status
  }

  const insertQuery =
    "INSERT INTO matrix (data, timestamp,date ,`select`, name, assessment_id, sample_type) VALUES (?, ?,? ,?, ?, ?, ?)";
  const assessmentId = activeAssessmentId || null
  const sampleType = activeSampleType || null

  currentDb.run(
    insertQuery,
    [JSON.stringify(newData), timestamp, colName, JSON.stringify(selectArr), colPersonName, assessmentId, sampleType],
    function (err) {
      if (err) {
        console.error(err);
        return;
      }
      console.log(`Event inserted with ID ${this.lastID}`);
    }
  );
}

// 做一个定时器任务  监听是否存在意外情况串口断开连接 然后重新连接 
setInterval(() => {
  if (Object.keys(parserArr).length) {
    Object.keys(parserArr).map((path) => {
      const item = parserArr[path]
      if (!item) return
      const port = item.port
      if (!port || !port.isOpen) {
        resetSensorHzCache()
        const reopenBaud = item.baudRate || baudRate
        item.port = new SerialPort(
          {
            path: path,
            baudRate: reopenBaud,
            autoOpen: true,
          },
          function (err) {
            console.log(err, "err");
          }
        );
        //???????
        item.port.pipe(item.parser);
      }
    })

  }

}, 3000)


// setInterval(async () => {

//   const portArr = Object.keys(parserArr).map((path) => {
//     return parserArr[path].port
//   })


//   // 关闭串口,并且清除本地缓存数据
//   portArr.forEach((port, index) => {
//     // console.log(port.isOpen)
//     if (port?.isOpen) {
//       server.clients.forEach(function each(client) {
//         if (port?.isOpen) {

//           if (algorData?.control_command && controlMode == ALGOR) {
//             const hexStr = algorData.control_command
//               .map(v => v.toString(16).padStart(2, '0'))
//               .join('');

//             // console.log(hexStr);

//             const command = Buffer.from(hexStr, 'hex')
//             console.log('sendCommand', command)
//             port.write(command, err => {
//               if (err) {
//                 return console.error('err2:', err.message);
//               }
//               // console.log('send:', command.trim());
//               // resolve(command.trim())

//               console.log('send:', 11);
//               // resolve(11)
//             });
//           }


//           // const arr = [170, 85, 3, 153];




//           if (client.readyState === WebSocket.OPEN) {
//             client.send(JSON.stringify({ algorData }));
//           }
//         }
//       });
//     }
//   })


// }, 500)


// setInterval(async () => {
//   console.log('first', 111)
//   const pointArr = new Array(144).fill(50)
//   algorData = await callPy('server', { sensor_data: pointArr })
//   // console.log('frame_count:' , algorData?.frame_count)
// }, 2)
