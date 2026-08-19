/**
 * 汽车自适应气囊控制协议。
 * 提供 24 项气囊的编号、分组、档位定义和 55 字节控制命令构造。
 */

/** 控制命令帧头。 */
export const CAR_ADAPTIVE_COMMAND_HEADER = 31;

/** 控制命令帧尾。 */
export const CAR_ADAPTIVE_COMMAND_TAIL = [170, 85, 3, 153];

/** 控制命令总长度。 */
export const CAR_ADAPTIVE_COMMAND_LENGTH = 55;

/** 气囊总数。 */
export const CAR_ADAPTIVE_AIRBAG_COUNT = 24;

/** 工作模式位取值。 */
export const CAR_ADAPTIVE_COMMAND_MODES = { AUTO: 0, MANUAL: 1 };

/** 方向位取值：下行为控制器发往气囊。 */
export const CAR_ADAPTIVE_COMMAND_DIRECTIONS = { DOWNLOAD: 0, UPLOAD: 1 };

/** 可下发的档位。 */
export const CAR_ADAPTIVE_GEARS = [
    { value: 0, label: '保持', hint: '维持当前状态，不动作' },
    { value: 1, label: '1 档', hint: '慢速充气或放气' },
    { value: 2, label: '2 档', hint: '中速充气或放气' },
    { value: 3, label: '3 档', hint: '快速充气' },
    { value: 4, label: '放气', hint: '初始档，快速放气' },
];

/** 24 项气囊的编号、名称和分组。 */
export const CAR_ADAPTIVE_AIRBAG_GROUPS = [
    {
        key: 'sideWings',
        label: '侧翼',
        airbags: [
            { id: 1, name: '右侧翼上' },
            { id: 2, name: '左侧翼上' },
            { id: 3, name: '右侧翼下' },
            { id: 4, name: '左侧翼下' },
        ],
    },
    {
        key: 'lumbar',
        label: '腰托',
        airbags: [
            { id: 5, name: '腰托 1' },
            { id: 6, name: '腰托 2' },
        ],
    },
    {
        key: 'hip',
        label: '臀托',
        airbags: [
            { id: 7, name: '臀托 1' },
            { id: 8, name: '臀托 2' },
        ],
    },
    {
        key: 'legSupport',
        label: '腿托',
        airbags: [
            { id: 9, name: '腿托 1' },
            { id: 10, name: '腿托 2' },
        ],
    },
    {
        key: 'backrestMassage',
        label: '靠背按摩',
        airbags: Array.from({ length: 8 }, (_, index) => ({
            id: 11 + index,
            name: `靠背 ${index + 1}`,
        })),
    },
    {
        key: 'cushionMassage',
        label: '坐垫按摩',
        airbags: Array.from({ length: 6 }, (_, index) => ({
            id: 19 + index,
            name: `坐垫 ${index + 1}`,
        })),
    },
];

/** 展平后的 24 项气囊定义，顺序即编号顺序。 */
export const CAR_ADAPTIVE_AIRBAGS = CAR_ADAPTIVE_AIRBAG_GROUPS
    .flatMap((group) => group.airbags.map((airbag) => ({ ...airbag, group: group.label })));

/**
 * 返回气囊编号对应的部位名称。
 * @param {number} id 气囊编号，1 到 24。
 * @returns {string} 部位名称，未知编号返回编号文本。
 */
export function getAirbagName(id) {
    const airbag = CAR_ADAPTIVE_AIRBAGS.find((item) => item.id === Number(id));
    return airbag ? airbag.name : `气囊 ${id}`;
}

/**
 * 返回档位的中文名称。
 * @param {unknown} gear 档位值。
 * @returns {string} 档位名称，未知档位返回 `--`。
 */
export function getGearLabel(gear) {
    const item = CAR_ADAPTIVE_GEARS.find((entry) => entry.value === Number(gear));
    return item ? item.label : '--';
}

/**
 * 构造一条 55 字节气囊控制命令。
 * 未指定的气囊填 `0`，表示保持当前状态。
 *
 * @param {Record<number, number>} [gears] 气囊编号到档位的映射。
 * @param {Object} [options]
 * @param {number} [options.mode] 工作模式位，默认自动。
 * @param {number} [options.direction] 方向位，默认下行。
 * @returns {number[]} 55 个字节的控制命令。
 */
export function buildCarAdaptiveControlCommand(gears = {}, options = {}) {
    const command = [CAR_ADAPTIVE_COMMAND_HEADER];

    for (let id = 1; id <= CAR_ADAPTIVE_AIRBAG_COUNT; id += 1) {
        command.push(id, normalizeGear(gears[id]));
    }

    command.push(
        Number(options.mode) === CAR_ADAPTIVE_COMMAND_MODES.MANUAL
            ? CAR_ADAPTIVE_COMMAND_MODES.MANUAL
            : CAR_ADAPTIVE_COMMAND_MODES.AUTO,
        Number(options.direction) === CAR_ADAPTIVE_COMMAND_DIRECTIONS.UPLOAD
            ? CAR_ADAPTIVE_COMMAND_DIRECTIONS.UPLOAD
            : CAR_ADAPTIVE_COMMAND_DIRECTIONS.DOWNLOAD,
        ...CAR_ADAPTIVE_COMMAND_TAIL,
    );

    return command;
}

/**
 * 从控制命令或回传帧中提取 24 路档位。
 * 兼容 55 字节完整命令和去掉 4 字节帧尾后的 51 字节回传帧。
 *
 * @param {unknown} command 命令字节数组。
 * @returns {number[]} 24 路档位，输入非法时返回空数组。
 */
export function extractGearsFromCommand(command) {
    if (!Array.isArray(command) || command.length < 49) return [];

    const gears = [];
    for (let index = 0; index < CAR_ADAPTIVE_AIRBAG_COUNT; index += 1) {
        gears.push(normalizeGear(command[2 * index + 2]));
    }
    return gears;
}

/**
 * 校验档位取值，非法值回落到保持档 `0`。
 * @param {unknown} gear 待校验档位。
 * @returns {number} 合法档位。
 */
function normalizeGear(gear) {
    const value = Number(gear);
    return CAR_ADAPTIVE_GEARS.some((item) => item.value === value) ? value : 0;
}
