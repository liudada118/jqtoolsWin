const AIRBAG_COUNT = 24;

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
    const dataObj = {
        controlFeed: Array.from(
            { length: AIRBAG_COUNT },
            (_, index) => controlsMode === 'algor' ? algorFeed?.[index] : handle?.[index],
        ),
        feedbackOnline: Boolean(feedbackOnline),
    };

    if (Object.keys(chartData || {}).length) {
        const controlCommand = Array.isArray(chartData.control_command)
            ? chartData.control_command
            : [];

        dataObj.body_type = chartData.body_type;
        dataObj.control_command = Array.from(
            { length: AIRBAG_COUNT },
            (_, index) => controlsMode === 'algor'
                ? controlCommand[2 * index + 2]
                : handle?.[2 * index + 2],
        );
        dataObj.seat_state = chartData.seat_state;
        dataObj.controlsMode = controlsMode;
    }

    return { ...dataObj, t: now() };
}
