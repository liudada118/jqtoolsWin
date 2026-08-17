'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createHistoryPlaybackPayload,
  createLegacyHistoryCsvFileName,
  getHistoryPlaybackHz,
  normalizeHistoryRows
} = require('../util/collectionHistory')

/** 创建一条汽车自适应历史记录。 */
function createHistoryRow(timestamp, values = new Array(144).fill(1)) {
  return {
    id: timestamp,
    timestamp,
    data: JSON.stringify({
      carAir: {
        sensorId: 1,
        arr: values
      }
    })
  }
}

test('旧下载文件名会替换 Windows 非法字符', () => {
  assert.equal(
    createLegacyHistoryCsvFileName('carAir', 'A-4-成人起身离座全过程-155/88'),
    'carAirA-4-成人起身离座全过程-155_88.csv'
  )
})

test('历史帧带明确标识并保留 144 点数据', () => {
  const payload = createHistoryPlaybackPayload(createHistoryRow(1000), 0)

  assert.equal(payload.carAdaptiveHistoryFrame, true)
  assert.equal(payload.index, 0)
  assert.equal(payload.timestamp, 1000)
  assert.equal(payload.sitData.carAir.arr.length, 144)
})

test('单帧和异常时间戳使用稳定的默认回放频率', () => {
  assert.equal(getHistoryPlaybackHz([createHistoryRow(1000)]), 12)
  assert.equal(
    getHistoryPlaybackHz([createHistoryRow(1000), createHistoryRow(1000)]),
    12
  )
})

test('历史记录解析会跳过损坏 JSON 并保持统计数组长度一致', () => {
  const normalized = normalizeHistoryRows([
    createHistoryRow(1000, [1, 0, 2]),
    { id: 2, timestamp: 1100, data: '{bad json' },
    createHistoryRow(1200, [0, 0, 4])
  ])

  assert.equal(normalized.rows.length, 2)
  assert.equal(normalized.skippedRows, 1)
  assert.deepEqual(normalized.pressArr.carAir, [3, 4])
  assert.deepEqual(normalized.areaArr.carAir, [2, 1])
})
