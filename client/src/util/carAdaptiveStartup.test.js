import axios from 'axios'
import {
    connectCarAdaptiveDevice,
    shouldShowCarAdaptiveTitle,
} from './carAdaptiveStartup'

jest.mock('axios', () => ({
    get: jest.fn(),
}))

test('完整标题栏默认隐藏，仅由显式调试参数打开', () => {
    expect(shouldShowCarAdaptiveTitle('')).toBe(false)
    expect(shouldShowCarAdaptiveTitle('?showTitle=0')).toBe(false)
    expect(shouldShowCarAdaptiveTitle('?showTitle=1')).toBe(true)
    expect(shouldShowCarAdaptiveTitle('?showTitle=true')).toBe(true)
})

test('自动连接先连接串口，再初始化设备信息', async () => {
    axios.get
        .mockResolvedValueOnce({ data: { code: 0, message: '连接成功' } })
        .mockResolvedValueOnce({ data: { code: 0, message: '发送成功' } })

    await connectCarAdaptiveDevice()

    expect(axios.get.mock.calls).toEqual([
        ['/connPort'],
        ['/sendMac'],
    ])
})

test('串口连接失败时不发送设备初始化请求', async () => {
    axios.get.mockResolvedValueOnce({
        data: { code: 1, message: '连接失败' },
    })

    await expect(connectCarAdaptiveDevice()).rejects.toThrow('连接失败')
    expect(axios.get).toHaveBeenCalledTimes(1)
    expect(axios.get).toHaveBeenCalledWith('/connPort')
})

test('并发触发时复用同一个连接请求', async () => {
    let finishConnection
    axios.get
        .mockImplementationOnce(() => new Promise((resolve) => {
            finishConnection = resolve
        }))
        .mockResolvedValueOnce({ data: { code: 0 } })

    const firstRequest = connectCarAdaptiveDevice()
    const secondRequest = connectCarAdaptiveDevice()

    expect(secondRequest).toBe(firstRequest)
    expect(axios.get).toHaveBeenCalledTimes(1)

    finishConnection({ data: { code: 0 } })
    await firstRequest
    expect(axios.get.mock.calls).toEqual([
        ['/connPort'],
        ['/sendMac'],
    ])
})
