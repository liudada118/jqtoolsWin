import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ApiOutlined,
    AppstoreOutlined,
    CheckCircleOutlined,
    ClearOutlined,
    ClockCircleOutlined,
    CloudServerOutlined,
    CodeOutlined,
    CopyOutlined,
    DatabaseOutlined,
    DisconnectOutlined,
    HomeOutlined,
    LinkOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    SendOutlined,
    TableOutlined,
    WifiOutlined,
} from '@ant-design/icons';
import {
    Button,
    Input,
    Popconfirm,
    Segmented,
    Select,
    Switch,
    Tooltip,
    message,
} from 'antd';
import { CAR_ADAPTIVE_GEARS, getGearLabel } from '../../util/carAdaptiveAirbagControl';
import {
    CAR_ADAPTIVE_API_AIRBAGS,
    buildApiAirbagControlCommand,
    buildApiAirbagDisplayGears,
    buildApiDebugWebSocketUrl,
    requestCarAdaptiveApi,
} from '../../util/carAdaptiveApiDebug';
import { CAR_ADAPTIVE_UI_ACTIONS } from '../../util/carAdaptiveUiControl';
import './index.scss';

const SENSOR_IDS = [1, 2];
const HTTP_METHODS = ['GET', 'POST', 'DELETE'];
const MODE_OPTIONS = [
    { value: 'auto', label: '开启', icon: <PlayCircleOutlined /> },
    { value: 'manual', label: '关闭', icon: <DisconnectOutlined /> },
    { value: 'paused', label: '暂停', icon: <PauseCircleOutlined /> },
];
const REQUEST_PRESETS = [
    { value: 'health', label: '服务健康', method: 'GET', path: '/health' },
    { value: 'ports', label: '串口列表', method: 'GET', path: '/getPort' },
    { value: 'connect', label: '连接串口', method: 'GET', path: '/connPort' },
    { value: 'sensors', label: '主副驾状态', method: 'GET', path: '/carAdaptive/sensors' },
    { value: 'mode-main', label: '查询主驾模式', method: 'GET', path: '/carAdaptive/mode?sensorId=1' },
    { value: 'mode-passenger', label: '查询副驾模式', method: 'GET', path: '/carAdaptive/mode?sensorId=2' },
    { value: 'display-main', label: '查询主驾展示', method: 'GET', path: '/carAdaptive/display?sensorId=1' },
    { value: 'feedback', label: 'ECU 回传诊断', method: 'GET', path: '/carAdaptive/feedbackDiagnostics' },
    { value: 'ui-state', label: '页面状态', method: 'GET', path: '/carAdaptive/ui/state' },
];

/**
 * 创建四路可控气囊的默认档位映射。
 * @param {number} gear 默认档位。
 * @returns {Record<number, number>} 3、4、5、6 号气囊档位。
 */
function createAirbagGears(gear = 0) {
    return Object.fromEntries(CAR_ADAPTIVE_API_AIRBAGS.map((airbag) => [airbag.id, gear]));
}

/**
 * 返回主副驾中文名称。
 * @param {unknown} sensorId 传感器标识。
 * @returns {string} 主驾或副驾。
 */
function getSensorLabel(sensorId) {
    return Number(sensorId) === 2 ? '副驾' : '主驾';
}

/**
 * 返回控制模式中文名称。
 * @param {unknown} mode 控制模式。
 * @returns {string} 模式名称。
 */
function getModeLabel(mode) {
    return { auto: '自适应开启', manual: '自适应关闭', paused: '算法暂停' }[mode] || '未知';
}

/**
 * 格式化请求记录时间。
 * @param {number} timestamp 毫秒时间戳。
 * @returns {string} 时分秒文本。
 */
function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
}

/**
 * 返回 HTTP 结果中的业务提示。
 * @param {object|null} result 请求结果。
 * @param {string} fallback 默认提示。
 * @returns {string} 可显示提示。
 */
function getResultMessage(result, fallback) {
    return result?.payload?.message || result?.payload?.data?.message || result?.statusText || fallback;
}

/**
 * 把串口列表响应转换为紧凑文本。
 * @param {unknown} value 后端串口响应数据。
 * @returns {string} 串口摘要。
 */
function formatPorts(value) {
    if (Array.isArray(value)) {
        if (!value.length) return '未发现串口';
        return value.map((item) => (
            typeof item === 'string' ? item : item?.path || item?.comName || JSON.stringify(item)
        )).join('、');
    }
    if (value && typeof value === 'object') {
        const values = Object.values(value).flat().filter(Boolean);
        if (values.length) return values.map((item) => item?.path || String(item)).join('、');
    }
    return value ? String(value) : '未发现串口';
}

/**
 * 返回当前模式响应中的目标通道状态。
 * @param {object|null} modeState 模式接口响应。
 * @param {number} sensorId 主副驾标识。
 * @returns {object|null} 对应通道状态。
 */
function findModeState(modeState, sensorId) {
    const sensors = Array.isArray(modeState?.sensors) ? modeState.sensors : [];
    return sensors.find((item) => Number(item.sensorId) === Number(sensorId)) || null;
}

/**
 * 渲染服务或数据链路状态点。
 * @param {object} props 组件属性。
 * @param {string} props.state 状态值。
 * @param {string} props.label 显示文本。
 * @returns {React.ReactElement} 状态点。
 */
function StateDot({ state, label }) {
    return (
        <span className={`api-state-dot is-${state}`}>
            <i />
            {label}
        </span>
    );
}

/**
 * 汽车自适应真实接口调试工作台。
 * @returns {React.ReactElement} 接口调试页面。
 */
function ApiDebugPage() {
    const query = useMemo(() => new URLSearchParams(window.location.search), []);
    const [baseUrl, setBaseUrl] = useState(() => query.get('apiBase') || window.location.origin);
    const [token, setToken] = useState(() => (
        window.sessionStorage.getItem('jqtools.apiDebug.token') || ''
    ));
    const [serviceState, setServiceState] = useState('checking');
    const [socketState, setSocketState] = useState('connecting');
    const [health, setHealth] = useState(null);
    const [sensorStatus, setSensorStatus] = useState([]);
    const [modeState, setModeState] = useState(null);
    const [uiState, setUiState] = useState(null);
    const [portsText, setPortsText] = useState('尚未查询');
    const [liveSnapshots, setLiveSnapshots] = useState({});
    const [lastFrameAt, setLastFrameAt] = useState(0);
    const [controlSensorId, setControlSensorId] = useState(1);
    const [controlGears, setControlGears] = useState(() => createAirbagGears(0));
    const [displayGears, setDisplayGears] = useState(() => createAirbagGears(0));
    const [displayState, setDisplayState] = useState({});
    const [busyKey, setBusyKey] = useState('');
    const [logs, setLogs] = useState([]);
    const [selectedLogId, setSelectedLogId] = useState('');
    const [customMethod, setCustomMethod] = useState('GET');
    const [customPath, setCustomPath] = useState('/carAdaptive/sensors');
    const [customBody, setCustomBody] = useState('');
    const socketRef = useRef(null);

    /** 把一次 HTTP 调用插入请求历史并选中。 */
    const appendLog = useCallback((record) => {
        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const next = { ...record, id, issuedAt: Date.now() };
        setLogs((current) => [next, ...current].slice(0, 100));
        setSelectedLogId(id);
    }, []);

    /** 发送一条 HTTP 请求并统一维护忙碌状态和历史。 */
    const performRequest = useCallback(async ({ key, label, path, method = 'GET', body }) => {
        setBusyKey(key);
        try {
            const result = await requestCarAdaptiveApi({ baseUrl, path, method, body, token });
            appendLog({ label, ...result });
            return result;
        } catch (error) {
            const failed = {
                label,
                method,
                url: path,
                requestBody: body,
                status: 0,
                statusText: 'NETWORK_ERROR',
                ok: false,
                durationMs: 0,
                payload: { message: error?.message || '网络请求失败' },
            };
            appendLog(failed);
            return failed;
        } finally {
            setBusyKey('');
        }
    }, [appendLog, baseUrl, token]);

    /** 静默刷新服务、主副驾模式和页面状态。 */
    const refreshState = useCallback(async (notify = false) => {
        try {
            const [healthResult, sensorsResult, modeResult, uiResult] = await Promise.all([
                requestCarAdaptiveApi({ baseUrl, path: '/health', token }),
                requestCarAdaptiveApi({ baseUrl, path: '/carAdaptive/sensors', token }),
                requestCarAdaptiveApi({ baseUrl, path: '/carAdaptive/mode?sensorId=1', token }),
                requestCarAdaptiveApi({ baseUrl, path: '/carAdaptive/ui/state', token }),
            ]);

            if (!healthResult.ok) throw new Error(getResultMessage(healthResult, '服务状态读取失败'));
            setHealth(healthResult.payload?.data || null);
            if (sensorsResult.ok) {
                setSensorStatus(Array.isArray(sensorsResult.payload?.data) ? sensorsResult.payload.data : []);
            }
            if (modeResult.ok) setModeState(modeResult.payload?.data || null);
            if (uiResult.ok) setUiState(uiResult.payload?.data || null);
            setServiceState('open');
            if (notify) message.success('接口状态已刷新');
        } catch (error) {
            setServiceState('error');
            if (notify) message.error(error?.message || '无法连接汽车自适应服务');
        }
    }, [baseUrl, token]);

    useEffect(() => {
        refreshState(false);
        const timer = window.setInterval(() => refreshState(false), 2000);
        return () => window.clearInterval(timer);
    }, [refreshState]);

    useEffect(() => {
        const queryPort = query.get('wsPort');
        const webSocketPort = queryPort || health?.webSocketPort || uiState?.webSocketPort;
        if (!webSocketPort) return undefined;

        if (socketRef.current) socketRef.current.close();
        setSocketState('connecting');
        const socket = new WebSocket(buildApiDebugWebSocketUrl(webSocketPort, baseUrl));
        socketRef.current = socket;

        socket.onopen = () => setSocketState('open');
        socket.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (Array.isArray(payload?.carAdaptiveSensorsData)) {
                    const snapshots = {};
                    payload.carAdaptiveSensorsData.forEach((snapshot) => {
                        snapshots[Number(snapshot.sensorId)] = snapshot;
                    });
                    setLiveSnapshots(snapshots);
                    setLastFrameAt(Date.now());
                }
                if (payload?.carAdaptiveControlMode) setModeState(payload.carAdaptiveControlMode);
            } catch (_error) {
                // 非 JSON 或非汽车自适应消息不影响接口调试页。
            }
        };
        socket.onerror = () => setSocketState('error');
        socket.onclose = () => {
            if (socketRef.current === socket) socketRef.current = null;
            setSocketState('closed');
        };

        return () => {
            socket.onopen = null;
            socket.onmessage = null;
            socket.onerror = null;
            socket.onclose = null;
            socket.close();
            if (socketRef.current === socket) socketRef.current = null;
        };
    }, [baseUrl, health?.webSocketPort, query, uiState?.webSocketPort]);

    /** 保存当前会话使用的远程控制令牌。 */
    const changeToken = useCallback((event) => {
        const value = event.target.value;
        setToken(value);
        window.sessionStorage.setItem('jqtools.apiDebug.token', value);
    }, []);

    /** 查询真实串口列表。 */
    const refreshPorts = useCallback(async () => {
        const result = await performRequest({ key: 'ports', label: '查询串口', path: '/getPort' });
        if (result.ok) {
            setPortsText(formatPorts(result.payload?.data));
            message.success('串口列表已刷新');
        } else {
            message.error(getResultMessage(result, '串口查询失败'));
        }
    }, [performRequest]);

    /** 依次连接串口并发送设备识别命令。 */
    const connectSerial = useCallback(async () => {
        const connectResult = await performRequest({ key: 'connect', label: '一键连接串口', path: '/connPort' });
        if (!connectResult.ok) {
            message.error(getResultMessage(connectResult, '串口连接失败'));
            return;
        }

        const identifyResult = await performRequest({ key: 'connect', label: '发送设备识别命令', path: '/sendMac' });
        if (identifyResult.ok) {
            message.success('串口连接和设备识别已完成');
            refreshState(false);
        } else {
            message.warning(getResultMessage(identifyResult, '串口已连接，设备识别命令失败'));
        }
    }, [performRequest, refreshState]);

    /** 独立切换指定主副驾的自适应模式。 */
    const changeMode = useCallback(async (sensorId, mode) => {
        const result = await performRequest({
            key: `mode-${sensorId}-${mode}`,
            label: `${getSensorLabel(sensorId)}${getModeLabel(mode)}`,
            path: '/carAdaptive/mode',
            method: 'POST',
            body: { sensorId, mode, reason: '接口调试页' },
        });
        if (result.ok) {
            setModeState(result.payload?.data || null);
            message.success(`${getSensorLabel(sensorId)}：${getModeLabel(mode)}`);
            refreshState(false);
        } else {
            message.error(getResultMessage(result, '模式切换失败'));
        }
    }, [performRequest, refreshState]);

    /** 修改单个真实气囊的待发送档位。 */
    const changeControlGear = useCallback((airbagId, gear) => {
        setControlGears((current) => ({ ...current, [airbagId]: Number(gear) }));
    }, []);

    /** 下发只包含 3、4、5、6 号动作的 55 字节命令。 */
    const sendAirbagCommand = useCallback(async () => {
        let controlCommand;
        try {
            controlCommand = buildApiAirbagControlCommand(controlGears);
        } catch (error) {
            message.error(error.message);
            return;
        }

        const result = await performRequest({
            key: 'write-airbag',
            label: `${getSensorLabel(controlSensorId)}气囊命令`,
            path: '/carAdaptive/writeCommand',
            method: 'POST',
            body: { sensorId: controlSensorId, controlCommand },
        });
        if (result.ok) {
            const queued = Boolean(result.payload?.data?.queued);
            queued ? message.success('命令已进入串口写入队列') : message.warning('命令未进入串口队列，请检查串口连接');
            refreshState(false);
        } else {
            message.error(getResultMessage(result, '气囊命令下发失败'));
        }
    }, [controlGears, controlSensorId, performRequest, refreshState]);

    /** 修改一个气囊的界面点亮状态。 */
    const changeDisplayGear = useCallback((airbagId, checked) => {
        setDisplayGears((current) => ({ ...current, [airbagId]: checked ? 3 : 0 }));
    }, []);

    /** 设置当前主副驾的接口展示覆盖。 */
    const applyDisplayOverride = useCallback(async () => {
        let gears;
        try {
            gears = buildApiAirbagDisplayGears(displayGears);
        } catch (error) {
            message.error(error.message);
            return;
        }
        const result = await performRequest({
            key: 'display-apply',
            label: `${getSensorLabel(controlSensorId)}展示覆盖`,
            path: '/carAdaptive/display',
            method: 'POST',
            body: { sensorId: controlSensorId, gears },
        });
        if (result.ok) {
            setDisplayState((current) => ({ ...current, [controlSensorId]: result.payload?.data }));
            message.success('界面展示覆盖已生效');
        } else {
            message.error(getResultMessage(result, '展示覆盖失败'));
        }
    }, [controlSensorId, displayGears, performRequest]);

    /** 查询当前主副驾的气囊展示来源和档位。 */
    const readDisplayOverride = useCallback(async () => {
        const result = await performRequest({
            key: 'display-read',
            label: `${getSensorLabel(controlSensorId)}展示状态`,
            path: `/carAdaptive/display?sensorId=${controlSensorId}`,
        });
        if (result.ok) {
            const data = result.payload?.data || null;
            setDisplayState((current) => ({ ...current, [controlSensorId]: data }));
            const gears = Array.isArray(data?.gears) ? data.gears : [];
            setDisplayGears(Object.fromEntries(
                CAR_ADAPTIVE_API_AIRBAGS.map((airbag) => [airbag.id, Number(gears[airbag.id - 1]) === 3 ? 3 : 0]),
            ));
            message.success('展示状态已读取');
        } else {
            message.error(getResultMessage(result, '展示状态读取失败'));
        }
    }, [controlSensorId, performRequest]);

    /** 清除当前主副驾的接口展示覆盖。 */
    const clearDisplayOverride = useCallback(async () => {
        const result = await performRequest({
            key: 'display-clear',
            label: `${getSensorLabel(controlSensorId)}清除展示覆盖`,
            path: `/carAdaptive/display/${controlSensorId}`,
            method: 'DELETE',
        });
        if (result.ok) {
            setDisplayState((current) => ({ ...current, [controlSensorId]: result.payload?.data }));
            setDisplayGears(createAirbagGears(0));
            message.success('3–6 号 API 展示状态已清除并熄灭');
        } else {
            message.error(getResultMessage(result, '清除展示覆盖失败'));
        }
    }, [controlSensorId, performRequest]);

    /** 广播页面返回、模块跳转或主副驾显示切换命令。 */
    const sendUiCommand = useCallback(async (action, sensorId = null) => {
        const body = { action, ...(sensorId ? { sensorId } : {}) };
        const result = await performRequest({
            key: `ui-${action}-${sensorId || ''}`,
            label: action === CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR
                ? `页面切换${getSensorLabel(sensorId)}`
                : `页面命令 ${action}`,
            path: '/carAdaptive/ui/command',
            method: 'POST',
            body,
        });
        if (result.ok) {
            setUiState(result.payload?.data?.state || uiState);
            message.success('页面命令已广播');
        } else {
            message.error(getResultMessage(result, '页面命令失败'));
        }
    }, [performRequest, uiState]);

    /** 把预设接口填入自定义请求编辑器。 */
    const applyRequestPreset = useCallback((value) => {
        const preset = REQUEST_PRESETS.find((item) => item.value === value);
        if (!preset) return;
        setCustomMethod(preset.method);
        setCustomPath(preset.path);
        setCustomBody(preset.body ? JSON.stringify(preset.body, null, 2) : '');
    }, []);

    /** 发送自定义 HTTP 请求。 */
    const sendCustomRequest = useCallback(async () => {
        let body;
        if (!['GET', 'HEAD'].includes(customMethod) && customBody.trim()) {
            try {
                body = JSON.parse(customBody);
            } catch (_error) {
                message.error('请求体不是合法 JSON');
                return;
            }
        }

        const result = await performRequest({
            key: 'custom-request',
            label: '自定义请求',
            path: customPath,
            method: customMethod,
            body,
        });
        result.ok
            ? message.success(`${customMethod} ${customPath} 调用成功`)
            : message.error(getResultMessage(result, '接口调用失败'));
    }, [customBody, customMethod, customPath, performRequest]);

    /** 复制文本到系统剪贴板。 */
    const copyText = useCallback(async (value, successText) => {
        try {
            await navigator.clipboard.writeText(String(value));
            message.success(successText);
        } catch (_error) {
            message.error('复制失败');
        }
    }, []);

    const currentMode = findModeState(modeState, controlSensorId)?.mode;
    const currentDisplayState = displayState[controlSensorId];
    const controlCommand = useMemo(() => buildApiAirbagControlCommand(controlGears), [controlGears]);
    const selectedLog = logs.find((item) => item.id === selectedLogId) || logs[0] || null;
    const webSocketLabel = {
        open: '实时数据已连接',
        connecting: '实时数据连接中',
        error: '实时数据错误',
        closed: '实时数据已断开',
    }[socketState] || '实时数据未知';

    return (
        <div className="api-debug-page">
            <header className="api-debug-header">
                <div className="api-debug-title">
                    <ApiOutlined />
                    <div>
                        <h1>汽车自适应接口调试</h1>
                        <span>真实服务 · 主副驾双通道</span>
                    </div>
                </div>
                <div className="api-debug-endpoint">
                    <Input
                        aria-label="服务地址"
                        prefix={<CloudServerOutlined />}
                        value={baseUrl}
                        onChange={(event) => setBaseUrl(event.target.value)}
                    />
                    <Input.Password
                        aria-label="控制令牌"
                        prefix={<SafetyCertificateOutlined />}
                        placeholder="控制令牌（可选）"
                        value={token}
                        onChange={changeToken}
                    />
                    <Tooltip title="刷新全部状态">
                        <Button
                            aria-label="刷新全部状态"
                            icon={<ReloadOutlined />}
                            loading={busyKey === 'refresh'}
                            onClick={() => refreshState(true)}
                        />
                    </Tooltip>
                </div>
            </header>

            <section className="api-debug-status-strip">
                <div>
                    <span>HTTP 服务</span>
                    <StateDot
                        state={serviceState}
                        label={serviceState === 'open' ? `在线 · ${health?.httpPort || '--'}` : serviceState === 'error' ? '连接失败' : '检查中'}
                    />
                </div>
                <div>
                    <span>WebSocket</span>
                    <StateDot state={socketState} label={webSocketLabel} />
                </div>
                <div>
                    <span>最新压力帧</span>
                    <strong>{lastFrameAt ? formatTime(lastFrameAt) : '--'}</strong>
                </div>
                <div>
                    <span>显示端</span>
                    <strong>{uiState?.displayClients ?? 0} 个</strong>
                </div>
                <div>
                    <span>当前页面</span>
                    <strong>{uiState?.view || '--'}</strong>
                </div>
            </section>

            <div className="api-debug-workspace">
                <main className="api-debug-main">
                    <section className="api-panel api-serial-panel">
                        <div className="api-panel-heading">
                            <div>
                                <LinkOutlined />
                                <h2>服务与串口</h2>
                            </div>
                            <span>{portsText}</span>
                        </div>
                        <div className="api-inline-actions">
                            <Button icon={<ReloadOutlined />} loading={busyKey === 'ports'} onClick={refreshPorts}>查询串口</Button>
                            <Button type="primary" icon={<LinkOutlined />} loading={busyKey === 'connect'} onClick={connectSerial}>一键连接</Button>
                            <Button
                                icon={<CodeOutlined />}
                                loading={busyKey === 'feedback'}
                                onClick={() => performRequest({ key: 'feedback', label: 'ECU 回传诊断', path: '/carAdaptive/feedbackDiagnostics' })}
                            >
                                回传诊断
                            </Button>
                        </div>
                    </section>

                    <section className="api-panel">
                        <div className="api-panel-heading">
                            <div>
                                <DatabaseOutlined />
                                <h2>主副驾自适应</h2>
                            </div>
                            <span>独立控制</span>
                        </div>
                        <div className="api-mode-list">
                            {SENSOR_IDS.map((sensorId) => {
                                const sensor = sensorStatus.find((item) => Number(item.sensorId) === sensorId);
                                const mode = findModeState(modeState, sensorId)?.mode || sensor?.controlMode;
                                return (
                                    <div className="api-mode-row" key={`mode-row-${sensorId}`}>
                                        <div className="api-mode-identity">
                                            <b>{getSensorLabel(sensorId)}</b>
                                            <StateDot state={sensor?.online ? 'open' : 'closed'} label={sensor?.online ? `${sensor.HZ || 0} Hz` : '离线'} />
                                        </div>
                                        <div className="api-mode-metrics">
                                            <span>算法 <strong>{sensor?.algorithmReady ? '就绪' : '等待'}</strong></span>
                                            <span>帧数 <strong>{sensor?.frameCount ?? 0}</strong></span>
                                            <span>ECU <strong>{sensor?.feedbackOnline ? '回传中' : '未回传'}</strong></span>
                                        </div>
                                        <div className="api-mode-actions">
                                            {MODE_OPTIONS.map((option) => (
                                                <Button
                                                    key={`${sensorId}-${option.value}`}
                                                    type={mode === option.value ? 'primary' : 'default'}
                                                    danger={option.value === 'paused' && mode === option.value}
                                                    icon={option.icon}
                                                    loading={busyKey === `mode-${sensorId}-${option.value}`}
                                                    onClick={() => changeMode(sensorId, option.value)}
                                                >
                                                    {option.label}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <section className="api-panel">
                        <div className="api-panel-heading">
                            <div>
                                <WifiOutlined />
                                <h2>真实气囊命令</h2>
                            </div>
                            <span className="api-scope-badge">仅 3、4、5、6 号</span>
                        </div>
                        <div className="api-control-toolbar">
                            <Segmented
                                value={controlSensorId}
                                options={[
                                    { label: '主驾', value: 1 },
                                    { label: '副驾', value: 2 },
                                ]}
                                onChange={(value) => setControlSensorId(Number(value))}
                            />
                            <StateDot
                                state={currentMode === 'auto' ? 'warning' : currentMode === 'manual' ? 'open' : 'closed'}
                                label={getModeLabel(currentMode)}
                            />
                            {currentMode !== 'manual' && (
                                <Button
                                    size="small"
                                    icon={<DisconnectOutlined />}
                                    loading={busyKey === `mode-${controlSensorId}-manual`}
                                    onClick={() => changeMode(controlSensorId, 'manual')}
                                >
                                    切到手动
                                </Button>
                            )}
                        </div>
                        <div className="api-airbag-grid">
                            {CAR_ADAPTIVE_API_AIRBAGS.map((airbag) => {
                                const liveGear = liveSnapshots[controlSensorId]?.algorFeed?.[airbag.id - 1];
                                return (
                                    <div className="api-airbag-control" key={`control-${airbag.id}`}>
                                        <div>
                                            <em>{airbag.id}</em>
                                            <span>{airbag.name}</span>
                                        </div>
                                        <small>当前 {Number.isInteger(liveGear) ? getGearLabel(liveGear) : '--'}</small>
                                        <Select
                                            aria-label={`${airbag.name}档位`}
                                            value={controlGears[airbag.id]}
                                            options={CAR_ADAPTIVE_GEARS.map((gear) => ({ value: gear.value, label: gear.label }))}
                                            onChange={(value) => changeControlGear(airbag.id, value)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        <div className="api-command-preview">
                            <code>{controlCommand.join(', ')}</code>
                            <Tooltip title="复制 55 字节命令">
                                <Button
                                    aria-label="复制 55 字节命令"
                                    icon={<CopyOutlined />}
                                    onClick={() => copyText(JSON.stringify(controlCommand), '命令已复制')}
                                />
                            </Tooltip>
                        </div>
                        <div className="api-inline-actions api-inline-actions--end">
                            <Button onClick={() => setControlGears(createAirbagGears(0))}>3-6 号保持</Button>
                            <Button danger onClick={() => setControlGears(createAirbagGears(4))}>3-6 号放气</Button>
                            <Button
                                type="primary"
                                icon={<SendOutlined />}
                                loading={busyKey === 'write-airbag'}
                                onClick={sendAirbagCommand}
                            >
                                下发命令
                            </Button>
                        </div>
                    </section>

                    <section className="api-panel">
                        <div className="api-panel-heading">
                            <div>
                                <CheckCircleOutlined />
                                <h2>气囊展示覆盖</h2>
                            </div>
                            <span>来源 {currentDisplayState?.source || '--'}</span>
                        </div>
                        <div className="api-display-grid">
                            {CAR_ADAPTIVE_API_AIRBAGS.map((airbag) => (
                                <label key={`display-${airbag.id}`}>
                                    <span><b>{airbag.id}</b>{airbag.name}</span>
                                    <Switch
                                        checked={Number(displayGears[airbag.id]) === 3}
                                        checkedChildren="亮"
                                        unCheckedChildren="灭"
                                        onChange={(checked) => changeDisplayGear(airbag.id, checked)}
                                    />
                                </label>
                            ))}
                        </div>
                        <div className="api-inline-actions api-inline-actions--end">
                            <Button loading={busyKey === 'display-read'} onClick={readDisplayOverride}>读取</Button>
                            <Button type="primary" loading={busyKey === 'display-apply'} onClick={applyDisplayOverride}>应用展示</Button>
                            <Button danger loading={busyKey === 'display-clear'} onClick={clearDisplayOverride}>清除并熄灭</Button>
                        </div>
                    </section>

                    <section className="api-panel">
                        <div className="api-panel-heading">
                            <div>
                                <AppstoreOutlined />
                                <h2>远程页面命令</h2>
                            </div>
                            <span>{uiState?.view || '--'} · {getSensorLabel(uiState?.selectedSensorId)}</span>
                        </div>
                        <div className="api-page-actions">
                            <Button onClick={() => sendUiCommand(CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR, 1)}>显示主驾</Button>
                            <Button onClick={() => sendUiCommand(CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR, 2)}>显示副驾</Button>
                            <Button icon={<HomeOutlined />} onClick={() => sendUiCommand(CAR_ADAPTIVE_UI_ACTIONS.RETURN_HOME)}>返回首页</Button>
                            <Button icon={<AppstoreOutlined />} onClick={() => sendUiCommand(CAR_ADAPTIVE_UI_ACTIONS.OPEN_MODULE)}>打开模块</Button>
                            <Button icon={<TableOutlined />} onClick={() => sendUiCommand(CAR_ADAPTIVE_UI_ACTIONS.OPEN_RAW_SERIAL)}>原始数据</Button>
                        </div>
                    </section>
                </main>

                <aside className="api-debug-console">
                    <section className="api-request-editor">
                        <div className="api-panel-heading">
                            <div>
                                <CodeOutlined />
                                <h2>自定义请求</h2>
                            </div>
                            <Select
                                aria-label="请求预设"
                                placeholder="接口预设"
                                options={REQUEST_PRESETS.map((preset) => ({ value: preset.value, label: preset.label }))}
                                onChange={applyRequestPreset}
                            />
                        </div>
                        <div className="api-request-line">
                            <Select value={customMethod} options={HTTP_METHODS.map((method) => ({ value: method, label: method }))} onChange={setCustomMethod} />
                            <Input value={customPath} onChange={(event) => setCustomPath(event.target.value)} />
                            <Button
                                type="primary"
                                aria-label="发送自定义请求"
                                icon={<SendOutlined />}
                                loading={busyKey === 'custom-request'}
                                onClick={sendCustomRequest}
                            />
                        </div>
                        {!['GET', 'HEAD'].includes(customMethod) && (
                            <Input.TextArea
                                aria-label="JSON 请求体"
                                value={customBody}
                                placeholder="JSON 请求体"
                                autoSize={{ minRows: 4, maxRows: 8 }}
                                onChange={(event) => setCustomBody(event.target.value)}
                            />
                        )}
                    </section>

                    <section className="api-log-section">
                        <div className="api-log-heading">
                            <div>
                                <ClockCircleOutlined />
                                <h2>请求记录</h2>
                                <span>{logs.length}</span>
                            </div>
                            <Tooltip title="清空请求记录">
                                <Popconfirm title="清空全部请求记录？" onConfirm={() => { setLogs([]); setSelectedLogId(''); }}>
                                    <Button aria-label="清空请求记录" icon={<ClearOutlined />} />
                                </Popconfirm>
                            </Tooltip>
                        </div>
                        <div className="api-log-list">
                            {logs.length === 0 && <div className="api-empty-log">等待接口调用</div>}
                            {logs.map((log) => (
                                <button
                                    type="button"
                                    key={log.id}
                                    className={log.id === selectedLog?.id ? 'is-selected' : ''}
                                    onClick={() => setSelectedLogId(log.id)}
                                >
                                    <span className={`is-${log.ok ? 'success' : 'error'}`}>{log.method}</span>
                                    <div>
                                        <b>{log.label}</b>
                                        <small>{log.url}</small>
                                    </div>
                                    <time>{log.status || 'ERR'} · {log.durationMs} ms</time>
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="api-response-viewer">
                        <div className="api-log-heading">
                            <div>
                                <CodeOutlined />
                                <h2>响应</h2>
                                {selectedLog && <span>{formatTime(selectedLog.issuedAt)}</span>}
                            </div>
                            {selectedLog && (
                                <Tooltip title="复制响应">
                                    <Button
                                        aria-label="复制响应"
                                        icon={<CopyOutlined />}
                                        onClick={() => copyText(JSON.stringify(selectedLog.payload, null, 2), '响应已复制')}
                                    />
                                </Tooltip>
                            )}
                        </div>
                        <pre>{selectedLog ? JSON.stringify({
                            request: {
                                method: selectedLog.method,
                                url: selectedLog.url,
                                body: selectedLog.requestBody,
                            },
                            response: {
                                status: selectedLog.status,
                                ok: selectedLog.ok,
                                durationMs: selectedLog.durationMs,
                                body: selectedLog.payload,
                            },
                        }, null, 2) : '// 尚无响应'}</pre>
                    </section>
                </aside>
            </div>
        </div>
    );
}

export default ApiDebugPage;
