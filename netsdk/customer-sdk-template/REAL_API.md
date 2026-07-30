# JQTools 汽车自适应 SDK 真实业务接口

本文档只描述客户 `customer-sdk` 实际业务使用的接口，不包含完整平台遗留接口。

接口范围根据以下真实调用链确定：

- WPF 启动、健康检查和真实串口连接。
- 当前 React/Three.js 汽车自适应页面。
- 主驾、副驾两套独立 Python 算法。
- 55 字节气囊控制命令串口写入。
- 算法参数调节。
- 工具栏中的采集、历史和回放。
- iPad/WPF 局域网主副驾切换和返回主页。

## 1. 服务地址

默认地址：

```text
HTTP:      http://127.0.0.1:19245
WebSocket: ws://127.0.0.1:19999
业务页面:  http://127.0.0.1:19245/app
```

局域网设备调用时，把 `127.0.0.1` 换成运行 SDK 的电脑 IPv4 地址。

当前真实链路：

```text
145 字节串口帧
  -> 第 1 字节传感器标识：1=主驾，2=副驾
  -> 后 144 字节压力数据
  -> 主、副两套独立 Python 算法
  -> 每套算法生成 55 字节 control_command
  -> 按来源串口排队写回
  -> HTTP / WebSocket 输出
```

本文档不包含 `/fake/*` 或 `/airbag/send`。这些是假数据服务接口，不能用于真实硬件。

## 2. 通用响应

业务 HTTP 接口通常返回：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | `number` | `0` 通常成功；`1` 或 `555` 表示失败 |
| `message` | `string` | 结果说明；部分采集旧接口使用 `"error"` 表示失败 |
| `data` | 任意 | 返回数据；值为 `undefined` 时可能不出现在 JSON 中 |

注意：

- 大部分接口即使业务失败也返回 HTTP `200`，需要同时检查 `code` 和 `message`。
- `/carAdaptive/ui/command` 参数错误返回 HTTP `400`，口令错误返回 HTTP `401`。
- POST JSON 请求使用 `Content-Type: application/json`。
- 时间戳均为 Unix 毫秒时间戳。

## 3. SDK 业务接口清单

| 方法 | 路径 | SDK 用途 |
| --- | --- | --- |
| `GET` | `/health` | 服务启动验收 |
| `GET` | `/app` | WPF/WebView2 加载业务页面 |
| `GET` | `/getSystem` | 页面读取当前汽车系统和可视化配置 |
| `GET` | `/getPort` | 枚举真实串口 |
| `GET` | `/connPort` | 自动连接真实串口 |
| `GET` | `/sendMac` | 页面启动兼容步骤 |
| `GET` | `/algorithm/config` | 读取算法参数和中文注释 |
| `POST` | `/algorithm/config` | 批量保存算法参数 |
| `GET` | `/carAdaptive/sensors` | 查询主副两路状态 |
| `GET` | `/carAdaptive/mode` | 查询算法自动/业务手动控制模式 |
| `POST` | `/carAdaptive/mode` | 切换算法自动/业务手动控制模式 |
| `POST` | `/carAdaptive/processFrame` | 手动提交 144 点算法帧 |
| `POST` | `/carAdaptive/writeCommand` | 手动写入气囊控制命令 |
| `GET` | `/carAdaptive/ui/state` | 查询局域网 UI 状态 |
| `POST` | `/carAdaptive/ui/command` | 主副驾切换、返回主页和页面切换 |
| `POST` | `/startCol` | 开始采集 |
| `GET` | `/endCol` | 停止采集 |
| `GET` | `/getColHistory` | 查询采集历史 |
| `POST` | `/downlaod` | 导出采集数据 |
| `POST` | `/delete` | 删除采集数据 |
| `POST` | `/changeDbName` | 修改采集名称 |
| `POST` | `/getDbHistory` | 加载历史数据 |
| `POST` | `/cancalDbPlay` | 取消历史回放 |
| `POST` | `/getDbHistoryPlay` | 开始历史回放 |
| `POST` | `/changeDbplaySpeed` | 修改回放速度 |
| `POST` | `/getDbHistoryStop` | 暂停回放 |
| `POST` | `/getDbHistoryIndex` | 跳转回放索引 |
| `POST` | `/getCsvData` | 读取已存在的本地 CSV |

## 4. 启动和真实串口

### 4.1 `GET /health`

判断真实服务是否就绪，并读取实际端口。

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "service": "jqtools-real-serial-service",
    "mode": "real",
    "httpPort": 19245,
    "webSocketPort": 19999,
    "frontendBuildDir": "D:\\...\\frontend-build",
    "controlMode": "auto"
  }
}
```

`mode` 必须为 `"real"`。如果返回 `"mock"`，说明当前连接的不是客户真实服务。
`controlMode` 为气囊控制模式，默认 `"auto"`。

### 4.2 `GET /app`

返回 SDK 内置 React/Three.js 业务页面。WPF 控件默认使用 WebView2 加载该地址。

常用入口：

```text
/app
/app#/raw-serial
/app#/remote-control
/app?remoteControl=1&showTitle=1
```

前端资源还会访问：

```text
/static/*
/model/*
/asset-manifest.json
/manifest.json
```

### 4.3 `GET /getSystem`

页面启动时读取当前系统和可视化默认值。

响应 `data` 示例：

```json
{
  "value": "carAir",
  "typeArr": [],
  "optimalObj": {
    "carAir": {
      "gauss": 2,
      "color": 616,
      "filter": 0,
      "height": 0.1,
      "coherent": 1
    }
  },
  "maxObj": {
    "carAir": {
      "gauss": 4,
      "color": 2000,
      "filter": 20,
      "height": 8,
      "coherent": 10
    }
  }
}
```

当前汽车 SDK 使用 `value: "carAir"`。页面用 `optimalObj.carAir` 初始化图像平滑、颜色、
噪点、高度和响应速度等参数。

### 4.4 `GET /getPort`

枚举操作系统当前可见的真实串口。

响应：

```json
{
  "code": 0,
  "message": "获取设备列表成功",
  "data": [
    {
      "path": "COM3",
      "manufacturer": "wch.cn",
      "serialNumber": "...",
      "vendorId": "1A86",
      "productId": "7523"
    }
  ]
}
```

不同驱动提供的字段可能不同，只有 `path` 应视为基础字段。空数组表示没有可见串口。

### 4.5 `GET /connPort`

打开尚未打开的真实串口并开始解析数据。页面挂载后会自动调用一次。

典型响应：

```json
{
  "code": 0,
  "message": "连接成功"
}
```

当前连接函数不返回端口明细，因此成功响应通常没有 `data`。该响应只表示连接流程已
执行，不表示主副传感器已有数据。实际在线状态以 `/carAdaptive/sensors` 或 WebSocket
快照为准。

### 4.6 `GET /sendMac`

这是页面自动启动流程保留的兼容调用。

当前真实行为：

- 已创建串口解析器时返回 `message: "发送成功"`。
- 尚未连接串口时返回 `message: "请先连接串口"`。
- 两种情况当前都返回 `code: 0`。
- 当前版本没有主动写入旧 AT/MAC 查询命令。

因此不能把该接口的“发送成功”当成设备应答。

## 5. 主副传感器和算法

### 5.1 串口输入格式

每帧固定 145 字节：

| 串口字节索引 | 长度 | 内容 |
| --- | --- | --- |
| `0` | 1 | `1` 主驾，`2` 副驾 |
| `1..144` | 144 | 对应通道的压力数据 |

去掉标识后的 144 点布局：

| 压力索引 | 区域 |
| --- | --- |
| `0..3` | 靠背侧翼 A，宽 1、高 4 |
| `4..7` | 靠背侧翼 B，宽 1、高 4 |
| `8..71` | 靠背中心区，8×8 |
| `72..75` | 坐垫侧翼 A，宽 1、高 4 |
| `76..79` | 坐垫侧翼 B，宽 1、高 4 |
| `80..143` | 坐垫中心区，8×8 |

每项应为 `0..255` 的整数。主、副两路始终进入各自独立的 Python 算法实例，前端切换
只改变当前展示通道。

### 5.2 `GET /carAdaptive/sensors`

查询两路轻量状态，不返回 144 点数组。

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "sensorId": 1,
      "role": "主",
      "online": true,
      "stamp": 1785292800000,
      "HZ": 12,
      "algorithmReady": true,
      "frameCount": 235
    },
    {
      "sensorId": 2,
      "role": "副",
      "online": true,
      "stamp": 1785292800010,
      "HZ": 12,
      "algorithmReady": true,
      "frameCount": 232
    }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `online` | 最近一帧距当前时间小于 1000 ms |
| `stamp` | 最近一帧接收时间 |
| `HZ` | 根据相邻帧间隔计算的整数频率 |
| `algorithmReady` | 该路是否已得到过算法结果 |
| `frameCount` | 该路独立算法实例累计帧数 |

### 5.3 `POST /carAdaptive/processFrame`

不经过串口，手动提交一帧给指定算法，主要用于 SDK 验收和调试。

请求字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `sensorId` | 建议填写 | `1` 主驾或 `2` 副驾 |
| `sensorData` | 是 | 正好 144 个数值 |
| `writeSerial` | 否 | 默认 `false`；`true` 时尝试写入算法控制命令 |

JavaScript 请求示例：

```javascript
const sensorData = new Array(144).fill(0);

const response = await fetch(
  'http://127.0.0.1:19245/carAdaptive/processFrame',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sensorId: 1,
      sensorData,
      writeSerial: false
    })
  }
);
```

成功响应 `data`：

```json
{
  "control_command": [31, 1, 0, 2, 0],
  "is_new_command": true,
  "control_decision_data": {},
  "living_status": "检测中",
  "body_type": "未判断",
  "seat_state": "CUSHION_ONLY",
  "frame_count": 1,
  "sensor_id": 1,
  "sensor_role": "主"
}
```

示例中的 `control_command` 已截断；实际非空命令固定为 55 字节。

算法状态：

| 字段 | 当前可能值 |
| --- | --- |
| `living_status` | `活体`、`静物`、`检测中`、`离座`、`未启用` |
| `body_type` | `大人`、`小孩`、`静物`、`未判断` |
| `seat_state` | `OFF_SEAT`、`CUSHION_ONLY`、`ADAPTIVE_LOCKED`、`RESETTING` |

### 5.4 55 字节控制命令

Python 算法当前生成：

| 命令索引 | 长度 | 内容 |
| --- | --- | --- |
| `0` | 1 | 帧头，默认 `31`（`0x1F`） |
| `1..48` | 48 | 24 组 `[气囊编号, 档位]` |
| `49` | 1 | 工作模式，自动模式默认 `0` |
| `50` | 1 | 方向，下行默认 `0` |
| `51..54` | 4 | 帧尾 `[170, 85, 3, 153]` |

结构：

```text
[31, 1, 档位1, 2, 档位2, ... , 24, 档位24, 0, 0, 170, 85, 3, 153]
```

当前默认档位：

| 值 | 含义 |
| --- | --- |
| `0` | 保持 |
| `1` | 1 档 |
| `2` | 2 档 |
| `3` | 3 档 |
| `4` | 初始/快速放气档 |

### 5.5 `POST /carAdaptive/writeCommand`

手动把已有命令排队写到指定传感器最近产生数据的串口。

JavaScript 示例：

```javascript
const controlCommand = [31];
for (let airbagId = 1; airbagId <= 24; airbagId += 1) {
  controlCommand.push(airbagId, 0);
}
controlCommand.push(0, 0, 170, 85, 3, 153);

const response = await fetch(
  'http://127.0.0.1:19245/carAdaptive/writeCommand',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sensorId: 1,
      controlCommand
    })
  }
);
```

成功响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "length": 55,
    "sensorId": 1,
    "controlMode": "manual"
  }
}
```

必须注意：

- 当前接口只校验数组非空以及每项是 `0..255` 整数。
- 当前后端**没有强制校验长度为 55**，客户必须传完整正确协议。
- 成功只表示参数通过校验并进入写入流程，不表示硬件已执行。
- 如果目标通道尚未记录来源串口，会尝试写到所有已打开的 `carAir` 串口。
- 没有可用串口时，当前接口仍可能返回成功，但不会产生物理写入。
- 串口异步写错误只写后端日志，不会回写到本次 HTTP 响应。
- 当前接口不返回硬件 ACK。

生产调用前应确认 `/carAdaptive/sensors` 中目标通道为 `online: true`。

### 5.6 `GET` / `POST /carAdaptive/mode`

查询当前气囊控制模式：

```http
GET /carAdaptive/mode
```

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "mode": "auto",
    "previousMode": null,
    "source": "default",
    "reason": "",
    "sequence": 0,
    "changedAt": 1785292800000,
    "autoWrite": true,
    "commandIntervalMs": 500
  }
}
```

切换到手动模式：

```http
POST /carAdaptive/mode
Content-Type: application/json
```

```json
{
  "mode": "manual",
  "reason": "产线标定"
}
```

`mode` 支持 `auto`、`manual`，并兼容历史值 `algor`、`handle` 和协议值 `0`、`1`。
重复设置同一模式是幂等操作，返回 `changed: false`。非法值返回 HTTP `400`。

- `auto`：主副两套算法继续运行，并每 500 ms 自动写回最近命令。
- `manual`：主副两套算法仍继续运行和推送，但不再自动写串口；只有显式调用
  `/carAdaptive/writeCommand` 的命令会进入写入队列。
- 从 `manual` 切回 `auto` 时，后端调用 Python `resetMessage` 清空按摩触发状态。
- 模式切换通过 WebSocket 顶层字段 `carAdaptiveControlMode` 广播。
- 模式默认不持久化，后端重启回到 `auto`；可用环境变量
  `JQTOOLS_CONTROL_MODE=manual` 修改启动默认值。

### 5.7 自动写入

真实串口数据进入后端后，主副两路都会持续执行算法。默认自动模式每 500 ms 将两路
最近一次非空 `control_command` 分别排队写回数据来源串口。前端是否显示该路，不影响
算法执行。切换到 `manual` 后只暂停自动写入，不暂停算法。

## 6. 算法参数

### 6.1 `GET /algorithm/config`

返回扁平化参数路径、当前值和 YAML 中文注释：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "system.hz": {
      "value": 13,
      "comment": "采样频率（帧/秒）"
    },
    "matrix.side_rect_size": {
      "value": 4,
      "comment": "每个侧翼区域点数"
    }
  }
}
```

### 6.2 `POST /algorithm/config`

批量保存参数：

```json
{
  "changes": {
    "system.hz": 13,
    "integrated_system.cushion_sum_threshold": 500,
    "tap_massage.enabled": true
  }
}
```

`changes` 必须是非空对象。成功响应：

```json
{
  "code": 0,
  "message": "算法参数已保存并生效",
  "data": {
    "result": {
      "updated": 3,
      "paths": [
        "system.hz",
        "integrated_system.cushion_sum_threshold",
        "tap_massage.enabled"
      ]
    },
    "config": {}
  }
}
```

保存后会写入：

```text
real-backend/python/app/sensor_config.yaml
```

随后重建主驾、副驾两套算法实例。新参数立即生效，同时两路此前的算法状态、历史和
帧计数会重新开始。

## 7. 局域网 UI 控制

### 7.1 `GET /carAdaptive/ui/state`

响应 `data`：

```json
{
  "selectedSensorId": 1,
  "view": "module",
  "sequence": 3,
  "lastCommand": null,
  "lastAcknowledgement": null,
  "lastClientReport": null,
  "tokenRequired": false,
  "homeUrlConfigured": false,
  "displayClients": 1,
  "webSocketClients": 2,
  "lanAddresses": ["192.168.1.20"],
  "httpPort": 19245,
  "webSocketPort": 19999
}
```

`view` 可能值：

```text
host-home
module
raw-serial
other
```

### 7.2 `POST /carAdaptive/ui/command`

| `action` | 其他字段 | 用途 |
| --- | --- | --- |
| `return-home` | 无 | 返回宿主主页 |
| `open-module` | 无 | 打开汽车自适应模块 |
| `open-raw-serial` | 无 | 打开原始串口页 |
| `select-sensor` | `sensorId: 1` 或 `2` | 所有显示端切换主驾或副驾 |

请求：

```json
{
  "action": "select-sensor",
  "sensorId": 2
}
```

成功响应 `data`：

```json
{
  "command": {
    "id": "ui-1785292800000-4",
    "action": "select-sensor",
    "sensorId": 2,
    "issuedAt": 1785292800000
  },
  "state": {
    "selectedSensorId": 2,
    "view": "module",
    "sequence": 4
  }
}
```

如果设置了 `JQTOOLS_REMOTE_CONTROL_TOKEN`，请求必须携带：

```http
X-JQTools-Control-Token: <token>
```

也可以在 JSON 中传 `"token": "<token>"`。完整 WPF `HomeRequested`、`HomeUrl` 和
iPad 配置见 `REMOTE_CONTROL.md`。

## 8. 采集和回放

这一组接口由当前页面工具栏“采集”面板直接调用。

### 8.1 `POST /startCol`

请求：

```json
{
  "fileName": "2026-07-29-test",
  "HZ": 30
}
```

`fileName` 是采集段名称。当前页面还会发送 `HZ`，但后端当前不读取该字段；可选的
`select` 数组只作为采集元数据写入数据库。

只有已连接设备类型包含当前系统 `carAir` 时才开始采集。

成功：

```json
{
  "code": 0,
  "message": "开始采集",
  "data": 19245
}
```

传感器类型不匹配：

```json
{
  "code": 0,
  "message": "error",
  "data": "请选择正确传感器类型"
}
```

该旧接口失败时仍可能返回 `code: 0`，必须检查 `message`。

### 8.2 `GET /endCol`

停止采集：

```json
{
  "code": 0,
  "message": "停止采集",
  "data": "success"
}
```

### 8.3 `GET /getColHistory`

返回最近 500 个采集段：

```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "date": "2026-07-29-test",
      "timestamp": 1785292800000,
      "select": "[\"carAir\"]"
    }
  ]
}
```

### 8.4 `POST /downlaod`

真实路径保留了旧拼写 `downlaod`，不能改为 `/download`。

请求：

```json
{
  "fileArr": ["2026-07-29-test"]
}
```

空数组返回 `code: 555` 和 `message: "error"`。

### 8.5 `POST /delete`

请求：

```json
{
  "fileArr": ["2026-07-29-test"]
}
```

响应 `data`：

```json
[
  {
    "2026-07-29-test": "success"
  }
]
```

### 8.6 `POST /changeDbName`

请求：

```json
{
  "newDate": "new-name",
  "oldDate": "old-name"
}
```

当前成功消息沿用旧值 `"删除成功"`，调用方不要用该中文消息判断操作类型。

### 8.7 `POST /getDbHistory`

请求：

```json
{
  "time": "2026-07-29-test"
}
```

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "length": 120,
    "pressArr": {
      "carAir": [1000, 1050, 980]
    },
    "areaArr": {
      "carAir": [40, 42, 39]
    }
  }
}
```

该调用会把完整历史帧缓存在后端，供播放接口使用。当前实现读取前两行计算频率，因此
采集段至少需要 2 行。

### 8.8 `POST /getDbHistoryPlay`

开始或继续播放由 `/getDbHistory` 加载的数据。无请求体。

播放期间通过 WebSocket 推送：

```json
{
  "sitData": {},
  "index": 10,
  "timestamp": 1785292800000
}
```

### 8.9 `POST /getDbHistoryStop`

暂停播放，无请求体。当前索引和已加载数据继续保留。

### 8.10 `POST /cancalDbPlay`

取消播放并清空已加载历史。无请求体。`cancal` 是真实旧拼写。

### 8.11 `POST /changeDbplaySpeed`

请求：

```json
{
  "speed": 2
}
```

实际播放频率为原始频率乘以 `speed`。应传大于 `0` 的有限数字。

### 8.12 `POST /getDbHistoryIndex`

请求：

```json
{
  "index": 10
}
```

立即推送该索引帧，并在 HTTP `data` 中返回对应数据库原始行。调用方必须保证索引位于
`0..length-1`。

### 8.13 `POST /getCsvData`

请求：

```json
{
  "fileName": "D:\\data\\sample.csv"
}
```

读取运行 SDK 电脑上已经存在的 CSV 文件并返回行对象数组。该接口不是上传接口，文件
路径必须能被后端访问。

## 9. WebSocket 业务协议

### 9.1 连接

普通数据连接：

```text
ws://127.0.0.1:19999
```

WPF/iPad 页面显示端：

```text
ws://127.0.0.1:19999/?role=ui-display&clientId=<唯一客户端ID>
```

服务不要求发送订阅消息。客户端按收到 JSON 的顶层字段区分消息类型。

### 9.2 `carAdaptiveSensorsData`

这是当前 SDK 前端使用的主副双路完整快照。

```json
{
  "carAdaptiveSensorsData": [
    {
      "sensorId": 1,
      "role": "主",
      "sitData": {
        "carAir": {
          "type": "carAir",
          "sensorId": 1,
          "status": "online",
          "arr": [0, 1, 2, 3],
          "stamp": 1785292800000,
          "HZ": 12
        }
      },
      "algorData": {
        "control_command": [31, 1, 0, 2, 0],
        "is_new_command": true,
        "control_decision_data": {},
        "living_status": "活体",
        "body_type": "大人",
        "seat_state": "ADAPTIVE_LOCKED",
        "frame_count": 235,
        "sensor_id": 1,
        "sensor_role": "主"
      },
      "algorFeed": [0, 0, 0, 0]
    },
    {
      "sensorId": 2,
      "role": "副",
      "sitData": {
        "carAir": {
          "type": "carAir",
          "sensorId": 2,
          "status": "offline",
          "stamp": 0
        }
      },
      "algorFeed": []
    }
  ]
}
```

示例数组已截断。实际规则：

- 在线压力 `sitData.carAir.arr` 为 144 项。
- 非空 `algorData.control_command` 为 55 项。
- `algorFeed` 为 24 项气囊档位。
- 算法尚未返回时，`algorData` 可能不出现在 JSON 中。
- 压力尚未到达时，`arr` 可能不出现在 JSON 中。

### 9.3 `carAdaptiveSensors`

每 500 ms 左右推送一次主副轻量状态，结构与
`GET /carAdaptive/sensors` 的 `data` 相同：

```json
{
  "carAdaptiveSensors": [
    {
      "sensorId": 1,
      "role": "主",
      "online": true,
      "stamp": 1785292800000,
      "HZ": 12,
      "algorithmReady": true,
      "frameCount": 235
    }
  ]
}
```

### 9.4 `carAdaptiveControlMode`

新建 WebSocket 连接时会立即收到当前控制模式；每次真实切换后也会广播：

```json
{
  "carAdaptiveControlMode": {
    "mode": "manual",
    "previousMode": "auto",
    "source": "api",
    "reason": "产线标定",
    "sequence": 1,
    "changedAt": 1785292800000,
    "autoWrite": false,
    "commandIntervalMs": 500
  }
}
```

### 9.5 UI 控制广播

调用 `/carAdaptive/ui/command` 后：

```json
{
  "carAdaptiveUiCommand": {
    "id": "ui-1785292800000-4",
    "action": "select-sensor",
    "sensorId": 2,
    "issuedAt": 1785292800000
  },
  "carAdaptiveUiState": {
    "selectedSensorId": 2,
    "view": "module",
    "sequence": 4
  }
}
```

显示端状态上报：

```json
{
  "type": "carAdaptiveUiReport",
  "sensorId": 2,
  "view": "module"
}
```

显示端执行回执：

```json
{
  "type": "carAdaptiveUiAcknowledgement",
  "commandId": "ui-1785292800000-4",
  "status": "applied",
  "sensorId": 2,
  "view": "module",
  "message": ""
}
```

### 9.6 采集回放消息

| 消息 | 用途 |
| --- | --- |
| `{ "sitData": {}, "index": 10, "timestamp": 1785292800000 }` | 当前历史帧 |
| `{ "playEnd": true }` | 当前旧实现的播放开始状态 |
| `{ "playEnd": false }` | 播放结束 |

### 9.7 兼容消息

真实后端还会广播顶层 `sitData`、`algorData` 和 `algorFeed`，但这些只代表后端旧版
单路投影。当前 SDK 前端维护主副两套状态时应使用 `carAdaptiveSensorsData`，不要用兼容
消息覆盖双路缓存。

## 10. 快速验证

### 10.1 PowerShell

```powershell
$base = "http://127.0.0.1:19245"

Invoke-RestMethod "$base/health"
Invoke-RestMethod "$base/getPort"
Invoke-RestMethod "$base/connPort"
Invoke-RestMethod "$base/carAdaptive/sensors"
Invoke-RestMethod "$base/carAdaptive/mode"
```

手动验证一帧算法：

```powershell
$frame = @(0..143 | ForEach-Object { 0 })
$body = @{
    sensorId = 1
    sensorData = $frame
    writeSerial = $false
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
    -Method Post `
    -Uri "$base/carAdaptive/processFrame" `
    -ContentType "application/json" `
    -Body $body
```

### 10.2 WebSocket

```javascript
const ws = new WebSocket(
  'ws://127.0.0.1:19999/?role=ui-display&clientId=customer-page'
);

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.carAdaptiveSensorsData) return;

  const main = message.carAdaptiveSensorsData.find(
    (item) => item.sensorId === 1
  );
  const secondary = message.carAdaptiveSensorsData.find(
    (item) => item.sensorId === 2
  );
  console.log({ main, secondary });
});
```

## 11. 安全和调用边界

- HTTP 和 WebSocket 默认可被局域网访问。
- CORS 当前允许任意来源。
- 只有 `/carAdaptive/ui/command` 支持可选控制口令。
- `/carAdaptive/mode`、`/carAdaptive/writeCommand`、算法参数、串口连接和采集接口当前没有鉴权。
- 建议通过 Windows 防火墙限制来源 IP，不要把端口暴露到互联网。
- `/carAdaptive/writeCommand` 成功不是硬件 ACK。
- `/connPort` 成功不是传感器在线证明。
- 实时状态以 `/carAdaptive/sensors` 和 `carAdaptiveSensorsData` 为准。
- 采集接口保留部分旧错误语义，客户调用应设置超时并检查 `code` 与 `message`。

## 12. 推荐调用顺序

1. `GET /health`，确认 `mode` 为 `real`。
2. 建立 WebSocket，处理 `carAdaptiveSensorsData`。
3. `GET /getPort`，确认目标串口可见。
4. `GET /connPort`。
5. 等待目标通道变为 `online: true`。
6. 使用 WebSocket 展示两路压力和算法结果。
7. `GET /carAdaptive/mode` 确认控制模式；正常运行保持 `auto`。
8. 手动调试先切 `manual`，再调用 `/carAdaptive/writeCommand`，完成后切回 `auto`。
9. 参数修改使用 `/algorithm/config`。
10. 局域网控制使用 `/carAdaptive/ui/command`。
