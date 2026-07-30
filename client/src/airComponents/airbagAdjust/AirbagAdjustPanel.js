import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    Button,
    Input,
    InputNumber,
    Select,
    Slider,
    Tooltip,
    message,
} from 'antd';
import {
    AimOutlined,
    CloseOutlined,
    CopyOutlined,
    HolderOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import {
    AIRBAG_GROUPS,
    createDefaultAirbagLayout,
    formatAirbagLayout,
    getAirbagGroupState,
    updateAirbagGroup,
} from './airbagLayout';
import { clampFloatingPanelPosition } from './floatingPanelPosition';
import './index.scss';

const CONTROL_RANGES = {
    top: { label: 'Y', min: 0, max: 99, step: 0.1 },
    left: { label: '左 X', min: 0, max: 49, step: 0.1 },
    width: { label: '宽度', min: 1, max: 40, step: 0.1 },
    height: { label: '高度', min: 1, max: 30, step: 0.1 },
};

/** 将文本写入系统剪贴板，不支持 Clipboard API 时使用隐藏文本框回退。 */
async function copyText(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) {
        throw new Error('copy command failed');
    }
}

/** 左右对称气囊的位置、尺寸和配置复制面板。 */
function AirbagAdjustPanel({
    layout,
    onLayoutChange,
    open: controlledOpen,
    onOpenChange,
    showTrigger = true,
}) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [groupValue, setGroupValue] = useState(AIRBAG_GROUPS[0].value);
    const [position, setPosition] = useState(null);
    const [dragging, setDragging] = useState(false);
    const panelRef = useRef(null);
    const dragStateRef = useRef(null);
    const open = typeof controlledOpen === 'boolean'
        ? controlledOpen
        : internalOpen;
    const groupState = useMemo(
        () => getAirbagGroupState(layout, groupValue),
        [groupValue, layout]
    );
    const configText = useMemo(() => formatAirbagLayout(layout), [layout]);

    /** 根据面板实际尺寸将坐标限制到当前窗口内。 */
    const clampPosition = useCallback((x, y) => {
        const panel = panelRef.current;
        if (!panel) {
            return { x, y };
        }
        const rect = panel.getBoundingClientRect();
        return clampFloatingPanelPosition({
            x,
            y,
            panelWidth: rect.width,
            panelHeight: rect.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
        });
    }, []);

    /** 设置拖动坐标，仅在位置实际变化时触发渲染。 */
    const movePanel = useCallback((x, y) => {
        const nextPosition = clampPosition(x, y);
        setPosition((currentPosition) => (
            currentPosition
            && currentPosition.x === nextPosition.x
            && currentPosition.y === nextPosition.y
                ? currentPosition
                : nextPosition
        ));
    }, [clampPosition]);

    /** 从标题栏开始拖动，记录指针在面板内的偏移量。 */
    const startDragging = (event) => {
        if (
            (typeof event.button === 'number' && event.button !== 0)
            || event.target.closest?.('button')
            || !panelRef.current
        ) {
            return;
        }

        const rect = panelRef.current.getBoundingClientRect();
        dragStateRef.current = {
            pointerId: event.pointerId,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
        };
        setPosition({ x: rect.left, y: rect.top });
        setDragging(true);
        event.preventDefault();
    };

    useEffect(() => {
        if (!dragging) {
            return undefined;
        }

        /** 根据指针移动更新面板左上角坐标。 */
        const handlePointerMove = (event) => {
            const dragState = dragStateRef.current;
            if (!dragState || event.pointerId !== dragState.pointerId) {
                return;
            }
            movePanel(
                event.clientX - dragState.offsetX,
                event.clientY - dragState.offsetY
            );
        };

        /** 结束当前指针的面板拖动。 */
        const handlePointerUp = (event) => {
            const dragState = dragStateRef.current;
            if (!dragState || event.pointerId !== dragState.pointerId) {
                return;
            }
            dragStateRef.current = null;
            setDragging(false);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
        };
    }, [dragging, movePanel]);

    useEffect(() => {
        /** 窗口尺寸变化后把已经拖动的面板重新限制到可见区域。 */
        const handleResize = () => {
            setPosition((currentPosition) => {
                if (!currentPosition) {
                    return currentPosition;
                }
                return clampPosition(currentPosition.x, currentPosition.y);
            });
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [clampPosition]);

    useLayoutEffect(() => {
        if (!open) {
            return;
        }

        setPosition((currentPosition) => {
            if (!currentPosition) {
                return currentPosition;
            }

            const nextPosition = clampPosition(
                currentPosition.x,
                currentPosition.y
            );
            return currentPosition.x === nextPosition.x
                && currentPosition.y === nextPosition.y
                ? currentPosition
                : nextPosition;
        });
    }, [
        clampPosition,
        groupValue,
        open,
    ]); // 气囊类型改变面板高度后保持在视口内。

    useEffect(() => {
        if (!open) {
            dragStateRef.current = null;
            setDragging(false);
        }
    }, [open]);

    /** 更新受控或非受控状态下的面板开关。 */
    const setOpen = (nextOpen) => {
        if (typeof controlledOpen !== 'boolean') {
            setInternalOpen(nextOpen);
        }
        onOpenChange?.(nextOpen);
    };

    /** 更新当前气囊组并立即同步到主视图。 */
    const updateField = (field, value) => {
        if (typeof value !== 'number') {
            return;
        }
        onLayoutChange(
            updateAirbagGroup(layout, groupState.group.value, field, value)
        );
    };

    /** 恢复全部气囊的默认对称位置。 */
    const resetAll = () => {
        onLayoutChange(createDefaultAirbagLayout());
    };

    /** 复制与当前 `airArr` 相同格式的位置配置。 */
    const copyConfig = async () => {
        try {
            await copyText(configText);
            message.success('气囊位置已复制');
        } catch (_error) {
            message.error('复制失败，请在配置框中手动复制');
        }
    };

    if (!open && showTrigger) {
        return (
            <Tooltip title="气囊位置" placement="left">
                <Button
                    className="airbag-adjust-toggle"
                    type="primary"
                    shape="circle"
                    icon={<AimOutlined />}
                    aria-label="打开气囊位置调节"
                    onClick={() => setOpen(true)}
                />
            </Tooltip>
        );
    }

    if (!open) {
        return null;
    }

    const fields = ['top'];
    if (!groupState.group.centered) {
        fields.push('left');
    }
    fields.push('width');
    if (groupState.primary.type === 'rect') {
        fields.push('height');
    }

    return (
        <section
            ref={panelRef}
            className={`airbag-adjust-panel${dragging ? ' is-dragging' : ''}`}
            style={position
                ? { left: position.x, top: position.y, right: 'auto' }
                : undefined}
            aria-label="气囊位置调节"
        >
            <header
                className="airbag-adjust-header"
                onPointerDown={startDragging}
            >
                <span className="airbag-adjust-title">
                    <HolderOutlined aria-hidden="true" />
                    <span>气囊位置调节</span>
                </span>
                <Tooltip title="收起">
                    <Button
                        type="text"
                        shape="circle"
                        icon={<CloseOutlined />}
                        aria-label="收起气囊位置调节"
                        onClick={() => setOpen(false)}
                    />
                </Tooltip>
            </header>

            <Select
                className="airbag-adjust-select"
                classNames={{
                    popup: { root: 'airbag-adjust-dropdown' },
                }}
                styles={{
                    popup: { root: { zIndex: 1300 } },
                }}
                value={groupValue}
                options={AIRBAG_GROUPS}
                aria-label="选择气囊组"
                onChange={setGroupValue}
            />

            <div className="airbag-adjust-position-summary">
                <span>左 {groupState.primary.left}</span>
                <span>
                    {groupState.mirrored
                        ? `右 ${groupState.mirrored.left}`
                        : `居中 ${groupState.primary.left}`}
                </span>
            </div>

            <div className="airbag-adjust-controls">
                {fields.map((field) => {
                    const range = CONTROL_RANGES[field];
                    const max = field === 'left'
                        ? Math.max(0, 50 - groupState.primary.width)
                        : range.max;

                    return (
                        <div className="airbag-adjust-row" key={field}>
                            <span>{range.label}</span>
                            <Slider
                                min={range.min}
                                max={max}
                                step={range.step}
                                value={groupState.primary[field]}
                                aria-label={`${groupState.group.label}${range.label}滑块`}
                                onChange={(value) => updateField(field, value)}
                            />
                            <InputNumber
                                min={range.min}
                                max={max}
                                step={range.step}
                                value={groupState.primary[field]}
                                aria-label={`${groupState.group.label}${range.label}数值`}
                                onChange={(value) => updateField(field, value)}
                            />
                        </div>
                    );
                })}
            </div>

            <div className="airbag-adjust-config-title">airArr</div>
            <Input.TextArea
                className="airbag-adjust-config"
                value={configText}
                readOnly
                autoSize={{ minRows: 5, maxRows: 8 }}
                aria-label="可复制的气囊位置配置"
            />

            <footer className="airbag-adjust-footer">
                <Button icon={<ReloadOutlined />} onClick={resetAll}>
                    重置全部
                </Button>
                <Button type="primary" icon={<CopyOutlined />} onClick={copyConfig}>
                    复制配置
                </Button>
            </footer>
        </section>
    );
}

export default AirbagAdjustPanel;
