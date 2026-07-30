'use strict'

const { normalizeCarAdaptiveSensorId } = require('./carAdaptiveProtocol')

const CAR_ADAPTIVE_UI_ACTIONS = Object.freeze({
  RETURN_HOME: 'return-home',
  OPEN_MODULE: 'open-module',
  OPEN_RAW_SERIAL: 'open-raw-serial',
  SELECT_SENSOR: 'select-sensor'
})

const CAR_ADAPTIVE_UI_VIEWS = Object.freeze({
  HOST_HOME: 'host-home',
  MODULE: 'module',
  RAW_SERIAL: 'raw-serial',
  OTHER: 'other'
})

/**
 * 创建局域网 UI 控制状态。
 * @param {number} sensorId 初始展示的传感器标识。
 * @returns {object} 初始控制状态。
 */
function createCarAdaptiveUiState(sensorId = 1) {
  return {
    selectedSensorId: normalizeCarAdaptiveSensorId(sensorId) || 1,
    view: CAR_ADAPTIVE_UI_VIEWS.MODULE,
    sequence: 0,
    lastCommand: null,
    lastAcknowledgement: null,
    lastClientReport: null
  }
}

/**
 * 校验远程控制动作名称。
 * @param {unknown} value 待校验动作。
 * @returns {string|null} 标准动作或 null。
 */
function normalizeCarAdaptiveUiAction(value) {
  const action = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return Object.values(CAR_ADAPTIVE_UI_ACTIONS).includes(action) ? action : null
}

/**
 * 校验前端上报的当前视图。
 * @param {unknown} value 待校验视图。
 * @returns {string|null} 标准视图或 null。
 */
function normalizeCarAdaptiveUiView(value) {
  const view = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return Object.values(CAR_ADAPTIVE_UI_VIEWS).includes(view) ? view : null
}

/**
 * 校验并规范化一条远程 UI 控制命令。
 * @param {unknown} input HTTP 请求体。
 * @returns {{ok: boolean, action?: string, sensorId?: number, message?: string}} 校验结果。
 */
function parseCarAdaptiveUiCommand(input) {
  const action = normalizeCarAdaptiveUiAction(input?.action)
  if (!action) {
    return {
      ok: false,
      message: `action 只允许为 ${Object.values(CAR_ADAPTIVE_UI_ACTIONS).join('、')}`
    }
  }

  if (action !== CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR) {
    return { ok: true, action }
  }

  const sensorId = normalizeCarAdaptiveSensorId(input?.sensorId)
  if (sensorId === null) {
    return { ok: false, message: 'sensorId 只允许为 1（主驾）或 2（副驾）' }
  }

  return { ok: true, action, sensorId }
}

/**
 * 根据命令生成下一份控制状态和可广播命令。
 * @param {object} currentState 当前控制状态。
 * @param {unknown} input HTTP 请求体。
 * @param {number} now 当前毫秒时间戳。
 * @returns {{ok: boolean, state?: object, command?: object, message?: string}} 应用结果。
 */
function applyCarAdaptiveUiCommand(currentState, input, now = Date.now()) {
  const parsed = parseCarAdaptiveUiCommand(input)
  if (!parsed.ok) return parsed

  const sequence = Number(currentState?.sequence || 0) + 1
  const command = {
    id: `ui-${now}-${sequence}`,
    action: parsed.action,
    sensorId: parsed.sensorId || null,
    issuedAt: now
  }
  const nextState = {
    ...createCarAdaptiveUiState(currentState?.selectedSensorId),
    ...currentState,
    sequence,
    lastCommand: command,
    lastAcknowledgement: null
  }

  if (parsed.action === CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR) {
    nextState.selectedSensorId = parsed.sensorId
  } else if (parsed.action === CAR_ADAPTIVE_UI_ACTIONS.RETURN_HOME) {
    nextState.view = CAR_ADAPTIVE_UI_VIEWS.HOST_HOME
  } else if (parsed.action === CAR_ADAPTIVE_UI_ACTIONS.OPEN_MODULE) {
    nextState.view = CAR_ADAPTIVE_UI_VIEWS.MODULE
  } else if (parsed.action === CAR_ADAPTIVE_UI_ACTIONS.OPEN_RAW_SERIAL) {
    nextState.view = CAR_ADAPTIVE_UI_VIEWS.RAW_SERIAL
  }

  return { ok: true, state: nextState, command }
}

/**
 * 合并 SDK 页面主动上报的视图和主副驾状态。
 * @param {object} currentState 当前控制状态。
 * @param {unknown} report WebSocket 页面状态上报。
 * @param {number} now 当前毫秒时间戳。
 * @returns {object} 更新后的控制状态。
 */
function applyCarAdaptiveUiReport(currentState, report, now = Date.now()) {
  const sensorId = normalizeCarAdaptiveSensorId(report?.sensorId)
  const view = normalizeCarAdaptiveUiView(report?.view)
  const nextState = { ...currentState }

  if (sensorId !== null) nextState.selectedSensorId = sensorId
  if (view) nextState.view = view
  nextState.lastClientReport = {
    clientId: typeof report?.clientId === 'string' ? report.clientId : '',
    sensorId: sensorId || nextState.selectedSensorId,
    view: view || nextState.view,
    reportedAt: now
  }
  return nextState
}

/**
 * 记录 SDK 页面对最近一条远程命令的执行回执。
 * @param {object} currentState 当前控制状态。
 * @param {unknown} acknowledgement WebSocket 执行回执。
 * @param {number} now 当前毫秒时间戳。
 * @returns {object} 更新后的控制状态。
 */
function applyCarAdaptiveUiAcknowledgement(currentState, acknowledgement, now = Date.now()) {
  const commandId = typeof acknowledgement?.commandId === 'string'
    ? acknowledgement.commandId
    : ''
  if (!commandId || commandId !== currentState?.lastCommand?.id) {
    return currentState
  }

  return {
    ...currentState,
    lastAcknowledgement: {
      commandId,
      clientId: typeof acknowledgement?.clientId === 'string' ? acknowledgement.clientId : '',
      status: acknowledgement?.status === 'error' ? 'error' : 'applied',
      sensorId: normalizeCarAdaptiveSensorId(acknowledgement?.sensorId),
      view: normalizeCarAdaptiveUiView(acknowledgement?.view),
      message: typeof acknowledgement?.message === 'string' ? acknowledgement.message : '',
      acknowledgedAt: now
    }
  }
}

module.exports = {
  CAR_ADAPTIVE_UI_ACTIONS,
  CAR_ADAPTIVE_UI_VIEWS,
  createCarAdaptiveUiState,
  normalizeCarAdaptiveUiAction,
  normalizeCarAdaptiveUiView,
  parseCarAdaptiveUiCommand,
  applyCarAdaptiveUiCommand,
  applyCarAdaptiveUiReport,
  applyCarAdaptiveUiAcknowledgement
}
