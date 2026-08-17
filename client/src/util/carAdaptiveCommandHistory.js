const API_ROOT = window.location.origin;

/** 气囊指令历史筛选项及页面文案。 */
export const CAR_ADAPTIVE_COMMAND_HISTORY_FILTERS = [
    { value: 'all', label: '全部' },
    { value: 'algorithmGenerated', label: '算法生成' },
    { value: 'algorithmSent', label: '算法下发' },
    { value: 'ecuFeedback', label: 'ECU 回传' },
    { value: 'apiSerial', label: '接口写串口' },
    { value: 'apiDisplay', label: '接口展示' },
];

/**
 * 返回历史类型对应的页面名称。
 * @param {string} type 历史类型。
 * @returns {string} 中文名称。
 */
export function getCarAdaptiveCommandHistoryLabel(type) {
    return CAR_ADAPTIVE_COMMAND_HISTORY_FILTERS.find((item) => item.value === type)?.label || '未知指令';
}

/**
 * 构造气囊指令历史接口地址。
 * @param {{sensorId:number,type?:string,limit?:number}} options 查询参数。
 * @returns {string} 同源接口地址。
 */
export function createCarAdaptiveCommandHistoryUrl(options = {}) {
    const sensorId = Number(options.sensorId) === 2 ? 2 : 1;
    const query = new URLSearchParams({ sensorId: String(sensorId) });
    const type = String(options.type || '').trim();
    if (type && type !== 'all') query.set('type', type);
    if (Number(options.limit) > 0) query.set('limit', String(Math.floor(Number(options.limit))));
    return `${API_ROOT}/carAdaptive/commands/history?${query.toString()}`;
}

/**
 * 统一调用气囊指令历史接口并处理业务错误。
 * @param {string} url 请求地址。
 * @param {RequestInit} [options] Fetch 参数。
 * @returns {Promise<object>} 历史接口数据。
 */
async function requestCarAdaptiveCommandHistory(url, options = {}) {
    const response = await window.fetch(url, { cache: 'no-store', ...options });
    const payload = await response.json();
    if (!response.ok || payload.code !== 0) {
        throw new Error(payload?.data || payload?.message || '读取气囊指令历史失败');
    }
    return payload.data;
}

/**
 * 查询一路全部或指定类型的气囊指令历史。
 * @param {{sensorId:number,type?:string,limit?:number}} options 查询参数。
 * @returns {Promise<object>} 历史记录和分类数量。
 */
export function getCarAdaptiveCommandHistory(options = {}) {
    return requestCarAdaptiveCommandHistory(createCarAdaptiveCommandHistoryUrl(options));
}

/**
 * 清空一路全部或指定类型的气囊指令历史。
 * @param {{sensorId:number,type?:string}} options 清空参数。
 * @returns {Promise<object>} 清空后的历史状态。
 */
export function clearCarAdaptiveCommandHistory(options = {}) {
    const sensorId = Number(options.sensorId) === 2 ? 2 : 1;
    const type = String(options.type || '').trim();
    const query = type && type !== 'all'
        ? `?${new URLSearchParams({ type }).toString()}`
        : '';
    return requestCarAdaptiveCommandHistory(
        `${API_ROOT}/carAdaptive/commands/history/${sensorId}${query}`,
        { method: 'DELETE' }
    );
}
