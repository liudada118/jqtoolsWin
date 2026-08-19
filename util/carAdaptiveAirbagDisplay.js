'use strict'

/** 汽车自适应气囊协议中的气囊数量。 */
const CAR_ADAPTIVE_AIRBAG_COUNT = 24

/** 完整气囊控制命令长度。 */
const CAR_ADAPTIVE_COMMAND_LENGTH = 55

/** ECU 回传在业务层可见的长度，4 字节帧尾已被分隔器消费。 */
const CAR_ADAPTIVE_FEEDBACK_LENGTH = 51

/** 气囊控制命令帧头。 */
const CAR_ADAPTIVE_COMMAND_HEADER = 31

/** 气囊控制命令帧尾。 */
const CAR_ADAPTIVE_COMMAND_TAIL = Object.freeze([170, 85, 3, 153])

/** 接口可设置的合法气囊档位。 */
const CAR_ADAPTIVE_AIRBAG_GEARS = Object.freeze([0, 1, 2, 3, 4])

/** 客户手动写串口接口允许出现非零档位的气囊编号。 */
const CAR_ADAPTIVE_MANUAL_AIRBAG_IDS = Object.freeze([3, 4, 5, 6])
const CAR_ADAPTIVE_MANUAL_AIRBAG_ID_SET = new Set(CAR_ADAPTIVE_MANUAL_AIRBAG_IDS)

/**
 * 校验并复制一组 24 路气囊档位。
 *
 * @param {unknown} gears 待校验档位数组。
 * @returns {number[]|null} 合法档位副本，非法时返回 null。
 */
function normalizeCarAdaptiveAirbagGears(gears) {
  if (!Array.isArray(gears) || gears.length !== CAR_ADAPTIVE_AIRBAG_COUNT) return null
  if (!gears.every((gear) => Number.isInteger(gear) && CAR_ADAPTIVE_AIRBAG_GEARS.includes(gear))) {
    return null
  }
  return [...gears]
}

/**
 * 从 51 或 55 字节命令中提取 24 路档位。
 *
 * @param {unknown} command ECU 回传业务帧或完整控制命令。
 * @returns {number[]} 24 路合法档位，格式不合法时返回空数组。
 */
function extractCarAdaptiveAirbagGears(command) {
  if (!Array.isArray(command) || ![CAR_ADAPTIVE_FEEDBACK_LENGTH, CAR_ADAPTIVE_COMMAND_LENGTH].includes(command.length)) {
    return []
  }

  const gears = Array.from(
    { length: CAR_ADAPTIVE_AIRBAG_COUNT },
    (_, index) => command[2 * index + 2]
  )
  return normalizeCarAdaptiveAirbagGears(gears) || []
}

/**
 * 根据 24 路档位构造一条 55 字节完整控制命令。
 *
 * @param {unknown} gears 24 路档位。
 * @param {{mode?: number, direction?: number}} [options] 模式位和方向位。
 * @returns {number[]|null} 完整命令，档位非法时返回 null。
 */
function buildCarAdaptiveAirbagCommand(gears, options = {}) {
  const normalized = normalizeCarAdaptiveAirbagGears(gears)
  if (!normalized) return null

  const command = [CAR_ADAPTIVE_COMMAND_HEADER]
  normalized.forEach((gear, index) => command.push(index + 1, gear))
  command.push(options.mode === 1 ? 1 : 0, options.direction === 1 ? 1 : 0)
  command.push(...CAR_ADAPTIVE_COMMAND_TAIL)
  return command
}

/**
 * 校验客户手动写串口接口提交的完整控制命令。
 * 算法内部命令不调用此函数，因此仍可使用全部 24 路气囊。
 *
 * @param {unknown} command 客户提交的 55 字节控制命令。
 * @returns {{ok: boolean, command?: number[], gears?: number[], message?: string}} 校验结果。
 */
function validateCarAdaptiveManualWriteCommand(command) {
  if (!Array.isArray(command) || command.length !== CAR_ADAPTIVE_COMMAND_LENGTH) {
    return { ok: false, message: 'controlCommand 必须是完整的 55 字节数组' }
  }

  if (!command.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
    return { ok: false, message: 'controlCommand 每个字节必须是 0-255 的整数' }
  }

  if (command[0] !== CAR_ADAPTIVE_COMMAND_HEADER) {
    return { ok: false, message: `controlCommand 帧头必须为 ${CAR_ADAPTIVE_COMMAND_HEADER}` }
  }

  const gears = []
  for (let index = 0; index < CAR_ADAPTIVE_AIRBAG_COUNT; index++) {
    const airbagId = index + 1
    const commandAirbagId = command[2 * index + 1]
    const gear = command[2 * index + 2]

    if (commandAirbagId !== airbagId) {
      return { ok: false, message: `controlCommand 第 ${airbagId} 组气囊编号必须为 ${airbagId}` }
    }
    if (!CAR_ADAPTIVE_AIRBAG_GEARS.includes(gear)) {
      return { ok: false, message: `${airbagId} 号气囊档位只允许为 0、1、2、3、4` }
    }
    if (!CAR_ADAPTIVE_MANUAL_AIRBAG_ID_SET.has(airbagId) && gear !== 0) {
      return {
        ok: false,
        message: `客户手动接口只允许控制 3、4、5、6 号气囊，${airbagId} 号档位必须为 0`
      }
    }
    gears.push(gear)
  }

  if (![0, 1].includes(command[49])) {
    return { ok: false, message: 'controlCommand 工作模式只允许为 0 或 1' }
  }
  if (command[50] !== 0) {
    return { ok: false, message: 'controlCommand 下行方向必须为 0' }
  }
  if (!CAR_ADAPTIVE_COMMAND_TAIL.every((value, index) => command[51 + index] === value)) {
    return { ok: false, message: 'controlCommand 帧尾必须为 170、85、3、153' }
  }

  return { ok: true, command: [...command], gears }
}

/**
 * 将 51 字节 ECU 业务帧还原为便于诊断的 55 字节完整帧。
 *
 * @param {unknown} frame 51 字节业务帧。
 * @returns {number[]} 55 字节完整帧，输入非法时返回空数组。
 */
function restoreCarAdaptiveFeedbackCommand(frame) {
  if (!Array.isArray(frame) || frame.length !== CAR_ADAPTIVE_FEEDBACK_LENGTH) return []
  return [...frame, ...CAR_ADAPTIVE_COMMAND_TAIL]
}

/**
 * 解析气囊展示控制接口请求。
 * 接受 `{gears: number[24]}` 或 `{controlCommand: number[51|55]}`。
 *
 * @param {unknown} input 接口请求体。
 * @returns {{ok: boolean, gears?: number[], command?: number[], message?: string}} 解析结果。
 */
function parseCarAdaptiveAirbagDisplayInput(input) {
  const directGears = normalizeCarAdaptiveAirbagGears(input?.gears)
  if (directGears) {
    const unsupportedId = directGears.findIndex(
      (gear, index) => gear !== 0 && !CAR_ADAPTIVE_MANUAL_AIRBAG_ID_SET.has(index + 1)
    ) + 1
    if (unsupportedId > 0) {
      return {
        ok: false,
        message: `气囊展示接口只允许控制 3、4、5、6 号气囊，${unsupportedId} 号档位必须为 0`
      }
    }
    return {
      ok: true,
      gears: directGears,
      command: buildCarAdaptiveAirbagCommand(directGears)
    }
  }

  const sourceCommand = input?.controlCommand ?? input?.command
  const gears = extractCarAdaptiveAirbagGears(sourceCommand)
  if (gears.length === CAR_ADAPTIVE_AIRBAG_COUNT) {
    const unsupportedId = gears.findIndex(
      (gear, index) => gear !== 0 && !CAR_ADAPTIVE_MANUAL_AIRBAG_ID_SET.has(index + 1)
    ) + 1
    if (unsupportedId > 0) {
      return {
        ok: false,
        message: `气囊展示接口只允许控制 3、4、5、6 号气囊，${unsupportedId} 号档位必须为 0`
      }
    }
    return {
      ok: true,
      gears,
      command: sourceCommand.length === CAR_ADAPTIVE_COMMAND_LENGTH
        ? [...sourceCommand]
        : restoreCarAdaptiveFeedbackCommand(sourceCommand)
    }
  }

  return {
    ok: false,
    message: 'gears 必须是 24 项 0-4 档位数组，或传入 51/55 字节 controlCommand'
  }
}

/**
 * 按固定归属合并界面展示状态：3、4、5、6 号只接受接口状态，其余 20 路来自 ECU。
 * ECU 或命令回落中的 3、4、5、6 号始终被清零；接口未设置或清除后，这四路保持熄灭。
 * 没有 ECU 回传时，其余 20 路保持为 0；可选命令回落可作为 ECU 基础状态的替代。
 *
 * @param {object} options 状态来源。
 * @returns {{gears: number[], available: boolean, source: string, baseSource: string, override: boolean, overrideAirbagIds: number[], stamp: number}} 展示状态。
 */
function resolveCarAdaptiveAirbagDisplayState(options = {}) {
  const feedbackGears = normalizeCarAdaptiveAirbagGears(options.feedbackGears)
  let baseGears
  let baseSource = 'none'
  let baseStamp = 0

  if (options.feedbackOnline && feedbackGears) {
    baseGears = [...feedbackGears]
    baseSource = 'ecu'
    baseStamp = Number(options.feedbackStamp) || 0
  }

  const commandGears = extractCarAdaptiveAirbagGears(options.fallbackCommand)
  if (!baseGears && options.allowCommandFallback && commandGears.length === CAR_ADAPTIVE_AIRBAG_COUNT) {
    baseGears = [...commandGears]
    baseSource = 'command'
    baseStamp = Number(options.fallbackStamp) || 0
  }

  // 3–6 号固定归 API 所有，任何 ECU 回传或命令回落都不能改变这四路界面状态。
  if (baseGears) {
    CAR_ADAPTIVE_MANUAL_AIRBAG_IDS.forEach((airbagId) => {
      baseGears[airbagId - 1] = 0
    })
  }

  const overrideGears = normalizeCarAdaptiveAirbagGears(options.overrideGears)
  if (overrideGears) {
    const mergedGears = baseGears ? [...baseGears] : new Array(CAR_ADAPTIVE_AIRBAG_COUNT).fill(0)
    CAR_ADAPTIVE_MANUAL_AIRBAG_IDS.forEach((airbagId) => {
      mergedGears[airbagId - 1] = overrideGears[airbagId - 1]
    })
    return {
      gears: mergedGears,
      available: true,
      source: 'api',
      baseSource,
      override: true,
      overrideAirbagIds: [...CAR_ADAPTIVE_MANUAL_AIRBAG_IDS],
      stamp: Math.max(Number(options.overrideStamp) || 0, baseStamp)
    }
  }

  if (baseGears) {
    return {
      gears: baseGears,
      available: true,
      source: baseSource,
      baseSource,
      override: false,
      overrideAirbagIds: [],
      stamp: baseStamp
    }
  }

  return {
    gears: [],
    available: false,
    source: 'none',
    baseSource: 'none',
    override: false,
    overrideAirbagIds: [],
    stamp: 0
  }
}

module.exports = {
  CAR_ADAPTIVE_AIRBAG_COUNT,
  CAR_ADAPTIVE_AIRBAG_GEARS,
  CAR_ADAPTIVE_MANUAL_AIRBAG_IDS,
  CAR_ADAPTIVE_COMMAND_HEADER,
  CAR_ADAPTIVE_COMMAND_LENGTH,
  CAR_ADAPTIVE_COMMAND_TAIL,
  CAR_ADAPTIVE_FEEDBACK_LENGTH,
  buildCarAdaptiveAirbagCommand,
  extractCarAdaptiveAirbagGears,
  normalizeCarAdaptiveAirbagGears,
  parseCarAdaptiveAirbagDisplayInput,
  resolveCarAdaptiveAirbagDisplayState,
  restoreCarAdaptiveFeedbackCommand,
  validateCarAdaptiveManualWriteCommand
}
