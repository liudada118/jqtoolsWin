'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { JqToolsCarClient } = require('../sdk')

/** 创建不发真实网络请求的 SDK 客户端。 */
function createTestClient() {
  const client = new JqToolsCarClient({
    fetch: async () => { throw new Error('not called') }
  })
  const calls = []
  client.request = async (method, pathname, options) => {
    calls.push({ method, pathname, options })
    return { method, pathname, options }
  }
  return { client, calls }
}

test('Node SDK 只提交 3、4、5、6 号展示档位', async () => {
  const { client, calls } = createTestClient()
  const gears = new Array(24).fill(0)
  gears[2] = 3
  gears[5] = 2

  await client.setAirbagDisplay(gears, 2)

  assert.deepEqual(calls, [{
    method: 'POST',
    pathname: '/carAdaptive/display',
    options: { body: { sensorId: 2, gears } }
  }])
})

test('Node SDK 拒绝 API 控制其余 20 路展示', () => {
  const { client, calls } = createTestClient()
  const gears = new Array(24).fill(0)
  gears[6] = 3

  assert.throws(
    () => client.setAirbagDisplay(gears, 1),
    /only allows airbags 3, 4, 5 and 6/
  )
  assert.equal(calls.length, 0)
})
