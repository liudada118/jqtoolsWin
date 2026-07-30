const test = require('node:test')
const assert = require('node:assert/strict')
const {
  CAR_ADAPTIVE_CONTROL_MODES,
  CAR_ADAPTIVE_CONTROL_MODE_SOURCES,
  applyCarAdaptiveControlMode,
  createCarAdaptiveControlModeState,
  getCarAdaptiveModeForView,
  isCarAdaptiveAlgorithmRunning,
  isCarAdaptiveAutoMode,
  normalizeCarAdaptiveControlMode
} = require('../util/carAdaptiveControlMode')

test('默认状态为算法自动写串口', () => {
  const state = createCarAdaptiveControlModeState(undefined, 1000)

  assert.equal(state.mode, CAR_ADAPTIVE_CONTROL_MODES.AUTO)
  assert.equal(state.source, CAR_ADAPTIVE_CONTROL_MODE_SOURCES.DEFAULT)
  assert.equal(state.sequence, 0)
  assert.equal(state.changedAt, 1000)
  assert.ok(isCarAdaptiveAutoMode(state))
})

test('兼容历史命名和协议字节取值', () => {
  assert.equal(normalizeCarAdaptiveControlMode('algor'), CAR_ADAPTIVE_CONTROL_MODES.AUTO)
  assert.equal(normalizeCarAdaptiveControlMode('handle'), CAR_ADAPTIVE_CONTROL_MODES.MANUAL)
  assert.equal(normalizeCarAdaptiveControlMode(' MANUAL '), CAR_ADAPTIVE_CONTROL_MODES.MANUAL)
  assert.equal(normalizeCarAdaptiveControlMode(0), CAR_ADAPTIVE_CONTROL_MODES.AUTO)
  assert.equal(normalizeCarAdaptiveControlMode(1), CAR_ADAPTIVE_CONTROL_MODES.MANUAL)
  assert.equal(normalizeCarAdaptiveControlMode('off'), null)
  assert.equal(normalizeCarAdaptiveControlMode(undefined), null)
})

test('切换到手动模式后停止算法自动写入', () => {
  const state = createCarAdaptiveControlModeState(undefined, 1000)
  const result = applyCarAdaptiveControlMode(state, { mode: 'manual', reason: '产线标定' }, 2000)

  assert.equal(result.ok, true)
  assert.equal(result.changed, true)
  assert.equal(result.previousMode, CAR_ADAPTIVE_CONTROL_MODES.AUTO)
  assert.equal(result.state.mode, CAR_ADAPTIVE_CONTROL_MODES.MANUAL)
  assert.equal(result.state.previousMode, CAR_ADAPTIVE_CONTROL_MODES.AUTO)
  assert.equal(result.state.source, CAR_ADAPTIVE_CONTROL_MODE_SOURCES.API)
  assert.equal(result.state.reason, '产线标定')
  assert.equal(result.state.sequence, 1)
  assert.equal(result.state.changedAt, 2000)
  assert.equal(isCarAdaptiveAutoMode(result.state), false)
  assert.equal(state.mode, CAR_ADAPTIVE_CONTROL_MODES.AUTO, '原状态不应被修改')
})

test('重复设置同一模式是幂等的', () => {
  const state = applyCarAdaptiveControlMode(
    createCarAdaptiveControlModeState(undefined, 1000),
    { mode: 'manual' },
    2000
  ).state
  const result = applyCarAdaptiveControlMode(state, { mode: 'manual', reason: '再次设置' }, 3000)

  assert.equal(result.ok, true)
  assert.equal(result.changed, false)
  assert.equal(result.state.sequence, 1)
  assert.equal(result.state.changedAt, 2000)
  assert.equal(result.state.reason, '')
})

test('记录 ECU 来源的模式跟随', () => {
  const state = createCarAdaptiveControlModeState(undefined, 1000)
  const result = applyCarAdaptiveControlMode(state, { mode: 'handle', source: 'ecu' }, 2000)

  assert.equal(result.state.mode, CAR_ADAPTIVE_CONTROL_MODES.MANUAL)
  assert.equal(result.state.source, CAR_ADAPTIVE_CONTROL_MODE_SOURCES.ECU)
})

test('未知来源回落到 api', () => {
  const state = createCarAdaptiveControlModeState(undefined, 1000)
  const result = applyCarAdaptiveControlMode(state, { mode: 'manual', source: '猜的' }, 2000)

  assert.equal(result.state.source, CAR_ADAPTIVE_CONTROL_MODE_SOURCES.API)
})

test('非法模式被拒绝且不产生状态', () => {
  const state = createCarAdaptiveControlModeState(undefined, 1000)
  const result = applyCarAdaptiveControlMode(state, { mode: 'off' }, 2000)

  assert.equal(result.ok, false)
  assert.equal(result.state, undefined)
  assert.match(result.message, /mode/)
})

test('暂停模式停止算法也停止自动写串口', () => {
  const state = applyCarAdaptiveControlMode(
    createCarAdaptiveControlModeState(undefined, 1000),
    { mode: 'paused', source: 'view', reason: '离开自适应模块' },
    2000
  ).state

  assert.equal(state.mode, CAR_ADAPTIVE_CONTROL_MODES.PAUSED)
  assert.equal(state.source, CAR_ADAPTIVE_CONTROL_MODE_SOURCES.VIEW)
  assert.equal(isCarAdaptiveAutoMode(state), false, '暂停时不应自动写串口')
  assert.equal(isCarAdaptiveAlgorithmRunning(state), false, '暂停时算法应停止')
})

test('手动模式下算法继续运行，只是不自动写串口', () => {
  const state = applyCarAdaptiveControlMode(
    createCarAdaptiveControlModeState(undefined, 1000),
    { mode: 'manual' },
    2000
  ).state

  assert.equal(isCarAdaptiveAutoMode(state), false)
  assert.equal(isCarAdaptiveAlgorithmRunning(state), true, '手动模式算法不应停止')
})

test('自动模式下算法运行且自动写串口', () => {
  const state = createCarAdaptiveControlModeState(undefined, 1000)

  assert.equal(isCarAdaptiveAutoMode(state), true)
  assert.equal(isCarAdaptiveAlgorithmRunning(state), true)
})

test('暂停模式的别名', () => {
  assert.equal(normalizeCarAdaptiveControlMode('paused'), CAR_ADAPTIVE_CONTROL_MODES.PAUSED)
  assert.equal(normalizeCarAdaptiveControlMode('pause'), CAR_ADAPTIVE_CONTROL_MODES.PAUSED)
  assert.equal(normalizeCarAdaptiveControlMode('STOP'), CAR_ADAPTIVE_CONTROL_MODES.PAUSED)
})

test('只有自适应模块主页让算法接管，其他视图暂停', () => {
  assert.equal(getCarAdaptiveModeForView('module'), CAR_ADAPTIVE_CONTROL_MODES.AUTO)
  assert.equal(getCarAdaptiveModeForView('host-home'), CAR_ADAPTIVE_CONTROL_MODES.PAUSED)
  assert.equal(getCarAdaptiveModeForView('raw-serial'), CAR_ADAPTIVE_CONTROL_MODES.PAUSED)
  assert.equal(getCarAdaptiveModeForView('other'), CAR_ADAPTIVE_CONTROL_MODES.PAUSED)
  assert.equal(getCarAdaptiveModeForView(undefined), CAR_ADAPTIVE_CONTROL_MODES.PAUSED)
})

test('三态之间可以任意切换并记录来源', () => {
  let state = createCarAdaptiveControlModeState(undefined, 1000)
  const path = [
    ['paused', 'view'],
    ['manual', 'api'],
    ['auto', 'view']
  ]

  path.forEach(([mode, source], index) => {
    const result = applyCarAdaptiveControlMode(state, { mode, source }, 2000 + index)
    assert.equal(result.ok, true)
    assert.equal(result.changed, true)
    assert.equal(result.state.mode, mode)
    assert.equal(result.state.sequence, index + 1)
    state = result.state
  })

  assert.equal(state.previousMode, CAR_ADAPTIVE_CONTROL_MODES.MANUAL)
})

test('过长的原因被截断', () => {
  const state = createCarAdaptiveControlModeState(undefined, 1000)
  const result = applyCarAdaptiveControlMode(state, { mode: 'manual', reason: '标'.repeat(200) }, 2000)

  assert.equal(result.state.reason.length, 120)
})
