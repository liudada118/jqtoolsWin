const AIRBAG_COUNT = 24;
const VALID_BODY_TYPES = new Set(['大人', '小孩', '静物', '成人', '儿童', '物品']);
const VALID_SEAT_STATES = new Set(['OFF_SEAT', 'CUSHION_ONLY', 'ADAPTIVE_LOCKED', 'RESETTING']);
const OCCUPIED_SEAT_STATES = new Set(['CUSHION_ONLY', 'ADAPTIVE_LOCKED']);

/** 区域调节面板支持的两种气囊数据源。 */
export const AIRBAG_DISPLAY_MODES = Object.freeze({
    EFFECTIVE: 'effective',
    ALGORITHM: 'algorithm',
});

/** 页面首次打开时继续展示 ECU 回传和 API 覆盖合并后的当前状态。 */
export const DEFAULT_AIRBAG_DISPLAY_MODE = AIRBAG_DISPLAY_MODES.EFFECTIVE;

/** 比较两个气囊档位数组是否完全一致。 */
function areNumberArraysEqual(left = [], right = []) {
    if (left === right) return true;
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false;
    }
    return left.every((value, index) => value === right[index]);
}

/**
 * 组装区域调节面板使用的数据。
 * 气囊展示档位独立于算法结果，接口覆盖在算法尚未产出时也必须立即生效。
 */
export function createAirAsideDisplayData({
    chartData = {},
    algorFeed = [],
    handle = [],
    controlsMode = 'algor',
    feedbackOnline = false,
    now = Date.now,
} = {}) {
    const controlCommand = Array.isArray(chartData?.control_command)
        ? chartData.control_command
        : [];
    const algorithmCommandAvailable = controlCommand.length >= AIRBAG_COUNT * 2 + 1;
    const dataObj = {
        controlFeed: Array.from(
            { length: AIRBAG_COUNT },
            (_, index) => controlsMode === 'algor' ? algorFeed?.[index] : handle?.[index],
        ),
        // 算法指令视图必须直读 Python 的 control_command，不能经过 ECU/API 合并逻辑。
        control_command: Array.from(
            { length: AIRBAG_COUNT },
            (_, index) => algorithmCommandAvailable ? controlCommand[2 * index + 2] : 0,
        ),
        algorithmCommandAvailable,
        feedbackOnline: Boolean(feedbackOnline),
        controlsMode,
    };

    if (Object.keys(chartData || {}).length) {
        if (Object.prototype.hasOwnProperty.call(chartData, 'body_type')) {
            dataObj.body_type = chartData.body_type;
        }
        if (Object.prototype.hasOwnProperty.call(chartData, 'seat_state')) {
            dataObj.seat_state = chartData.seat_state;
        }
    }

    return { ...dataObj, t: now() };
}

/**
 * 算法重置或活体队列检测中时可能短暂缺少有效乘员字段，此时保留上一个有效展示值。
 * 收到明确离座状态时允许清空乘员分类，新的有效分类仍会正常替换。
 */
export function retainAirAsideOccupantState(previous = {}, next = {}) {
    const merged = { ...next };

    if (!VALID_SEAT_STATES.has(next.seat_state) && VALID_SEAT_STATES.has(previous.seat_state)) {
        merged.seat_state = previous.seat_state;
    }

    const previousBodyTypeIsValid = VALID_BODY_TYPES.has(previous.body_type);
    const nextBodyTypeIsValid = VALID_BODY_TYPES.has(next.body_type);
    const shouldRetainBodyType = previousBodyTypeIsValid
        && !nextBodyTypeIsValid
        && (!VALID_SEAT_STATES.has(merged.seat_state) || OCCUPIED_SEAT_STATES.has(merged.seat_state));

    if (shouldRetainBodyType) {
        merged.body_type = previous.body_type;
    }
    return merged;
}

/** 判断面板可见数据是否变化，时间戳不会单独触发 React 重渲染。 */
export function areAirAsideDisplayDataEqual(previous = {}, next = {}) {
    return previous.body_type === next.body_type
        && previous.seat_state === next.seat_state
        && previous.algorithmCommandAvailable === next.algorithmCommandAvailable
        && previous.feedbackOnline === next.feedbackOnline
        && previous.controlsMode === next.controlsMode
        && areNumberArraysEqual(previous.controlFeed, next.controlFeed)
        && areNumberArraysEqual(previous.control_command, next.control_command);
}
