export const AIRBAG_LAYOUT_STORAGE_KEY = 'jqtools.carAir.airbagLayout.v2';

const DEFAULT_AIRBAG_LAYOUT = [
    { top: 19.8, left: 37.1, width: 11.7, height: 5.7, type: 'rect' },
    { top: 19.8, left: 51.2, width: 11.7, height: 5.7, type: 'rect' },
    { top: 39.3, left: 33.5, width: 5, height: 13.3, type: 'rect' },
    { top: 39.3, left: 61.5, width: 5, height: 13.3, type: 'rect' },
    { top: 45.6, left: 41, width: 18, height: 6, type: 'rect' },
    { top: 53.4, left: 41, width: 18, height: 6, type: 'rect' },
    { top: 62.6, left: 39, width: 11, height: 11.1, type: 'rect' },
    { top: 62.6, left: 50, width: 11, height: 11.1, type: 'rect' },
    { top: 74.1, left: 38, width: 10, height: 5.6, type: 'rect' },
    { top: 74.1, left: 52, width: 10, height: 5.6, type: 'rect' },
    { top: 30, left: 42.5, width: 5, type: 'circle' },
    { top: 30, left: 52.5, width: 5, type: 'circle' },
    { top: 38, left: 42.5, width: 5, type: 'circle' },
    { top: 38, left: 52.5, width: 5, type: 'circle' },
    { top: 46, left: 42.5, width: 5, type: 'circle' },
    { top: 46, left: 52.5, width: 5, type: 'circle' },
    { top: 54, left: 42.5, width: 5, type: 'circle' },
    { top: 54, left: 52.5, width: 5, type: 'circle' },
    { top: 62.7, left: 42.5, width: 5, type: 'circle' },
    { top: 62.7, left: 52.5, width: 5, type: 'circle' },
    { top: 68.6, left: 42.5, width: 5, type: 'circle' },
    { top: 68.6, left: 52.5, width: 5, type: 'circle' },
    { top: 74.5, left: 42.5, width: 5, type: 'circle' },
    { top: 74.5, left: 52.5, width: 5, type: 'circle' },
];

export const AIRBAG_GROUPS = [
    { value: 'shoulder', label: '肩部左右气囊', indexes: [0, 1] },
    { value: 'sideWing', label: '靠背侧翼气囊', indexes: [2, 3] },
    { value: 'lumbarUpper', label: '腰部上气囊', indexes: [4], centered: true },
    { value: 'lumbarLower', label: '腰部下气囊', indexes: [5], centered: true },
    { value: 'cushionRear', label: '坐垫后部气囊', indexes: [6, 7] },
    { value: 'cushionFront', label: '坐垫前部气囊', indexes: [8, 9] },
    { value: 'massage1', label: '按摩气囊第 1 排', indexes: [10, 11] },
    { value: 'massage2', label: '按摩气囊第 2 排', indexes: [12, 13] },
    { value: 'massage3', label: '按摩气囊第 3 排', indexes: [14, 15] },
    { value: 'massage4', label: '按摩气囊第 4 排', indexes: [16, 17] },
    { value: 'massage5', label: '按摩气囊第 5 排', indexes: [18, 19] },
    { value: 'massage6', label: '按摩气囊第 6 排', indexes: [20, 21] },
    { value: 'massage7', label: '按摩气囊第 7 排', indexes: [22, 23] },
];

/** 将气囊百分比值限制到指定范围，并保留两位小数。 */
function clampLayoutValue(value, min, max) {
    const numericValue = Number(value);
    const safeValue = Number.isFinite(numericValue) ? numericValue : min;
    return Number(Math.min(max, Math.max(min, safeValue)).toFixed(2));
}

/** 复制单个气囊配置，避免状态更新时修改原数组。 */
function cloneAirbagItem(item) {
    return { ...item };
}

/** 按左侧气囊计算同组右侧气囊，镜像轴固定为容器宽度的 50%。 */
function mirrorAirbagPair(layout, group) {
    const [leftIndex, rightIndex] = group.indexes;
    const sourceLeftItem = layout[leftIndex];
    const rightItem = layout[rightIndex];
    const leftItem = {
        ...sourceLeftItem,
        left: clampLayoutValue(
            sourceLeftItem.left,
            0,
            Math.max(0, 50 - sourceLeftItem.width)
        ),
    };
    const mirroredLeft = clampLayoutValue(
        100 - leftItem.left - leftItem.width,
        50,
        99
    );

    layout[leftIndex] = leftItem;
    layout[rightIndex] = {
        ...rightItem,
        top: leftItem.top,
        left: mirroredLeft,
        width: leftItem.width,
        ...(leftItem.type === 'rect' ? { height: leftItem.height } : {}),
        type: leftItem.type,
    };
}

/** 将单个横跨中线的气囊按宽度自动居中。 */
function centerAirbagItem(layout, group) {
    const [index] = group.indexes;
    const item = layout[index];
    layout[index] = {
        ...item,
        left: clampLayoutValue((100 - item.width) / 2, 0, 99),
    };
}

/** 校验气囊数组并统一应用左右镜像和居中规则。 */
export function normalizeAirbagLayout(layout) {
    const source = Array.isArray(layout) ? layout : [];
    const normalized = DEFAULT_AIRBAG_LAYOUT.map((defaultItem, index) => {
        const sourceItem = source[index] || {};
        const width = clampLayoutValue(sourceItem.width ?? defaultItem.width, 1, 40);
        const item = {
            top: clampLayoutValue(sourceItem.top ?? defaultItem.top, 0, 99),
            left: clampLayoutValue(sourceItem.left ?? defaultItem.left, 0, 99),
            width,
            type: defaultItem.type,
        };

        if (defaultItem.type === 'rect') {
            item.height = clampLayoutValue(
                sourceItem.height ?? defaultItem.height,
                1,
                30
            );
        }

        return item;
    });

    AIRBAG_GROUPS.forEach((group) => {
        if (group.centered) {
            centerAirbagItem(normalized, group);
        } else {
            mirrorAirbagPair(normalized, group);
        }
    });

    return normalized;
}

/** 创建一份满足左右对称规则的默认气囊位置。 */
export function createDefaultAirbagLayout() {
    return normalizeAirbagLayout(DEFAULT_AIRBAG_LAYOUT.map(cloneAirbagItem));
}

/** 从本地存储读取气囊位置，数据损坏时恢复默认布局。 */
export function readStoredAirbagLayout() {
    try {
        const storedLayout = JSON.parse(
            localStorage.getItem(AIRBAG_LAYOUT_STORAGE_KEY)
        );
        return normalizeAirbagLayout(storedLayout);
    } catch (_error) {
        return createDefaultAirbagLayout();
    }
}

/** 保存已经归一化的气囊位置。 */
export function storeAirbagLayout(layout) {
    localStorage.setItem(
        AIRBAG_LAYOUT_STORAGE_KEY,
        JSON.stringify(normalizeAirbagLayout(layout))
    );
}

/** 返回指定气囊组及其当前主气囊、镜像气囊。 */
export function getAirbagGroupState(layout, groupValue) {
    const normalized = normalizeAirbagLayout(layout);
    const group = AIRBAG_GROUPS.find((item) => item.value === groupValue)
        || AIRBAG_GROUPS[0];
    const [primaryIndex, mirroredIndex] = group.indexes;

    return {
        group,
        primary: normalized[primaryIndex],
        mirrored: typeof mirroredIndex === 'number'
            ? normalized[mirroredIndex]
            : null,
    };
}

/** 更新一个气囊组，成对气囊始终同步尺寸、纵向位置并自动水平镜像。 */
export function updateAirbagGroup(layout, groupValue, field, value) {
    const normalized = normalizeAirbagLayout(layout);
    const group = AIRBAG_GROUPS.find((item) => item.value === groupValue)
        || AIRBAG_GROUPS[0];
    const [primaryIndex] = group.indexes;
    const primary = { ...normalized[primaryIndex] };

    if (field === 'top') {
        primary.top = clampLayoutValue(value, 0, 99);
    } else if (field === 'width') {
        const maxWidth = group.centered
            ? 40
            : Math.max(1, 50 - primary.left);
        primary.width = clampLayoutValue(value, 1, maxWidth);
    } else if (field === 'height' && primary.type === 'rect') {
        primary.height = clampLayoutValue(value, 1, 30);
    } else if (field === 'left' && !group.centered) {
        primary.left = clampLayoutValue(
            value,
            0,
            Math.max(0, 50 - primary.width)
        );
    }

    normalized[primaryIndex] = primary;
    if (group.centered) {
        centerAirbagItem(normalized, group);
    } else {
        mirrorAirbagPair(normalized, group);
    }

    return normalized;
}

/** 将当前气囊位置输出为与原 `airArr` 相同的 JavaScript 配置格式。 */
export function formatAirbagLayout(layout) {
    const normalized = normalizeAirbagLayout(layout);
    const itemLines = normalized.map((item) => {
        const properties = [
            `top: ${item.top}`,
            `left: ${item.left}`,
            `width: ${item.width}`,
        ];

        if (item.type === 'rect') {
            properties.push(`height: ${item.height}`);
        }
        properties.push(`type: '${item.type}'`);

        return [
            '    {',
            ...properties.map((property) => `        ${property},`),
            '    },',
        ].join('\n');
    });

    return `const airArr = [\n${itemLines.join('\n')}\n]`;
}
