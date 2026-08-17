import {
    clearCarAdaptiveCommandHistory,
    createCarAdaptiveCommandHistoryUrl,
    getCarAdaptiveCommandHistory,
    getCarAdaptiveCommandHistoryLabel,
} from './carAdaptiveCommandHistory';

const originalFetch = window.fetch;

afterEach(() => {
    window.fetch = originalFetch;
});

test('历史查询地址包含主副驾、类型和数量', () => {
    expect(createCarAdaptiveCommandHistoryUrl({
        sensorId: 2,
        type: 'ecuFeedback',
        limit: 300,
    })).toBe('http://localhost/carAdaptive/commands/history?sensorId=2&type=ecuFeedback&limit=300');
    expect(createCarAdaptiveCommandHistoryUrl({ sensorId: 9, type: 'all' }))
        .toBe('http://localhost/carAdaptive/commands/history?sensorId=1');
});

test('历史类型返回对应中文名称', () => {
    expect(getCarAdaptiveCommandHistoryLabel('algorithmSent')).toBe('算法下发');
    expect(getCarAdaptiveCommandHistoryLabel('apiDisplay')).toBe('接口展示');
    expect(getCarAdaptiveCommandHistoryLabel('unknown')).toBe('未知指令');
});

test('查询历史返回后端记录', async () => {
    window.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, data: { records: [{ id: '1-1' }] } }),
    });

    await expect(getCarAdaptiveCommandHistory({ sensorId: 1 }))
        .resolves.toEqual({ records: [{ id: '1-1' }] });
    expect(window.fetch).toHaveBeenCalledWith(
        'http://localhost/carAdaptive/commands/history?sensorId=1',
        expect.objectContaining({ cache: 'no-store' })
    );
});

test('可以只清空副驾接口写串口历史', async () => {
    window.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, data: { removed: 2 } }),
    });

    await expect(clearCarAdaptiveCommandHistory({ sensorId: 2, type: 'apiSerial' }))
        .resolves.toEqual({ removed: 2 });
    expect(window.fetch).toHaveBeenCalledWith(
        'http://localhost/carAdaptive/commands/history/2?type=apiSerial',
        expect.objectContaining({ method: 'DELETE' })
    );
});
