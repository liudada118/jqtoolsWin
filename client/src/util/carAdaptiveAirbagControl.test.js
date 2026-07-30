import {
    CAR_ADAPTIVE_AIRBAGS,
    CAR_ADAPTIVE_COMMAND_LENGTH,
    CAR_ADAPTIVE_COMMAND_TAIL,
    buildCarAdaptiveControlCommand,
    buildUniformControlCommand,
    extractGearsFromCommand,
    getAirbagName,
    getGearLabel,
} from './carAdaptiveAirbagControl';

test('24 项气囊编号连续且不重复', () => {
    expect(CAR_ADAPTIVE_AIRBAGS).toHaveLength(24);
    expect(CAR_ADAPTIVE_AIRBAGS.map((item) => item.id)).toEqual(
        Array.from({ length: 24 }, (_, index) => index + 1),
    );
});

test('构造的命令长度、帧头和帧尾符合协议', () => {
    const command = buildCarAdaptiveControlCommand();

    expect(command).toHaveLength(CAR_ADAPTIVE_COMMAND_LENGTH);
    expect(command[0]).toBe(31);
    expect(command.slice(-4)).toEqual(CAR_ADAPTIVE_COMMAND_TAIL);
    expect(command[49]).toBe(0);
    expect(command[50]).toBe(0);
});

test('未指定的气囊填保持档，编号位依次为 1 到 24', () => {
    const command = buildCarAdaptiveControlCommand({ 5: 3, 6: 3 });

    for (let id = 1; id <= 24; id += 1) {
        expect(command[2 * (id - 1) + 1]).toBe(id);
    }
    expect(command[2 * 4 + 2]).toBe(3);
    expect(command[2 * 5 + 2]).toBe(3);
    expect(command[2 * 0 + 2]).toBe(0);
    expect(command[2 * 23 + 2]).toBe(0);
});

test('非法档位回落到保持档', () => {
    const command = buildCarAdaptiveControlCommand({ 1: 9, 2: -1, 3: 'x', 4: null });

    expect(command[2]).toBe(0);
    expect(command[4]).toBe(0);
    expect(command[6]).toBe(0);
    expect(command[8]).toBe(0);
});

test('全部放气命令把 24 路都设为 4 档', () => {
    const command = buildUniformControlCommand(4);

    expect(extractGearsFromCommand(command)).toEqual(new Array(24).fill(4));
});

test('从 55 字节命令和 51 字节回传帧都能提取档位', () => {
    const command = buildCarAdaptiveControlCommand({ 5: 3, 24: 1 });
    const feedbackFrame = command.slice(0, command.length - 4);

    const expected = new Array(24).fill(0);
    expected[4] = 3;
    expected[23] = 1;

    expect(extractGearsFromCommand(command)).toEqual(expected);
    expect(feedbackFrame).toHaveLength(51);
    expect(extractGearsFromCommand(feedbackFrame)).toEqual(expected);
});

test('非法输入提取不出档位', () => {
    expect(extractGearsFromCommand(null)).toEqual([]);
    expect(extractGearsFromCommand([])).toEqual([]);
    expect(extractGearsFromCommand([31, 1, 2])).toEqual([]);
});

test('编号和档位有中文名称', () => {
    expect(getAirbagName(5)).toBe('腰托 1');
    expect(getAirbagName(11)).toBe('靠背 1');
    expect(getAirbagName(99)).toBe('气囊 99');
    expect(getGearLabel(3)).toBe('3 档');
    expect(getGearLabel(4)).toBe('放气');
    expect(getGearLabel(9)).toBe('--');
});
