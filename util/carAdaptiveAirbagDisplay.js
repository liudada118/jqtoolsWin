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
    return {
      ok: true,
      gears: directGears,
      command: buildCarAdaptiveAirbagCommand(directGears)
    }
  }

  const sourceCommand = input?.controlCommand ?? input?.command
  const gears = extractCarAdaptiveAirbagGears(sourceCommand)
  if (gears.length === CAR_ADAPTIVE_AIRBAG_COUNT) {
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
 * 按“接口覆盖、ECU 回传、命令回落”的优先级解析界面展示状态。
 *
 * @param {object} options 状态来源。
 * @returns {{gears: number[], available: boolean, source: string, override: boolean, stamp: number}} 展示状态。
 */
function resolveCarAdaptiveAirbagDisplayState(options = {}) {
  const overrideGears = normalizeCarAdaptiveAirbagGears(options.overrideGears)
  if (overrideGears) {
    return {
      gears: overrideGears,
      available: true,
      source: 'api',
      override: true,
      stamp: Number(options.overrideStamp) || 0
    }
  }

  const feedbackGears = normalizeCarAdaptiveAirbagGears(options.feedbackGears)
  if (options.feedbackOnline && feedbackGears) {
    return {
      gears: feedbackGears,
      available: true,
      source: 'ecu',
      override: false,
      stamp: Number(options.feedbackStamp) || 0
    }
  }

  const commandGears = extractCarAdaptiveAirbagGears(options.fallbackCommand)
  if (options.allowCommandFallback && commandGears.length === CAR_ADAPTIVE_AIRBAG_COUNT) {
    return {
      gears: commandGears,
      available: true,
      source: 'command',
      override: false,
      stamp: Number(options.fallbackStamp) || 0
    }
  }

  return { gears: [], available: false, source: 'none', override: false, stamp: 0 }
}

module.exports = {
  CAR_ADAPTIVE_AIRBAG_COUNT,
  CAR_ADAPTIVE_AIRBAG_GEARS,
  CAR_ADAPTIVE_COMMAND_HEADER,
  CAR_ADAPTIVE_COMMAND_LENGTH,
  CAR_ADAPTIVE_COMMAND_TAIL,
  CAR_ADAPTIVE_FEEDBACK_LENGTH,
  buildCarAdaptiveAirbagCommand,
  extractCarAdaptiveAirbagGears,
  normalizeCarAdaptiveAirbagGears,
  parseCarAdaptiveAirbagDisplayInput,
  resolveCarAdaptiveAirbagDisplayState,
  restoreCarAdaptiveFeedbackCommand
}
