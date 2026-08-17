const API_ROOT = window.location.origin;

/**
 * 调用汽车自适应采集接口并统一处理业务错误。
 * @param {string} path 接口路径。
 * @param {RequestInit} [options] Fetch 请求配置。
 * @returns {Promise<object>} 后端返回的采集状态。
 */
async function requestCollection(path, options = {}) {
    const response = await window.fetch(`${API_ROOT}${path}`, {
        cache: 'no-store',
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {}),
        },
    });
    const payload = await response.json();
    if (!response.ok || payload.code !== 0) {
        throw new Error(payload?.data || payload?.message || '采集接口调用失败');
    }
    return payload.data;
}

/**
 * 生成不含文件系统特殊字符的默认采集名称。
 * @param {number} sensorId 主副传感器标识。
 * @param {Date} [now] 当前时间，测试时可传入固定值。
 * @returns {string} 默认采集名称。
 */
export function createCarAdaptiveCollectionName(sensorId, now = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    const role = Number(sensorId) === 2 ? '副驾' : '主驾';
    return `${role}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** 查询当前全局采集状态。 */
export function getCarAdaptiveCollectionState() {
    return requestCollection('/carAdaptive/collection');
}

/**
 * 开始采集指定主副驾的真实串口压力数据。
 * @param {{sensorId: number, fileName?: string, select?: object|Array}} options 采集参数。
 * @returns {Promise<object>} 开始后的采集状态。
 */
export function startCarAdaptiveCollection(options) {
    const sensorId = Number(options?.sensorId) === 2 ? 2 : 1;
    return requestCollection('/startCol', {
        method: 'POST',
        body: JSON.stringify({
            sensorId,
            fileName: options?.fileName || createCarAdaptiveCollectionName(sensorId),
            select: options?.select || [],
        }),
    });
}

/** 停止当前全局采集并返回最终状态。 */
export function stopCarAdaptiveCollection() {
    return requestCollection('/endCol');
}

/**
 * 生成一个采集段的原始数据 CSV 下载地址。
 * @param {{fileName: string, sensorId?: number}} options 导出参数。
 * @returns {string} 同源下载地址。
 */
export function createCarAdaptiveCollectionExportUrl(options) {
    const fileName = String(options?.fileName || '').trim();
    if (!fileName) {
        throw new Error('请先完成一次数据采集');
    }
    const query = new URLSearchParams({ fileName });
    if ([1, 2].includes(Number(options?.sensorId))) {
        query.set('sensorId', String(Number(options.sensorId)));
    }
    return `${API_ROOT}/carAdaptive/collection/export?${query.toString()}`;
}

/**
 * 从 Content-Disposition 响应头读取 UTF-8 下载文件名。
 * @param {string|null} disposition Content-Disposition 响应头。
 * @param {string} fallbackName 无有效响应头时的回落文件名。
 * @returns {string} 下载文件名。
 */
export function resolveCarAdaptiveCollectionDownloadName(disposition, fallbackName) {
    const utf8Match = String(disposition || '').match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match) {
        try {
            return decodeURIComponent(utf8Match[1]);
        } catch (_error) {
            // 非法转义时继续使用普通文件名或回落名称。
        }
    }
    const plainMatch = String(disposition || '').match(/filename="?([^";]+)"?/i);
    return plainMatch?.[1] || fallbackName;
}

/**
 * 下载一个采集段中未经算法处理的 145 字节原始帧 CSV。
 * @param {{fileName: string, sensorId?: number}} options 导出参数。
 * @returns {Promise<{fileName:string,frameCount:number}>} 下载结果。
 */
export async function downloadCarAdaptiveCollection(options) {
    const response = await window.fetch(createCarAdaptiveCollectionExportUrl(options), {
        cache: 'no-store',
    });
    if (!response.ok) {
        let errorMessage = `导出失败（HTTP ${response.status}）`;
        try {
            const payload = await response.json();
            errorMessage = payload?.data || payload?.message || errorMessage;
        } catch (_error) {
            // 非 JSON 错误响应保留 HTTP 状态信息。
        }
        throw new Error(errorMessage);
    }

    const sensorId = Number(options?.sensorId) === 2 ? 2 : 1;
    const fallbackName = `${options.fileName}-${sensorId === 2 ? '副驾' : '主驾'}-原始数据.csv`;
    const fileName = resolveCarAdaptiveCollectionDownloadName(
        response.headers.get('content-disposition'),
        fallbackName
    );
    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    link.style.display = 'none';
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);

    return {
        fileName,
        frameCount: Number(response.headers.get('x-jqtools-frame-count')) || 0,
    };
}
