# 汽车自适应假数据接口文档

## 服务地址

```text
HTTP: http://127.0.0.1:19245
WebSocket: ws://127.0.0.1:19999
真实前端: http://127.0.0.1:19245/app
```

WPF 客户端会自动启动服务。也可以单独启动：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-mock-service.ps1
```

## 通用响应

成功：

```json
{ "code": 0, "data": {}, "message": "success" }
```

失败：

```json
{ "code": 1, "data": {}, "message": "错误信息" }
```

## HTTP 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 健康检查 |
| `GET` | `/status` | 当前状态 |
| `GET` | `/getPort` | 获取假串口列表 |
| `GET` | `/connPort` | 兼容真实接口，连接假串口 |
| `POST` | `/fake/connect` | 连接假设备并开始推送 |
| `GET` | `/fake/serialFrame` | 主动生成一帧 144 点数据 |
| `POST` | `/fake/disconnect` | 断开假设备并停止推送 |
| `POST` | `/adaptive/switch` | 自适应开关 |
| `POST` | `/airbag/send` | 发送 51 字节气囊控制命令 |
| `POST` | `/carAdaptive/processFrame` | 输入 144 点数据并返回假算法结果 |
| `GET` | `/debug` | 调试页面 |
| `GET` | `/app` | 项目当前真实前端 |

## WebSocket 推送

连接成功后：

```json
{}
```

串口压力数据：

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

算法结果：

```json
{
  "algorData": {
    "sensor_data_144": [54, 57, 60],
    "control_command": [31, 1, 0],
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

气囊反馈：

```json
{
  "algorFeed": [0, 1, 2, 0, 1, 2]
}
```

说明：文档示例数组做了截断展示。实际 `sitData.carAir.arr` 和 `algorData.sensor_data_144` 长度为 144，`algorData.control_command` 长度为 51，`algorFeed` 长度为 24。

## PowerShell 示例

连接假设备：

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:19345/fake/connect
```

开启自适应：

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:19345/adaptive/switch `
  -ContentType "application/json" `
  -Body '{"enabled":true}'
```

发送气囊控制命令：

```powershell
$command = @(31)
for ($i = 1; $i -le 24; $i++) {
  $command += $i
  $command += 1
}
$command += 1
$command += (($command | Measure-Object -Sum).Sum % 256)

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:19345/airbag/send `
  -ContentType "application/json" `
  -Body (@{ source = "manual"; controlCommand = $command } | ConvertTo-Json -Depth 5)
```
