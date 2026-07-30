export const CAR_ADAPTIVE_SENSOR_STORAGE_KEY = 'jqtools.carAdaptive.sensorId';
export const CAR_ADAPTIVE_HOME_EVENT = 'jqtools:car-adaptive-home-requested';
export const CAR_ADAPTIVE_VIEW_EVENT = 'jqtools:car-adaptive-view-requested';
export const CAR_ADAPTIVE_REMOTE_CONTROL_TOKEN_KEY = 'jqtools.remoteControl.token';

export const CAR_ADAPTIVE_UI_ACTIONS = Object.freeze({
    RETURN_HOME: 'return-home',
    OPEN_MODULE: 'open-module',
    OPEN_RAW_SERIAL: 'open-raw-serial',
    SELECT_SENSOR: 'select-sensor',
});

export const CAR_ADAPTIVE_UI_VIEWS = Object.freeze({
    HOST_HOME: 'host-home',
    MODULE: 'module',
    RAW_SERIAL: 'raw-serial',
    OTHER: 'other',
});

/**
 * 判断当前业务页面是否作为局域网远程控制端运行。
 * @returns {boolean} 查询参数 remoteControl 是否启用。
 */
export function isCarAdaptiveRemoteController() {
    const value = new URLSearchParams(window.location.search)
        .get('remoteControl')
        ?.trim()
        .toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(value);
}

/**
 * 解析返回主页地址，当前设备查询参数优先于后端广播配置。
 * @param {object|null|undefined} command 远程返回主页命令。
 * @returns {string} 可跳转的主页地址；未配置时返回空字符串。
 */
export function resolveCarAdaptiveHomeUrl(command) {
    const localHomeUrl = new URLSearchParams(window.location.search).get('homeUrl')?.trim();
    if (localHomeUrl) return localHomeUrl;
    return typeof command?.homeUrl === 'string' ? command.homeUrl.trim() : '';
}

/**
 * 读取控制页面查询参数或当前会话保存的远程控制口令。
 * @returns {string} 当前远程控制口令。
 */
function getCarAdaptiveRemoteControlToken() {
    const queryToken = new URLSearchParams(window.location.search).get('controlToken')?.trim();
    if (queryToken) return queryToken;
    try {
        return window.sessionStorage.getItem(CAR_ADAPTIVE_REMOTE_CONTROL_TOKEN_KEY)?.trim() || '';
    } catch (_error) {
        return '';
    }
}

/**
 * 通过真实后端接口向所有 SDK 显示端广播页面控制命令。
 * @param {string} action 控制动作。
 * @param {number|null} sensorId 主副驾标识，仅切换命令需要。
 * @returns {Promise<object>} 后端返回的命令和公共状态。
 */
export async function sendCarAdaptiveUiCommand(action, sensorId = null) {
    if (!Object.values(CAR_ADAPTIVE_UI_ACTIONS).includes(action)) {
        throw new Error('远程控制动作无效');
    }

    const body = { action };
    if (action === CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR) {
        const normalizedSensorId = normalizeCarAdaptiveSensorId(sensorId);
        if (normalizedSensorId === null) {
            throw new Error('传感器标识只允许为 1 或 2');
        }
        body.sensorId = normalizedSensorId;
    }

    const token = getCarAdaptiveRemoteControlToken();
    const response = await window.fetch(
        `${window.location.origin}/carAdaptive/ui/command`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'X-JQTools-Control-Token': token } : {}),
            },
            body: JSON.stringify(body),
        }
    );
    const payload = await response.json();
    if (!response.ok || payload?.code !== 0) {
        throw new Error(payload?.message || '远程控制命令下发失败');
    }
    return payload.data;
}

/**
 * 将输入规范化为主驾或副驾标识。
 * @param {unknown} value 待处理值。
 * @returns {number|null} 1、2 或 null。
 */
export function normalizeCarAdaptiveSensorId(value) {
    const sensorId = Number(value);
    return [1, 2].includes(sensorId) ? sensorId : null;
}

/**
 * 读取当前浏览器保存的主副驾选择。
 * @returns {number} 主副驾标识。
 */
export function getStoredCarAdaptiveSensorId() {
    try {
        return normalizeCarAdaptiveSensorId(window.localStorage.getItem(CAR_ADAPTIVE_SENSOR_STORAGE_KEY)) || 1;
    } catch (_error) {
        return 1;
    }
}

/**
 * 保存当前页面选择的主副驾标识。
 * @param {unknown} value 主副驾标识。
 * @returns {number|null} 保存后的标识或 null。
 */
export function storeCarAdaptiveSensorId(value) {
    const sensorId = normalizeCarAdaptiveSensorId(value);
    if (sensorId === null) return null;
    try {
        window.localStorage.setItem(CAR_ADAPTIVE_SENSOR_STORAGE_KEY, String(sensorId));
    } catch (_error) {
        // WebView 禁用存储时仍允许本次页面切换。
    }
    return sensorId;
}

/**
 * 获取当前 WebView 会话的稳定客户端标识。
 * @returns {string} 会话客户端标识。
 */
export function getCarAdaptiveUiClientId() {
    const storageKey = 'jqtools.carAdaptive.uiClientId';
    try {
        const existing = window.sessionStorage.getItem(storageKey);
        if (existing) return existing;
        const randomPart = window.crypto?.randomUUID?.() ||
            `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const clientId = `display-${randomPart}`;
        window.sessionStorage.setItem(storageKey, clientId);
        return clientId;
    } catch (_error) {
        return `display-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}

/**
 * 根据当前 HTTP 地址和查询参数生成 UI 显示端 WebSocket 地址。
 * @param {string} clientId 显示端客户端标识。
 * @returns {string} WebSocket 地址。
 */
export function resolveCarAdaptiveUiWebSocketUrl(clientId = getCarAdaptiveUiClientId()) {
    const wsPort = new URLSearchParams(window.location.search).get('wsPort') || '19999';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${protocol}//${window.location.hostname || '127.0.0.1'}:${wsPort}`);
    url.searchParams.set('role', 'ui-display');
    url.searchParams.set('clientId', clientId);
    return url.toString();
}

/**
 * 将 React 路由转换为后端可识别的 SDK 视图名称。
 * @param {string} pathname 当前路由。
 * @returns {string} 标准视图名称。
 */
export function getCarAdaptiveUiView(pathname) {
    if (pathname === '/') return CAR_ADAPTIVE_UI_VIEWS.MODULE;
    if (pathname === '/raw-serial') return CAR_ADAPTIVE_UI_VIEWS.RAW_SERIAL;
    return CAR_ADAPTIVE_UI_VIEWS.OTHER;
}

/**
 * 在 WebSocket 可写时发送 JSON 消息。
 * @param {WebSocket|null|undefined} socket WebSocket 实例。
 * @param {object} payload 待发送对象。
 * @returns {boolean} 是否成功发送。
 */
export function sendCarAdaptiveUiSocketMessage(socket, payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
}

/**
 * 生成 SDK 页面状态上报消息。
 * @param {string} clientId 显示端标识。
 * @param {number} sensorId 当前主副驾标识。
 * @param {string} view 当前视图。
 * @returns {object} WebSocket 上报消息。
 */
export function createCarAdaptiveUiReport(clientId, sensorId, view) {
    return {
        type: 'carAdaptiveUiReport',
        clientId,
        sensorId: normalizeCarAdaptiveSensorId(sensorId) || 1,
        view,
    };
}

/**
 * 通知 WPF、网页宿主或浏览器容器返回其主页，并在无宿主时回到 SDK 模块首页。
 * @param {object} command 远程命令。
 * @param {(path: string) => void} navigate React 路由跳转函数。
 * @returns {void}
 */
export function requestCarAdaptiveHostHome(command, navigate) {
    const homeUrl = resolveCarAdaptiveHomeUrl(command);
    const detail = {
        type: 'jqtools.carAdaptive.homeRequested',
        action: CAR_ADAPTIVE_UI_ACTIONS.RETURN_HOME,
        commandId: command?.id || '',
        source: 'jqtools-car-adaptive-sdk',
        homeUrl,
        requestedAt: Date.now(),
    };

    window.dispatchEvent(new CustomEvent(CAR_ADAPTIVE_HOME_EVENT, { detail }));

    try {
        window.chrome?.webview?.postMessage(detail);
    } catch (_error) {
        // 非 WebView2 容器无需处理。
    }

    try {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage(detail, '*');
        }
    } catch (_error) {
        // 跨域父窗口拒绝消息时继续使用本地回退。
    }

    if (homeUrl) {
        window.location.assign(homeUrl);
        return;
    }
    navigate('/');
}

/**
 * 通知 WPF、网页宿主或浏览器容器显示指定的 SDK 视图。
 * @param {object} command 远程控制命令。
 * @param {string} view 要显示的 SDK 视图。
 * @returns {void}
 */
export function requestCarAdaptiveHostView(command, view) {
    const detail = {
        type: 'jqtools.carAdaptive.viewRequested',
        action: command?.action || '',
        commandId: command?.id || '',
        source: 'jqtools-car-adaptive-sdk',
        view,
        requestedAt: Date.now(),
    };

    window.dispatchEvent(new CustomEvent(CAR_ADAPTIVE_VIEW_EVENT, { detail }));

    try {
        window.chrome?.webview?.postMessage(detail);
    } catch (_error) {
        // 非 WebView2 容器无需处理。
    }

    try {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage(detail, '*');
        }
    } catch (_error) {
        // 跨域父窗口拒绝消息时不影响 SDK 自身路由切换。
    }
}

/**
 * 执行后端通过 WebSocket 广播的 UI 控制命令。
 * @param {object} message WebSocket JSON 消息。
 * @param {object} handlers 页面操作函数。
 * @returns {object|null} 应发送给后端的执行回执。
 */
export function applyCarAdaptiveUiCommand(message, handlers) {
    const command = message?.carAdaptiveUiCommand;
    if (!command?.id || !Object.values(CAR_ADAPTIVE_UI_ACTIONS).includes(command.action)) {
        return null;
    }

    let sensorId = normalizeCarAdaptiveSensorId(handlers?.sensorId) || 1;
    let view = handlers?.view || CAR_ADAPTIVE_UI_VIEWS.OTHER;
    let status = 'applied';
    let responseMessage = '';

    try {
        if (command.action === CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR) {
            sensorId = normalizeCarAdaptiveSensorId(command.sensorId);
            if (sensorId === null) throw new Error('传感器标识无效');
            handlers.onSelectSensor(sensorId);
        } else if (command.action === CAR_ADAPTIVE_UI_ACTIONS.OPEN_MODULE) {
            view = CAR_ADAPTIVE_UI_VIEWS.MODULE;
            requestCarAdaptiveHostView(command, view);
            handlers.navigate('/');
        } else if (command.action === CAR_ADAPTIVE_UI_ACTIONS.OPEN_RAW_SERIAL) {
            view = CAR_ADAPTIVE_UI_VIEWS.RAW_SERIAL;
            requestCarAdaptiveHostView(command, view);
            handlers.navigate('/raw-serial');
        } else if (command.action === CAR_ADAPTIVE_UI_ACTIONS.RETURN_HOME) {
            view = CAR_ADAPTIVE_UI_VIEWS.HOST_HOME;
            requestCarAdaptiveHostHome(command, handlers.navigate);
        }
    } catch (error) {
        status = 'error';
        responseMessage = error?.message || '命令执行失败';
    }

    return {
        type: 'carAdaptiveUiAcknowledgement',
        commandId: command.id,
        status,
        sensorId,
        view,
        message: responseMessage,
    };
}
