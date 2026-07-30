const DEFAULT_VIEWPORT_MARGIN = 8;

/** 将浮动面板位置限制在当前视口内，确保标题栏和内容不会被拖出窗口。 */
export function clampFloatingPanelPosition({
    x,
    y,
    panelWidth,
    panelHeight,
    viewportWidth,
    viewportHeight,
    margin = DEFAULT_VIEWPORT_MARGIN,
}) {
    const horizontalMargin = panelWidth + margin * 2 <= viewportWidth
        ? margin
        : 0;
    const verticalMargin = panelHeight + margin * 2 <= viewportHeight
        ? margin
        : 0;
    const maxX = Math.max(
        horizontalMargin,
        viewportWidth - panelWidth - horizontalMargin
    );
    const maxY = Math.max(
        verticalMargin,
        viewportHeight - panelHeight - verticalMargin
    );

    return {
        x: Math.min(maxX, Math.max(horizontalMargin, x)),
        y: Math.min(maxY, Math.max(verticalMargin, y)),
    };
}
