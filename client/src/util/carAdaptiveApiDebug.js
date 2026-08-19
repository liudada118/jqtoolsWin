import {
    CAR_ADAPTIVE_AIRBAG_COUNT,
    CAR_ADAPTIVE_GEARS,
    buildCarAdaptiveControlCommand,
    getAirbagName,
} from './carAdaptiveAirbagControl';

/** 客户接口允许直接控制的真实气囊编号。 */
export const CAR_ADAPTIVE_API_AIRBAG_IDS = Object.freeze([3, 4, 5, 6]);

/** 客户接口允许直接控制的真实气囊定义。 */
export const CAR_ADAPTIVE_API_AIRBAGS = Object.freeze(
    CAR_ADAPTIVE_API_AIRBAG_IDS.map((id) => Object.freeze({ id, name: getAirbagName(id) })),
);

/**
 * 把服务地址规范化为不带末尾斜杠的 HTTP 根地址。
 * @param {unknown} value 用户输入的服务地址。
 * @returns {string} 规范化后的服务地址。
 */
export function normalizeApiDebugBaseUrl(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.replace(/\/+$/, '');
}

/**
 * 把接口路径与服务根地址组合为完整 URL。
 * @param {string} baseUrl 服务根地址。
 * @param {string} path 接口路径或完整 URL。
 * @returns {string} 完整请求地址。
 */
export function buildApiDebugUrl(baseUrl, path) {
    const normalizedPath = String(path || '').trim();
    if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;

    const root = normalizeApiDebugBaseUrl(baseUrl);
    if (!root) throw new Error('请填写服务地址');
    return `${root}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
}

/**
 * 校验单个气囊档位并转成协议整数。
 * @param {unknown} value 待校验档位。
 * @returns {number} 0 到 4 的合法档位。
 */
export function normalizeApiAirbagGear(value) {
    const gear = Number(value);
    if (!CAR_ADAPTIVE_GEARS.some((item) => item.value === gear)) {
        throw new Error(`气囊档位只允许为 0、1、2、3、4，当前值为 ${String(value)}`);
    }
    return gear;
}

/**
 * 构造只允许 3、4、5、6 号气囊动作的 55 字节命令。
 * 未指定及不允许控制的气囊全部保持为 0 档。
 * @param {Record<number, unknown>} gears 气囊编号到档位的映射。
 * @returns {number[]} 完整 55 字节控制命令。
 */
export function buildApiAirbagControlCommand(gears = {}) {
    const normalized = {};

    Object.entries(gears || {}).forEach(([rawId, rawGear]) => {
        const id = Number(rawId);
        const gear = normalizeApiAirbagGear(rawGear);
        if (!CAR_ADAPTIVE_API_AIRBAG_IDS.includes(id) && gear !== 0) {
            throw new Error(`客户接口只允许控制 3、4、5、6 号气囊，${id} 号必须保持为 0 档`);
        }
        if (CAR_ADAPTIVE_API_AIRBAG_IDS.includes(id)) normalized[id] = gear;
    });

    return buildCarAdaptiveControlCommand(normalized);
}

/**
 * 构造展示覆盖接口使用的 24 路档位数组。
 * API 只填写其独占的 3、4、5、6 号；其余 20 路固定传 0，并由后端保留 ECU 状态。
 * @param {Record<number, unknown>} gears 气囊编号到档位的映射。
 * @returns {number[]} 24 路展示档位。
 */
export function buildApiAirbagDisplayGears(gears = {}) {
    const result = new Array(CAR_ADAPTIVE_AIRBAG_COUNT).fill(0);
    Object.entries(gears || {}).forEach(([rawId, rawGear]) => {
        const id = Number(rawId);
        const gear = normalizeApiAirbagGear(rawGear);
        if (!CAR_ADAPTIVE_API_AIRBAG_IDS.includes(id) && gear !== 0) {
            throw new Error(`气囊展示接口只允许控制 3、4、5、6 号气囊，${id} 号必须保持为 0 档`);
        }
    });
    CAR_ADAPTIVE_API_AIRBAG_IDS.forEach((id) => {
        result[id - 1] = normalizeApiAirbagGear(gears[id] ?? 0);
    });
    return result;
}

/**
 * 尝试把响应文本解析成 JSON，非 JSON 内容保留为文本。
 * @param {string} text HTTP 响应文本。
 * @returns {unknown} JSON 对象、数组或原始文本。
 */
export function parseApiDebugResponse(text) {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch (_error) {
        return text;
    }
}

/**
 * 调用汽车自适应 HTTP 接口并返回便于调试展示的完整结果。
 * @param {object} options 请求参数。
 * @param {string} options.baseUrl 服务根地址。
 * @param {string} options.path 接口路径。
 * @param {string} [options.method] HTTP 方法。
 * @param {unknown} [options.body] JSON 请求体。
 * @param {string} [options.token] 可选远程控制令牌。
 * @param {typeof fetch} [options.fetchImpl] 测试时注入的 fetch。
 * @returns {Promise<object>} 请求地址、耗时、状态和响应内容。
 */
export async function requestCarAdaptiveApi({
    baseUrl,
    path,
    method = 'GET',
    body,
    token = '',
    fetchImpl = window.fetch.bind(window),
}) {
    const normalizedMethod = String(method || 'GET').trim().toUpperCase();
    const url = buildApiDebugUrl(baseUrl, path);
    const startedAt = Date.now();
    const hasBody = !['GET', 'HEAD'].includes(normalizedMethod) && body !== undefined;
    const headers = {
        Accept: 'application/json',
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(String(token || '').trim()
            ? { 'X-JQTools-Control-Token': String(token).trim() }
            : {}),
    };

    const response = await fetchImpl(url, {
        method: normalizedMethod,
        headers,
        cache: 'no-store',
        ...(hasBody ? { body: JSON.stringify(body) } : {}),
    });
    const responseText = await response.text();
    const payload = parseApiDebugResponse(responseText);
    const businessOk = !(payload && typeof payload === 'object' && payload.code !== undefined)
        || Number(payload.code) === 0;

    return {
        url,
        method: normalizedMethod,
        requestBody: hasBody ? body : undefined,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok && businessOk,
        durationMs: Date.now() - startedAt,
        payload,
        responseText,
    };
}

/**
 * 根据 HTTP 页面地址生成调试页使用的 WebSocket 地址。
 * @param {number|string} port 后端 WebSocket 端口。
 * @param {string} [baseUrl] HTTP 服务根地址，用于提取远程主机名。
 * @returns {string} WebSocket 完整地址。
 */
export function buildApiDebugWebSocketUrl(port, baseUrl = window.location.origin) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let hostname = window.location.hostname || '127.0.0.1';
    try {
        hostname = new URL(normalizeApiDebugBaseUrl(baseUrl)).hostname || hostname;
    } catch (_error) {
        // 地址正在编辑时继续使用当前页面主机，避免中断调试页。
    }
    const url = new URL(`${protocol}//${hostname}:${Number(port) || 19999}`);
    url.searchParams.set('role', 'api-debug');
    return url.toString();
}
