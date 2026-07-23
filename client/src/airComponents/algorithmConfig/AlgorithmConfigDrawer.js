import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Collapse, Drawer, Empty, Input, InputNumber, Spin, Switch, Tooltip, message } from 'antd';
import { ReloadOutlined, SaveOutlined, SearchOutlined, SlidersOutlined, UndoOutlined } from '@ant-design/icons';
import axios from 'axios';
import './index.scss';

const GROUP_LABELS = {
    system: '系统参数',
    control: '控制参数',
    lumbar: '腰托参数',
    side_wings: '侧翼参数',
    leg_support: '腿托参数',
    matrix: '矩阵参数',
    protocol: '通信协议',
    living_detection: '活体检测',
    body_type_detection: '体型检测',
    integrated_system: '集成算法',
    tap_massage: '敲击按摩',
};

/** 根据当前页面地址解析后端 API，开发热启动固定连接 19245。 */
function resolveApiBase() {
    if (window.location.port && window.location.port !== '3000') {
        return window.location.origin;
    }
    return 'http://127.0.0.1:19245';
}

/** 对数组参数进行可读格式化。 */
function formatArray(value) {
    return value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(', ');
}

/** 按原数组元素类型解析用户输入，避免数字数组被保存成字符串数组。 */
function parseArray(text, originalValue) {
    const parts = text.split(',').map((item) => item.trim()).filter(Boolean);
    const sample = originalValue.find((item) => item !== null && item !== undefined);

    if (typeof sample === 'number') {
        const values = parts.map(Number);
        if (values.some(Number.isNaN)) {
            throw new Error('数组中只能填写数字，并使用英文逗号分隔');
        }
        return values;
    }
    if (typeof sample === 'boolean') {
        return parts.map((item) => item.toLowerCase() === 'true');
    }
    return parts;
}

/** 判断两个参数值是否相同。 */
function valuesEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

/** 提供 Python 汽车自适应算法参数的读取、编辑和批量保存抽屉。 */
function AlgorithmConfigDrawer({ open: controlledOpen, onOpenChange, showTrigger = true }) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [source, setSource] = useState({});
    const [draft, setDraft] = useState({});

    const open = typeof controlledOpen === 'boolean' ? controlledOpen : internalOpen;

    /** 更新受控或非受控状态下的抽屉开关。 */
    const setOpen = (nextOpen) => {
        if (typeof controlledOpen !== 'boolean') {
            setInternalOpen(nextOpen);
        }
        onOpenChange?.(nextOpen);
    };

    /** 从 Python worker 读取参数，并同步初始化编辑草稿。 */
    const loadConfig = useCallback(async () => {
        setLoading(true);
        try {
            const response = await axios.get(`${resolveApiBase()}/algorithm/config`);
            if (response.data?.code !== 0) {
                throw new Error(response.data?.message || '读取算法参数失败');
            }
            const config = response.data.data || {};
            setSource(config);
            setDraft(Object.fromEntries(Object.entries(config).map(([path, item]) => [path, item.value])));
        } catch (error) {
            message.error(error.response?.data?.message || error.message || '读取算法参数失败');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) {
            loadConfig();
        }
    }, [open, loadConfig]);

    /** 打开抽屉并加载算法参数。 */
    const showDrawer = () => {
        setOpen(true);
    };

    /** 更新单个参数的草稿值。 */
    const updateDraft = (path, value) => {
        setDraft((current) => ({ ...current, [path]: value }));
    };

    /** 将所有未保存改动恢复为本次读取到的值。 */
    const undoChanges = () => {
        setDraft(Object.fromEntries(Object.entries(source).map(([path, item]) => [path, item.value])));
    };

    const dirtyChanges = useMemo(() => Object.fromEntries(
        Object.entries(draft).filter(([path, value]) => !valuesEqual(value, source[path]?.value))
    ), [draft, source]);
    const dirtyCount = Object.keys(dirtyChanges).length;

    /** 批量保存修改，并使用后端返回的最新配置刷新界面。 */
    const saveChanges = async () => {
        if (!dirtyCount) return;
        setSaving(true);
        try {
            const response = await axios.post(`${resolveApiBase()}/algorithm/config`, { changes: dirtyChanges });
            if (response.data?.code !== 0) {
                throw new Error(response.data?.message || '保存算法参数失败');
            }
            const config = response.data.data?.config || {};
            setSource(config);
            setDraft(Object.fromEntries(Object.entries(config).map(([path, item]) => [path, item.value])));
            message.success(`已保存 ${dirtyCount} 个参数，算法已重新加载`);
        } catch (error) {
            message.error(error.response?.data?.message || error.message || '保存算法参数失败');
        } finally {
            setSaving(false);
        }
    };

    /** 根据参数原始类型渲染对应编辑控件。 */
    const renderEditor = (path, item) => {
        const value = draft[path];
        if (typeof item.value === 'boolean') {
            return <Switch checked={Boolean(value)} onChange={(checked) => updateDraft(path, checked)} />;
        }
        if (typeof item.value === 'number') {
            return <InputNumber value={value} onChange={(next) => updateDraft(path, next)} />;
        }
        if (Array.isArray(item.value)) {
            return (
                <Input
                    value={formatArray(Array.isArray(value) ? value : [])}
                    onChange={(event) => {
                        try {
                            updateDraft(path, parseArray(event.target.value, item.value));
                        } catch (error) {
                            message.warning(error.message);
                        }
                    }}
                />
            );
        }
        return <Input value={value ?? ''} onChange={(event) => updateDraft(path, event.target.value)} />;
    };

    const groupedItems = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        const groups = {};
        Object.entries(source).forEach(([path, item]) => {
            const searchable = `${path} ${item.comment || ''}`.toLowerCase();
            if (keyword && !searchable.includes(keyword)) return;
            const group = path.split('.')[0];
            if (!groups[group]) groups[group] = [];
            groups[group].push({ path, item });
        });
        return groups;
    }, [search, source]);

    const collapseItems = Object.entries(groupedItems).map(([group, items]) => ({
        key: group,
        label: `${GROUP_LABELS[group] || group} (${items.length})`,
        children: (
            <div className="algorithm-config-list">
                {items.map(({ path, item }) => (
                    <div className={`algorithm-config-row ${!valuesEqual(draft[path], item.value) ? 'is-dirty' : ''}`} key={path}>
                        <div className="algorithm-config-meta">
                            <div className="algorithm-config-path">{path}</div>
                            {item.comment && <div className="algorithm-config-comment">{item.comment}</div>}
                        </div>
                        <div className="algorithm-config-editor">{renderEditor(path, item)}</div>
                    </div>
                ))}
            </div>
        ),
    }));

    return (
        <>
            {showTrigger && (
                <Tooltip title="算法参数">
                    <Button className="algorithm-config-toggle" type="primary" icon={<SlidersOutlined />} onClick={showDrawer} />
                </Tooltip>
            )}
            <Drawer
                rootClassName="algorithm-config-drawer"
                title="算法参数"
                width={460}
                open={open}
                mask={false}
                onClose={() => setOpen(false)}
                extra={<Button icon={<ReloadOutlined />} onClick={loadConfig} loading={loading}>刷新</Button>}
                footer={(
                    <div className="algorithm-config-footer">
                        <span>{dirtyCount ? `待保存 ${dirtyCount} 项` : '参数已同步'}</span>
                        <div>
                            <Button icon={<UndoOutlined />} disabled={!dirtyCount || saving} onClick={undoChanges}>撤销修改</Button>
                            <Button type="primary" icon={<SaveOutlined />} disabled={!dirtyCount} loading={saving} onClick={saveChanges}>保存参数</Button>
                        </div>
                    </div>
                )}
            >
                <Input
                    className="algorithm-config-search"
                    prefix={<SearchOutlined />}
                    placeholder="搜索参数路径或中文说明"
                    allowClear
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
                <Spin spinning={loading}>
                    {collapseItems.length
                        ? <Collapse items={collapseItems} defaultActiveKey={collapseItems.slice(0, 2).map((item) => item.key)} />
                        : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? '正在读取参数' : '没有匹配的参数'} />}
                </Spin>
            </Drawer>
        </>
    );
}

export default AlgorithmConfigDrawer;
