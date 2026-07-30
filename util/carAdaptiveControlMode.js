'use strict'

const { CAR_ADAPTIVE_UI_VIEWS } = require('./carAdaptiveUiControl')

/**
 * 汽车自适应气囊控制模式。
 *
 * | 模式 | 算法 | 自动写串口 | 手动写入 |
 * | --- | --- | --- | --- |
 * | `auto` | 运行 | 每 500ms 写 | 允许，但会被覆盖 |
 * | `manual` | 运行 | 不写 | 允许 |
 * | `paused` | 暂停 | 不写 | 允许 |
 *
 * 三种模式都不影响串口采集和压力数据推送，暂停的只是算法。
 */
const CAR_ADAPTIVE_CONTROL_MODES = Object.freeze({
  AUTO: 'auto',
  MANUAL: 'manual',
  PAUSED: 'paused'
})

/** 模式变更来源，用于排查是谁切换了模式。 */
const CAR_ADAPTIVE_CONTROL_MODE_SOURCES = Object.freeze({
  DEFAULT: 'default',
  API: 'api',
  VIEW: 'view',
  ECU: 'ecu'
})

/** 兼容后端历史命名和协议字节取值的模式别名。 */
const CONTROL_MODE_ALIASES = Object.freeze({
  auto: CAR_ADAPTIVE_CONTROL_MODES.AUTO,
  algor: CAR_ADAPTIVE_CONTROL_MODES.AUTO,
  algorithm: CAR_ADAPTIVE_CONTROL_MODES.AUTO,
  0: CAR_ADAPTIVE_CONTROL_MODES.AUTO,
  manual: CAR_ADAPTIVE_CONTROL_MODES.MANUAL,
  handle: CAR_ADAPTIVE_CONTROL_MODES.MANUAL,
  1: CAR_ADAPTIVE_CONTROL_MODES.MANUAL,
  paused: CAR_ADAPTIVE_CONTROL_MODES.PAUSED,
  pause: CAR_ADAPTIVE_CONTROL_MODES.PAUSED,
  stop: CAR_ADAPTIVE_CONTROL_MODES.PAUSED
})

const MAX_REASON_LENGTH = 120

/**
 * 校验并标准化控制模式。
 * 接受 `auto`/`manual`、历史命名 `algor`/`handle` 和协议字节 `0`/`1`。
 *
 * @param {unknown} value 待校验模式。
 * @returns {string|null} 标准模式或 null。
 */
function normalizeCarAdaptiveControlMode(value) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return CONTROL_MODE_ALIASES[value] || null
  }
  const mode = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return CONTROL_MODE_ALIASES[mode] || null
}

/**
 * 校验并标准化模式变更来源。
 *
 * @param {unknown} value 待校验来源。
 * @returns {string} 标准来源，未知来源回落到 `api`。
 */
function normalizeCarAdaptiveControlModeSource(value) {
  const source = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return Object.values(CAR_ADAPTIVE_CONTROL_MODE_SOURCES).includes(source)
    ? source
    : CAR_ADAPTIVE_CONTROL_MODE_SOURCES.API
}

/**
 * 创建控制模式状态。
 *
 * @param {unknown} [mode] 初始模式，非法值回落到 `auto`。
 * @param {number} [now] 当前毫秒时间戳。
 * @returns {object} 初始控制模式状态。
 */
function createCarAdaptiveControlModeState(mode, now = Date.now()) {
  return {
    mode: normalizeCarAdaptiveControlMode(mode) || CAR_ADAPTIVE_CONTROL_MODES.AUTO,
    previousMode: null,
    source: CAR_ADAPTIVE_CONTROL_MODE_SOURCES.DEFAULT,
    reason: '',
    sequence: 0,
    changedAt: now
  }
}

/**
 * 判断是否应由算法自动把控制命令写回串口。
 * 只有 `auto` 满足，`manual` 和 `paused` 都不写。
 *
 * @param {object} state 控制模式状态。
 * @returns {boolean} 处于自动模式时为 true。
 */
function isCarAdaptiveAutoMode(state) {
  return state?.mode === CAR_ADAPTIVE_CONTROL_MODES.AUTO
}

/**
 * 判断算法是否应继续处理串口帧。
 * 只有 `paused` 会停止算法；`manual` 下算法照常运行，只是不下发。
 *
 * @param {object} state 控制模式状态。
 * @returns {boolean} 算法应运行时为 true。
 */
function isCarAdaptiveAlgorithmRunning(state) {
  return state?.mode !== CAR_ADAPTIVE_CONTROL_MODES.PAUSED
}

/**
 * 根据请求生成下一份控制模式状态。
 * 重复设置同一模式是幂等的：返回 ok 但 changed 为 false，序号和时间戳都不变。
 *
 * @param {object} currentState 当前控制模式状态。
 * @param {unknown} input 请求体，形如 `{mode, source, reason}`。
 * @param {number} [now] 当前毫秒时间戳。
 * @returns {{ok: boolean, state?: object, changed?: boolean, previousMode?: string, message?: string}} 应用结果。
 */
function applyCarAdaptiveControlMode(currentState, input, now = Date.now()) {
  const mode = normalizeCarAdaptiveControlMode(input?.mode)
  if (!mode) {
    return {
      ok: false,
      message: `mode 只允许为 ${Object.values(CAR_ADAPTIVE_CONTROL_MODES).join('、')}`
    }
  }

  const state = {
    ...createCarAdaptiveControlModeState(currentState?.mode, now),
    ...currentState
  }

  if (state.mode === mode) {
    return { ok: true, state, changed: false, previousMode: mode }
  }

  const reason = typeof input?.reason === 'string'
    ? input.reason.trim().slice(0, MAX_REASON_LENGTH)
    : ''

  return {
    ok: true,
    changed: true,
    previousMode: state.mode,
    state: {
      ...state,
      mode,
      previousMode: state.mode,
      source: normalizeCarAdaptiveControlModeSource(input?.source),
      reason,
      sequence: Number(state.sequence || 0) + 1,
      changedAt: now
    }
  }
}

/**
 * 返回某个 SDK 视图应当对应的气囊控制模式。
 *
 * 只有自适应模块主页 `module` 让算法接管气囊；宿主主页、原始数据页和其他页面
 * 都暂停算法。原始数据页只看串口原始帧，不需要算法运行。
 *
 * @param {string} view SDK 页面视图标识。
 * @returns {string} 目标控制模式。
 */
function getCarAdaptiveModeForView(view) {
  return view === CAR_ADAPTIVE_UI_VIEWS.MODULE
    ? CAR_ADAPTIVE_CONTROL_MODES.AUTO
    : CAR_ADAPTIVE_CONTROL_MODES.PAUSED
}

module.exports = {
  CAR_ADAPTIVE_CONTROL_MODES,
  CAR_ADAPTIVE_CONTROL_MODE_SOURCES,
  applyCarAdaptiveControlMode,
  createCarAdaptiveControlModeState,
  getCarAdaptiveModeForView,
  isCarAdaptiveAlgorithmRunning,
  isCarAdaptiveAutoMode,
  normalizeCarAdaptiveControlMode,
  normalizeCarAdaptiveControlModeSource
}
