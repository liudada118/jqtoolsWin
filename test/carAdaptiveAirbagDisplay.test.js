const test = require('node:test')
const assert = require('node:assert/strict')
const {
  CAR_ADAPTIVE_COMMAND_TAIL,
  buildCarAdaptiveAirbagCommand,
  extractCarAdaptiveAirbagGears,
  parseCarAdaptiveAirbagDisplayInput,
  resolveCarAdaptiveAirbagDisplayState,
  restoreCarAdaptiveFeedbackCommand
} = require('../util/carAdaptiveAirbagDisplay')

test('24 路档位可以构造 55 字节命令并再次提取', () => {
  const gears = Array.from({ length: 24 }, (_, index) => index % 5)
  const command = buildCarAdaptiveAirbagCommand(gears)

  assert.equal(command.length, 55)
  assert.deepEqual(command.slice(-4), CAR_ADAPTIVE_COMMAND_TAIL)
  assert.deepEqual(extractCarAdaptiveAirbagGears(command), gears)
})

test('51 字节 ECU 业务帧可以还原完整帧', () => {
  const gears = new Array(24).fill(3)
  const businessFrame = buildCarAdaptiveAirbagCommand(gears).slice(0, 51)

  assert.deepEqual(extractCarAdaptiveAirbagGears(businessFrame), gears)
  assert.deepEqual(restoreCarAdaptiveFeedbackCommand(businessFrame).slice(-4), CAR_ADAPTIVE_COMMAND_TAIL)
})

test('展示接口同时接受档位和控制命令', () => {
  const gears = new Array(24).fill(0)
  gears[0] = 3
  const fromGears = parseCarAdaptiveAirbagDisplayInput({ gears })
  const fromCommand = parseCarAdaptiveAirbagDisplayInput({ controlCommand: fromGears.command })

  assert.equal(fromGears.ok, true)
  assert.equal(fromGears.command.length, 55)
  assert.deepEqual(fromCommand.gears, gears)
})

test('展示接口拒绝错误长度和非法档位', () => {
  assert.equal(parseCarAdaptiveAirbagDisplayInput({ gears: [3] }).ok, false)
  assert.equal(parseCarAdaptiveAirbagDisplayInput({ gears: new Array(24).fill(9) }).ok, false)
  assert.equal(parseCarAdaptiveAirbagDisplayInput({ controlCommand: new Array(50).fill(0) }).ok, false)
})

test('接口展示覆盖优先于 ECU，清除后可恢复 ECU', () => {
  const overrideGears = new Array(24).fill(3)
  const feedbackGears = new Array(24).fill(4)
  const overridden = resolveCarAdaptiveAirbagDisplayState({
    overrideGears,
    overrideStamp: 3000,
    feedbackOnline: true,
    feedbackGears,
    feedbackStamp: 2000
  })
  const feedback = resolveCarAdaptiveAirbagDisplayState({
    feedbackOnline: true,
    feedbackGears,
    feedbackStamp: 2000
  })

  assert.deepEqual(overridden, {
    gears: overrideGears,
    available: true,
    source: 'api',
    override: true,
    stamp: 3000
  })
  assert.equal(feedback.source, 'ecu')
  assert.deepEqual(feedback.gears, feedbackGears)
})

test('无 ECU 回传时可按配置回落到最近写入命令', () => {
  const gears = new Array(24).fill(2)
  const display = resolveCarAdaptiveAirbagDisplayState({
    feedbackOnline: false,
    allowCommandFallback: true,
    fallbackCommand: buildCarAdaptiveAirbagCommand(gears),
    fallbackStamp: 1234
  })

  assert.equal(display.source, 'command')
  assert.equal(display.available, true)
  assert.deepEqual(display.gears, gears)
})
