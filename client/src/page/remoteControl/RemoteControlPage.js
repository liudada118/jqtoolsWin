import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Tooltip } from 'antd';
import {
    AppstoreOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    DesktopOutlined,
    HomeOutlined,
    PauseCircleOutlined,
    PoweroffOutlined,
    ReloadOutlined,
    RobotOutlined,
    SafetyCertificateOutlined,
    SlidersOutlined,
    SwapOutlined,
    ThunderboltOutlined,
    WifiOutlined,
} from '@ant-design/icons';
import { CAR_ADAPTIVE_UI_ACTIONS } from '../../util/carAdaptiveUiControl';
import {
    CAR_ADAPTIVE_AIRBAG_GROUPS,
    CAR_ADAPTIVE_GEARS,
    buildCarAdaptiveControlCommand,
    buildUniformControlCommand,
    getGearLabel,
} from '../../util/carAdaptiveAirbagControl';
import './index.scss';

const API_ROOT = window.location.origin;
const SENSOR_IDS = [1, 2];

/**
 * 将毫秒时间戳格式化为调试页时间。
 * @param {unknown} value 时间戳。
 * @returns {string} 本地时间文本。
 */
function formatTimestamp(value) {
    const timestamp = Number(value);
    if (!timestamp) return '--';
    const date = new Date(timestamp);
    return `${date.toLocaleTimeString('zh-CN', { hour12: false })}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

/**
 * 返回远程命令的中文名称。
 * @param {string} action 命令动作。
 * @param {number|null} sensorId 传感器标识。
 * @returns {string} 中文名称。
 */
function getActionLabel(action, sensorId) {
    if (action === CAR_ADAPTIVE_UI_ACTIONS.RETURN_HOME) return '返回宿主页';
    if (action === CAR_ADAPTIVE_UI_ACTIONS.OPEN_MODULE) return '打开自适应模块';
    if (action === CAR_ADAPTIVE_UI_ACTIONS.OPEN_RAW_SERIAL) return '打开原始数据';
    if (action === CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR) {
        return Number(sensorId) === 2 ? '切换副驾' : '切换主驾';
    }
    return action || '--';
}

/**
 * 返回 SDK 视图的中文名称。
 * @param {string} view 视图标识。
 * @returns {string} 中文名称。
 */
function getViewLabel(view) {
    return {
        'host-home': '宿主页',
        'module': '自适应模块',
        'raw-serial': '原始数据',
        'other': '其他页面',
    }[view] || '--';
}

/**
 * 独立的局域网 SDK 控制调试页面。
 * @returns {React.ReactElement} 调试控制页面。
 */
function RemoteControlPage() {
    const [controlState, setControlState] = useState(null);
    const [modeState, setModeState] = useState(null);
    const [sensorStatus, setSensorStatus] = useState([]);
    const [sensorGears, setSensorGears] = useState({});
    const [connection, setConnection] = useState('connecting');
    const [token, setToken] = useState(() => window.sessionStorage.getItem('jqtools.remoteControl.token') || '');
    const [busyAction, setBusyAction] = useState('');
    const [notice, setNotice] = useState({ type: 'idle', text: '等待连接' });
    const [history, setHistory] = useState([]);
    const [airbagSensorId, setAirbagSensorId] = useState(1);
    const [selectedAirbags, setSelectedAirbags] = useState([]);
    const streamRef = useRef(null);

    /** 从真实后端读取显示端连接、控制模式和主副驾运行状态。 */
    const refreshState = useCallback(async (silent = false) => {
        try {
            const [uiResponse, modeResponse, sensorResponse] = await Promise.all([
                fetch(`${API_ROOT}/carAdaptive/ui/state`, { cache: 'no-store' }),
                fetch(`${API_ROOT}/carAdaptive/mode`, { cache: 'no-store' }),
                fetch(`${API_ROOT}/carAdaptive/sensors`, { cache: 'no-store' }),
            ]);
            const uiPayload = await uiResponse.json();
            if (!uiResponse.ok || uiPayload.code !== 0) {
                throw new Error(uiPayload.message || '状态读取失败');
            }
            setControlState(uiPayload.data);

            const modePayload = await modeResponse.json();
            if (modeResponse.ok && modePayload.code === 0) setModeState(modePayload.data);

            const sensorPayload = await sensorResponse.json();
            if (sensorResponse.ok && sensorPayload.code === 0) {
                setSensorStatus(Array.isArray(sensorPayload.data) ? sensorPayload.data : []);
            }

            setConnection('open');
            if (!silent) setNotice({ type: 'success', text: '状态已刷新' });
        } catch (error) {
            setConnection('error');
            if (!silent) setNotice({ type: 'error', text: error.message || '无法连接 SDK 服务' });
        }
    }, []);

    useEffect(() => {
        refreshState(true);
        const timer = window.setInterval(() => refreshState(true), 1000);
        return () => window.clearInterval(timer);
    }, [refreshState]);

    // 订阅实时数据，用于显示两路气囊当前档位和模式变化。
    useEffect(() => {
        const wsPort = controlState?.webSocketPort;
        if (!wsPort || streamRef.current) return undefined;

        const socket = new WebSocket(`ws://${window.location.hostname}:${wsPort}?role=remote-console`);
        streamRef.current = socket;

        socket.onmessage = (event) => {
            let message;
            try {
                message = JSON.parse(event.data);
            } catch (error) {
                return;
            }

            if (Array.isArray(message?.carAdaptiveSensorsData)) {
                const nextGears = {};
                message.carAdaptiveSensorsData.forEach((snapshot) => {
                    nextGears[snapshot.sensorId] = Array.isArray(snapshot.algorFeed) ? snapshot.algorFeed : [];
                });
                setSensorGears(nextGears);
            }
            if (message?.carAdaptiveControlMode) {
                setModeState(message.carAdaptiveControlMode);
            }
        };

        socket.onclose = () => {
            streamRef.current = null;
        };

        return () => {
            socket.onmessage = null;
            socket.onclose = null;
            socket.close();
            streamRef.current = null;
        };
    }, [controlState?.webSocketPort]);

    /** 保存当前会话使用的可选控制令牌。 */
    const changeToken = useCallback((event) => {
        const value = event.target.value;
        setToken(value);
        window.sessionStorage.setItem('jqtools.remoteControl.token', value);
    }, []);

    /** 向 SDK 显示端广播一条远程页面控制命令。 */
    const sendCommand = useCallback(async (action, sensorId = null) => {
        const operationKey = `${action}-${sensorId || ''}`;
        setBusyAction(operationKey);
        setNotice({ type: 'pending', text: '正在下发命令' });

        try {
            const response = await fetch(`${API_ROOT}/carAdaptive/ui/command`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'X-JQTools-Control-Token': token } : {}),
                },
                body: JSON.stringify({
                    action,
                    ...(sensorId ? { sensorId } : {}),
                }),
            });
            const payload = await response.json();
            if (!response.ok || payload.code !== 0) {
                throw new Error(payload.message || '命令下发失败');
            }

            const command = payload.data.command;
            setControlState(payload.data.state);
            setHistory((current) => [{
                id: command.id,
                action: command.action,
                sensorId: command.sensorId,
                issuedAt: command.issuedAt,
                result: '已广播',
            }, ...current].slice(0, 20));
            setNotice({
                type: payload.data.state.displayClients > 0 ? 'success' : 'warning',
                text: payload.data.state.displayClients > 0 ? '命令已广播' : '命令已保存，当前无显示端连接',
            });
        } catch (error) {
            setNotice({ type: 'error', text: error.message || '命令下发失败' });
        } finally {
            setBusyAction('');
        }
    }, [token]);

    /** 切换气囊控制模式：auto 算法接管，manual 人工控制，paused 暂停算法。 */
    const changeControlMode = useCallback(async (mode) => {
        const operationKey = `mode-${mode}`;
        setBusyAction(operationKey);
        setNotice({ type: 'pending', text: mode === 'manual' ? '正在切换手动模式' : '正在恢复自动模式' });

        try {
            const response = await fetch(`${API_ROOT}/carAdaptive/mode`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'X-JQTools-Control-Token': token } : {}),
                },
                body: JSON.stringify({ mode, reason: '局域网控制台' }),
            });
            const payload = await response.json();
            if (!response.ok || payload.code !== 0) {
                throw new Error(payload.message || '模式切换失败');
            }

            setModeState(payload.data);
            setNotice({
                type: 'success',
                text: {
                    manual: '已切到手动模式，算法继续运行但不再写串口',
                    paused: '算法已暂停，气囊冻结在当前充气量',
                    auto: payload.data.algorithmReset
                        ? '算法已重新初始化并接管气囊'
                        : '已恢复自动模式，算法接管气囊',
                }[payload.data.mode] || '模式已切换',
            });
        } catch (error) {
            setNotice({ type: 'error', text: error.message || '模式切换失败' });
        } finally {
            setBusyAction('');
        }
    }, [token]);

    /** 向目标通道下发一条 55 字节气囊控制命令。 */
    const sendAirbagCommand = useCallback(async (controlCommand, description, operationKey) => {
        setBusyAction(operationKey);
        setNotice({ type: 'pending', text: `正在下发：${description}` });

        try {
            const response = await fetch(`${API_ROOT}/carAdaptive/writeCommand`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'X-JQTools-Control-Token': token } : {}),
                },
                body: JSON.stringify({ sensorId: airbagSensorId, controlCommand }),
            });
            const payload = await response.json();
            if (!response.ok || payload.code !== 0) {
                throw new Error(payload.message || '命令下发失败');
            }

            setHistory((current) => [{
                id: `airbag-${Date.now()}`,
                label: `${airbagSensorId === 2 ? '副驾' : '主驾'} ${description}`,
                issuedAt: Date.now(),
                result: payload.data.controlMode === 'auto' ? '已下发（自动模式会覆盖）' : '已下发',
            }, ...current].slice(0, 20));
            setNotice({
                type: payload.data.controlMode === 'auto' ? 'warning' : 'success',
                text: payload.data.controlMode === 'auto'
                    ? '已下发，但当前是自动模式，500 毫秒后会被算法覆盖'
                    : '已下发到串口写入队列',
            });
        } catch (error) {
            setNotice({ type: 'error', text: error.message || '命令下发失败' });
        } finally {
            setBusyAction('');
        }
    }, [token, airbagSensorId]);

    /** 把当前选中的气囊设为指定档位并下发。 */
    const applyGearToSelection = useCallback((gear) => {
        if (!selectedAirbags.length) {
            setNotice({ type: 'error', text: '请先选择要控制的气囊' });
            return;
        }

        const gears = {};
        selectedAirbags.forEach((id) => { gears[id] = gear; });
        sendAirbagCommand(
            buildCarAdaptiveControlCommand(gears),
            `${selectedAirbags.length} 项气囊 ${getGearLabel(gear)}`,
            `gear-${gear}`,
        );
    }, [selectedAirbags, sendAirbagCommand]);

    /** 选中或取消一个气囊。 */
    const toggleAirbag = useCallback((id) => {
        setSelectedAirbags((current) => (
            current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
        ));
    }, []);

    const airbagGears = sensorGears[airbagSensorId] || [];
    const currentMode = modeState?.mode;
    const isAutoMode = currentMode === 'auto';
    const isPausedMode = currentMode === 'paused';
    const targetSensor = sensorStatus.find((item) => Number(item.sensorId) === airbagSensorId);

    const lastCommand = controlState?.lastCommand;
    const lastAcknowledgement = controlState?.lastAcknowledgement;
    const commandApplied = Boolean(
        lastCommand?.id &&
        lastAcknowledgement?.commandId === lastCommand.id &&
        lastAcknowledgement?.status === 'applied'
    );
    const lanControlUrl = useMemo(() => {
        const address = controlState?.lanAddresses?.[0];
        if (!address) return window.location.href;
        return `http://${address}:${controlState.httpPort}/app#/remote-control`;
    }, [controlState]);

    return (
        <div className="remote-control-page">
            <header className="remote-control-header">
                <div className="remote-control-title">
                    <DesktopOutlined />
                    <div>
                        <h1>局域网控制台</h1>
                        <code>{lanControlUrl}</code>
                    </div>
                </div>
                <div className="remote-header-actions">
                    <div className={`remote-service-state is-${connection}`}>
                        <i />
                        <span>{connection === 'open' ? '服务在线' : connection === 'error' ? '连接失败' : '连接中'}</span>
                    </div>
                    <Tooltip title="刷新状态">
                        <Button
                            aria-label="刷新状态"
                            icon={<ReloadOutlined />}
                            onClick={() => refreshState(false)}
                        />
                    </Tooltip>
                </div>
            </header>

            <section className="remote-status-strip">
                <div>
                    <span>SDK 显示端</span>
                    <strong>{controlState?.displayClients ?? 0}</strong>
                </div>
                <div>
                    <span>当前页面</span>
                    <strong>{getViewLabel(controlState?.view)}</strong>
                </div>
                <div>
                    <span>当前通道</span>
                    <strong>{Number(controlState?.selectedSensorId) === 2 ? '副驾' : '主驾'}</strong>
                </div>
                <div>
                    <span>气囊模式</span>
                    <strong className={isAutoMode ? 'is-success' : isPausedMode ? 'is-error' : 'is-warning'}>
                        {modeState ? { auto: '自动', manual: '手动', paused: '已暂停' }[currentMode] : '--'}
                    </strong>
                </div>
                <div>
                    <span>通道在线</span>
                    <strong>
                        {sensorStatus.length
                            ? SENSOR_IDS
                                .map((id) => {
                                    const item = sensorStatus.find((entry) => Number(entry.sensorId) === id);
                                    return `${id === 1 ? '主' : '副'}${item?.online ? '✓' : '✗'}`;
                                })
                                .join(' ')
                            : '--'}
                    </strong>
                </div>
                <div>
                    <span>最近回执</span>
                    <strong className={commandApplied ? 'is-success' : ''}>
                        {commandApplied ? '已执行' : lastCommand ? '等待执行' : '--'}
                    </strong>
                </div>
            </section>

            <main className="remote-control-workspace">
                <section className="remote-command-panel">
                    <div className="remote-section-heading">
                        <h2>页面控制</h2>
                        <span>广播到全部 SDK 显示端</span>
                    </div>
                    <div className="remote-command-grid">
                        <Button
                            icon={<HomeOutlined />}
                            loading={busyAction === `${CAR_ADAPTIVE_UI_ACTIONS.RETURN_HOME}-`}
                            onClick={() => sendCommand(CAR_ADAPTIVE_UI_ACTIONS.RETURN_HOME)}
                        >
                            返回宿主页
                        </Button>
                        <Button
                            icon={<DesktopOutlined />}
                            loading={busyAction === `${CAR_ADAPTIVE_UI_ACTIONS.OPEN_MODULE}-`}
                            onClick={() => sendCommand(CAR_ADAPTIVE_UI_ACTIONS.OPEN_MODULE)}
                        >
                            自适应模块
                        </Button>
                        <Button
                            icon={<AppstoreOutlined />}
                            loading={busyAction === `${CAR_ADAPTIVE_UI_ACTIONS.OPEN_RAW_SERIAL}-`}
                            onClick={() => sendCommand(CAR_ADAPTIVE_UI_ACTIONS.OPEN_RAW_SERIAL)}
                        >
                            原始数据
                        </Button>
                    </div>

                    <div className="remote-section-heading remote-section-heading--spaced">
                        <h2>显示通道</h2>
                        <span>两路算法始终同时运行</span>
                    </div>
                    <div className="remote-command-grid remote-command-grid--sensor">
                        <Button
                            type={Number(controlState?.selectedSensorId) === 1 ? 'primary' : 'default'}
                            icon={<SwapOutlined />}
                            loading={busyAction === `${CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR}-1`}
                            onClick={() => sendCommand(CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR, 1)}
                        >
                            主驾
                        </Button>
                        <Button
                            type={Number(controlState?.selectedSensorId) === 2 ? 'primary' : 'default'}
                            icon={<SwapOutlined />}
                            loading={busyAction === `${CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR}-2`}
                            onClick={() => sendCommand(CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR, 2)}
                        >
                            副驾
                        </Button>
                    </div>

                    <div className="remote-section-heading remote-section-heading--spaced">
                        <h2>气囊控制</h2>
                        <span>直接写入串口，不经过页面</span>
                    </div>

                    <div className="remote-airbag-toolbar">
                        <div className="remote-airbag-target">
                            <span>目标通道</span>
                            <div>
                                {SENSOR_IDS.map((id) => (
                                    <Button
                                        key={`airbag-target-${id}`}
                                        size="small"
                                        type={airbagSensorId === id ? 'primary' : 'default'}
                                        onClick={() => setAirbagSensorId(id)}
                                    >
                                        {id === 1 ? '主驾' : '副驾'}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        <div className="remote-airbag-target remote-airbag-target--mode">
                            <span>控制模式</span>
                            <div>
                                <Tooltip title="算法接管，每 500 毫秒自动写串口">
                                    <Button
                                        size="small"
                                        icon={<RobotOutlined />}
                                        type={currentMode === 'auto' ? 'primary' : 'default'}
                                        loading={busyAction === 'mode-auto'}
                                        onClick={() => changeControlMode('auto')}
                                    >
                                        自动
                                    </Button>
                                </Tooltip>
                                <Tooltip title="算法继续运行但不写串口，只接受手动命令">
                                    <Button
                                        size="small"
                                        icon={<SlidersOutlined />}
                                        type={currentMode === 'manual' ? 'primary' : 'default'}
                                        loading={busyAction === 'mode-manual'}
                                        onClick={() => changeControlMode('manual')}
                                    >
                                        手动
                                    </Button>
                                </Tooltip>
                                <Tooltip title="暂停算法，气囊冻结在当前充气量">
                                    <Button
                                        size="small"
                                        icon={<PauseCircleOutlined />}
                                        type={currentMode === 'paused' ? 'primary' : 'default'}
                                        loading={busyAction === 'mode-paused'}
                                        onClick={() => changeControlMode('paused')}
                                    >
                                        暂停
                                    </Button>
                                </Tooltip>
                            </div>
                        </div>
                    </div>

                    {isAutoMode && (
                        <div className="remote-airbag-hint">
                            当前为自动模式，算法每 500 毫秒会覆盖手动命令。请先切到手动模式再调气囊。
                        </div>
                    )}
                    {isPausedMode && (
                        <div className="remote-airbag-hint">
                            算法已暂停，气囊冻结在当前充气量。手动命令仍可下发；
                            切回自动会重新初始化算法，帧计数和在离座历史从零开始。
                        </div>
                    )}
                    {!targetSensor?.online && (
                        <div className="remote-airbag-hint is-error">
                            {airbagSensorId === 1 ? '主驾' : '副驾'}通道离线，命令不会产生物理写入。
                        </div>
                    )}
                    {targetSensor?.online && !targetSensor?.feedbackOnline && (
                        <div className="remote-airbag-hint">
                            未收到 ECU 气囊状态回传，下方档位显示为空。命令仍会正常下发，
                            但无法确认硬件是否执行。
                        </div>
                    )}

                    <div className="remote-airbag-groups">
                        {CAR_ADAPTIVE_AIRBAG_GROUPS.map((group) => (
                            <div className="remote-airbag-group" key={group.key}>
                                <span className="remote-airbag-group-label">{group.label}</span>
                                <div className="remote-airbag-items">
                                    {group.airbags.map((airbag) => {
                                        const gear = airbagGears[airbag.id - 1];
                                        const active = selectedAirbags.includes(airbag.id);
                                        return (
                                            <button
                                                type="button"
                                                key={`airbag-${airbag.id}`}
                                                className={`remote-airbag-item${active ? ' is-selected' : ''}${gear === 3 ? ' is-inflating' : ''}`}
                                                onClick={() => toggleAirbag(airbag.id)}
                                            >
                                                <em>{airbag.id}</em>
                                                <span>{airbag.name}</span>
                                                <i>{Number.isInteger(gear) ? getGearLabel(gear) : '--'}</i>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="remote-airbag-actions">
                        <div className="remote-airbag-selection">
                            已选 <strong>{selectedAirbags.length}</strong> 项
                            {selectedAirbags.length > 0 && (
                                <Button size="small" type="link" onClick={() => setSelectedAirbags([])}>清空</Button>
                            )}
                        </div>
                        <div className="remote-airbag-gears">
                            {CAR_ADAPTIVE_GEARS.map((gear) => (
                                <Tooltip title={gear.hint} key={`gear-${gear.value}`}>
                                    <Button
                                        size="small"
                                        disabled={!selectedAirbags.length}
                                        loading={busyAction === `gear-${gear.value}`}
                                        onClick={() => applyGearToSelection(gear.value)}
                                    >
                                        {gear.label}
                                    </Button>
                                </Tooltip>
                            ))}
                        </div>
                        <div className="remote-airbag-presets">
                            <Button
                                size="small"
                                icon={<ThunderboltOutlined />}
                                loading={busyAction === 'preset-hold'}
                                onClick={() => sendAirbagCommand(buildUniformControlCommand(0), '全部保持', 'preset-hold')}
                            >
                                全部保持
                            </Button>
                            <Button
                                size="small"
                                danger
                                icon={<PoweroffOutlined />}
                                loading={busyAction === 'preset-deflate'}
                                onClick={() => sendAirbagCommand(buildUniformControlCommand(4), '全部放气', 'preset-deflate')}
                            >
                                全部放气
                            </Button>
                        </div>
                    </div>

                    <label className="remote-token-field">
                        <span><SafetyCertificateOutlined /> 控制令牌</span>
                        <Input.Password
                            value={token}
                            placeholder={controlState?.tokenRequired ? '请输入令牌' : '未启用'}
                            onChange={changeToken}
                        />
                    </label>

                    <div className={`remote-notice is-${notice.type}`}>
                        {notice.type === 'success' ? <CheckCircleOutlined /> :
                            notice.type === 'pending' ? <ClockCircleOutlined /> : <WifiOutlined />}
                        <span>{notice.text}</span>
                    </div>
                </section>

                <section className="remote-state-panel">
                    <div className="remote-section-heading">
                        <h2>执行状态</h2>
                        <span>每秒自动刷新</span>
                    </div>
                    <dl className="remote-state-list">
                        <div>
                            <dt>最近命令</dt>
                            <dd>{getActionLabel(lastCommand?.action, lastCommand?.sensorId)}</dd>
                        </div>
                        <div>
                            <dt>命令编号</dt>
                            <dd><code>{lastCommand?.id || '--'}</code></dd>
                        </div>
                        <div>
                            <dt>下发时间</dt>
                            <dd>{formatTimestamp(lastCommand?.issuedAt)}</dd>
                        </div>
                        <div>
                            <dt>执行客户端</dt>
                            <dd><code>{lastAcknowledgement?.clientId || '--'}</code></dd>
                        </div>
                        <div>
                            <dt>回执时间</dt>
                            <dd>{formatTimestamp(lastAcknowledgement?.acknowledgedAt)}</dd>
                        </div>
                        <div>
                            <dt>WebSocket 客户端</dt>
                            <dd>{controlState?.webSocketClients ?? 0}</dd>
                        </div>
                    </dl>

                    <div className="remote-history-heading">
                        <h2>通道状态</h2>
                        <span>两路始终独立运行</span>
                    </div>
                    <div className="remote-sensor-list">
                        {SENSOR_IDS.map((id) => {
                            const item = sensorStatus.find((entry) => Number(entry.sensorId) === id);
                            return (
                                <div className="remote-sensor-row" key={`sensor-${id}`}>
                                    <strong>{id === 1 ? '主驾' : '副驾'}</strong>
                                    <span className={item?.online ? 'is-success' : 'is-error'}>
                                        {item?.online ? '在线' : '离线'}
                                    </span>
                                    <span>{item?.HZ ? `${item.HZ} Hz` : '--'}</span>
                                    <span>{item?.frameCount ? `${item.frameCount} 帧` : '--'}</span>
                                    <span className={item?.feedbackOnline ? 'is-success' : 'is-error'}>
                                        {item?.feedbackOnline ? '有回传' : '无回传'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="remote-history-heading">
                        <h2>本机操作</h2>
                        <span>{history.length}</span>
                    </div>
                    <div className="remote-history-list">
                        {history.length === 0 && <div className="remote-history-empty">暂无操作</div>}
                        {history.map((item) => (
                            <div className="remote-history-row" key={item.id}>
                                <div>
                                    <strong>{item.label || getActionLabel(item.action, item.sensorId)}</strong>
                                    <code>{item.id}</code>
                                </div>
                                <div>
                                    <span>{item.result}</span>
                                    <time>{formatTimestamp(item.issuedAt)}</time>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
}

export default RemoteControlPage;
