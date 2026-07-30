'use strict'

const CAR_ADAPTIVE_SENSOR_DATA_LENGTH = 144
const CAR_ADAPTIVE_SERIAL_FRAME_LENGTH = 145
const CAR_ADAPTIVE_MAIN_SENSOR_ID = 1
const CAR_ADAPTIVE_SECONDARY_SENSOR_ID = 2
const CAR_ADAPTIVE_SENSOR_IDS = Object.freeze([
  CAR_ADAPTIVE_MAIN_SENSOR_ID,
  CAR_ADAPTIVE_SECONDARY_SENSOR_ID
])
const CAR_ADAPTIVE_SENSOR_ID_SET = new Set(CAR_ADAPTIVE_SENSOR_IDS)

/**
 * 将接口输入转换为有效的汽车传感器标识符。
 *
 * @param {unknown} value 待校验的标识符。
 * @returns {1|2|null} 主传感器为 1，副传感器为 2，无效值返回 null。
 */
function normalizeCarAdaptiveSensorId(value) {
  const sensorId = Number(value)
  return Number.isInteger(sensorId) && CAR_ADAPTIVE_SENSOR_ID_SET.has(sensorId)
    ? sensorId
    : null
}

/**
 * 解析汽车自适应串口帧，第 1 字节为传感器标识，后 144 字节为算法数据。
 *
 * @param {Buffer|number[]} frame 145 字节串口帧。
 * @returns {{sensorId: 1|2, sensorData: number[]}|null} 协议无效时返回 null。
 */
function parseCarAdaptiveSerialFrame(frame) {
  if ((!Buffer.isBuffer(frame) && !Array.isArray(frame)) || frame.length !== CAR_ADAPTIVE_SERIAL_FRAME_LENGTH) {
    return null
  }

  const sensorId = normalizeCarAdaptiveSensorId(frame[0])
  if (sensorId === null) {
    return null
  }

  const sensorData = Array.from(frame).slice(1)
  if (sensorData.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null
  }

  return { sensorId, sensorData }
}

/**
 * 返回传感器在 UI 和接口中使用的中文角色名称。
 *
 * @param {1|2} sensorId 传感器标识符。
 * @returns {'主'|'副'} 传感器角色。
 */
function getCarAdaptiveSensorRole(sensorId) {
  return sensorId === CAR_ADAPTIVE_SECONDARY_SENSOR_ID ? '副' : '主'
}

module.exports = {
  CAR_ADAPTIVE_SENSOR_DATA_LENGTH,
  CAR_ADAPTIVE_SERIAL_FRAME_LENGTH,
  CAR_ADAPTIVE_MAIN_SENSOR_ID,
  CAR_ADAPTIVE_SECONDARY_SENSOR_ID,
  CAR_ADAPTIVE_SENSOR_IDS,
  normalizeCarAdaptiveSensorId,
  parseCarAdaptiveSerialFrame,
  getCarAdaptiveSensorRole
}
