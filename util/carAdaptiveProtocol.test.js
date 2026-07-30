'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  CAR_ADAPTIVE_SENSOR_DATA_LENGTH,
  CAR_ADAPTIVE_SERIAL_FRAME_LENGTH,
  normalizeCarAdaptiveSensorId,
  parseCarAdaptiveSerialFrame,
  getCarAdaptiveSensorRole
} = require('./carAdaptiveProtocol')

/** 生成指定标识符的完整测试帧。 */
function createFrame(sensorId) {
  return [sensorId, ...Array.from({ length: CAR_ADAPTIVE_SENSOR_DATA_LENGTH }, (_, index) => index % 256)]
}

test('主传感器帧会移除标识符并保留 144 点数据', () => {
  const frame = createFrame(1)
  const result = parseCarAdaptiveSerialFrame(frame)

  assert.equal(frame.length, CAR_ADAPTIVE_SERIAL_FRAME_LENGTH)
  assert.equal(result.sensorId, 1)
  assert.equal(result.sensorData.length, CAR_ADAPTIVE_SENSOR_DATA_LENGTH)
  assert.deepEqual(result.sensorData, frame.slice(1))
})

test('副传感器帧支持 Buffer 输入', () => {
  const result = parseCarAdaptiveSerialFrame(Buffer.from(createFrame(2)))

  assert.equal(result.sensorId, 2)
  assert.equal(result.sensorData[0], 0)
  assert.equal(result.sensorData[143], 143)
})

test('拒绝旧 144 字节帧和未知标识符', () => {
  assert.equal(parseCarAdaptiveSerialFrame(new Array(144).fill(0)), null)
  assert.equal(parseCarAdaptiveSerialFrame(createFrame(3)), null)
  assert.equal(normalizeCarAdaptiveSensorId('1'), 1)
  assert.equal(normalizeCarAdaptiveSensorId(0), null)
})

test('传感器角色名称与标识符一致', () => {
  assert.equal(getCarAdaptiveSensorRole(1), '主')
  assert.equal(getCarAdaptiveSensorRole(2), '副')
})
