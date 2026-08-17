import {
    createCarAdaptiveCollectionExportUrl,
    createCarAdaptiveCollectionName,
    getCarAdaptiveCollectionState,
    resolveCarAdaptiveCollectionDownloadName,
    startCarAdaptiveCollection,
    stopCarAdaptiveCollection,
} from './carAdaptiveCollection';

const originalFetch = window.fetch;

afterEach(() => {
    window.fetch = originalFetch;
});

test('默认采集名称包含主副驾和固定时间', () => {
    const now = new Date(2026, 7, 10, 9, 8, 7);
    expect(createCarAdaptiveCollectionName(1, now)).toBe('主驾-20260810-090807');
    expect(createCarAdaptiveCollectionName(2, now)).toBe('副驾-20260810-090807');
});

test('采集状态使用当前页面服务地址', async () => {
    window.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, data: { collecting: false } }),
    });

    await expect(getCarAdaptiveCollectionState()).resolves.toEqual({ collecting: false });
    expect(window.fetch).toHaveBeenCalledWith(
        'http://localhost/carAdaptive/collection',
        expect.objectContaining({ cache: 'no-store' })
    );
});

test('开始采集会携带传感器和名称', async () => {
    window.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, data: { collecting: true, sensorId: 2 } }),
    });

    await startCarAdaptiveCollection({ sensorId: 2, fileName: '副驾测试' });
    expect(window.fetch).toHaveBeenCalledWith(
        'http://localhost/startCol',
        expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
                sensorId: 2,
                fileName: '副驾测试',
                select: [],
            }),
        })
    );
});

test('停止采集返回最终状态，业务错误会抛出', async () => {
    window.fetch = jest.fn()
        .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ code: 0, data: { collecting: false, frameCount: 12 } }),
        })
        .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ code: 1, message: 'error', data: '没有可采集的汽车传感器' }),
        });

    await expect(stopCarAdaptiveCollection()).resolves.toEqual({ collecting: false, frameCount: 12 });
    await expect(getCarAdaptiveCollectionState()).rejects.toThrow('没有可采集的汽车传感器');
});

test('原始 CSV 下载地址携带采集段和主副驾标识', () => {
    expect(createCarAdaptiveCollectionExportUrl({
        fileName: '副驾 测试/01',
        sensorId: 2,
    })).toBe(
        'http://localhost/carAdaptive/collection/export?fileName=%E5%89%AF%E9%A9%BE+%E6%B5%8B%E8%AF%95%2F01&sensorId=2'
    );
    expect(() => createCarAdaptiveCollectionExportUrl({})).toThrow('请先完成一次数据采集');
});

test('优先解析下载接口返回的 UTF-8 中文文件名', () => {
    const encodedName = encodeURIComponent('副驾测试-副驾-原始数据.csv');
    expect(resolveCarAdaptiveCollectionDownloadName(
        `attachment; filename="raw.csv"; filename*=UTF-8''${encodedName}`,
        'fallback.csv'
    )).toBe('副驾测试-副驾-原始数据.csv');
});
