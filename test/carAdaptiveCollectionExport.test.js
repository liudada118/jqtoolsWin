'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createCarAdaptiveCollectionCsv,
  createCarAdaptiveCollectionExportFileName
} = require('../util/carAdaptiveCollectionExport')

/** 创建一条指定主副驾的测试采集记录。 */
function createCollectionRow(sensorId, timestamp, values) {
  return {
    timestamp,
    data: JSON.stringify({
      carAir: {
        sensorId,
        arr: values
      }
    })
  }
}

test('CSV 每帧包含传感器标识和 144 个原始压力字节', () => {
  const values = Array.from({ length: 144 }, (_, index) => index)
  const result = createCarAdaptiveCollectionCsv([
    createCollectionRow(1, 1786341439784, values)
  ], { sensorId: 1 })
  const lines = result.csv.replace(/^\uFEFF/, '').trim().split('\r\n')

  assert.equal(result.frameCount, 1)
  assert.equal(result.sensorId, 1)
  assert.equal(lines[0].split(',').length, 148)
  assert.equal(lines[1].split(',').length, 148)
  assert.match(lines[0], /^frameIndex,timestamp,datetime,sensorId,p0,p1/)
  assert.match(lines[1], /^0,1786341439784,.*?,1,0,1,2,3/)
})

test('导出时只保留指定通道并跳过损坏记录', () => {
  const values = new Array(144).fill(8)
  const result = createCarAdaptiveCollectionCsv([
    createCollectionRow(1, 1, values),
    createCollectionRow(2, 2, values),
    { timestamp: 3, data: '{bad json' },
    createCollectionRow(2, 4, [1, 2, 3])
  ], { sensorId: 2 })

  assert.equal(result.frameCount, 1)
  assert.match(result.csv, /,2,8,8,8,8/)
  assert.doesNotMatch(result.csv, /,1,8,8,8,8/)
})

test('下载文件名移除 Windows 非法字符并保留主副驾', () => {
  assert.equal(
    createCarAdaptiveCollectionExportFileName('测试:主/副*', 2),
    '测试_主_副_-副驾-原始数据.csv'
  )
})
