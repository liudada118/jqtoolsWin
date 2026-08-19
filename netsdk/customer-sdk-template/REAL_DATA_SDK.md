# 真实数据版 SDK 说明

当前 `customer-sdk` 默认启动真实串口和真实 Python 算法，不会生成假压力或假算法数据。

## 1. 当前链路

```text
WPF 启动程序
  -> app/mock-sdk/mock-service.js
  -> real-backend/backend-host.exe
  -> 内存解密 backend.jqpack
  -> 读取 145 字节真实串口帧
  -> 调用 python/app/server.pyc
  -> 写回 55 字节 control_command
  -> WebSocket 推送真实协议数据
  -> WebView2 加载 /app 前端
```

入口文件仍叫 `mock-service.js` 是为了兼容已有 WPF 控件；它只是启动器，不是假数据服务。

## 2. 默认地址

```text
HTTP: http://127.0.0.1:19245
WebSocket: ws://127.0.0.1:19999
前端: http://127.0.0.1:19245/app
```

## 3. 真数据处理

- `GET /getPort`：读取本机真实串口列表。
- `GET /connPort`：按现有配置连接真实串口。
- 每帧固定 145 字节：首字节为传感器标识，后 144 字节为压力数据。
- 144 点分为靠背和坐垫各 72 点；每个 72 点区域依次为侧翼 A（宽 1、高 4）、侧翼 B（宽 1、高 4）、中心 `8×8` 的 `64` 点。
- 靠背压力索引为 `0–3 / 4–7 / 8–71`，坐垫压力索引为 `72–75 / 76–79 / 80–143`。
- 标识 `1` 使用主驾算法实例，标识 `2` 使用副驾算法实例。
- 两路数据始终并行处理，UI 切换只影响当前展示。
- 默认 `auto` 模式下，两套算法返回的 55 字节 `control_command` 按来源串口排队写回。
- 主、副驾各自维护 `auto/manual/paused` 模式；请求带 `sensorId` 时只修改目标通道。
- `manual` 只停止目标通道的算法自动写串口，该通道算法仍持续执行并推送结果。
- `paused` 停止目标通道算法，另一通道保持原状态。
- WebSocket 的 `carAdaptiveSensorsData` 同时携带主、副完整快照。

双路状态接口：

```text
GET /carAdaptive/sensors
```

主副驾自适应独立开关：

```text
GET  /carAdaptive/mode
POST /carAdaptive/mode
```

| `mode` | 对外含义 | 算法 | 自动写气囊串口 |
| --- | --- | --- | --- |
| `auto` | 自适应开启 | 运行 | 每 500 ms 写一次 |
| `manual` | 自适应关闭 | 运行并继续返回算法数据 | 不写 |
| `paused` | 自适应完全暂停 | 暂停 | 不写 |

例如只关闭主驾自适应，副驾保持不变：

```json
{ "sensorId": 1, "mode": "manual" }
```

不传 `sensorId` 时，为兼容旧客户端会同时切换主、副两路，因此独立控制时不要省略。
响应中的 `sensors` 数组给出主副两路各自的 `mode`、`autoWrite` 和 `algorithmRunning`。

手动验证算法但不写串口：

```http
POST /carAdaptive/processFrame
Content-Type: application/json
```

```json
{
  "sensorId": 1,
  "sensorData": [144个0到255的数值],
  "writeSerial": false
}
```

手动写入一条完整控制命令：

先通过 `POST /carAdaptive/mode` 切换为 `manual`，避免下一个自动写入周期覆盖手动命令。

```http
POST /carAdaptive/writeCommand
Content-Type: application/json
```

```json
{
  "sensorId": 1,
  "controlCommand": [55个0到255的整数]
}
```

该接口成功只表示参数通过校验并进入写入流程，不代表硬件已经执行或返回 ACK。
后端强制校验完整 55 字节协议和 3、4、5、6 号手动白名单；其余 20 路必须保持为 `0`。
Python 算法内部写串口不经过该客户手动接口，仍可使用完整 24 路控制。

3、4、5、6 号由 API 独占控制界面显示，不写串口也不伪造 ACK：

```http
GET    /carAdaptive/display?sensorId=1
POST   /carAdaptive/display
DELETE /carAdaptive/display/1
```

```json
{
  "sensorId": 1,
  "gears": [0, 0, 3, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
}
```

也可以用 `controlCommand` 传一条 51 或 55 字节命令帧，由后端提取 24 路档位。
接口只设置 3、4、5、6 号，其余 20 路持续使用 ECU 回传（无回传时可选命令回落）。
ECU 和命令回落中的 3–6 号始终被忽略。API 状态生效期间 `airbagDisplaySource` 为 `api`、
`airbagDisplayBaseSource` 表示其余 20 路来源、`airbagDisplayOverride` 为 `true`；
`DELETE` 后 3–6 号固定熄灭，其余 20 路继续跟随 ECU。

先确认 ECU 到底有没有回传：

```text
GET /carAdaptive/feedbackDiagnostics
```

只读接口。`data.observedFeedback` 表示是否收到过合法回传帧；回传帧长度不是 51 时，
从 `data.ports.<串口>.lengthCounts` 能看出实际长度。

原始数据页 `#/raw-serial` 的“气囊指令”视图会同时展示算法生成/下发、ECU 回传、
接口写串口和接口展示覆盖。点击“历史记录”可按主副驾和来源查看服务生命周期内的完整记录。
对应接口为 `GET /carAdaptive/commands/history` 和 `DELETE /carAdaptive/commands/history/:sensorId`；
每个通道每种类型最多保留 500 条。`feedbackOnline` 只代表 ECU 是否真实回传。

## 4. Python 算法

客户包实际运行：

```text
real-backend/python/Python311/python.exe
real-backend/python/app/server.pyc
```

第一方 `.py` 不随客户包交付。算法参数仍保存在：

```text
real-backend/python/app/sensor_config.yaml
```

参数接口：

```text
GET  /algorithm/config
POST /algorithm/config
```

## 5. 前端资源

真实前端和 Three.js 模型位于：

```text
frontend-build/
```

后端提供：

```text
GET /app
GET /static/...
GET /model/...
```

WPF 默认加载 `/app`，客户看到的是当前项目构建后的完整业务页面。

## 6. 验证

基础验收：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-sdk.ps1
```

它会验证保护文件、源码移除、HTTP、当前前端、Three.js 模型、算法配置、主副两路
144 点算法处理、主副独立模式、展示覆盖和 WebSocket 指令诊断，全程不会主动连接硬件。

实际连接串口：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-sdk.ps1 -ConnectSerial
```

WPF 冒烟验证：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-sdk.ps1 -IncludeWpfSmokeTest
```

## 7. 独立交付内容

客户运行所需内容均在 `customer-sdk` 内：

```text
runtime/node/node.exe
real-backend/backend-host.exe
real-backend/backend.jqpack
real-backend/python/
real-backend/node_modules/
real-backend/config.txt
real-backend/db/
frontend-build/
```

启动器显式指向客户包内的 `real-backend`，不会依赖或回退到开发项目目录。

客户 SDK 业务使用的真实 HTTP、WebSocket、算法、串口写入、采集和远程控制协议见：

```text
docs/QUICKSTART.md
docs/API.md
docs/REAL_API.md
```
