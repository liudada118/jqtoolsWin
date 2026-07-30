import axios from 'axios'

let connectionRequest = null

/**
 * 校验后端统一返回结构；明确失败时抛出异常，阻止继续执行设备初始化。
 * @param {import('axios').AxiosResponse} response HTTP 响应。
 * @param {string} actionName 当前操作名称。
 * @returns {import('axios').AxiosResponse} 校验通过的原始响应。
 */
function assertSuccessfulResponse(response, actionName) {
    const responseCode = Number(response?.data?.code)
    if (Number.isFinite(responseCode) && responseCode !== 0) {
        const message = response?.data?.message || response?.data?.msg || `${actionName}失败`
        throw new Error(message)
    }
    return response
}

/**
 * 判断汽车自适应页面是否需要显示完整标题栏。
 * 默认隐藏；调试时可在 /app 后增加 ?showTitle=1 或 ?showTitle=true。
 * @param {string} search 页面查询字符串。
 * @returns {boolean} 是否显示标题栏。
 */
export function shouldShowCarAdaptiveTitle(search = window.location.search) {
    const value = new URLSearchParams(search).get('showTitle')
    return value === '1' || value?.toLowerCase() === 'true'
}

/**
 * 按“一键连接”的真实顺序连接串口并初始化设备信息。
 * 同一时刻只保留一个请求，避免页面初始化和人工点击重复打开串口。
 * @returns {Promise<{connectionResponse: import('axios').AxiosResponse, initializationResponse: import('axios').AxiosResponse}>}
 */
export function connectCarAdaptiveDevice() {
    if (connectionRequest) return connectionRequest

    connectionRequest = (async () => {
        const connectionResponse = assertSuccessfulResponse(
            await axios.get('/connPort'),
            '串口连接'
        )
        const initializationResponse = assertSuccessfulResponse(
            await axios.get('/sendMac'),
            '设备初始化'
        )
        return { connectionResponse, initializationResponse }
    })()

    /**
     * 请求结束后允许人工重连；成功和失败都必须释放当前请求引用。
     */
    const clearConnectionRequest = () => {
        connectionRequest = null
    }
    connectionRequest.then(clearConnectionRequest, clearConnectionRequest)

    return connectionRequest
}
