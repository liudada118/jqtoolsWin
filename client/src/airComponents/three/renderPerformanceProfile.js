const LARGE_BACK_BUFFER_PIXELS = 3000000;

/**
 * 根据运行宿主和预计 WebGL 后备缓冲区大小选择渲染配置。
 * WPF WebView2 优先稳定性：保持 1 倍像素比并关闭实时阴影和抗锯齿。
 *
 * @param {object} options 运行环境覆盖项，主要供测试使用。
 * @param {Navigator|object} [options.navigatorObject] 浏览器 navigator。
 * @param {Window|object} [options.windowObject] 浏览器 window。
 * @returns {{antialias:boolean,pixelRatio:number,shadows:boolean,constrained:boolean}} 渲染配置。
 */
export function getRenderPerformanceProfile({
    navigatorObject = typeof navigator === 'undefined' ? {} : navigator,
    windowObject = typeof window === 'undefined' ? {} : window,
} = {}) {
    const deviceMemory = Number(navigatorObject.deviceMemory || 0);
    const hardwareConcurrency = Number(navigatorObject.hardwareConcurrency || 0);
    const devicePixelRatio = Math.max(1, Number(windowObject.devicePixelRatio || 1));
    const viewportWidth = Math.max(1, Number(windowObject.innerWidth || 1));
    const viewportHeight = Math.max(1, Number(windowObject.innerHeight || 1));
    const lowPerformance =
        (deviceMemory > 0 && deviceMemory <= 4) ||
        (hardwareConcurrency > 0 && hardwareConcurrency <= 4);
    const embeddedWebView = Boolean(windowObject.chrome?.webview);
    const largeBackBuffer = viewportWidth * viewportHeight * devicePixelRatio * devicePixelRatio
        >= LARGE_BACK_BUFFER_PIXELS;
    const constrained = lowPerformance || embeddedWebView || largeBackBuffer;

    return {
        antialias: !constrained,
        pixelRatio: Math.min(devicePixelRatio, constrained ? 1 : 1.25),
        shadows: !constrained,
        constrained,
    };
}
