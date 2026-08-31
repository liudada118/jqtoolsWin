import {
    AIRBAG_DISPLAY_MODES,
    DEFAULT_AIRBAG_DISPLAY_MODE,
    areAirAsideDisplayDataEqual,
    createAirAsideDisplayData,
    retainAirAsideOccupantState,
} from './airAsideDisplayData';

test('气囊展示默认使用 ECU 和 API 合并后的当前状态', () => {
    expect(DEFAULT_AIRBAG_DISPLAY_MODE).toBe(AIRBAG_DISPLAY_MODES.EFFECTIVE);
});

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
    expect(result.algorithmCommandAvailable).toBe(true);
});

test('算法指令始终直读 Python 控制帧，不受手动展示模式影响', () => {
    const controlCommand = new Array(55).fill(0);
    controlCommand[2] = 3;
    controlCommand[4] = 4;
    const handle = new Array(55).fill(0);
    handle[2] = 4;
    handle[4] = 3;

    const result = createAirAsideDisplayData({
        chartData: { control_command: controlCommand },
        handle,
        controlsMode: 'handle',
    });

    expect(result.control_command.slice(0, 2)).toEqual([3, 4]);
});

test('没有完整算法控制帧时算法指令视图保持不可用', () => {
    const result = createAirAsideDisplayData({
        chartData: { control_command: [31, 1, 3] },
        algorFeed: new Array(24).fill(3),
    });

    expect(result.algorithmCommandAvailable).toBe(false);
    expect(result.control_command).toEqual(new Array(24).fill(0));
});

test('短暂缺少算法乘员字段时保留上一个状态', () => {
    const previous = {
        body_type: '大人',
        seat_state: 'ADAPTIVE_LOCKED',
        controlFeed: new Array(24).fill(0),
        feedbackOnline: true,
        controlsMode: 'algor',
    };
    const next = createAirAsideDisplayData({
        chartData: {},
        algorFeed: new Array(24).fill(0),
        controlsMode: 'algor',
        feedbackOnline: true,
        now: () => 2000,
    });

    const merged = retainAirAsideOccupantState(previous, next);
    expect(merged.body_type).toBe('大人');
    expect(merged.seat_state).toBe('ADAPTIVE_LOCKED');
});

test('在座期间算法短暂返回未判断时保留已确认分类', () => {
    const merged = retainAirAsideOccupantState(
        { body_type: '大人', seat_state: 'ADAPTIVE_LOCKED' },
        { body_type: '未判断', seat_state: 'ADAPTIVE_LOCKED' },
    );

    expect(merged.body_type).toBe('大人');
    expect(merged.seat_state).toBe('ADAPTIVE_LOCKED');
});

test('明确离座时不保留上一帧乘员分类', () => {
    const merged = retainAirAsideOccupantState(
        { body_type: '大人', seat_state: 'ADAPTIVE_LOCKED' },
        { body_type: '未判断', seat_state: 'OFF_SEAT' },
    );

    expect(merged.body_type).toBe('未判断');
    expect(merged.seat_state).toBe('OFF_SEAT');
});

test('只有时间戳变化时不重新渲染面板', () => {
    const base = {
        body_type: '大人',
        seat_state: 'ADAPTIVE_LOCKED',
        controlFeed: new Array(24).fill(0),
        control_command: new Array(24).fill(0),
        algorithmCommandAvailable: true,
        feedbackOnline: true,
        controlsMode: 'algor',
    };

    expect(areAirAsideDisplayDataEqual(
        { ...base, t: 1000 },
        { ...base, controlFeed: [...base.controlFeed], control_command: [...base.control_command], t: 2000 },
    )).toBe(true);
    expect(areAirAsideDisplayDataEqual(base, { ...base, seat_state: 'OFF_SEAT' })).toBe(false);
});
