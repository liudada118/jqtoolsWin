'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  CAR_ADAPTIVE_UI_ACTIONS,
  CAR_ADAPTIVE_UI_VIEWS,
  createCarAdaptiveUiState,
  parseCarAdaptiveUiCommand,
  applyCarAdaptiveUiCommand,
  applyCarAdaptiveUiReport,
  applyCarAdaptiveUiAcknowledgement
} = require('./carAdaptiveUiControl')

test('远程选择副驾会更新状态并生成可追踪命令', () => {
  const result = applyCarAdaptiveUiCommand(
    createCarAdaptiveUiState(),
    { action: CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR, sensorId: 2 },
    1000
  )

  assert.equal(result.ok, true)
  assert.equal(result.state.selectedSensorId, 2)
  assert.equal(result.state.sequence, 1)
  assert.equal(result.command.id, 'ui-1000-1')
})

test('返回主页和打开原始数据会更新目标视图', () => {
  const home = applyCarAdaptiveUiCommand(
    createCarAdaptiveUiState(),
    { action: CAR_ADAPTIVE_UI_ACTIONS.RETURN_HOME },
    1000
  )
  const raw = applyCarAdaptiveUiCommand(
    home.state,
    { action: CAR_ADAPTIVE_UI_ACTIONS.OPEN_RAW_SERIAL },
    1001
  )

  assert.equal(home.state.view, CAR_ADAPTIVE_UI_VIEWS.HOST_HOME)
  assert.equal(raw.state.view, CAR_ADAPTIVE_UI_VIEWS.RAW_SERIAL)
  assert.equal(raw.state.sequence, 2)
})

test('拒绝未知动作和非法传感器标识', () => {
  assert.equal(parseCarAdaptiveUiCommand({ action: 'unknown' }).ok, false)
  assert.equal(parseCarAdaptiveUiCommand({
    action: CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR,
    sensorId: 3
  }).ok, false)
})

test('页面状态上报和命令回执只接受规范值', () => {
  const commandResult = applyCarAdaptiveUiCommand(
    createCarAdaptiveUiState(),
    { action: CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR, sensorId: 2 },
    1000
  )
  const reported = applyCarAdaptiveUiReport(commandResult.state, {
    clientId: 'display-1',
    sensorId: 1,
    view: CAR_ADAPTIVE_UI_VIEWS.MODULE
  }, 1001)
  const acknowledged = applyCarAdaptiveUiAcknowledgement(reported, {
    commandId: commandResult.command.id,
    clientId: 'display-1',
    status: 'applied',
    sensorId: 2,
    view: CAR_ADAPTIVE_UI_VIEWS.MODULE
  }, 1002)

  assert.equal(reported.selectedSensorId, 1)
  assert.equal(reported.lastClientReport.clientId, 'display-1')
  assert.equal(acknowledged.lastAcknowledgement.commandId, commandResult.command.id)
  assert.equal(
    applyCarAdaptiveUiAcknowledgement(reported, { commandId: 'other' }, 1002),
    reported
  )
})
