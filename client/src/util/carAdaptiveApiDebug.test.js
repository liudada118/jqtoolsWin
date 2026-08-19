import {
    CAR_ADAPTIVE_API_AIRBAGS,
    buildApiAirbagControlCommand,
    buildApiAirbagDisplayGears,
    buildApiDebugUrl,
    parseApiDebugResponse,
    requestCarAdaptiveApi,
} from './carAdaptiveApiDebug';

test('接口调试页只暴露 3、4、5、6 号真实气囊', () => {
    expect(CAR_ADAPTIVE_API_AIRBAGS.map((item) => item.id)).toEqual([3, 4, 5, 6]);
});

test('受限命令只让 3 到 6 号出现非零档位', () => {
    const command = buildApiAirbagControlCommand({ 3: 1, 4: 2, 5: 3, 6: 4 });
    const gears = Array.from({ length: 24 }, (_, index) => command[index * 2 + 2]);

    expect(command).toHaveLength(55);
    expect(gears.slice(2, 6)).toEqual([1, 2, 3, 4]);
    expect(gears.filter((gear, index) => ![2, 3, 4, 5].includes(index) && gear !== 0)).toEqual([]);
});

test('受限命令拒绝控制其他气囊', () => {
    expect(() => buildApiAirbagControlCommand({ 2: 3 })).toThrow('只允许控制 3、4、5、6');
    expect(() => buildApiAirbagControlCommand({ 7: 4 })).toThrow('只允许控制 3、4、5、6');
});

test('展示数组只填写 API 四路，其余 20 路留给 ECU', () => {
    const gears = buildApiAirbagDisplayGears({ 3: 1, 4: 2, 5: 3, 6: 4 });

    expect(gears).toHaveLength(24);
    expect(gears.slice(2, 6)).toEqual([1, 2, 3, 4]);
    expect(gears.filter((gear, index) => ![2, 3, 4, 5].includes(index) && gear !== 0)).toEqual([]);
    expect(() => buildApiAirbagDisplayGears({ 7: 3 })).toThrow('只允许控制 3、4、5、6');
});

test('接口地址兼容相对路径和完整地址', () => {
    expect(buildApiDebugUrl('http://127.0.0.1:19245/', '/health'))
        .toBe('http://127.0.0.1:19245/health');
    expect(buildApiDebugUrl('http://127.0.0.1:19245', 'carAdaptive/sensors'))
        .toBe('http://127.0.0.1:19245/carAdaptive/sensors');
    expect(buildApiDebugUrl('http://unused', 'http://192.168.1.20:19245/health'))
        .toBe('http://192.168.1.20:19245/health');
});

test('HTTP 调用携带令牌和 JSON 请求体并识别业务错误', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ code: 1, message: '参数错误', data: {} }),
    });

    const result = await requestCarAdaptiveApi({
        baseUrl: 'http://127.0.0.1:19245',
        path: '/carAdaptive/mode',
        method: 'POST',
        body: { sensorId: 1, mode: 'manual' },
        token: 'test-token',
        fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
        'http://127.0.0.1:19245/carAdaptive/mode',
        expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ sensorId: 1, mode: 'manual' }),
            headers: expect.objectContaining({ 'X-JQTools-Control-Token': 'test-token' }),
        }),
    );
    expect(result.ok).toBe(false);
    expect(result.payload.message).toBe('参数错误');
});

test('响应解析兼容 JSON 和普通文本', () => {
    expect(parseApiDebugResponse('{"code":0}')).toEqual({ code: 0 });
    expect(parseApiDebugResponse('service unavailable')).toBe('service unavailable');
    expect(parseApiDebugResponse('')).toBeNull();
});
