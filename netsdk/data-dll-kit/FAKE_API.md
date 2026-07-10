# 汽车自适应假数据接口文档

本文档描述 `data-dll-kit` 内置假数据服务的 HTTP 接口和 WebSocket 推送格式，用于客户验证 WPF、DLL、接口链路、144 点压力数据、51 字节控制数据、算法结果和气囊控制回包。

## 服务地址

默认地址：

```text
HTTP: http://127.0.0.1:19345
WebSocket: ws://127.0.0.1:19399
调试页面: http://127.0.0.1:19345/debug
```

启动 WPF 后会自动启动或复用假数据服务。也可以单独启动服务：

```powershell
cd D:\jqtoolsWin1\netsdk\data-dll-kit
powershell -ExecutionPolicy Bypass -File .\start-data-service.ps1
```

停止服务：

```powershell
powershell -ExecutionPolicy Bypass -File .\stop-data-service.ps1
```

## 通用响应格式

成功：

```json
{
  "code": 0,
  "data": {},
  "message": "success"
}
```

失败：

```json
{
  "code": 1,
  "data": {},
  "message": "错误信息"
}
```

## HTTP 接口

### 健康检查

```http
GET /health
GET /
```

返回服务端口、连接状态、帧计数、气囊状态等。

PowerShell 示例：

```powershell
Invoke-RestMethod http://127.0.0.1:19345/health
```

返回示例：

```json
{
  "code": 0,
  "data": {
    "service": "jqtools-car-adaptive-mock",
    "httpPort": 19345,
    "wsPort": 19399,
    "connected": false,
    "adaptiveEnabled": false,
    "frameCount": 0,
    "clients": 0,
    "airbagState": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "lastSerial": null,
    "lastAlgorithm": null,
    "hasTimer": false
  },
  "message": "success"
}
```

### 当前状态

```http
GET /status
```

返回当前连接状态、是否开启自适应、已推送帧数、最近一帧串口数据、最近一次算法结果。

PowerShell 示例：

```powershell
Invoke-RestMethod http://127.0.0.1:19345/status
```

### 获取假串口列表

```http
GET /getPort
```

返回示例：

```json
{
  "code": 0,
  "data": [
    {
      "path": "COM_FAKE_CAR",
      "manufacturer": "JQTools Mock",
      "serialNumber": "MOCK-CAR-ADAPTIVE-001",
      "type": "carAir",
      "mock": true
    }
  ],
  "message": "success"
}
```

### 连接假串口

```http
GET /connPort
POST /fake/connect
```

作用：

- 将服务状态改为已连接。
- 启动定时推送，每 500ms 生成一帧假串口数据。
- WebSocket 会持续收到 `serial` 和 `algorithm` 消息。

PowerShell 示例：

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:19345/fake/connect
```

### 主动生成一帧假串口数据

```http
GET /fake/serialFrame
```

返回一帧 144 点压力数据，并同步通过 WebSocket 广播串口和算法消息。

返回核心字段：

```json
{
  "code": 0,
  "data": {
    "sitData": {
      "carAir": {
        "type": "carAir",
        "arr": [54, 57, 60],
        "stamp": 1783410000000,
        "HZ": 2,
        "mock": true
      }
    }
  },
  "message": "success"
}
```

说明：示例里 `sitData.carAir.arr` 只截取了前 3 个值，实际长度固定为 144。

### 断开假串口

```http
POST /fake/disconnect
```

停止 500ms 定时推送。

PowerShell 示例：

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:19345/fake/disconnect
```

### 自适应调节开关

```http
POST /adaptive/switch
Content-Type: application/json
```

请求体：

```json
{
  "enabled": true
}
```

说明：

- `enabled=true`：开启自适应调节。
- `enabled=false`：关闭自适应调节。
- 开启后，每次生成算法数据时，如果算法返回 `control_command`，服务会自动模拟发送气囊控制命令，并按真实协议广播 `{ "algorFeed": [...] }`。

PowerShell 示例：

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:19345/adaptive/switch `
  -ContentType "application/json" `
  -Body '{"enabled":true}'
```

### 发送气囊控制命令

```http
POST /airbag/send
Content-Type: application/json
```

请求体：

```json
{
  "source": "manual",
  "controlCommand": [31, 1, 1, 2, 1, 3, 0]
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `source` | string | 否 | 来源标识，例如 `manual`、`adaptive`、`debug-web` |
| `controlCommand` | number[] | 是 | 51 字节控制命令，不足 51 会自动补 0，超过 51 会截断 |

51 字节控制命令约定：

| 下标 | 说明 |
| --- | --- |
| `0` | 命令 ID，假数据里固定使用 `31` |
| `1,3,5...47` | 气囊编号，1 到 24 |
| `2,4,6...48` | 对应气囊动作，`0=保持`、`1=充气`、`2=放气` |
| `49` | 自适应开关标记，`0=关闭`、`1=开启` |
| `50` | 校验值，前 50 字节累加后 `% 256` |

返回示例：

```json
{
  "code": 0,
  "data": {
    "accepted": true,
    "source": "manual",
    "sentCommand": [31, 1, 1, 2, 1],
    "receivedFrame": {
      "header": [170, 85],
      "commandId": 31,
      "status": 0,
      "message": "mock airbag command accepted",
      "checksum": 123
    },
    "airbagState": [8, 8, 0],
    "timestamp": 1783410000000
  },
  "message": "success"
}
```

说明：示例数组做了截断展示，实际 `sentCommand` 长度为 51，`airbagState` 长度为 24。

### 调用假算法处理 144 点数据

```http
POST /carAdaptive/processFrame
Content-Type: application/json
```

请求体：

```json
{
  "sensorData": [54, 57, 60]
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sensorData` | number[] | 是 | 144 点压力数据 |
| `sensor_data` | number[] | 否 | `sensorData` 的兼容字段名 |

返回核心字段：

```json
{
  "code": 0,
  "data": {
    "control_command": [31, 1, 0],
    "control_command_51": [31, 1, 0],
    "sensor_data_144": [54, 57, 60],
    "pressure_map_144": [54, 57, 60],
    "normalized_pressure_144": [0.212, 0.224, 0.235],
    "sensor_length": 144,
    "control_length": 51,
    "is_new_command": true,
    "living_status": "living_confirmed",
    "body_type": "adult",
    "seat_state": "ADAPTIVE_LOCKED",
    "frame_count": 1,
    "mock": true
  },
  "message": "success"
}
```

说明：示例数组做了截断展示，实际 `sensor_data_144` 长度固定为 144，`control_command_51` 长度固定为 51。

### 调试页面

```http
GET /debug
GET /debug.html
```

返回内置 HTML 调试页面。WPF 程序内部也是加载这个页面，但客户启动入口是 WPF EXE，不是浏览器。

## WebSocket 推送

连接地址：

```text
ws://127.0.0.1:19399
```

连接成功后立即收到空对象，这和真实后端连接时的初始推送一致：

```json
{}
```

### sitData

假串口帧推送，连接后每 500ms 一帧：

```json
{
  "sitData": {
    "carAir": {
      "type": "carAir",
      "arr": [54, 57, 60],
      "stamp": 1783410000000,
      "HZ": 2,
      "mock": true
    }
  }
}
```

说明：`sitData.carAir.arr` 是 144 点压力数据。

### algorData

假算法结果推送，每帧串口数据后都会推送：

```json
{
  "algorData": {
    "sensor_data_144": [54, 57, 60],
    "control_command_51": [31, 1, 0],
    "sensor_length": 144,
    "control_length": 51,
    "living_status": "living_confirmed",
    "body_type": "adult",
    "seat_state": "ADAPTIVE_LOCKED",
    "mock": true
  }
}
```

说明：示例数组做了截断展示，实际 `algorData.sensor_data_144` 长度固定为 144，`algorData.control_command_51` 长度固定为 51。

### algorFeed

算法控制反馈或气囊控制命令发送后推送：

```json
{
  "algorFeed": [0, 1, 2, 0, 1, 2]
}
```

说明：示例数组做了截断展示，实际长度为 24，对应 24 路气囊反馈。

## 数据长度要求

| 数据 | 长度 | 来源 |
| --- | --- | --- |
| 传感器压力数据 | 144 | `/fake/serialFrame`、WS `sitData.carAir.arr`、WS `algorData.sensor_data_144` |
| 控制命令 | 51 | `/carAdaptive/processFrame`、`/airbag/send`、WS `algorData.control_command_51` |
| 气囊反馈 | 24 | `/status`、`/airbag/send`、WS `algorFeed` |

## 最小调试流程

1. 启动 WPF：

```powershell
cd D:\jqtoolsWin1\netsdk\data-dll-kit
powershell -ExecutionPolicy Bypass -File .\start-wpf.ps1
```

2. 连接假设备：

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:19345/fake/connect
```

3. 打开自适应：

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:19345/adaptive/switch `
  -ContentType "application/json" `
  -Body '{"enabled":true}'
```

4. 查看状态：

```powershell
Invoke-RestMethod http://127.0.0.1:19345/status
```
