import {
    AIRBAG_LAYOUT_STORAGE_KEY,
    AIRBAG_GROUPS,
    createDefaultAirbagLayout,
    formatAirbagLayout,
    getAirbagGroupState,
    normalizeAirbagLayout,
    updateAirbagGroup,
} from './airbagLayout';

test('默认气囊布局包含 24 项并保持全部左右组对称', () => {
    const layout = createDefaultAirbagLayout();

    expect(AIRBAG_LAYOUT_STORAGE_KEY).toBe('jqtools.carAir.airbagLayout.v2');
    expect(layout).toEqual([
        { top: 19.8, left: 37.1, width: 11.7, type: 'rect', height: 5.7 },
        { top: 19.8, left: 51.2, width: 11.7, type: 'rect', height: 5.7 },
        { top: 39.3, left: 33.5, width: 5, type: 'rect', height: 13.3 },
        { top: 39.3, left: 61.5, width: 5, type: 'rect', height: 13.3 },
        { top: 45.6, left: 41, width: 18, type: 'rect', height: 6 },
        { top: 53.4, left: 41, width: 18, type: 'rect', height: 6 },
        { top: 62.6, left: 39, width: 11, type: 'rect', height: 11.1 },
        { top: 62.6, left: 50, width: 11, type: 'rect', height: 11.1 },
        { top: 74.1, left: 38, width: 10, type: 'rect', height: 5.6 },
        { top: 74.1, left: 52, width: 10, type: 'rect', height: 5.6 },
        { top: 30, left: 42.5, width: 5, type: 'circle' },
        { top: 30, left: 52.5, width: 5, type: 'circle' },
        { top: 38, left: 42.5, width: 5, type: 'circle' },
        { top: 38, left: 52.5, width: 5, type: 'circle' },
        { top: 46, left: 42.5, width: 5, type: 'circle' },
        { top: 46, left: 52.5, width: 5, type: 'circle' },
        { top: 54, left: 42.5, width: 5, type: 'circle' },
        { top: 54, left: 52.5, width: 5, type: 'circle' },
        { top: 62.7, left: 42.5, width: 5, type: 'circle' },
        { top: 62.7, left: 52.5, width: 5, type: 'circle' },
        { top: 68.6, left: 42.5, width: 5, type: 'circle' },
        { top: 68.6, left: 52.5, width: 5, type: 'circle' },
        { top: 74.5, left: 42.5, width: 5, type: 'circle' },
        { top: 74.5, left: 52.5, width: 5, type: 'circle' },
    ]);
    AIRBAG_GROUPS.filter((group) => !group.centered).forEach((group) => {
        const [leftIndex, rightIndex] = group.indexes;
        const left = layout[leftIndex];
        const right = layout[rightIndex];
        expect(left.top).toBe(right.top);
        expect(left.width).toBe(right.width);
        expect(left.left + left.width + right.left).toBeCloseTo(100, 5);
    });
});

test('调节左侧位置时自动更新右侧镜像位置', () => {
    const layout = updateAirbagGroup(
        createDefaultAirbagLayout(),
        'shoulder',
        'left',
        31.5
    );
    const state = getAirbagGroupState(layout, 'shoulder');

    expect(state.primary.left).toBe(31.5);
    expect(state.mirrored.left).toBe(56.8);
});

test('调节成对气囊尺寸时左右保持一致', () => {
    const layout = updateAirbagGroup(
        createDefaultAirbagLayout(),
        'sideWing',
        'height',
        12.4
    );
    const state = getAirbagGroupState(layout, 'sideWing');

    expect(state.primary.height).toBe(12.4);
    expect(state.mirrored.height).toBe(12.4);
});

test('中间气囊修改宽度后继续自动居中', () => {
    const layout = updateAirbagGroup(
        createDefaultAirbagLayout(),
        'lumbarUpper',
        'width',
        20
    );
    const state = getAirbagGroupState(layout, 'lumbarUpper');

    expect(state.primary.left).toBe(40);
    expect(state.mirrored).toBeNull();
});

test('损坏或缺失的数据会按默认格式补齐', () => {
    const layout = normalizeAirbagLayout([{ top: 'bad', width: 8 }]);

    expect(layout).toHaveLength(24);
    expect(layout[0].type).toBe('rect');
    expect(layout[10].type).toBe('circle');
});

test('复制文本保持当前 airArr JavaScript 格式', () => {
    const text = formatAirbagLayout(createDefaultAirbagLayout());

    expect(text).toMatch(/^const airArr = \[/);
    expect(text).toContain("type: 'rect',");
    expect(text).toContain("type: 'circle',");
    expect(text).toContain('top: 45.6,');
    expect(text).not.toContain('"top"');
});
