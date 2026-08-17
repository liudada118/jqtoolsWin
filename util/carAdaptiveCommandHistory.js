'use strict'

/** 后端支持记录的气囊指令历史类型。 */
const CAR_ADAPTIVE_COMMAND_HISTORY_TYPES = Object.freeze([
  'algorithmGenerated',
  'algorithmSent',
  'ecuFeedback',
  'apiSerial',
  'apiDisplay'
])

/** 每个传感器、每种类型默认保留的历史条数。 */
const CAR_ADAPTIVE_COMMAND_HISTORY_LIMIT = 500

/** 查询接口默认返回的历史条数。 */
const CAR_ADAPTIVE_COMMAND_HISTORY_QUERY_LIMIT = 200

/** 查询接口单次允许返回的最大历史条数。 */
const CAR_ADAPTIVE_COMMAND_HISTORY_QUERY_MAX = 1000

/**
 * 校验气囊指令历史类型。
 *
 * @param {unknown} value 待校验类型。
 * @returns {string|null} 合法类型；空值表示查询全部；非法类型返回 null。
 */
function normalizeCarAdaptiveCommandHistoryType(value) {
  const type = String(value || '').trim()
  if (!type || type === 'all') return ''
  return CAR_ADAPTIVE_COMMAND_HISTORY_TYPES.includes(type) ? type : null
}

/**
 * 规范历史查询条数，防止一次返回过多命令字节。
 *
 * @param {unknown} value 请求条数。
 * @returns {number} 1 到 1000 之间的查询条数。
 */
function normalizeCarAdaptiveCommandHistoryQueryLimit(value) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return CAR_ADAPTIVE_COMMAND_HISTORY_QUERY_LIMIT
  }
  return Math.min(CAR_ADAPTIVE_COMMAND_HISTORY_QUERY_MAX, parsed)
}

/**
 * 向历史队列追加记录，并只裁剪同类型的最早记录。
 * 这样高频 ECU 回传不会挤掉低频接口操作记录。
 *
 * @param {object[]} history 当前传感器历史队列。
 * @param {object} record 已标准化的历史记录。
 * @param {number} [perTypeLimit] 每种类型最多保留条数。
 * @returns {object|null} 成功追加的记录，输入非法时返回 null。
 */
function appendCarAdaptiveCommandHistory(history, record, perTypeLimit = CAR_ADAPTIVE_COMMAND_HISTORY_LIMIT) {
  if (!Array.isArray(history) || !record || typeof record !== 'object') return null
  if (!CAR_ADAPTIVE_COMMAND_HISTORY_TYPES.includes(record.type)) return null

  history.push(record)
  const limit = Math.max(1, Number.parseInt(perTypeLimit, 10) || CAR_ADAPTIVE_COMMAND_HISTORY_LIMIT)
  let matchingCount = history.reduce(
    (count, item) => count + (item?.type === record.type ? 1 : 0),
    0
  )

  for (let index = 0; index < history.length && matchingCount > limit;) {
    if (history[index]?.type === record.type) {
      history.splice(index, 1)
      matchingCount -= 1
    } else {
      index += 1
    }
  }
  return record
}

/**
 * 按类型筛选历史，并按最新时间和序号倒序返回。
 *
 * @param {object[]} history 当前传感器历史队列。
 * @param {{type?: string, limit?: number}} [options] 筛选参数。
 * @returns {object[]} 历史记录副本。
 */
function listCarAdaptiveCommandHistory(history, options = {}) {
  if (!Array.isArray(history)) return []
  const type = normalizeCarAdaptiveCommandHistoryType(options.type)
  if (type === null) return []
  const limit = normalizeCarAdaptiveCommandHistoryQueryLimit(options.limit)

  return history
    .filter((item) => !type || item?.type === type)
    .slice()
    .sort((left, right) => {
      const stampDifference = (Number(right?.stamp) || 0) - (Number(left?.stamp) || 0)
      return stampDifference || (Number(right?.sequence) || 0) - (Number(left?.sequence) || 0)
    })
    .slice(0, limit)
    .map((item) => ({ ...item }))
}

/**
 * 统计每种气囊指令历史的条数。
 *
 * @param {object[]} history 当前传感器历史队列。
 * @returns {Record<string, number>} 全部和各类型数量。
 */
function countCarAdaptiveCommandHistory(history) {
  const counts = Object.fromEntries(
    CAR_ADAPTIVE_COMMAND_HISTORY_TYPES.map((type) => [type, 0])
  )
  if (Array.isArray(history)) {
    history.forEach((item) => {
      if (CAR_ADAPTIVE_COMMAND_HISTORY_TYPES.includes(item?.type)) {
        counts[item.type] += 1
      }
    })
  }
  counts.all = Object.values(counts).reduce((sum, count) => sum + count, 0)
  return counts
}

/**
 * 清空全部历史或指定类型历史。
 *
 * @param {object[]} history 当前传感器历史队列。
 * @param {unknown} type 指定类型；空值表示清空全部。
 * @returns {number} 被删除的记录条数，类型非法时返回 -1。
 */
function clearCarAdaptiveCommandHistory(history, type) {
  if (!Array.isArray(history)) return 0
  const normalizedType = normalizeCarAdaptiveCommandHistoryType(type)
  if (normalizedType === null) return -1
  const previousLength = history.length

  if (!normalizedType) {
    history.splice(0, history.length)
  } else {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      if (history[index]?.type === normalizedType) history.splice(index, 1)
    }
  }
  return previousLength - history.length
}

module.exports = {
  CAR_ADAPTIVE_COMMAND_HISTORY_LIMIT,
  CAR_ADAPTIVE_COMMAND_HISTORY_QUERY_LIMIT,
  CAR_ADAPTIVE_COMMAND_HISTORY_QUERY_MAX,
  CAR_ADAPTIVE_COMMAND_HISTORY_TYPES,
  appendCarAdaptiveCommandHistory,
  clearCarAdaptiveCommandHistory,
  countCarAdaptiveCommandHistory,
  listCarAdaptiveCommandHistory,
  normalizeCarAdaptiveCommandHistoryQueryLimit,
  normalizeCarAdaptiveCommandHistoryType
}
