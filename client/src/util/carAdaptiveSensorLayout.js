export const CAR_ADAPTIVE_SECTION_SIZE = 72;
export const CAR_ADAPTIVE_SIDE_ROWS = 4;
export const CAR_ADAPTIVE_SIDE_COLUMNS = 1;
export const CAR_ADAPTIVE_SIDE_SIZE = (
    CAR_ADAPTIVE_SIDE_ROWS * CAR_ADAPTIVE_SIDE_COLUMNS
);
export const CAR_ADAPTIVE_CENTER_ROWS = 8;
export const CAR_ADAPTIVE_CENTER_COLUMNS = 8;
export const CAR_ADAPTIVE_CENTER_SIZE = (
    CAR_ADAPTIVE_CENTER_ROWS * CAR_ADAPTIVE_CENTER_COLUMNS
);

/**
 * 将靠背或坐垫的 72 点数据拆分为两个 4 点侧翼和一个 8×8 中心区域。
 * @param {unknown} input 完整 144 点数据或其他可迭代数值集合。
 * @param {number} offset 当前 72 点区域在完整数据中的起始位置。
 * @returns {{firstSide: any[], secondSide: any[], center: any[]}} 三个物理区域。
 */
export function splitCarAdaptiveSensorSection(input, offset = 0) {
    const source = Array.isArray(input) || ArrayBuffer.isView(input)
        ? Array.from(input)
        : [];
    const firstSideEnd = offset + CAR_ADAPTIVE_SIDE_SIZE;
    const secondSideEnd = firstSideEnd + CAR_ADAPTIVE_SIDE_SIZE;
    const sectionEnd = offset + CAR_ADAPTIVE_SECTION_SIZE;

    return {
        firstSide: source.slice(offset, firstSideEnd),
        secondSide: source.slice(firstSideEnd, secondSideEnd),
        center: source.slice(secondSideEnd, sectionEnd),
    };
}

/**
 * 按整行反转矩阵，用于将坐垫串口方向转换为页面和 Three.js 物理方向。
 * @param {any[]} values 按行排列的矩阵数据。
 * @param {number} columns 矩阵列数。
 * @returns {any[]} 行顺序反转后的新数组。
 */
export function reverseSensorRows(values, columns) {
    const source = Array.isArray(values) ? values : [];
    const safeColumns = Math.max(1, Number(columns) || 1);
    const rows = [];

    for (let index = 0; index < source.length; index += safeColumns) {
        rows.push(source.slice(index, index + safeColumns));
    }

    return rows.reverse().flat();
}
