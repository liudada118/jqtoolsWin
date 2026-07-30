const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('net')
const http = require('http')
const {
  CLIENT_DEV_MARKER_ID,
  createClientDevUrl,
  findAvailablePort,
  isClientDevServerReady,
  isPortAvailable,
  validatePort
} = require('../util/clientDevServer')

/**
 * 创建一个临时 TCP 服务，用于验证端口占用识别。
 *
 * @returns {Promise<import('net').Server>} 已开始监听的服务。
 */
function createTemporaryServer() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

/**
 * 关闭测试创建的临时 TCP 服务。
 *
 * @param {import('net').Server} server 待关闭服务。
 * @returns {Promise<void>} 服务关闭完成信号。
 */
function closeTemporaryServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

/**
 * 创建返回指定 JSON 数据的临时 HTTP 服务。
 *
 * @param {object} payload 接口返回对象。
 * @returns {Promise<import('http').Server>} 已开始监听的 HTTP 服务。
 */
function createTemporaryHttpServer(payload) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((_request, response) => {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify(payload))
    })
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

test('端口被占用时会选择下一个空闲端口', async () => {
  const checkedPorts = []
  const selectedPort = await findAvailablePort({
    host: '127.0.0.1',
    startPort: 3000,
    maxAttempts: 3,
    probe: async ({ port }) => {
      checkedPorts.push(port)
      return port === 3001
    }
  })

  assert.equal(selectedPort, 3001)
  assert.deepEqual(checkedPorts, [3000, 3001])
})

test('所有候选端口都被占用时返回明确错误', async () => {
  await assert.rejects(
    findAvailablePort({
      host: '127.0.0.1',
      startPort: 3000,
      maxAttempts: 2,
      probe: async () => false
    }),
    /no available client dev server port between 3000 and 3001/
  )
})

test('TCP 探测能够识别真实占用端口', async () => {
  const server = await createTemporaryServer()
  const address = server.address()

  try {
    assert.equal(
      await isPortAvailable({
        host: '127.0.0.1',
        port: address.port
      }),
      false
    )
  } finally {
    await closeTemporaryServer(server)
  }
})

test('项目标识可以区分本项目与其他 HTTP 服务', async () => {
  const projectServer = await createTemporaryHttpServer({
    id: CLIENT_DEV_MARKER_ID
  })
  const otherServer = await createTemporaryHttpServer({
    id: 'another-project'
  })

  try {
    const projectAddress = projectServer.address()
    const otherAddress = otherServer.address()
    assert.equal(
      await isClientDevServerReady(
        `http://127.0.0.1:${projectAddress.port}`
      ),
      true
    )
    assert.equal(
      await isClientDevServerReady(
        `http://127.0.0.1:${otherAddress.port}`
      ),
      false
    )
  } finally {
    await closeTemporaryServer(projectServer)
    await closeTemporaryServer(otherServer)
  }
})

test('开发服务地址支持普通主机名和 IPv6', () => {
  assert.equal(createClientDevUrl('127.0.0.1', 3001), 'http://127.0.0.1:3001')
  assert.equal(createClientDevUrl('::1', 3001), 'http://[::1]:3001')
})

test('无效端口会被拒绝', () => {
  assert.throws(() => validatePort(0), /invalid client dev server port/)
  assert.throws(() => validatePort(65536), /invalid client dev server port/)
  assert.throws(() => validatePort(3000.5), /invalid client dev server port/)
})
