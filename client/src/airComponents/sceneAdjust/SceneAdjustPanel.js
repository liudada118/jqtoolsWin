import React, { useCallback, useEffect, useState } from 'react';
import { Button, InputNumber, Segmented, Select, Slider, Tooltip } from 'antd';
import { CloseOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import {
    createDefaultSceneTransform,
    normalizeSceneScale,
    POINT_ITEM_OPTIONS,
} from '../three/sceneTransform';
import './index.scss';

const STORAGE_KEY = 'jqtools.carAir.sceneTransform.v7';

const TARGET_LABELS = {
    model: '座椅模型',
    points: '压力点图',
    pointItem: '单个点图',
    overall: '整体视图',
};

const POSITION_RANGES = {
    overall: {
        x: { min: -400, max: 400, step: 1 },
        y: { min: -400, max: 400, step: 1 },
        z: { min: -400, max: 400, step: 1 },
    },
    model: {
        x: { min: -200, max: 200, step: 1 },
        y: { min: -300, max: 100, step: 1 },
        z: { min: -200, max: 200, step: 1 },
    },
    points: {
        x: { min: -100, max: 100, step: 1 },
        y: { min: -100, max: 100, step: 1 },
        z: { min: -100, max: 100, step: 1 },
    },
    pointItem: {
        x: { min: -400, max: 400, step: 1 },
        y: { min: -400, max: 400, step: 1 },
        z: { min: -400, max: 400, step: 1 },
    },
};

const ROTATION_RANGE = { min: -12.57, max: 12.57, step: 0.01 };
const SCALE_RANGE = { min: 0.25, max: 2.5, step: 0.05 };

/** 从本地存储读取整体、座椅和点图变换，损坏的数据自动回退到默认值。 */
function readStoredTransform() {
    const defaults = createDefaultSceneTransform();

    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return {
            overall: {
                ...defaults.overall,
                ...stored?.overall,
                rotation: { ...defaults.overall.rotation, ...stored?.overall?.rotation },
                scale: normalizeSceneScale(stored?.overall?.scale, defaults.overall.scale),
            },
            model: {
                ...defaults.model,
                ...stored?.model,
                scale: normalizeSceneScale(stored?.model?.scale, defaults.model.scale),
            },
            points: {
                ...defaults.points,
                ...stored?.points,
                scale: normalizeSceneScale(stored?.points?.scale, defaults.points.scale),
            },
            pointItems: Object.fromEntries(
                Object.entries(defaults.pointItems).map(([name, item]) => [
                    name,
                    {
                        ...item,
                        ...stored?.pointItems?.[name],
                        rotation: { ...item.rotation, ...stored?.pointItems?.[name]?.rotation },
                        scale: normalizeSceneScale(
                            stored?.pointItems?.[name]?.scale,
                            item.scale
                        ),
                    },
                ])
            ),
        };
    } catch (_error) {
        return defaults;
    }
}

/** 汽车整体视图、座椅模型和压力点图的位置、缩放调节面板。 */
function SceneAdjustPanel({ sceneRef, open: controlledOpen, onOpenChange, showTrigger = true }) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [target, setTarget] = useState('model');
    const [pointItem, setPointItem] = useState(POINT_ITEM_OPTIONS[0].value);
    const [transform, setTransform] = useState(readStoredTransform);
    const open = typeof controlledOpen === 'boolean' ? controlledOpen : internalOpen;

    /** 更新受控或非受控状态下的面板开关。 */
    const setOpen = (nextOpen) => {
        if (typeof controlledOpen !== 'boolean') {
            setInternalOpen(nextOpen);
        }
        onOpenChange?.(nextOpen);
    };

    const applyTransform = useCallback((nextTransform) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTransform));
        sceneRef.current?.setSceneTransform(nextTransform);
    }, [sceneRef]);

    useEffect(() => {
        applyTransform(transform);
    }, []); // 场景挂载后恢复上次保存的位置。

    /** 更新当前选中对象的变换配置。 */
    const updateActiveTransform = (changes) => {
        const nextTransform = target === 'pointItem'
            ? {
                ...transform,
                pointItems: {
                    ...transform.pointItems,
                    [pointItem]: { ...transform.pointItems[pointItem], ...changes },
                },
            }
            : {
                ...transform,
                [target]: { ...transform[target], ...changes },
            };
        setTransform(nextTransform);
        applyTransform(nextTransform);
    };

    /** 更新当前对象的单个位置轴。 */
    const updatePosition = (axis, value) => {
        if (typeof value !== 'number') return;
        updateActiveTransform({ [axis]: value });
    };

    /** 更新当前对象的单个缩放轴。 */
    const updateScale = (axis, value) => {
        if (typeof value !== 'number') return;
        const scale = Math.min(2.5, Math.max(0.25, Number(value.toFixed(2))));
        const activeScale = target === 'pointItem'
            ? transform.pointItems[pointItem].scale
            : transform[target].scale;
        updateActiveTransform({
            scale: {
                ...activeScale,
                [axis]: scale,
            },
        });
    };

    /** 更新单个点图或整体视图的旋转轴，旋转值使用弧度。 */
    const updateRotation = (axis, value) => {
        if (typeof value !== 'number') return;
        const currentRotation = target === 'pointItem'
            ? transform.pointItems[pointItem].rotation
            : transform[target].rotation;
        updateActiveTransform({
            rotation: {
                ...currentRotation,
                [axis]: value,
            },
        });
    };

    /** 将当前对象恢复到默认位置和缩放。 */
    const resetCurrentTarget = () => {
        const defaults = createDefaultSceneTransform();
        const nextTransform = target === 'pointItem'
            ? {
                ...transform,
                pointItems: {
                    ...transform.pointItems,
                    [pointItem]: defaults.pointItems[pointItem],
                },
            }
            : { ...transform, [target]: defaults[target] };
        setTransform(nextTransform);
        applyTransform(nextTransform);
    };

    if (!open && showTrigger) {
        return (
            <Tooltip title="视图调节" placement="left">
                <Button
                    className="scene-adjust-toggle"
                    type="primary"
                    shape="circle"
                    icon={<SettingOutlined />}
                    aria-label="打开视图调节"
                    onClick={() => setOpen(true)}
                />
            </Tooltip>
        );
    }

    if (!open) return null;

    const activeTransform = target === 'pointItem' ? transform.pointItems[pointItem] : transform[target];
    const ranges = POSITION_RANGES[target];
    const activeLabel = target === 'pointItem'
        ? POINT_ITEM_OPTIONS.find((option) => option.value === pointItem)?.label
        : TARGET_LABELS[target];

    return (
        <section className="scene-adjust-panel" aria-label="视图调节">
            <header className="scene-adjust-header">
                <span>视图调节</span>
                <Tooltip title="收起">
                    <Button
                        type="text"
                        shape="circle"
                        icon={<CloseOutlined />}
                        aria-label="收起视图调节"
                        onClick={() => setOpen(false)}
                    />
                </Tooltip>
            </header>

            <Segmented
                block
                value={target}
                options={[
                    { label: '座椅模型', value: 'model' },
                    { label: '全部点图', value: 'points' },
                    { label: '单点调节', value: 'pointItem' },
                    { label: '整体视图', value: 'overall' },
                ]}
                onChange={setTarget}
            />

            {target === 'pointItem' && (
                <Select
                    className="scene-adjust-point-select"
                    popupClassName="scene-adjust-point-dropdown"
                    dropdownStyle={{ zIndex: 1300 }}
                    aria-label="选择压力点图"
                    value={pointItem}
                    options={POINT_ITEM_OPTIONS}
                    onChange={setPointItem}
                />
            )}

            <div className="scene-adjust-controls">
                <div className="scene-adjust-section-title">位置</div>
                {['x', 'y', 'z'].map((axis) => (
                    <div className="scene-adjust-row" key={axis}>
                        <span className="scene-adjust-axis">{axis.toUpperCase()}</span>
                        <Slider
                            aria-label={`${activeLabel} ${axis.toUpperCase()} 位置滑块`}
                            min={ranges[axis].min}
                            max={ranges[axis].max}
                            step={ranges[axis].step}
                            value={activeTransform[axis]}
                            onChange={(value) => updatePosition(axis, value)}
                        />
                        <InputNumber
                            aria-label={`${activeLabel} ${axis.toUpperCase()} 位置数值`}
                            min={ranges[axis].min}
                            max={ranges[axis].max}
                            step={ranges[axis].step}
                            value={activeTransform[axis]}
                            onChange={(value) => updatePosition(axis, value)}
                        />
                    </div>
                ))}

                {(target === 'pointItem' || target === 'overall') && (
                    <>
                        <div className="scene-adjust-section-title">旋转（弧度）</div>
                        {['x', 'y', 'z'].map((axis) => (
                            <div className="scene-adjust-row" key={`rotation-${axis}`}>
                                <span className="scene-adjust-axis">R{axis.toUpperCase()}</span>
                                <Slider
                                    aria-label={`${activeLabel} R${axis.toUpperCase()} 旋转滑块`}
                                    {...ROTATION_RANGE}
                                    value={activeTransform.rotation[axis]}
                                    onChange={(value) => updateRotation(axis, value)}
                                />
                                <InputNumber
                                    aria-label={`${activeLabel} R${axis.toUpperCase()} 旋转数值`}
                                    {...ROTATION_RANGE}
                                    value={activeTransform.rotation[axis]}
                                    onChange={(value) => updateRotation(axis, value)}
                                />
                            </div>
                        ))}
                    </>
                )}

                <>
                    <div className="scene-adjust-section-title">方向缩放</div>
                    {['x', 'y', 'z'].map((axis) => (
                        <div className="scene-adjust-row" key={`scale-${axis}`}>
                            <span className="scene-adjust-axis">S{axis.toUpperCase()}</span>
                            <Slider
                                aria-label={`${activeLabel} S${axis.toUpperCase()} 缩放滑块`}
                                {...SCALE_RANGE}
                                value={activeTransform.scale[axis]}
                                onChange={(value) => updateScale(axis, value)}
                            />
                            <InputNumber
                                aria-label={`${activeLabel} S${axis.toUpperCase()} 缩放数值`}
                                {...SCALE_RANGE}
                                value={activeTransform.scale[axis]}
                                onChange={(value) => updateScale(axis, value)}
                            />
                        </div>
                    ))}
                </>
            </div>

            <footer className="scene-adjust-footer">
                <Button icon={<ReloadOutlined />} onClick={resetCurrentTarget}>
                    重置当前
                </Button>
            </footer>
        </section>
    );
}

export default SceneAdjustPanel;
