'use strict'

/**
 * 创建一个只发送最新状态的限频广播器。
 * 高频请求会在同一个时间窗口内合并，避免重复发送内容相同的大型快照。
 *
 * @param {object} options 广播配置。
 * @param {number} options.intervalMs 两次广播之间的最小毫秒数。
 * @param {() => string|Buffer} options.createPayload 发送时创建最新载荷。
 * @param {(payload: string|Buffer) => void} options.send 实际发送载荷的函数。
 * @param {() => number} [options.now] 当前时间函数，默认使用 Date.now。
 * @param {(callback: () => void, delay: number) => unknown} [options.scheduleTimer] 定时器创建函数。
 * @param {(timer: unknown) => void} [options.cancelTimer] 定时器取消函数。
 * @returns {{request: () => boolean, dispose: () => void, getState: () => object}} 限频广播控制器。
 */
function createRateLimitedBroadcaster({
  intervalMs,
  createPayload,
  send,
  now = Date.now,
  scheduleTimer = setTimeout,
  cancelTimer = clearTimeout
}) {
  const normalizedInterval = Number(intervalMs)
  if (!Number.isFinite(normalizedInterval) || normalizedInterval <= 0) {
    throw new TypeError('intervalMs 必须是大于 0 的有限数字')
  }
  if (typeof createPayload !== 'function' || typeof send !== 'function') {
    throw new TypeError('createPayload 和 send 必须是函数')
  }

  let lastSentAt = Number.NEGATIVE_INFINITY
  let pending = false
  let timer = null
  let disposed = false

  /** 发送当前最新载荷，并清除待发送标记。 */
  function emitPending() {
    timer = null
    if (disposed || !pending) return false

    pending = false
    lastSentAt = now()
    send(createPayload())
    return true
  }

  /**
   * 请求广播一次；在限频窗口内的多次请求会合并为下一次发送。
   * @returns {boolean} 本次请求是否立即完成了发送。
   */
  function request() {
    if (disposed) return false

    pending = true
    const elapsed = now() - lastSentAt
    if (elapsed >= normalizedInterval) {
      if (timer !== null) {
        cancelTimer(timer)
        timer = null
      }
      return emitPending()
    }

    if (timer === null) {
      timer = scheduleTimer(emitPending, Math.max(0, normalizedInterval - elapsed))
    }
    return false
  }

  /** 停止广播器并取消尚未执行的发送。 */
  function dispose() {
    disposed = true
    pending = false
    if (timer !== null) {
      cancelTimer(timer)
      timer = null
    }
  }

  /**
   * 返回诊断状态，供测试和运行监控确认限频是否生效。
   * @returns {{intervalMs:number,lastSentAt:number,pending:boolean,scheduled:boolean,disposed:boolean}} 当前状态。
   */
  function getState() {
    return {
      intervalMs: normalizedInterval,
      lastSentAt,
      pending,
      scheduled: timer !== null,
      disposed
    }
  }

  return { request, dispose, getState }
}

module.exports = { createRateLimitedBroadcaster }
