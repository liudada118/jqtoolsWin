const test = require('node:test')
const assert = require('node:assert/strict')
const {
  appendCarAdaptiveCommandHistory,
  clearCarAdaptiveCommandHistory,
  countCarAdaptiveCommandHistory,
  listCarAdaptiveCommandHistory,
  normalizeCarAdaptiveCommandHistoryQueryLimit,
  normalizeCarAdaptiveCommandHistoryType
} = require('../util/carAdaptiveCommandHistory')

test('历史类型支持全部和五类气囊指令', () => {
  assert.equal(normalizeCarAdaptiveCommandHistoryType(undefined), '')
  assert.equal(normalizeCarAdaptiveCommandHistoryType('all'), '')
  assert.equal(normalizeCarAdaptiveCommandHistoryType('ecuFeedback'), 'ecuFeedback')
  assert.equal(normalizeCarAdaptiveCommandHistoryType('unknown'), null)
})

test('同类型历史独立裁剪，不会挤掉其他来源', () => {
  const history = []
  appendCarAdaptiveCommandHistory(history, { sequence: 1, type: 'apiSerial', stamp: 1 }, 2)
  appendCarAdaptiveCommandHistory(history, { sequence: 2, type: 'ecuFeedback', stamp: 2 }, 2)
  appendCarAdaptiveCommandHistory(history, { sequence: 3, type: 'ecuFeedback', stamp: 3 }, 2)
  appendCarAdaptiveCommandHistory(history, { sequence: 4, type: 'ecuFeedback', stamp: 4 }, 2)

  assert.deepEqual(history.map((item) => item.sequence), [1, 3, 4])
  assert.deepEqual(countCarAdaptiveCommandHistory(history), {
    algorithmGenerated: 0,
    algorithmSent: 0,
    ecuFeedback: 2,
    apiSerial: 1,
    apiDisplay: 0,
    all: 3
  })
})

test('查询按时间倒序、支持类型和数量限制', () => {
  const history = [
    { sequence: 1, type: 'apiSerial', stamp: 100 },
    { sequence: 2, type: 'ecuFeedback', stamp: 300 },
    { sequence: 3, type: 'apiSerial', stamp: 200 }
  ]

  assert.deepEqual(
    listCarAdaptiveCommandHistory(history, { limit: 2 }).map((item) => item.sequence),
    [2, 3]
  )
  assert.deepEqual(
    listCarAdaptiveCommandHistory(history, { type: 'apiSerial' }).map((item) => item.sequence),
    [3, 1]
  )
  assert.equal(normalizeCarAdaptiveCommandHistoryQueryLimit(5000), 1000)
})

test('可以只清空一种记录，也可以清空全部', () => {
  const history = [
    { type: 'apiSerial' },
    { type: 'ecuFeedback' },
    { type: 'apiSerial' }
  ]

  assert.equal(clearCarAdaptiveCommandHistory(history, 'apiSerial'), 2)
  assert.deepEqual(history, [{ type: 'ecuFeedback' }])
  assert.equal(clearCarAdaptiveCommandHistory(history), 1)
  assert.deepEqual(history, [])
  assert.equal(clearCarAdaptiveCommandHistory(history, 'unknown'), -1)
})
