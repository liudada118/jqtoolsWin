import {
    CAR_ADAPTIVE_CENTER_COLUMNS,
    CAR_ADAPTIVE_SECTION_SIZE,
    CAR_ADAPTIVE_SIDE_COLUMNS,
    reverseSensorRows,
    splitCarAdaptiveSensorSection,
} from '../../util/carAdaptiveSensorLayout';

export const RAW_SENSOR_DATA_LENGTH = 144;
export const RAW_SERIAL_FRAME_LENGTH = 145;

/**
 * 将任意输入规范化为固定 144 字节数组，不做滤波、插值或预压力处理。
 * @param {unknown} input WebSocket 中收到的原始压力数组。
 * @returns {number[]} 固定长度的无符号字节数组。
 */
export function normalizeRawSensorData(input) {
    const source = Array.isArray(input) ? input : [];
    return Array.from({ length: RAW_SENSOR_DATA_LENGTH }, (_, index) => {
        const value = Number(source[index]);
        if (!Number.isFinite(value)) return 0;
        return Math.min(255, Math.max(0, Math.round(value)));
    });
}

/**
 * 按汽车点图使用的物理区域拆分 144 点原始帧。
 * 每个 72 点区域均由 8×8 中心区和左右两个宽 1、高 4 的侧区组成。
 * @param {unknown} input 原始压力数组。
 * @returns {{
 *   values: number[],
 *   backrest: {left: object[], center: object[], right: object[]},
 *   cushion: {left: object[], center: object[], right: object[]}
 * }} 点图布局数据。
 */
export function createRawSerialLayout(input) {
    const values = normalizeRawSensorData(input);
    const indexedValues = values.map((value, index) => ({ index, value }));
    const backrest = splitCarAdaptiveSensorSection(indexedValues, 0);
    const cushion = splitCarAdaptiveSensorSection(
        indexedValues,
        CAR_ADAPTIVE_SECTION_SIZE
    );

    return {
        values,
        backrest: {
            left: backrest.secondSide,
            center: backrest.center,
            right: backrest.firstSide,
        },
        cushion: {
            left: reverseSensorRows(
                cushion.firstSide,
                CAR_ADAPTIVE_SIDE_COLUMNS
            ),
            center: reverseSensorRows(
                cushion.center,
                CAR_ADAPTIVE_CENTER_COLUMNS
            ),
            right: reverseSensorRows(
                cushion.secondSide,
                CAR_ADAPTIVE_SIDE_COLUMNS
            ),
        },
    };
}

/**
 * 计算当前 144 点原始帧的基础统计值。
 * @param {unknown} input 原始压力数组。
 * @returns {{minimum: number, maximum: number, average: number, active: number, total: number}} 统计结果。
 */
export function getRawSerialStats(input) {
    const values = normalizeRawSensorData(input);
    const total = values.reduce((sum, value) => sum + value, 0);
    return {
        minimum: Math.min(...values),
        maximum: Math.max(...values),
        average: Number((total / values.length).toFixed(1)),
        active: values.filter((value) => value > 0).length,
        total,
    };
}

/**
 * 按十进制或十六进制格式化一个原始字节。
 * @param {number} value 字节值。
 * @param {'decimal'|'hex'} format 显示格式。
 * @returns {string} 格式化文本。
 */
export function formatRawByte(value, format) {
    return format === 'hex'
        ? Number(value).toString(16).padStart(2, '0').toUpperCase()
        : String(value);
}
