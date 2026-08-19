/**
 * 根据 WebSocket 消息更新汽车历史回放是否处于激活状态。
 * @param {boolean} currentActive 当前状态。
 * @param {object} message WebSocket 消息。
 * @returns {boolean} 更新后的状态。
 */
export function getCarAdaptiveHistoryPlaybackActive(currentActive, message) {
    if (message?.carAdaptiveHistoryState) {
        return Boolean(message.carAdaptiveHistoryState.active)
    }
    if (message?.carAdaptiveHistoryFrame) return true
    return currentActive
}

/**
 * 判断当前双路实时快照是否允许更新页面展示。
 * @param {object} message WebSocket 消息。
 * @param {boolean} historyActive 历史回放状态。
 * @returns {boolean} true 表示使用实时快照。
 */
export function shouldUseCarAdaptiveLiveSnapshot(message, historyActive) {
    return Array.isArray(message?.carAdaptiveSensorsData) && !historyActive
}

/**
 * 判断旧版单路汽车数据是否应在双路协议下被过滤。
 * 带 carAdaptiveHistoryFrame 标识的历史帧必须保留。
 * @param {object} message WebSocket 消息。
 * @param {boolean} dualStreamEnabled 是否已启用双路协议。
 * @returns {boolean} true 表示过滤单路汽车数据。
 */
export function shouldFilterCarAdaptiveSingleStream(message, dualStreamEnabled) {
    return Boolean(dualStreamEnabled && !message?.carAdaptiveHistoryFrame)
}

/**
 * 清除双路协议启用后仍由旧链路推送的汽车单路字段。
 * 未识别串口会产生名为 undefined 的状态项，也必须丢弃，避免覆盖当前主副驾在线状态。
 * @param {object} message WebSocket 消息。
 * @returns {object} 不包含旧汽车单路字段的新消息。
 */
export function stripCarAdaptiveSingleStreamFields(message) {
    const filteredMessage = { ...(message || {}) }

    if (filteredMessage.sitData && typeof filteredMessage.sitData === 'object') {
        const nextSitData = Object.fromEntries(
            Object.entries(filteredMessage.sitData).filter(([key, value]) => (
                key !== 'carAir' &&
                key !== 'undefined' &&
                value?.type !== 'carAir'
            ))
        )

        if (Object.keys(nextSitData).length) filteredMessage.sitData = nextSitData
        else delete filteredMessage.sitData
    }

    if (filteredMessage.algorData?.sensor_id) delete filteredMessage.algorData
    if (filteredMessage.algorFeed) delete filteredMessage.algorFeed

    return filteredMessage
}
