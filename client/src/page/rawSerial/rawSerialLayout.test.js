import {
    RAW_SENSOR_DATA_LENGTH,
    RAW_SERIAL_FRAME_LENGTH,
    createRawSerialLayout,
    formatRawByte,
    getRawSerialStats,
    normalizeRawSensorData,
} from './rawSerialLayout';

test('原始串口数据始终规范化为 144 个字节', () => {
    const normalized = normalizeRawSensorData([-1, 12.6, 999, '8']);

    expect(normalized).toHaveLength(RAW_SENSOR_DATA_LENGTH);
    expect(normalized.slice(0, 4)).toEqual([0, 13, 255, 8]);
    expect(RAW_SERIAL_FRAME_LENGTH).toBe(145);
});

test('靠背和坐垫按点图真实区域保留全部原始索引', () => {
    const layout = createRawSerialLayout(Array.from({ length: 144 }, (_, index) => index));
    const allIndexes = [
        ...layout.backrest.left,
        ...layout.backrest.center,
        ...layout.backrest.right,
        ...layout.cushion.left,
        ...layout.cushion.center,
        ...layout.cushion.right,
    ].map((point) => point.index);

    expect(layout.backrest.left.map((point) => point.index)).toEqual([4, 5, 6, 7]);
    expect(layout.backrest.right.map((point) => point.index)).toEqual([0, 1, 2, 3]);
    expect(layout.cushion.left.map((point) => point.index)).toEqual([75, 74, 73, 72]);
    expect(layout.cushion.right.map((point) => point.index)).toEqual([79, 78, 77, 76]);
    expect(layout.cushion.center.slice(0, 8).map((point) => point.index)).toEqual([
        136, 137, 138, 139, 140, 141, 142, 143,
    ]);
    expect(new Set(allIndexes).size).toBe(144);
    expect(Math.min(...allIndexes)).toBe(0);
    expect(Math.max(...allIndexes)).toBe(143);
});

test('统计值和字节格式使用未经滤波的输入', () => {
    const values = new Array(144).fill(0);
    values[0] = 16;
    values[143] = 32;

    expect(getRawSerialStats(values)).toEqual({
        minimum: 0,
        maximum: 32,
        average: 0.3,
        active: 2,
        total: 48,
    });
    expect(formatRawByte(16, 'decimal')).toBe('16');
    expect(formatRawByte(16, 'hex')).toBe('10');
});
