import { clampFloatingPanelPosition } from './floatingPanelPosition';

test('面板拖动位置会被限制在视口边界内', () => {
    expect(clampFloatingPanelPosition({
        x: -100,
        y: -80,
        panelWidth: 400,
        panelHeight: 500,
        viewportWidth: 1200,
        viewportHeight: 900,
    })).toEqual({ x: 8, y: 8 });

    expect(clampFloatingPanelPosition({
        x: 1100,
        y: 850,
        panelWidth: 400,
        panelHeight: 500,
        viewportWidth: 1200,
        viewportHeight: 900,
    })).toEqual({ x: 792, y: 392 });
});

test('面板大于视口时允许贴边并保持左上角可操作', () => {
    expect(clampFloatingPanelPosition({
        x: 200,
        y: 100,
        panelWidth: 500,
        panelHeight: 700,
        viewportWidth: 390,
        viewportHeight: 600,
    })).toEqual({ x: 0, y: 0 });
});
