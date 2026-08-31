import { getRenderPerformanceProfile } from './renderPerformanceProfile';

test('WPF WebView2 使用稳定优先配置', () => {
    const profile = getRenderPerformanceProfile({
        navigatorObject: { deviceMemory: 16, hardwareConcurrency: 12 },
        windowObject: {
            devicePixelRatio: 1.5,
            innerWidth: 1920,
            innerHeight: 1080,
            chrome: { webview: {} },
        },
    });

    expect(profile).toMatchObject({
        antialias: false,
        pixelRatio: 1,
        shadows: false,
        constrained: true,
    });
});

test('普通低分辨率浏览器保留适度画质', () => {
    const profile = getRenderPerformanceProfile({
        navigatorObject: { deviceMemory: 16, hardwareConcurrency: 12 },
        windowObject: {
            devicePixelRatio: 1,
            innerWidth: 1280,
            innerHeight: 720,
        },
    });

    expect(profile).toMatchObject({
        antialias: true,
        pixelRatio: 1,
        shadows: true,
        constrained: false,
    });
});

test('高 DPI 大后备缓冲区自动进入限制模式', () => {
    const profile = getRenderPerformanceProfile({
        navigatorObject: { deviceMemory: 8, hardwareConcurrency: 8 },
        windowObject: {
            devicePixelRatio: 2,
            innerWidth: 1600,
            innerHeight: 900,
        },
    });

    expect(profile.constrained).toBe(true);
    expect(profile.pixelRatio).toBe(1);
    expect(profile.shadows).toBe(false);
});
