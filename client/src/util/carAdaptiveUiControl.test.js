import {
    CAR_ADAPTIVE_HOME_EVENT,
    CAR_ADAPTIVE_VIEW_EVENT,
    CAR_ADAPTIVE_UI_ACTIONS,
    CAR_ADAPTIVE_UI_VIEWS,
    applyCarAdaptiveUiCommand,
    getCarAdaptiveUiView,
    getStoredCarAdaptiveSensorId,
    isCarAdaptiveRemoteController,
    normalizeCarAdaptiveSensorId,
    resolveCarAdaptiveHomeUrl,
    sendCarAdaptiveUiCommand,
    storeCarAdaptiveSensorId,
} from './carAdaptiveUiControl';

const originalFetch = window.fetch;

beforeEach(() => {
    window.history.replaceState({}, '', '/');
    window.localStorage.clear();
    window.sessionStorage.clear();
});

afterEach(() => {
    window.fetch = originalFetch;
});

test('主副驾标识会被规范化并持久化', () => {
    expect(normalizeCarAdaptiveSensorId('2')).toBe(2);
    expect(normalizeCarAdaptiveSensorId(3)).toBeNull();
    expect(storeCarAdaptiveSensorId(2)).toBe(2);
    expect(getStoredCarAdaptiveSensorId()).toBe(2);
});

test('SDK 路由会转换为标准视图名称', () => {
    expect(getCarAdaptiveUiView('/')).toBe(CAR_ADAPTIVE_UI_VIEWS.MODULE);
    expect(getCarAdaptiveUiView('/raw-serial')).toBe(CAR_ADAPTIVE_UI_VIEWS.RAW_SERIAL);
    expect(getCarAdaptiveUiView('/other')).toBe(CAR_ADAPTIVE_UI_VIEWS.OTHER);
});

test('remoteControl 查询参数会启用同界面远程控制模式', () => {
    window.history.replaceState({}, '', '/app?remoteControl=1');
    expect(isCarAdaptiveRemoteController()).toBe(true);

    window.history.replaceState({}, '', '/app?remoteControl=false');
    expect(isCarAdaptiveRemoteController()).toBe(false);
});

test('当前设备的 homeUrl 优先于后端广播地址', () => {
    expect(resolveCarAdaptiveHomeUrl({ homeUrl: '/server-home' })).toBe('/server-home');

    window.history.replaceState({}, '', '/app?homeUrl=%2Flocal-home');
    expect(resolveCarAdaptiveHomeUrl({ homeUrl: '/server-home' })).toBe('/local-home');
});

test('同界面控制端通过真实接口广播主副驾命令', async () => {
    window.history.replaceState({}, '', '/app?controlToken=query-secret');
    window.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
            code: 0,
            data: {
                command: { id: 'ui-1', action: CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR },
            },
        }),
    });

    const result = await sendCarAdaptiveUiCommand(CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR, 2);

    expect(window.fetch).toHaveBeenCalledWith(
        'http://localhost/carAdaptive/ui/command',
        expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
                'X-JQTools-Control-Token': 'query-secret',
            }),
            body: JSON.stringify({
                action: CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR,
                sensorId: 2,
            }),
        })
    );
    expect(result.command.id).toBe('ui-1');
});

test('远程主副驾命令调用页面选择函数并返回回执', () => {
    const onSelectSensor = jest.fn();
    const acknowledgement = applyCarAdaptiveUiCommand({
        carAdaptiveUiCommand: {
            id: 'command-1',
            action: CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR,
            sensorId: 2,
        },
    }, {
        sensorId: 1,
        view: CAR_ADAPTIVE_UI_VIEWS.MODULE,
        navigate: jest.fn(),
        onSelectSensor,
    });

    expect(onSelectSensor).toHaveBeenCalledWith(2);
    expect(acknowledgement.sensorId).toBe(2);
    expect(acknowledgement.status).toBe('applied');
});

test('打开自适应模块命令会通知宿主显示 SDK 视图', () => {
    const navigate = jest.fn();
    const listener = jest.fn();
    window.addEventListener(CAR_ADAPTIVE_VIEW_EVENT, listener);

    const acknowledgement = applyCarAdaptiveUiCommand({
        carAdaptiveUiCommand: {
            id: 'command-module',
            action: CAR_ADAPTIVE_UI_ACTIONS.OPEN_MODULE,
        },
    }, {
        sensorId: 1,
        view: CAR_ADAPTIVE_UI_VIEWS.HOST_HOME,
        navigate,
        onSelectSensor: jest.fn(),
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual(expect.objectContaining({
        type: 'jqtools.carAdaptive.viewRequested',
        action: CAR_ADAPTIVE_UI_ACTIONS.OPEN_MODULE,
        commandId: 'command-module',
        view: CAR_ADAPTIVE_UI_VIEWS.MODULE,
    }));
    expect(navigate).toHaveBeenCalledWith('/');
    expect(acknowledgement.view).toBe(CAR_ADAPTIVE_UI_VIEWS.MODULE);
    window.removeEventListener(CAR_ADAPTIVE_VIEW_EVENT, listener);
});

test('返回主页命令通知宿主并使用 SDK 首页作为回退', () => {
    const navigate = jest.fn();
    const listener = jest.fn();
    window.addEventListener(CAR_ADAPTIVE_HOME_EVENT, listener);

    const acknowledgement = applyCarAdaptiveUiCommand({
        carAdaptiveUiCommand: {
            id: 'command-home',
            action: CAR_ADAPTIVE_UI_ACTIONS.RETURN_HOME,
        },
    }, {
        sensorId: 1,
        view: CAR_ADAPTIVE_UI_VIEWS.MODULE,
        navigate,
        onSelectSensor: jest.fn(),
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/');
    expect(acknowledgement.view).toBe(CAR_ADAPTIVE_UI_VIEWS.HOST_HOME);
    window.removeEventListener(CAR_ADAPTIVE_HOME_EVENT, listener);
});
