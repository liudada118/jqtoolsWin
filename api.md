﻿# API 文档（serialServer.js）

基于 `server/serialServer.js` 的接口整理。

- HTTP 端口：`19245`
- WebSocket 端口：`19999`
- 返回格式：大多数接口使用 `new HttpResult(code, data, msg)`

## 字段定义

### HttpResult（通用返回）
- `code` number：0 表示成功，非 0 表示失败
- `data` any：业务数据
- `msg` string：提示信息

### HistoryItem（历史记录项）
- `date` string：记录日期或名称
- `timestamp` number：时间戳
- `select` object|string：选中项（来自数据库 `select` 字段）
- `alias` string|null：别名
- `remark` string|null：备注

### DbHistorySummary（/getDbHistory、/getContrastData 的概要返回）
- `length` number：记录数量
- `pressArr` number[]：压力数组
- `areaArr` number[]：面积数组

### PlaybackPush（WS 回放推送）
- `sitData` number[]|object：数据矩阵或对象
- `index` number：当前索引
- `timestamp` number：时间戳

## HTTP 接口

### 1) 健康检查
- 方法：`GET`
- 路径：`/`
- 说明：服务是否启动
- 响应：`Hello World!`

### 2) 绑定密钥
- 方法：`POST`
- 路径：`/bindKey`
- 请求体：
  - `key` string
- 响应：成功/失败（HttpResult）

### 3) 选择系统
- 方法：`POST`
- 路径：`/selectSystem`
- 请求参数：`file`（注意：代码用 `req.query.file`）
- 说明：切换系统并初始化数据库、设置波特率
- 响应：当前实现无 `res.json`

### 4) 获取系统列表
- 方法：`GET`
- 路径：`/getSystem`
- 说明：读取 `config.txt` 并返回当前系统
- 响应：`{ value, typeArr, ... }`

### 5) 获取串口
- 方法：`GET`
- 路径：`/getPort`
- 说明：查询串口列表
- 响应：串口列表（`getPort` 处理）

### 6) 一键连接串口
- 方法：`GET`
- 路径：`/connPort`
- 响应：成功返回端口信息

### 7) 开始采集
- 方法：`POST`
- 路径：`/startCol`
- 请求体：
  - `fileName` string
  - `select` object
- 说明：开始采集（会校验设备类型）
- 响应：成功/失败（HttpResult）

### 8) 停止采集
- 方法：`GET`
- 路径：`/endCol`
- 响应：成功（HttpResult）

### 9) 获取采集历史列表
- 方法：`GET`
- 路径：`/getColHistory`
- 说明：按日期聚合，最多 500 条
- 响应：数组（含 `date/timestamp/select/alias/remark`）

### 10) 导出 CSV
- 方法：`POST`
- 路径：`/downlaod`
- 请求体：
  - `fileArr` string[]
  - `selectJson` object（可选，优先使用；未传则使用回放缓存的 `historySelectCache`）
- 说明：导出数据（路径拼写为 `downlaod`），如传 `selectJson` 会用框选数据计算导出字段；如果数据库里有 `alias`，则 CSV 文件名使用别名
- 响应：导出结果

### 11) 删除记录
- 方法：`POST`
- 路径：`/delete`
- 请求体：
  - `fileArr` string[]
- 响应：删除结果

### 12) 修改记录名（按日期）
- 方法：`POST`
- 路径：`/changeDbName`
- 请求体：
  - `newDate` string
  - `oldDate` string
- 响应：修改结果

### 13) 获取某日期数据
- 方法：`POST`
- 路径：`/getDbHistory`
- 请求体：
  - `time` string
- 响应：`{ length, pressArr, areaArr }`

### 13.1) 历史回放框选统计
- 方法：POST`r
- 路径：/getDbHistorySelect`r
- 说明：基于缓存 historyDbArr 计算所有帧的框选 pressArr/areaArr（需先调用 /getDbHistory）
- 请求体：
  - selectJson object（与实时框选结构一致，按 sensor key）
- 响应：{ length, pressArr, areaArr }`r

### 14) 获取对比数据
- 方法：`POST`
- 路径：`/getContrastData`
- 请求体：
  - `left` string
  - `right` string
- 响应：`{ left: {...}, right: {...} }`

### 15) 修改记录名（按字段）
- 方法：`POST`
- 路径：`/changeDbDataName`
- 请求体：
  - `oldName` string
  - `newName` string
- 响应：当前实现无 `res.json`

### 16) 备注/别名/选中项
- 方法：`POST`
- 路径：`/upsertRemark`
- 请求体：
  - `date` string（必填）
  - `alias` string（可选）
  - `remark` string（可选）
  - `select` any（可选）
- 响应：成功/失败（HttpResult）

### 17) 获取备注
- 方法：`POST`
- 路径：`/getRemark`
- 请求体：
  - `date` string（必填）
- 响应：备注内容

### 18) 取消回放
- 方法：`POST`
- 路径：`/cancalDbPlay`
- 说明：停止回放并清理定时器
- 响应：成功

### 19) 开始回放
- 方法：`POST`
- 路径：`/getDbHistoryPlay`
- 说明：按当前速度回放，通过 WS 推送
- 响应：成功/失败

### 20) 调整回放速度
- 方法：`POST`
- 路径：`/changeDbplaySpeed`
- 请求体：
  - `speed` number
- 响应：成功

### 21) 切换系统类型
- 方法：`POST`
- 路径：`/changeSystemType`
- 请求体：
  - `system` string
- 响应：`{ optimalObj, maxObj }`

### 22) 暂停回放
- 方法：`POST`
- 路径：`/getDbHistoryStop`
- 响应：成功

### 23) 回放跳转索引
- 方法：`POST`
- 路径：`/getDbHistoryIndex`
- 请求体：
  - `index` number
- 响应：指定索引记录

### 24) 读取 CSV
- 方法：`POST`
- 路径：`/getCsvData`
- 请求体：
  - `fileName` string
- 响应：CSV 内容

### 25) 发送设备 MAC
- 方法：`GET`
- 路径：`/sendMac`
- 说明：对所有串口发送 AT 指令获取 Unique ID
- 响应：成功/失败

### 26) 加密系统配置
- 方法：`POST`
- 路径：`/getSysconfig`
- 请求体：
  - `config` any
- 响应：加密后的字符串

## WebSocket
- 地址：`ws://localhost:19999`
- 连接后会推送实时数据

常见推送：
- `{ data: obj }` 实时数据
- `{ sitData: obj }` 高频数据
- `{ sitDataPlay: obj, index, timestamp }` 回放数据
- `{ macInfo: {...} }` 设备信息
- `{ playEnd: boolean }` 回放结束标记

---

## OpenAPI 3.0（简版）

```yaml
openapi: 3.0.3
info:
  title: jqtools serialServer API
  version: 1.0.0
servers:
  - url: http://localhost:19245
paths:
  /:
    get:
      summary: Health check
      responses:
        '200':
          description: OK
          content:
            text/plain:
              schema:
                type: string

  /bindKey:
    post:
      summary: Bind key
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [key]
              properties:
                key:
                  type: string
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /selectSystem:
    post:
      summary: Select system
      parameters:
        - in: query
          name: file
          schema:
            type: string
      responses:
        '200':
          description: No body (current implementation)

  /getSystem:
    get:
      summary: Get system list and current system
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /getPort:
    get:
      summary: Get serial ports
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /connPort:
    get:
      summary: Connect ports
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /startCol:
    post:
      summary: Start collecting
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [fileName, select]
              properties:
                fileName:
                  type: string
                select:
                  type: object
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /endCol:
    get:
      summary: Stop collecting
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /getColHistory:
    get:
      summary: Get collection history list
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /downlaod:
    post:
      summary: Download CSV
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [fileArr]
              properties:
                fileArr:
                  type: array
                  items:
                    type: string
                selectJson:
                  type: object
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /delete:
    post:
      summary: Delete records
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [fileArr]
              properties:
                fileArr:
                  type: array
                  items:
                    type: string
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /changeDbName:
    post:
      summary: Change record date
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [newDate, oldDate]
              properties:
                newDate:
                  type: string
                oldDate:
                  type: string
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /getDbHistory:
    post:
      summary: Get history data by date
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [time]
              properties:
                time:
                  type: string
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /getContrastData:
    post:
      summary: Get contrast data
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [left, right]
              properties:
                left:
                  type: string
                right:
                  type: string
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /changeDbDataName:
    post:
      summary: Change data name
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [oldName, newName]
              properties:
                oldName:
                  type: string
                newName:
                  type: string
      responses:
        '200':
          description: No body (current implementation)

  /upsertRemark:
    post:
      summary: Upsert remark/alias/select
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [date]
              properties:
                date:
                  type: string
                alias:
                  type: string
                remark:
                  type: string
                select:
                  type: object
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /getRemark:
    post:
      summary: Get remark
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [date]
              properties:
                date:
                  type: string
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /cancalDbPlay:
    post:
      summary: Cancel playback
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /getDbHistoryPlay:
    post:
      summary: Start playback
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /changeDbplaySpeed:
    post:
      summary: Change playback speed
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [speed]
              properties:
                speed:
                  type: number
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /changeSystemType:
    post:
      summary: Change system type
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [system]
              properties:
                system:
                  type: string
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /getDbHistoryStop:
    post:
      summary: Stop playback
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /getDbHistoryIndex:
    post:
      summary: Jump to playback index
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [index]
              properties:
                index:
                  type: integer
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /getCsvData:
    post:
      summary: Read CSV data
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [fileName]
              properties:
                fileName:
                  type: string
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /sendMac:
    get:
      summary: Send AT command to get device unique ID
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

  /getSysconfig:
    post:
      summary: Encrypt config
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [config]
              properties:
                config:
                  type: object
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HttpResult'

components:
  schemas:
    HttpResult:
      type: object
      required: [code, data, msg]
      properties:
        code:
          type: number
          description: 0 success, non-0 failure
        data:
          description: Business payload
          nullable: true
        msg:
          type: string
```




