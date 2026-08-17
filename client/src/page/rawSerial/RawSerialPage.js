import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, Modal, Popconfirm, Segmented, Spin, Switch, Tooltip, message } from 'antd';
import {
    ArrowLeftOutlined,
    CaretRightOutlined,
    DatabaseOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EyeOutlined,
    HistoryOutlined,
    PauseOutlined,
    ReloadOutlined,
    StopOutlined,
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
import {
    downloadCarAdaptiveCollection,
    getCarAdaptiveCollectionState,
    startCarAdaptiveCollection,
    stopCarAdaptiveCollection,
} from '../../util/carAdaptiveCollection';
import {
    CAR_ADAPTIVE_COMMAND_HISTORY_FILTERS,
    clearCarAdaptiveCommandHistory,
    getCarAdaptiveCommandHistory,
    getCarAdaptiveCommandHistoryLabel,
} from '../../util/carAdaptiveCommandHistory';
import './index.scss';

const SENSOR_OPTIONS = [
    { label: '主驾', value: 1 },
    { label: '副驾', value: 2 },
];

/** 历史弹窗打开时的自动刷新间隔。 */
const COMMAND_HISTORY_REFRESH_INTERVAL = 1000;

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
        controlMode: 'auto',
        feedbackOnline: false,
        airbagDisplaySource: 'none',
        airbagDisplayOverride: false,
        airbagCommands: {
            algorithmGenerated: null,
            algorithmSent: null,
            ecuFeedback: null,
            apiSerial: null,
            apiDisplay: null,
        },
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
                        if (![1, 2].includes(sensorId)) return;

                        const previous = current[sensorId];
                        const hasPressureFrame = Array.isArray(carAir?.arr) && carAir.arr.length === 144;
                        const nextFrame = {
                            ...previous,
                            controlMode: snapshot?.controlMode || previous.controlMode,
                            feedbackOnline: Boolean(snapshot?.feedbackOnline),
                            airbagDisplaySource: snapshot?.airbagDisplaySource || 'none',
                            airbagDisplayOverride: Boolean(snapshot?.airbagDisplayOverride),
                            airbagCommands: snapshot?.airbagCommands || previous.airbagCommands,
                        };

                        if (hasPressureFrame) {
                            const calculatedHz = previous.receivedAt
                                ? Math.max(1, Math.round(1000 / Math.max(1, receivedAt - previous.receivedAt)))
                                : 0;
                            const nextStamp = Number(carAir.stamp) || receivedAt;
                            nextFrame.values = normalizeRawSensorData(carAir.arr);
                            nextFrame.stamp = nextStamp;
                            nextFrame.receivedAt = receivedAt;
                            nextFrame.hz = Number(carAir.HZ) || calculatedHz;
                            nextFrame.frameCount = nextStamp === previous.stamp
                                ? previous.frameCount
                                : previous.frameCount + 1;
                        }

                        next[sensorId] = nextFrame;
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
 * 渲染气囊命令的完整字节网格。
 * @param {{bytes:number[],format:string,keyPrefix:string}} props 字节网格属性。
 * @returns {React.ReactElement} 字节网格。
 */
function AirbagCommandByteGrid({ bytes, format, keyPrefix }) {
    return (
        <div className="raw-command-bytes">
            {bytes.map((value, index) => (
                <div className="raw-command-byte" key={`${keyPrefix}-${index}`}>
                    <small>{index}</small>
                    <strong>{formatRawByte(value, format)}</strong>
                </div>
            ))}
        </div>
    );
}

/**
 * 渲染一条气囊命令的字节、时间和队列状态。
 * @param {object} props 命令展示属性。
 * @returns {React.ReactElement} 命令诊断区块。
 */
function AirbagCommandFrame({ title, record, format, status, emptyText }) {
    const bytes = Array.isArray(record?.command) ? record.command : [];
    return (
        <section className="raw-command-frame">
            <div className="raw-command-heading">
                <div>
                    <strong>{title}</strong>
                    <span>{bytes.length ? `${bytes.length} 字节 · ${formatTimestamp(record.stamp)}` : emptyText}</span>
                </div>
                <em className={bytes.length ? '' : 'is-empty'}>{bytes.length ? status : '无数据'}</em>
            </div>
            {bytes.length > 0 && (
                <>
                    <div className="raw-command-meta">
                        {Array.isArray(record.portPaths) && record.portPaths.length > 0 && (
                            <code>{record.portPaths.join(' / ')}</code>
                        )}
                        {record.portPath && <code>{record.portPath}</code>}
                        {Array.isArray(record.gears) && record.gears.length === 24 && (
                            <span>24 路档位</span>
                        )}
                    </div>
                    <AirbagCommandByteGrid bytes={bytes} format={format} keyPrefix={title} />
                </>
            )}
        </section>
    );
}

/**
 * 返回历史记录的执行状态文案。
 * @param {object} record 气囊指令历史记录。
 * @returns {string} 状态文案。
 */
function getAirbagCommandHistoryStatus(record) {
    if (record?.type === 'algorithmGenerated') return '仅生成';
    if (record?.type === 'algorithmSent') return '已入串口队列';
    if (record?.type === 'ecuFeedback') return record.trusted ? '可信回传' : 'ECU 回传';
    if (record?.type === 'apiSerial') return record.queued ? '已入串口队列' : '未连接目标串口';
    if (record?.type === 'apiDisplay') return record.active ? '展示覆盖中' : '展示覆盖已清除';
    return '--';
}

/**
 * 气囊指令历史弹窗，读取服务生命周期内的主副驾独立历史。
 * @param {{open:boolean,sensorId:number,format:string,onClose:Function}} props 弹窗属性。
 * @returns {React.ReactElement} 历史弹窗。
 */
function AirbagCommandHistoryModal({ open, sensorId, format, onClose }) {
    const [filter, setFilter] = useState('all');
    const [history, setHistory] = useState({ records: [], counts: {}, total: 0 });
    const [selectedId, setSelectedId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [errorText, setErrorText] = useState('');
    const requestSequenceRef = useRef(0);

    /** 读取当前主副驾和筛选类型的最新历史。 */
    const refreshHistory = useCallback(async (showLoading = false) => {
        const requestSequence = requestSequenceRef.current + 1;
        requestSequenceRef.current = requestSequence;
        if (showLoading) setLoading(true);
        try {
            const result = await getCarAdaptiveCommandHistory({
                sensorId,
                type: filter,
                limit: 300,
            });
            if (requestSequence !== requestSequenceRef.current) return;
            const records = Array.isArray(result?.records) ? result.records : [];
            setHistory({
                ...result,
                records,
                counts: result?.counts || {},
            });
            setSelectedId((current) => (
                records.some((record) => record.id === current)
                    ? current
                    : records[0]?.id || null
            ));
            setErrorText('');
        } catch (error) {
            if (requestSequence === requestSequenceRef.current) {
                setErrorText(error.message || '读取气囊指令历史失败');
            }
        } finally {
            if (requestSequence === requestSequenceRef.current) setLoading(false);
        }
    }, [filter, sensorId]);

    useEffect(() => {
        if (!open) return undefined;
        refreshHistory(true);
        const timer = window.setInterval(
            () => refreshHistory(false),
            COMMAND_HISTORY_REFRESH_INTERVAL
        );
        return () => window.clearInterval(timer);
    }, [open, refreshHistory]);

    /** 清空当前通道的全部历史或当前筛选类型。 */
    const clearHistory = useCallback(async () => {
        if (clearing) return;
        setClearing(true);
        try {
            const result = await clearCarAdaptiveCommandHistory({ sensorId, type: filter });
            message.success(`已清空 ${Number(result?.removed) || 0} 条气囊指令历史`);
            await refreshHistory(false);
        } catch (error) {
            message.error(error.message || '清空气囊指令历史失败');
        } finally {
            setClearing(false);
        }
    }, [clearing, filter, refreshHistory, sensorId]);

    const records = history.records || [];
    const selectedRecord = records.find((record) => record.id === selectedId) || records[0] || null;
    const filterOptions = CAR_ADAPTIVE_COMMAND_HISTORY_FILTERS.map((item) => ({
        value: item.value,
        label: `${item.label} ${Number(history.counts?.[item.value]) || 0}`,
    }));
    const commandBytes = Array.isArray(selectedRecord?.command) ? selectedRecord.command : [];
    const wireBytes = Array.isArray(selectedRecord?.wireCommand) ? selectedRecord.wireCommand : [];

    return (
        <Modal
            className="raw-command-history-modal"
            wrapClassName="raw-command-history-modal-wrap"
            open={open}
            title={`气囊指令历史 · ${sensorId === 2 ? '副驾' : '主驾'}`}
            width={1000}
            destroyOnClose
            onCancel={onClose}
            footer={<Button onClick={onClose}>关闭</Button>}
        >
            <div className="raw-command-history-toolbar">
                <div className="raw-command-history-filter">
                    <Segmented
                        block
                        value={filter}
                        options={filterOptions}
                        onChange={setFilter}
                    />
                </div>
                <div className="raw-command-history-tools">
                    <Tooltip title="立即刷新">
                        <Button
                            aria-label="刷新气囊指令历史"
                            icon={<ReloadOutlined />}
                            loading={loading}
                            onClick={() => refreshHistory(true)}
                        />
                    </Tooltip>
                    <Popconfirm
                        title={`确认清空${filter === 'all' ? '当前通道全部' : `“${getCarAdaptiveCommandHistoryLabel(filter)}”`}历史？`}
                        okText="清空"
                        cancelText="取消"
                        onConfirm={clearHistory}
                    >
                        <Button danger icon={<DeleteOutlined />} loading={clearing}>清空</Button>
                    </Popconfirm>
                </div>
            </div>

            {errorText && <div className="raw-command-history-error">{errorText}</div>}
            <div className="raw-command-history-body">
                <div className="raw-command-history-list">
                    {loading && records.length === 0 ? (
                        <div className="raw-command-history-empty"><Spin /></div>
                    ) : records.length === 0 ? (
                        <div className="raw-command-history-empty"><Empty description="暂无历史记录" /></div>
                    ) : records.map((record) => (
                        <button
                            type="button"
                            className={`raw-command-history-item ${record.id === selectedRecord?.id ? 'is-selected' : ''}`}
                            key={record.id}
                            onClick={() => setSelectedId(record.id)}
                        >
                            <span className={`is-${record.type}`}>{getCarAdaptiveCommandHistoryLabel(record.type)}</span>
                            <strong>{formatTimestamp(record.stamp)}</strong>
                            <small>{record.length} 字节 · {getAirbagCommandHistoryStatus(record)}</small>
                        </button>
                    ))}
                </div>

                <section className="raw-command-history-detail">
                    {!selectedRecord ? (
                        <div className="raw-command-history-empty"><Empty description="请选择历史记录" /></div>
                    ) : (
                        <>
                            <div className="raw-command-history-detail-heading">
                                <div>
                                    <span className={`is-${selectedRecord.type}`}>
                                        {getCarAdaptiveCommandHistoryLabel(selectedRecord.type)}
                                    </span>
                                    <strong>{formatTimestamp(selectedRecord.stamp)}</strong>
                                </div>
                                <em>{getAirbagCommandHistoryStatus(selectedRecord)}</em>
                            </div>
                            <div className="raw-command-history-meta">
                                <span>{selectedRecord.length} 字节</span>
                                {selectedRecord.portPath && <code>{selectedRecord.portPath}</code>}
                                {Array.isArray(selectedRecord.portPaths) && selectedRecord.portPaths.length > 0 && (
                                    <code>{selectedRecord.portPaths.join(' / ')}</code>
                                )}
                            </div>
                            <div className="raw-command-history-section">
                                <h3>{selectedRecord.type === 'ecuFeedback' ? '51 字节业务帧' : '控制命令'}</h3>
                                <AirbagCommandByteGrid
                                    bytes={commandBytes}
                                    format={format}
                                    keyPrefix={`history-${selectedRecord.id}`}
                                />
                            </div>
                            {wireBytes.length > 0 && (
                                <div className="raw-command-history-section">
                                    <h3>还原后的 55 字节完整帧</h3>
                                    <AirbagCommandByteGrid
                                        bytes={wireBytes}
                                        format={format}
                                        keyPrefix={`wire-${selectedRecord.id}`}
                                    />
                                </div>
                            )}
                            {Array.isArray(selectedRecord.gears) && selectedRecord.gears.length === 24 && (
                                <div className="raw-command-history-section">
                                    <h3>24 路档位</h3>
                                    <div className="raw-command-history-gears">
                                        {selectedRecord.gears.map((gear, index) => (
                                            <div key={`gear-${selectedRecord.id}-${index}`}>
                                                <small>{index + 1}</small>
                                                <strong>{gear}</strong>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </section>
            </div>
        </Modal>
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
    const [railMode, setRailMode] = useState('pressure');
    const [historyOpen, setHistoryOpen] = useState(false);
    const [collectionState, setCollectionState] = useState({ collecting: false });
    const [collectionPending, setCollectionPending] = useState(false);
    const [exportPending, setExportPending] = useState(false);
    const remoteController = useRef(isCarAdaptiveRemoteController()).current;

    /** 静默同步主界面和原始数据页共享的采集状态。 */
    const refreshCollectionState = useCallback(async () => {
        try {
            const state = await getCarAdaptiveCollectionState();
            setCollectionState(state);
        } catch (_error) {
            // WebSocket 断线状态已经在页面展示，轮询失败时不重复弹出提示。
        }
    }, []);

    useEffect(() => {
        refreshCollectionState();
        const timer = window.setInterval(refreshCollectionState, 1000);
        return () => window.clearInterval(timer);
    }, [refreshCollectionState]);

    /** 开始当前通道采集，或停止并保存已有的全局采集任务。 */
    const toggleCollection = useCallback(async () => {
        if (collectionPending) return;
        setCollectionPending(true);
        try {
            const state = collectionState.collecting
                ? await stopCarAdaptiveCollection()
                : await startCarAdaptiveCollection({ sensorId });
            setCollectionState(state);
            if (state.collecting) {
                message.success(`开始采集${Number(state.sensorId) === 2 ? '副驾' : '主驾'}数据`);
            } else {
                message.success(`采集已保存，共 ${Number(state.frameCount) || 0} 帧`);
            }
        } catch (error) {
            message.error(error.message || '采集操作失败');
        } finally {
            setCollectionPending(false);
        }
    }, [collectionPending, collectionState.collecting, sensorId]);

    /** 直接下载当前采集段的真实 145 字节原始帧 CSV。 */
    const exportCollection = useCallback(async () => {
        if (exportPending) return;
        setExportPending(true);
        try {
            const result = await downloadCarAdaptiveCollection({
                fileName: collectionState.fileName,
                sensorId: collectionState.sensorId,
            });
            message.success(`已导出 ${result.frameCount} 帧：${result.fileName}`);
        } catch (error) {
            message.error(error.message || '导出原始数据失败');
        } finally {
            setExportPending(false);
        }
    }, [collectionState.fileName, collectionState.sensorId, exportPending]);

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
    const commands = frame.airbagCommands || {};
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
                    <Tooltip
                        title={collectionState.collecting
                            ? `${collectionState.role || ''}采集中，已保存 ${Number(collectionState.frameCount) || 0} 帧`
                            : '采集当前显示通道的真实串口压力数据'}
                    >
                        <Button
                            className={`raw-collection-button ${collectionState.collecting ? 'is-collecting' : ''}`}
                            type={collectionState.collecting ? 'primary' : 'default'}
                            danger={collectionState.collecting}
                            loading={collectionPending}
                            icon={collectionState.collecting ? <StopOutlined /> : <DatabaseOutlined />}
                            onClick={toggleCollection}
                        >
                            {collectionState.collecting
                                ? `停止采集 · ${Number(collectionState.sensorId) === 2 ? '副驾' : '主驾'}`
                                : '采集数据'}
                        </Button>
                    </Tooltip>
                    <Tooltip
                        title={Number(collectionState.frameCount) > 0
                            ? `导出${collectionState.role || ''}采集段，共 ${Number(collectionState.frameCount)} 帧`
                            : '完成一次采集后可以直接导出 CSV'}
                    >
                        <Button
                            className="raw-export-button"
                            loading={exportPending}
                            disabled={!collectionState.fileName || Number(collectionState.frameCount) <= 0}
                            icon={<DownloadOutlined />}
                            onClick={exportCollection}
                        >
                            导出 CSV
                        </Button>
                    </Tooltip>
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
                            <h2>{railMode === 'pressure' ? '完整原始帧' : '气囊指令'}</h2>
                            <p>
                                {railMode === 'pressure'
                                    ? `${RAW_SERIAL_FRAME_LENGTH} 字节 · ${format === 'hex' ? 'HEX' : 'DEC'}`
                                    : `算法 / ECU / 接口 · ${format === 'hex' ? 'HEX' : 'DEC'}`}
                            </p>
                        </div>
                        <div className="raw-rail-actions">
                            {railMode === 'commands' && (
                                <Button
                                    size="small"
                                    icon={<HistoryOutlined />}
                                    onClick={() => setHistoryOpen(true)}
                                >
                                    历史记录
                                </Button>
                            )}
                            <span className={paused ? 'is-paused' : ''}>{paused ? '已暂停' : '实时'}</span>
                        </div>
                    </div>
                    <Segmented
                        className="raw-rail-mode"
                        block
                        value={railMode}
                        options={[
                            { label: '压力帧', value: 'pressure' },
                            { label: '气囊指令', value: 'commands' },
                        ]}
                        onChange={setRailMode}
                    />
                    {railMode === 'pressure' ? (
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
                    ) : (
                        <div className="raw-command-feed">
                            <AirbagCommandFrame
                                title="算法下发"
                                record={commands.algorithmSent || commands.algorithmGenerated}
                                format={format}
                                status={commands.algorithmSent ? '已入串口队列' : '仅生成，尚未入队'}
                                emptyText="等待算法命令"
                            />
                            <AirbagCommandFrame
                                title="ECU 回传"
                                record={commands.ecuFeedback}
                                format={format}
                                status="51 字节业务帧"
                                emptyText="尚未收到可信回传"
                            />
                            <AirbagCommandFrame
                                title="接口写串口"
                                record={commands.apiSerial}
                                format={format}
                                status={commands.apiSerial?.queued ? '已入串口队列' : '未连接目标串口'}
                                emptyText="尚未调用 writeCommand"
                            />
                            <AirbagCommandFrame
                                title="接口控制展示"
                                record={commands.apiDisplay}
                                format={format}
                                status={commands.apiDisplay?.active ? '展示覆盖中' : '覆盖已清除'}
                                emptyText="尚未调用 display 接口"
                            />
                        </div>
                    )}
                    <div className="raw-rail-footer">
                        <span>数据源</span>
                        <code>{wsUrl}</code>
                    </div>
                </aside>
            </main>
            <AirbagCommandHistoryModal
                open={historyOpen}
                sensorId={sensorId}
                format={format}
                onClose={() => setHistoryOpen(false)}
            />
        </div>
    );
}

export default RawSerialPage;
