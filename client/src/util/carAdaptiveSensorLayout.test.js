import {
    CAR_ADAPTIVE_CENTER_COLUMNS,
    CAR_ADAPTIVE_CENTER_ROWS,
    CAR_ADAPTIVE_CENTER_SIZE,
    CAR_ADAPTIVE_SECTION_SIZE,
    CAR_ADAPTIVE_SIDE_COLUMNS,
    CAR_ADAPTIVE_SIDE_ROWS,
    CAR_ADAPTIVE_SIDE_SIZE,
    reverseSensorRows,
    splitCarAdaptiveSensorSection,
} from './carAdaptiveSensorLayout';

test('每个 72 点区域按 4+4+8×8 拆分', () => {
    const values = Array.from({ length: 144 }, (_, index) => index);
    const backrest = splitCarAdaptiveSensorSection(values, 0);
    const cushion = splitCarAdaptiveSensorSection(
        values,
        CAR_ADAPTIVE_SECTION_SIZE
    );

    expect(CAR_ADAPTIVE_SIDE_SIZE).toBe(4);
    expect(CAR_ADAPTIVE_SIDE_ROWS).toBe(4);
    expect(CAR_ADAPTIVE_SIDE_COLUMNS).toBe(1);
    expect(CAR_ADAPTIVE_CENTER_ROWS).toBe(8);
    expect(CAR_ADAPTIVE_CENTER_COLUMNS).toBe(8);
    expect(CAR_ADAPTIVE_CENTER_SIZE).toBe(64);
    expect(backrest.firstSide).toEqual([0, 1, 2, 3]);
    expect(backrest.secondSide).toEqual([4, 5, 6, 7]);
    expect(backrest.center).toHaveLength(64);
    expect(backrest.center[0]).toBe(8);
    expect(backrest.center[63]).toBe(71);
    expect(cushion.firstSide).toEqual([72, 73, 74, 75]);
    expect(cushion.secondSide).toEqual([76, 77, 78, 79]);
    expect(cushion.center[0]).toBe(80);
    expect(cushion.center[63]).toBe(143);
});

test('8 列中心矩阵反转行顺序但保持行内顺序', () => {
    const values = Array.from({ length: 64 }, (_, index) => index + 8);
    const reversed = reverseSensorRows(values, CAR_ADAPTIVE_CENTER_COLUMNS);

    expect(reversed.slice(0, 8)).toEqual([64, 65, 66, 67, 68, 69, 70, 71]);
    expect(reversed.slice(-8)).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
});
