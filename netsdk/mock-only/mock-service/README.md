# 汽车自适应假数据调试版

这个目录是独立的调试服务，不依赖真实串口、不调用真实 Python 算法。

启动：

```bash
cd mock-sdk
npm start
```

默认服务：

- HTTP: `http://127.0.0.1:19345`
- WebSocket: `ws://127.0.0.1:19399`
- 调试页: `http://127.0.0.1:19345/debug`

功能：

- 一键假连接
- 假串口列表
- 连接后自动推送 144 点假传感器数据
- 自适应开关
- 自动生成假算法数据并通过 WebSocket 推送
- 气囊控制发送和假硬件回包

主要接口：

```text
GET  /health
GET  /status
GET  /getPort
GET  /connPort
POST /fake/connect
POST /fake/disconnect
GET  /fake/serialFrame
POST /adaptive/switch
POST /airbag/send
POST /carAdaptive/processFrame
```

端口可通过环境变量修改：

```bash
JQTOOLS_MOCK_HTTP_PORT=19345
JQTOOLS_MOCK_WS_PORT=19399
```

## 假串口推送

- 一键连接后会立即通过 WebSocket 推送一帧 `type: "serial"` 数据，之后默认每 500ms 推送一次。
- 每帧包含 `serialData.frameData`、`sitData.carAir.arr`、`data.carAir.arr`，数组长度均为 144。

## 假算法数据

- 每帧假串口数据都会同步推送一条 `type: "algorithm"` 的 WebSocket 消息。
- 算法消息包含 `sensor_data_144`、`pressure_map_144`、`normalized_pressure_144`，长度均为 144。
- 算法消息包含 `control_command_51`，长度为 51，调试页会把 144 点压力和 51 字节控制数据可视化出来。
- `algorithms` 字段包含 `pressure_map`、`living_detection`、`body_type`、`seat_state`、`adaptive_adjustment` 五组假算法结果。
