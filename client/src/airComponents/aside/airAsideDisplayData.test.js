import { createAirAsideDisplayData } from './airAsideDisplayData';

test('接口展示覆盖在算法数据为空时仍可点亮气囊', () => {
    const algorFeed = new Array(24).fill(0);
    algorFeed[2] = 3;
    algorFeed[3] = 3;

    const result = createAirAsideDisplayData({
        chartData: {},
        algorFeed,
        controlsMode: 'algor',
        feedbackOnline: true,
        now: () => 1000,
    });

    expect(result.controlFeed).toEqual(algorFeed);
    expect(result.feedbackOnline).toBe(true);
    expect(result.t).toBe(1000);
});

test('已有算法数据时保留乘员状态和控制命令', () => {
    const controlCommand = new Array(55).fill(0);
    controlCommand[2] = 3;

    const result = createAirAsideDisplayData({
        chartData: {
            body_type: '大人',
            seat_state: 'ADAPTIVE_LOCKED',
            control_command: controlCommand,
        },
        algorFeed: new Array(24).fill(0),
        controlsMode: 'algor',
        now: () => 1000,
    });

    expect(result.body_type).toBe('大人');
    expect(result.seat_state).toBe('ADAPTIVE_LOCKED');
    expect(result.control_command[0]).toBe(3);
});
