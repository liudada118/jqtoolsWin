'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { JqToolsCarClient } = require('../sdk')

test('Node SDK 构造主副驾气囊指令历史查询地址', async () => {
  const client = new JqToolsCarClient({
    fetch: async () => { throw new Error('not called') }
  })
  const calls = []
  client.request = async (method, pathname) => {
    calls.push({ method, pathname })
    return { method, pathname }
  }

  await client.getAirbagCommandHistory({ sensorId: 2, type: 'ecuFeedback', limit: 50 })
  await client.getAirbagCommandHistory()

  assert.deepEqual(calls, [
    {
      method: 'GET',
      pathname: '/carAdaptive/commands/history?sensorId=2&type=ecuFeedback&limit=50'
    },
    {
      method: 'GET',
      pathname: '/carAdaptive/commands/history?sensorId=1'
    }
  ])
})

test('Node SDK 构造气囊指令历史清空地址', async () => {
  const client = new JqToolsCarClient({
    fetch: async () => { throw new Error('not called') }
  })
  const calls = []
  client.request = async (method, pathname) => {
    calls.push({ method, pathname })
    return { method, pathname }
  }

  await client.clearAirbagCommandHistory({ sensorId: 1, type: 'apiSerial' })
  await client.clearAirbagCommandHistory({ sensorId: 2 })

  assert.deepEqual(calls, [
    {
      method: 'DELETE',
      pathname: '/carAdaptive/commands/history/1?type=apiSerial'
    },
    {
      method: 'DELETE',
      pathname: '/carAdaptive/commands/history/2'
    }
  ])
})

test('Node SDK 拒绝非法历史查询参数', () => {
  const client = new JqToolsCarClient({
    fetch: async () => { throw new Error('not called') }
  })

  assert.throws(
    () => client.getAirbagCommandHistory({ sensorId: 3 }),
    /sensorId must be 1/
  )
  assert.throws(
    () => client.getAirbagCommandHistory({ type: 'unknown' }),
    /unsupported airbag command history type/
  )
  assert.throws(
    () => client.getAirbagCommandHistory({ limit: 0 }),
    /limit must be a positive integer/
  )
})
