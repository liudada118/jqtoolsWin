const test = require('node:test')
const assert = require('node:assert/strict')
const { createRateLimitedBroadcaster } = require('../util/carAdaptiveSnapshotBroadcast')

/** 创建可手动推进时间的限频广播测试环境。 */
function createHarness(intervalMs = 84) {
  let currentTime = 0
  let latestPayload = 'frame-0'
  let nextTimerId = 1
  const timers = new Map()
  const sent = []

  const broadcaster = createRateLimitedBroadcaster({
    intervalMs,
    createPayload: () => latestPayload,
    send: (payload) => sent.push({ payload, at: currentTime }),
    now: () => currentTime,
    scheduleTimer: (callback, delay) => {
      const id = nextTimerId++
      timers.set(id, { callback, dueAt: currentTime + delay })
      return id
    },
    cancelTimer: (id) => timers.delete(id)
  })

  /** 将虚拟时间推进到目标值，并执行到期定时器。 */
  function advanceTo(targetTime) {
    currentTime = targetTime
    const dueTimers = [...timers.entries()]
      .filter(([, timer]) => timer.dueAt <= currentTime)
      .sort((left, right) => left[1].dueAt - right[1].dueAt)
    dueTimers.forEach(([id, timer]) => {
      timers.delete(id)
      timer.callback()
    })
  }

  return {
    broadcaster,
    sent,
    timers,
    advanceTo,
    setPayload: (payload) => { latestPayload = payload },
    setTime: (value) => { currentTime = value }
  }
}

test('首次快照立即发送', () => {
  const harness = createHarness()

  assert.equal(harness.broadcaster.request(), true)
  assert.deepEqual(harness.sent, [{ payload: 'frame-0', at: 0 }])
  assert.equal(harness.timers.size, 0)
})

test('限频窗口内的高频请求只保留最新快照', () => {
  const harness = createHarness(84)
  harness.broadcaster.request()

  harness.setTime(10)
  harness.setPayload('frame-1')
  assert.equal(harness.broadcaster.request(), false)
  harness.setTime(20)
  harness.setPayload('frame-2')
  assert.equal(harness.broadcaster.request(), false)

  assert.equal(harness.timers.size, 1)
  harness.advanceTo(84)
  assert.deepEqual(harness.sent, [
    { payload: 'frame-0', at: 0 },
    { payload: 'frame-2', at: 84 }
  ])
})

test('连续请求不会超过约 12 Hz 的最小间隔', () => {
  const harness = createHarness(84)
  harness.broadcaster.request()

  for (let time = 1; time <= 200; time += 1) {
    harness.setTime(time)
    harness.setPayload(`frame-${time}`)
    harness.broadcaster.request()
    harness.advanceTo(time)
  }
  harness.advanceTo(252)

  assert.deepEqual(harness.sent.map((item) => item.at), [0, 84, 168, 252])
  assert.ok(harness.sent.every((item, index) => (
    index === 0 || item.at - harness.sent[index - 1].at >= 84
  )))
})

test('销毁后取消待发送任务并拒绝新请求', () => {
  const harness = createHarness()
  harness.broadcaster.request()
  harness.setTime(10)
  harness.broadcaster.request()
  assert.equal(harness.timers.size, 1)

  harness.broadcaster.dispose()
  harness.advanceTo(100)

  assert.equal(harness.broadcaster.request(), false)
  assert.equal(harness.timers.size, 0)
  assert.equal(harness.sent.length, 1)
})
