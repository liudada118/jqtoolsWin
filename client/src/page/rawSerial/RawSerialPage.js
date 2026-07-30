import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Segmented, Switch, Tooltip } from 'antd';
import {
    ArrowLeftOutlined,
    CaretRightOutlined,
    EyeOutlined,
    PauseOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
    RAW_SERIAL_FRAME_LENGTH,
    createRawSerialLayout,
    formatRawByte,
    getRawSerialStats,
    normalizeRawSensorData,
} from './rawSerialLayout';
import {
    CAR_ADAPTIVE_CENTER_COLUMNS,
    CAR_ADAPTIVE_SIDE_COLUMNS,
} from '../../util/carAdaptiveSensorLayout';
import {
    CAR_ADAPTIVE_UI_ACTIONS,
    CAR_ADAPTIVE_UI_VIEWS,
    applyCarAdaptiveUiCommand,
    createCarAdaptiveUiReport,
    getCarAdaptiveUiClientId,
    getStoredCarAdaptiveSensorId,
    isCarAdaptiveRemoteController,
    resolveCarAdaptiveUiWebSocketUrl,
    sendCarAdaptiveUiCommand,
    sendCarAdaptiveUiSocketMessage,
    storeCarAdaptiveSensorId,
} from '../../util/carAdaptiveUiControl';
import './index.scss';

const SENSOR_OPTIONS = [
    { label: '主驾', value: 1 },
    { label: '副驾', value: 2 },
];

/**
 * 创建一路传感器的空白页面状态。
 * @param {number} sensorId 主副传感器标识。
 * @returns {object} 初始状态。
 */
function createEmptySensorState(sensorId) {
    return {
        sensorId,
        role: sensorId === 1 ? '主驾' : '副驾',
        values: new Array(144).fill(0),
        stamp: 0,
        receivedAt: 0,
        hz: 0,
        frameCount: 0,
    };
}

/**
 * 从双路快照或旧版单路消息中提取可用的原始串口帧。
 * @param {object} message WebSocket JSON 消息。
 * @returns {object[]} 标准化快照列表。
 */
function extractRawSnapshots(message) {
    if (Array.isArray(message?.carAdaptiveSensorsData)) {
        return message.carAdaptiveSensorsData;
    }

    const carAir = message?.sitData?.carAir;
    if (Array.isArray(carAir?.arr)) {
        return [{
            sensorId: carAir.sensorId || 1,
            role: Number(carAir.sensorId) === 2 ? '副驾' : '主驾',
            sitData: { carAir },
        }];
    }
    return [];
}

/**
 * 订阅原始串口 WebSocket，并持续维护主、副两路最新 144 点数据。
 * @param {boolean} paused 是否暂停页面刷新。
 * @param {(message: object) => object|null} handleUiCommand UI 命令处理函数。
 * @param {React.MutableRefObject<number>} selectedSensorIdRef 当前传感器标识引用。
 * @returns {{connection: string, frames: Record<number, object>, wsUrl: string, reportUiState: Function}} 连接和帧状态。
 */
function useRawSerialFrames(paused, handleUiCommand, selectedSensorIdRef) {
    const [connection, setConnection] = useState('connecting');
    const [frames, setFrames] = useState({
        1: createEmptySensorState(1),
        2: createEmptySensorState(2),
    });
    const pausedRef = useRef(paused);
    const commandHandlerRef = useRef(handleUiCommand);
    const socketRef = useRef(null);
    const clientId = useMemo(getCarAdaptiveUiClientId, []);
    const wsUrl = useMemo(() => resolveCarAdaptiveUiWebSocketUrl(clientId), [clientId]);

    useEffect(() => {
        pausedRef.current = paused;
    }, [paused]);

    useEffect(() => {
        commandHandlerRef.current = handleUiCommand;
    }, [handleUiCommand]);

    /** 向后端上报原始数据页当前展示的主副驾状态。 */
    const reportUiState = useCallback((sensorId) => {
        sendCarAdaptiveUiSocketMessage(
            socketRef.current,
            createCarAdaptiveUiReport(clientId, sensorId, CAR_ADAPTIVE_UI_VIEWS.RAW_SERIAL)
        );
    }, [clientId]);

    useEffect(() => {
        let socket;
        let reconnectTimer;
        let disposed = false;

        /** 建立连接，并在异常断开后自动重连。 */
        const connect = () => {
            if (disposed) return;
            setConnection('connecting');
            socket = new WebSocket(wsUrl);
            socketRef.current = socket;

            socket.onopen = () => {
                setConnection('open');
                reportUiState(selectedSensorIdRef.current);
            };
            socket.onerror = () => setConnection('error');
            socket.onclose = () => {
                if (disposed) return;
                setConnection('reconnecting');
                reconnectTimer = window.setTimeout(connect, 1200);
            };
            socket.onmessage = (event) => {
                let message;
                try {
                    message = JSON.parse(event.data);
                } catch (_error) {
                    return;
                }

                const acknowledgement = commandHandlerRef.current?.(message);
                if (acknowledgement) {
                    sendCarAdaptiveUiSocketMessage(socket, acknowledgement);
                }

                if (pausedRef.current) return;

                const snapshots = extractRawSnapshots(message);
                if (!snapshots.length) return;
                const receivedAt = Date.now();

                setFrames((current) => {
                    const next = { ...current };
                    let changed = false;

                    snapshots.forEach((snapshot) => {
                        const sensorId = Number(snapshot?.sensorId);
                        const carAir = snapshot?.sitData?.carAir;
                        if (![1, 2].includes(sensorId) || !Array.isArray(carAir?.arr) || carAir.arr.length !== 144) {
                            return;
                        }

                        const previous = current[sensorId];
                        const calculatedHz = previous.receivedAt
                            ? Math.max(1, Math.round(1000 / Math.max(1, receivedAt - previous.receivedAt)))
                            : 0;
                        next[sensorId] = {
                            sensorId,
                            role: sensorId === 1 ? '主驾' : '副驾',
                            values: normalizeRawSensorData(carAir.arr),
                            stamp: Number(carAir.stamp) || receivedAt,
                            receivedAt,
                            hz: Number(carAir.HZ) || calculatedHz,
                            frameCount: previous.frameCount + 1,
                        };
                        changed = true;
                    });

                    return changed ? next : current;
                });
            };
        };

        connect();
        return () => {
            disposed = true;
            window.clearTimeout(reconnectTimer);
            if (socketRef.current === socket) socketRef.current = null;
            socket?.close();
        };
    }, [reportUiState, selectedSensorIdRef, wsUrl]);

    return { connection, frames, wsUrl, reportUiState };
}

/**
 * 把字节值映射为固定 0-255 色阶，颜色不受当前帧最大值影响。
 * @param {number} value 原始字节。
 * @returns {string} CSS 颜色。
 */
function getPointColor(value) {
    if (value <= 0) return '#171b20';
    const ratio = Math.min(1, value / 255);
    const hue = Math.round(215 - ratio * 215);
    const lightness = ratio > 0.72 ? 52 : 44;
    return `hsl(${hue}, 82%, ${lightness}%)`;
}

/**
 * 格式化毫秒时间戳。
 * @param {number} value 时间戳。
 * @returns {string} 时分秒和毫秒文本。
 */
function formatTimestamp(value) {
    if (!value) return '--:--:--.---';
    const date = new Date(value);
    return `${date.toLocaleTimeString('zh-CN', { hour12: false })}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

/**
 * 渲染一个带原始索引的压力点。
 * @param {object} props 点属性。
 * @returns {React.ReactElement} 点单元。
 */
function RawPoint({ point, format, showValue }) {
    const displayValue = formatRawByte(point.value, format);
    return (
        <div
            className={`raw-point ${point.value > 0 ? 'is-active' : ''}`}
            style={{ backgroundColor: getPointColor(point.value) }}
            title={`原始索引 ${point.index} · 十进制 ${point.value} · 十六进制 ${formatRawByte(point.value, 'hex')}`}
            data-index={point.index}
        >
            {showValue && <span>{displayValue}</span>}
        </div>
    );
}

/**
 * 渲染固定列数的点阵区域。
 * @param {object} props 点阵属性。
 * @returns {React.ReactElement} 点阵。
 */
function PointGrid({ points, columns, format, showValue, className = '' }) {
    return (
        <div
            className={`raw-point-grid ${className}`}
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
            {points.map((point) => (
                <RawPoint
                    key={point.index}
                    point={point}
                    format={format}
                    showValue={showValue}
                />
            ))}
        </div>
    );
}

/**
 * 按左右侧区和中心区渲染一块座椅点图。
 * @param {object} props 区域属性。
 * @returns {React.ReactElement} 座椅区域。
 */
function SensorShape({ title, subtitle, section, type, format, showValue }) {
    return (
        <section className={`raw-sensor-section raw-sensor-section--${type}`}>
            <div className="raw-section-heading">
                <strong>{title}</strong>
                <span>{subtitle}</span>
            </div>
            <div className={`raw-sensor-shape raw-sensor-shape--${type}`}>
                <PointGrid points={section.left} columns={CAR_ADAPTIVE_SIDE_COLUMNS} format={format} showValue={showValue} className="raw-side-grid" />
                <PointGrid points={section.center} columns={CAR_ADAPTIVE_CENTER_COLUMNS} format={format} showValue={showValue} className="raw-center-grid" />
                <PointGrid points={section.right} columns={CAR_ADAPTIVE_SIDE_COLUMNS} format={format} showValue={showValue} className="raw-side-grid" />
            </div>
        </section>
    );
}

/**
 * 显示真实串口原始数据的独立调试页面。
 * @returns {React.ReactElement} 原始数据页面。
 */
function RawSerialPage() {
    const navigate = useNavigate();
    const [sensorId, setSensorId] = useState(getStoredCarAdaptiveSensorId);
    const sensorIdRef = useRef(sensorId);
    const [paused, setPaused] = useState(false);
    const [showValue, setShowValue] = useState(true);
    const [format, setFormat] = useState('decimal');
    const remoteController = useRef(isCarAdaptiveRemoteController()).current;

    /** 切换原始数据页当前展示的主副驾并保存选择。 */
    const selectSensor = useCallback((value) => {
        const nextSensorId = storeCarAdaptiveSensorId(value);
        if (nextSensorId === null || nextSensorId === sensorIdRef.current) return false;
        sensorIdRef.current = nextSensorId;
        setSensorId(nextSensorId);
        return true;
    }, []);

    /** iPad 控制模式下把原始数据页的主副驾选择广播给全部显示端。 */
    const selectSensorFromUi = useCallback((value) => {
        const changed = selectSensor(value);
        if (!changed || !remoteController) return changed;

        sendCarAdaptiveUiCommand(CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR, value)
            .catch((error) => console.error('[car-adaptive] 远程切换主副驾失败:', error));
        return true;
    }, [remoteController, selectSensor]);

    /** 返回业务页，并在 iPad 控制模式下同步其他显示端。 */
    const openModuleFromUi = useCallback(() => {
        navigate('/');
        if (!remoteController) return;
        sendCarAdaptiveUiCommand(CAR_ADAPTIVE_UI_ACTIONS.OPEN_MODULE)
            .catch((error) => console.error('[car-adaptive] 远程打开业务页失败:', error));
    }, [navigate, remoteController]);

    /** 执行后端广播的页面控制命令。 */
    const handleUiCommand = useCallback((message) => applyCarAdaptiveUiCommand(message, {
        sensorId: sensorIdRef.current,
        view: CAR_ADAPTIVE_UI_VIEWS.RAW_SERIAL,
        navigate,
        onSelectSensor: selectSensor,
    }), [navigate, selectSensor]);

    const { connection, frames, wsUrl, reportUiState } = useRawSerialFrames(
        paused,
        handleUiCommand,
        sensorIdRef
    );

    useEffect(() => {
        sensorIdRef.current = sensorId;
        reportUiState(sensorId);
    }, [reportUiState, sensorId]);

    const frame = frames[sensorId];
    const layout = useMemo(() => createRawSerialLayout(frame.values), [frame.values]);
    const stats = useMemo(() => getRawSerialStats(frame.values), [frame.values]);
    const serialBytes = useMemo(() => [sensorId, ...frame.values], [sensorId, frame.values]);
    const statusText = {
        connecting: '正在连接',
        reconnecting: '正在重连',
        open: '已连接',
        error: '连接异常',
    }[connection];

    return (
        <div className="raw-serial-page">
            <header className="raw-serial-header">
                <div className="raw-header-title">
                    <Tooltip title="返回汽车自适应页面">
                        <Button
                            type="text"
                            shape="circle"
                            icon={<ArrowLeftOutlined />}
                            aria-label="返回汽车自适应页面"
                            onClick={openModuleFromUi}
                        />
                    </Tooltip>
                    <div>
                        <h1>串口原始数据</h1>
                        <p>145 字节帧：1 字节传感器标识 + 144 字节压力数据</p>
                    </div>
                </div>

                <div className="raw-header-controls">
                    <div className={`raw-connection-state is-${connection}`}>
                        <i />
                        <span>{statusText}</span>
                    </div>
                    <Segmented value={sensorId} options={SENSOR_OPTIONS} onChange={selectSensorFromUi} />
                    <Segmented
                        value={format}
                        options={[
                            { label: '十进制', value: 'decimal' },
                            { label: '十六进制', value: 'hex' },
                        ]}
                        onChange={setFormat}
                    />
                    <div className="raw-value-switch">
                        <EyeOutlined />
                        <span>数值</span>
                        <Switch size="small" checked={showValue} onChange={setShowValue} />
                    </div>
                    <Button
                        icon={paused ? <CaretRightOutlined /> : <PauseOutlined />}
                        onClick={() => setPaused((current) => !current)}
                    >
                        {paused ? '继续' : '暂停'}
                    </Button>
                </div>
            </header>

            <div className="raw-serial-summary">
                <div><span>当前通道</span><strong>{frame.role}</strong></div>
                <div><span>刷新频率</span><strong>{frame.hz || 0} Hz</strong></div>
                <div><span>帧计数</span><strong>{frame.frameCount}</strong></div>
                <div><span>最小值</span><strong>{stats.minimum}</strong></div>
                <div><span>最大值</span><strong>{stats.maximum}</strong></div>
                <div><span>平均值</span><strong>{stats.average}</strong></div>
                <div><span>有效点</span><strong>{stats.active} / 144</strong></div>
                <div><span>帧时间</span><strong>{formatTimestamp(frame.stamp)}</strong></div>
            </div>

            <main className="raw-serial-workspace">
                <section className="raw-shape-workspace">
                    <div className="raw-shape-toolbar">
                        <div>
                            <h2>物理点阵</h2>
                            <p>保持串口原始值，仅按照座椅点图位置排列</p>
                        </div>
                        <div className="raw-color-key" aria-label="原始值颜色说明">
                            {[0, 64, 128, 192, 255].map((value) => (
                                <span key={value}>
                                    <i style={{ backgroundColor: getPointColor(value) }} />
                                    {value}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="raw-shape-stack">
                        <SensorShape
                            title="靠背"
                            subtitle="索引 0–71"
                            section={layout.backrest}
                            type="backrest"
                            format={format}
                            showValue={showValue}
                        />
                        <SensorShape
                            title="坐垫"
                            subtitle="索引 72–143"
                            section={layout.cushion}
                            type="cushion"
                            format={format}
                            showValue={showValue}
                        />
                    </div>
                </section>

                <aside className="raw-frame-rail">
                    <div className="raw-rail-heading">
                        <div>
                            <h2>完整原始帧</h2>
                            <p>{RAW_SERIAL_FRAME_LENGTH} 字节 · {format === 'hex' ? 'HEX' : 'DEC'}</p>
                        </div>
                        <span className={paused ? 'is-paused' : ''}>{paused ? '已暂停' : '实时'}</span>
                    </div>
                    <div className="raw-frame-bytes">
                        {serialBytes.map((value, index) => (
                            <div
                                className={`raw-byte ${index === 0 ? 'is-identifier' : ''}`}
                                key={index}
                                title={index === 0 ? '传感器标识符' : `压力原始索引 ${index - 1}`}
                            >
                                <small>{index === 0 ? 'ID' : index - 1}</small>
                                <strong>{formatRawByte(value, format)}</strong>
                            </div>
                        ))}
                    </div>
                    <div className="raw-rail-footer">
                        <span>数据源</span>
                        <code>{wsUrl}</code>
                    </div>
                </aside>
            </main>
        </div>
    );
}

export default RawSerialPage;
