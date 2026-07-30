const net = require('net')
const http = require('http')

const CLIENT_DEV_MARKER_ID = 'jqtools-client-source-v1'
const CLIENT_DEV_MARKER_PATH = '/jqtools-client-dev.json'

/**
 * 校验开发服务器端口是否处于 TCP 有效范围内。
 *
 * @param {number} port 待校验端口。
 * @returns {number} 校验后的整数端口。
 */
function validatePort(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RangeError(`invalid client dev server port: ${port}`)
  }

  return port
}

/**
 * 判断指定主机端口当前是否可以由本项目监听。
 *
 * @param {{ host: string, port: number }} options 探测参数。
 * @returns {Promise<boolean>} 可以监听时返回 true。
 */
function isPortReachable({ host, port, timeoutMs = 500 }) {
  const checkedPort = validatePort(port)

  return new Promise((resolve) => {
    const socket = net.createConnection({
      host,
      port: checkedPort
    })
    let settled = false

    /**
     * 完成连接探测并销毁临时套接字。
     *
     * @param {boolean} reachable 是否连接到现有 TCP 服务。
     */
    function finish(reachable) {
      if (settled) {
        return
      }

      settled = true
      socket.destroy()
      resolve(reachable)
    }

    socket.unref()
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(timeoutMs, () => finish(false))
  })
}

/**
 * 尝试独占监听指定端口，确认系统允许本项目使用该端口。
 *
 * @param {{ host: string, port: number }} options 探测参数。
 * @returns {Promise<boolean>} 成功监听并关闭时返回 true。
 */
function canBindPort({ host, port }) {
  const checkedPort = validatePort(port)

  return new Promise((resolve, reject) => {
    const server = net.createServer()
    let settled = false

    /**
     * 完成探测并防止监听与错误事件重复返回。
     *
     * @param {boolean} available 端口是否可用。
     * @param {Error} [error] 无法判断端口状态时的错误。
     */
    function finish(available, error) {
      if (settled) {
        return
      }

      settled = true
      if (error) {
        reject(error)
        return
      }

      resolve(available)
    }

    server.unref()
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
        finish(false)
        return
      }

      finish(false, error)
    })
    server.listen({
      host,
      port: checkedPort,
      exclusive: true
    }, () => {
      server.close((error) => finish(!error, error))
    })
  })
}

/**
 * 判断指定主机端口当前是否可以由本项目监听。
 *
 * 先连接端口以识别 Windows 上监听于 `::` 的双栈服务，再执行独占监听校验。
 *
 * @param {{ host: string, port: number }} options 探测参数。
 * @returns {Promise<boolean>} 可以监听时返回 true。
 */
async function isPortAvailable({ host, port }) {
  if (await isPortReachable({ host, port })) {
    return false
  }

  return canBindPort({ host, port })
}

/**
 * 从首选端口开始寻找可用于本项目 React 开发服务的端口。
 *
 * @param {{
 *   host: string,
 *   startPort: number,
 *   maxAttempts?: number,
 *   probe?: typeof isPortAvailable
 * }} options 查找参数。
 * @returns {Promise<number>} 找到的第一个空闲端口。
 */
async function findAvailablePort({
  host,
  startPort,
  maxAttempts = 100,
  probe = isPortAvailable
}) {
  const checkedStartPort = validatePort(startPort)
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError(`invalid client dev server port search limit: ${maxAttempts}`)
  }

  const lastPort = Math.min(65535, checkedStartPort + maxAttempts - 1)
  for (let port = checkedStartPort; port <= lastPort; port += 1) {
    if (await probe({ host, port })) {
      return port
    }
  }

  throw new Error(
    `no available client dev server port between ${checkedStartPort} and ${lastPort}`
  )
}

/**
 * 根据主机和端口生成 Electron 要加载的 HTTP 地址。
 *
 * @param {string} host 开发服务器主机。
 * @param {number} port 开发服务器端口。
 * @returns {string} 完整 HTTP 地址。
 */
function createClientDevUrl(host, port) {
  const checkedPort = validatePort(port)
  const urlHost = host.includes(':') && !host.startsWith('[')
    ? `[${host}]`
    : host

  return `http://${urlHost}:${checkedPort}`
}

/**
 * 检查 HTTP 服务是否返回本项目 `client/public` 中的开发标识。
 *
 * @param {string} baseUrl React 开发服务根地址。
 * @returns {Promise<boolean>} 标识匹配时返回 true。
 */
function isClientDevServerReady(baseUrl) {
  const markerUrl = new URL(CLIENT_DEV_MARKER_PATH, baseUrl)

  return new Promise((resolve) => {
    const request = http.get(markerUrl, (response) => {
      if (response.statusCode !== 200) {
        response.resume()
        resolve(false)
        return
      }

      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        if (body.length <= 4096) {
          body += chunk
        }
      })
      response.on('end', () => {
        try {
          const marker = JSON.parse(body)
          resolve(marker.id === CLIENT_DEV_MARKER_ID)
        } catch (_error) {
          resolve(false)
        }
      })
    })

    request.on('error', () => resolve(false))
    request.setTimeout(1000, () => {
      request.destroy()
      resolve(false)
    })
  })
}

/**
 * 等待本项目 React 开发服务完成编译并开始提供项目标识。
 *
 * @param {string} baseUrl React 开发服务根地址。
 * @param {number} [timeoutMs] 最长等待时间。
 * @returns {Promise<boolean>} 在超时前就绪时返回 true。
 */
async function waitForClientDevServerReady(baseUrl, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isClientDevServerReady(baseUrl)) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  return false
}

module.exports = {
  CLIENT_DEV_MARKER_ID,
  CLIENT_DEV_MARKER_PATH,
  createClientDevUrl,
  findAvailablePort,
  isClientDevServerReady,
  isPortAvailable,
  validatePort,
  waitForClientDevServerReady
}
