'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { JqToolsCarClient } = require('../sdk')

/** 创建一个大小写不敏感的测试响应头对象。 */
function createHeaders(values) {
  const normalized = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), value])
  )
  return {
    get(name) {
      return normalized[String(name).toLowerCase()] || null
    }
  }
}

test('Node SDK 生成带采集段和主副驾的 CSV 下载地址', () => {
  const client = new JqToolsCarClient({
    baseUrl: 'http://127.0.0.1:19245',
    fetch: async () => { throw new Error('not called') }
  })

  assert.equal(
    client.getCarAdaptiveCollectionExportUrl({ fileName: '副驾 测试', sensorId: 2 }),
    'http://127.0.0.1:19245/carAdaptive/collection/export?fileName=%E5%89%AF%E9%A9%BE+%E6%B5%8B%E8%AF%95&sensorId=2'
  )
  assert.throws(
    () => client.getCarAdaptiveCollectionExportUrl({ sensorId: 3 }),
    /sensorId must be 1/
  )
})

test('Node SDK 返回 CSV 字节、文件名和实际帧数', async () => {
  const csvBytes = new TextEncoder().encode('\uFEFFframeIndex,sensorId\r\n0,1\r\n')
  const client = new JqToolsCarClient({
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: createHeaders({
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent('主驾原始数据.csv')}`,
        'x-jqtools-frame-count': '1'
      }),
      arrayBuffer: async () => csvBytes.buffer
    })
  })

  const result = await client.exportCarAdaptiveCollection({ fileName: '主驾测试', sensorId: 1 })
  assert.equal(result.fileName, '主驾原始数据.csv')
  assert.equal(result.frameCount, 1)
  assert.equal(result.contentType, 'text/csv; charset=utf-8')
  assert.deepEqual(result.data, csvBytes)
})
