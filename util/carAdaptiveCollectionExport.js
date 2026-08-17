'use strict'

const CAR_ADAPTIVE_RAW_PRESSURE_LENGTH = 144

/**
 * 把传感器标识规范化为主驾 1 或副驾 2。
 * @param {unknown} value 待校验标识。
 * @returns {1|2|null} 有效标识或 null。
 */
function normalizeCollectionSensorId(value) {
  const sensorId = Number(value)
  return sensorId === 1 || sensorId === 2 ? sensorId : null
}

/**
 * 把任意压力值限制为一个 0-255 原始字节。
 * @param {unknown} value 原始压力值。
 * @returns {number} 规范化字节。
 */
function normalizeCollectionByte(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(255, Math.round(number)))
}

/**
 * 从一条 SQLite 采集记录提取完整汽车原始帧。
 * @param {object} row 数据库记录。
 * @param {1|2|null} requestedSensorId 调用方指定的主副驾标识。
 * @returns {{timestamp:number,sensorId:1|2,values:number[]}|null} 可导出帧。
 */
function parseCarAdaptiveCollectionRow(row, requestedSensorId) {
  let data
  try {
    data = typeof row?.data === 'string' ? JSON.parse(row.data) : row?.data
  } catch (_error) {
    return null
  }

  const carAir = data?.carAir
  if (!Array.isArray(carAir?.arr) || carAir.arr.length !== CAR_ADAPTIVE_RAW_PRESSURE_LENGTH) {
    return null
  }

  const sensorId = normalizeCollectionSensorId(carAir.sensorId) || requestedSensorId
  if (!sensorId || (requestedSensorId && sensorId !== requestedSensorId)) {
    return null
  }

  return {
    timestamp: Number(row?.timestamp) || 0,
    sensorId,
    values: carAir.arr.map(normalizeCollectionByte)
  }
}

/**
 * 转义一个 CSV 单元格，避免逗号、引号或换行破坏列结构。
 * @param {unknown} value 单元格值。
 * @returns {string} CSV 安全文本。
 */
function escapeCsvCell(value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * 把数据库采集记录生成可直接下载的 UTF-8 CSV。
 * 每行包含时间、传感器标识和未经算法处理的 144 个原始压力字节。
 * @param {object[]} rows SQLite 采集记录。
 * @param {{sensorId?:1|2}} [options] 导出选项。
 * @returns {{csv:string,frameCount:number,sensorId:1|2|null}} CSV 和有效帧信息。
 */
function createCarAdaptiveCollectionCsv(rows, options = {}) {
  const requestedSensorId = normalizeCollectionSensorId(options.sensorId)
  const frames = (Array.isArray(rows) ? rows : [])
    .map((row) => parseCarAdaptiveCollectionRow(row, requestedSensorId))
    .filter(Boolean)
  const pressureHeaders = Array.from(
    { length: CAR_ADAPTIVE_RAW_PRESSURE_LENGTH },
    (_, index) => `p${index}`
  )
  const lines = [
    ['frameIndex', 'timestamp', 'datetime', 'sensorId', ...pressureHeaders].join(',')
  ]

  frames.forEach((frame, index) => {
    const datetime = new Date(frame.timestamp).toISOString()
    lines.push([
      index,
      frame.timestamp,
      escapeCsvCell(datetime),
      frame.sensorId,
      ...frame.values
    ].join(','))
  })

  return {
    csv: `\uFEFF${lines.join('\r\n')}\r\n`,
    frameCount: frames.length,
    sensorId: requestedSensorId || frames[0]?.sensorId || null
  }
}

/**
 * 生成兼容 Windows 文件名规则的原始数据 CSV 名称。
 * @param {unknown} collectionName 采集段名称。
 * @param {unknown} sensorId 主副驾标识。
 * @returns {string} 下载文件名。
 */
function createCarAdaptiveCollectionExportFileName(collectionName, sensorId) {
  const safeName = String(collectionName || '原始数据')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 80) || '原始数据'
  const role = normalizeCollectionSensorId(sensorId) === 2 ? '副驾' : '主驾'
  return `${safeName}-${role}-原始数据.csv`
}

module.exports = {
  CAR_ADAPTIVE_RAW_PRESSURE_LENGTH,
  createCarAdaptiveCollectionCsv,
  createCarAdaptiveCollectionExportFileName,
  normalizeCollectionSensorId
}
