'use strict'

const DEFAULT_HISTORY_PLAYBACK_HZ = 12

/**
 * 将采集名称转换为可在 Windows 上创建的文件名片段。
 * @param {unknown} value 原始名称。
 * @param {string} fallback 名称为空时使用的默认值。
 * @returns {string} 已移除路径分隔符和其他非法字符的名称。
 */
function sanitizeWindowsFileName(value, fallback = 'history') {
  return String(value ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 120) || fallback
}

/**
 * 生成旧版历史数据导出的安全 CSV 文件名。
 * @param {unknown} systemName 当前系统名称。
 * @param {unknown} collectionName 采集段名称。
 * @returns {string} 可直接用于文件系统的 CSV 文件名。
 */
function createLegacyHistoryCsvFileName(systemName, collectionName) {
  const prefix = sanitizeWindowsFileName(systemName, 'data')
  const name = sanitizeWindowsFileName(collectionName, 'history')
  return `${prefix}${name}.csv`
}

/**
 * 解析一条历史记录中的传感器数据对象。
 * @param {object} row SQLite 历史记录。
 * @returns {object|null} 至少包含一个 arr 数组的对象，解析失败时返回 null。
 */
function parseHistoryRowData(row) {
  let data
  try {
    data = typeof row?.data === 'string' ? JSON.parse(row.data) : row?.data
  } catch (_error) {
    return null
  }

  if (!data || Array.isArray(data) || typeof data !== 'object') return null
  const hasSensorArray = Object.values(data).some((item) => Array.isArray(item?.arr))
  return hasSensorArray ? data : null
}

/**
 * 将历史记录过滤为可回放数据，并生成每个传感器的压力与面积统计。
 * @param {object[]} rows SQLite 查询结果。
 * @returns {{rows:object[],pressArr:object,areaArr:object,skippedRows:number}} 归一化结果。
 */
function normalizeHistoryRows(rows) {
  const records = []
  const sensorKeys = new Set()
  let skippedRows = 0

  for (const row of Array.isArray(rows) ? rows : []) {
    const data = parseHistoryRowData(row)
    if (!data) {
      skippedRows++
      continue
    }

    Object.entries(data).forEach(([key, value]) => {
      if (Array.isArray(value?.arr)) sensorKeys.add(key)
    })
    records.push({ row, data })
  }

  const pressArr = {}
  const areaArr = {}
  sensorKeys.forEach((key) => {
    pressArr[key] = []
    areaArr[key] = []
  })

  records.forEach(({ data }) => {
    sensorKeys.forEach((key) => {
      const values = Array.isArray(data[key]?.arr)
        ? data[key].arr.map(Number).filter(Number.isFinite)
        : []
      pressArr[key].push(values.reduce((total, value) => total + value, 0))
      areaArr[key].push(values.filter((value) => value > 0).length)
    })
  })

  return {
    rows: records.map(({ row, data }) => ({
      ...row,
      data: JSON.stringify(data)
    })),
    pressArr,
    areaArr,
    skippedRows
  }
}

/**
 * 根据历史记录时间戳计算回放频率，单帧或异常时间戳使用 12Hz。
 * @param {object[]} rows 已归一化的历史记录。
 * @returns {number} 限制在 1-60Hz 范围内的回放频率。
 */
function getHistoryPlaybackHz(rows) {
  const deltas = []
  for (let index = 1; index < (Array.isArray(rows) ? rows.length : 0); index++) {
    const current = Number(rows[index]?.timestamp)
    const previous = Number(rows[index - 1]?.timestamp)
    const delta = current - previous
    if (Number.isFinite(delta) && delta > 0) deltas.push(delta)
  }

  if (!deltas.length) return DEFAULT_HISTORY_PLAYBACK_HZ
  deltas.sort((left, right) => left - right)
  const medianDelta = deltas[Math.floor(deltas.length / 2)]
  return Math.max(1, Math.min(60, 1000 / medianDelta))
}

/**
 * 创建带明确历史标识的 WebSocket 回放消息。
 * @param {object} row 已归一化的历史记录。
 * @param {number} index 当前回放索引。
 * @returns {{carAdaptiveHistoryFrame:boolean,sitData:object,index:number,timestamp:number}} 回放消息。
 */
function createHistoryPlaybackPayload(row, index) {
  const data = parseHistoryRowData(row)
  if (!data) throw new Error('历史记录数据格式无效')

  return {
    carAdaptiveHistoryFrame: true,
    sitData: data,
    index,
    timestamp: Number(row?.timestamp) || 0
  }
}

module.exports = {
  DEFAULT_HISTORY_PLAYBACK_HZ,
  createHistoryPlaybackPayload,
  createLegacyHistoryCsvFileName,
  getHistoryPlaybackHz,
  normalizeHistoryRows,
  parseHistoryRowData,
  sanitizeWindowsFileName
}
