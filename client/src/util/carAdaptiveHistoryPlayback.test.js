import {
    getCarAdaptiveHistoryPlaybackActive,
    shouldFilterCarAdaptiveSingleStream,
    shouldUseCarAdaptiveLiveSnapshot
} from './carAdaptiveHistoryPlayback'

test('收到历史帧后保持历史回放状态', () => {
    expect(getCarAdaptiveHistoryPlaybackActive(false, {
        carAdaptiveHistoryFrame: true
    })).toBe(true)
})

test('历史关闭消息恢复实时双路数据', () => {
    const message = {
        carAdaptiveHistoryState: { active: false },
        carAdaptiveSensorsData: [{ sensorId: 1 }]
    }

    expect(getCarAdaptiveHistoryPlaybackActive(true, message)).toBe(false)
    expect(shouldUseCarAdaptiveLiveSnapshot(message, false)).toBe(true)
})

test('双路协议不会过滤带标识的历史单路帧', () => {
    expect(shouldFilterCarAdaptiveSingleStream({
        carAdaptiveHistoryFrame: true,
        sitData: { carAir: { arr: new Array(144).fill(0) } }
    }, true)).toBe(false)

    expect(shouldFilterCarAdaptiveSingleStream({
        sitData: { carAir: { arr: new Array(144).fill(0) } }
    }, true)).toBe(true)
})
