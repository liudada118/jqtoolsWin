import {
    getCarAdaptiveHistoryPlaybackActive,
    shouldFilterCarAdaptiveSingleStream,
    shouldUseCarAdaptiveLiveSnapshot,
    stripCarAdaptiveSingleStreamFields
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

test('旧版单路离线状态不会覆盖当前双路主副驾状态', () => {
    const filtered = stripCarAdaptiveSingleStreamFields({
        sitData: {
            undefined: { status: 'offline' },
            carAir: { type: 'carAir', status: 'offline' }
        },
        algorData: { sensor_id: 1 },
        algorFeed: new Array(24).fill(0),
        keep: 'value'
    })

    expect(filtered).toEqual({ keep: 'value' })
})

test('过滤汽车单路字段时保留其他有效设备数据', () => {
    const bed = { type: 'bed', status: 'online', arr: [1, 2] }
    const filtered = stripCarAdaptiveSingleStreamFields({
        sitData: {
            carAir: { type: 'carAir', status: 'offline' },
            bed
        }
    })

    expect(filtered.sitData).toEqual({ bed })
})
