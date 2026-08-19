const test = require('node:test')
const assert = require('node:assert/strict')
const {
  CAR_ADAPTIVE_MANUAL_AIRBAG_IDS,
  CAR_ADAPTIVE_COMMAND_TAIL,
  buildCarAdaptiveAirbagCommand,
  extractCarAdaptiveAirbagGears,
  parseCarAdaptiveAirbagDisplayInput,
  resolveCarAdaptiveAirbagDisplayState,
  restoreCarAdaptiveFeedbackCommand,
  validateCarAdaptiveManualWriteCommand
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

test('展示接口接受只控制 3、4、5、6 号的档位和控制命令', () => {
  const gears = new Array(24).fill(0)
  gears[2] = 3
  gears[5] = 2
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

test('展示接口拒绝通过 API 控制其余 20 路气囊', () => {
  const gears = new Array(24).fill(0)
  gears[6] = 3
  const parsed = parseCarAdaptiveAirbagDisplayInput({ gears })

  assert.equal(parsed.ok, false)
  assert.match(parsed.message, /只允许控制 3、4、5、6 号气囊/)
})

test('客户手动写串口命令只允许 3、4、5、6 号气囊动作', () => {
  const gears = new Array(24).fill(0)
  gears[2] = 1
  gears[3] = 2
  gears[4] = 3
  gears[5] = 4
  const result = validateCarAdaptiveManualWriteCommand(buildCarAdaptiveAirbagCommand(gears))

  assert.deepEqual(CAR_ADAPTIVE_MANUAL_AIRBAG_IDS, [3, 4, 5, 6])
  assert.equal(result.ok, true)
  assert.deepEqual(result.gears.slice(2, 6), [1, 2, 3, 4])
})

test('客户手动写串口命令拒绝 7 号气囊且不能伪造协议布局', () => {
  const gears = new Array(24).fill(0)
  gears[6] = 3
  const blocked = validateCarAdaptiveManualWriteCommand(buildCarAdaptiveAirbagCommand(gears))
  const malformed = buildCarAdaptiveAirbagCommand(new Array(24).fill(0))
  malformed[13] = 99

  assert.equal(blocked.ok, false)
  assert.match(blocked.message, /只允许控制 3、4、5、6 号气囊/)
  assert.equal(validateCarAdaptiveManualWriteCommand(malformed).ok, false)
})

test('3 到 6 号只使用 API，其余 20 路持续使用 ECU 回传', () => {
  const overrideGears = new Array(24).fill(0)
  overrideGears.splice(2, 4, 1, 2, 3, 4)
  const feedbackGears = Array.from({ length: 24 }, (_, index) => index % 5)
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

  const ecuOwnedGears = [...feedbackGears]
  ecuOwnedGears.splice(2, 4, 0, 0, 0, 0)
  const expectedGears = [...ecuOwnedGears]
  expectedGears.splice(2, 4, 1, 2, 3, 4)

  assert.deepEqual(overridden.gears, expectedGears)
  assert.equal(overridden.source, 'api')
  assert.equal(overridden.baseSource, 'ecu')
  assert.equal(overridden.override, true)
  assert.deepEqual(overridden.overrideAirbagIds, [3, 4, 5, 6])
  assert.equal(overridden.stamp, 3000)
  assert.equal(feedback.source, 'ecu')
  assert.equal(feedback.baseSource, 'ecu')
  assert.deepEqual(feedback.gears, ecuOwnedGears)
})

test('没有 ECU 回传时 API 四路仍可显示，其余 20 路保持熄灭', () => {
  const overrideGears = new Array(24).fill(0)
  overrideGears[2] = 3
  const display = resolveCarAdaptiveAirbagDisplayState({ overrideGears, overrideStamp: 1000 })

  assert.equal(display.available, true)
  assert.equal(display.baseSource, 'none')
  assert.equal(display.gears[2], 3)
  assert.equal(display.gears.filter((gear, index) => index !== 2 && gear !== 0).length, 0)
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
  assert.deepEqual(display.gears.slice(0, 2), [2, 2])
  assert.deepEqual(display.gears.slice(2, 6), [0, 0, 0, 0])
  assert.deepEqual(display.gears.slice(6), new Array(18).fill(2))
})
