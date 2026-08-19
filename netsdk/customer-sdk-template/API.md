# JQTools 汽车自适应接口文档

本文档只描述接口调用方法：HTTP 请求、请求体字段、响应字段和 WebSocket 消息。
最短上手路径见 `QUICKSTART.md`。

覆盖范围为业务链路真实使用的接口，不包含 `/fake/*`、`/airbag/send` 等假数据调试接口。

## 目录

1. [接口约定](#1-接口约定)
2. [服务与串口](#2-服务与串口)
3. [主副驾自适应独立开关](#3-主副驾自适应独立开关)
4. [气囊展示状态控制](#4-气囊展示状态控制)
5. [气囊真实控制（写串口）](#5-气囊真实控制写串口)
6. [气囊指令历史与回传诊断](#6-气囊指令历史与回传诊断)
7. [传感器与算法数据](#7-传感器与算法数据)
8. [WebSocket 消息](#8-websocket-消息)
9. [远程控制页面](#9-远程控制页面)
10. [数据采集与回放](#10-数据采集与回放)
11. [算法参数](#11-算法参数)
12. [环境变量与安全边界](#12-环境变量与安全边界)

---

## 1. 接口约定

### 1.1 地址

| 服务 | 地址 |
| --- | --- |
| HTTP REST | `http://127.0.0.1:19245` |
| WebSocket | `ws://127.0.0.1:19999` |
| 业务页面 | `http://127.0.0.1:19245/app` |
| 接口调试页 | `http://127.0.0.1:19245/app#/api-debug` |
| 局域网控制页 | `http://127.0.0.1:19245/app#/remote-control` |

局域网设备调用时把 `127.0.0.1` 换成 SDK 主机的 IPv4 地址，可从 `GET /carAdaptive/ui/state` 的 `lanAddresses` 读到。

### 1.2 主副驾标识

| 值 | 含义 |
| --- | --- |
| `sensorId = 1` | 主驾 |
| `sensorId = 2` | 副驾 |

主驾和副驾是两条完全独立的链路：算法实例、帧计数、控制模式、控制命令、气囊展示状态互不共享。
除非接口说明写了「兼容旧客户端」，否则调用时都应显式传 `sensorId`。

### 1.3 统一响应结构

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

| 项目 | 说明 |
| --- | --- |
| `code` | `0` 成功；`1` / `555` 为业务失败，原因看 `message` |
| HTTP 状态码 | 参数校验失败返回 `400`，令牌错误返回 `401`，其余业务失败仍返回 `200` |

**判断成功必须看 `code`，不能只看 HTTP 状态码。**

### 1.4 控制令牌

只有 `POST /carAdaptive/ui/command` 支持可选令牌校验。后端设置了 `JQTOOLS_REMOTE_CONTROL_TOKEN` 时，请求需带：

```http
X-JQTools-Control-Token: 配置的口令
```

也支持放在请求体的 `token` 字段。令牌不匹配返回 HTTP `401`。其余接口无鉴权。

### 1.5 推荐启动顺序

```text
GET  /health                 确认服务在跑
GET  /getSystem              读系统类型和可视化配置
GET  /getPort                看串口
GET  /connPort               一键连接
GET  /sendMac                启动兼容步骤
WS   ws://host:19999         订阅 carAdaptiveSensorsData
GET  /carAdaptive/sensors    确认目标通道 online: true
```

---

## 2. 服务与串口

### 2.1 `GET /health`

无参数，用于启动验收。

```bash
curl http://127.0.0.1:19245/health
```

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "service": "jqtools-real-serial-service",
    "mode": "real",
    "httpPort": 19245,
    "webSocketPort": 19999,
    "frontendBuildDir": "C:\\JQTools\\customer-sdk\\frontend-build",
    "controlMode": "auto"
  }
}
```

`GET /` 返回纯文本 `Hello World!`，仅用于最简连通探测。

### 2.2 `GET /getPort`

枚举串口，`data` 为数组，字段同 `SerialPort.list()`。

```bash
curl http://127.0.0.1:19245/getPort
```

### 2.3 `GET /connPort`

按当前系统波特率（`carAir` 为 `1000000`）连接全部匹配串口。

```bash
curl http://127.0.0.1:19245/connPort
```

成功 `message="连接成功"`，失败 `code=1`、`message="连接失败"`。

**可以重复调用，也可以和界面的一键连接同时调用**：后端把并发请求合并为同一次连接流程，已打开或正在打开的串口直接复用，不会重复占用端口，也不会打断正在接收的数据。

### 2.4 `GET /sendMac`

启动流程兼容步骤。未连接串口时返回 `code=0` 且 `message="请先连接串口"`。

```bash
curl http://127.0.0.1:19245/sendMac
```

### 2.5 `GET /getSystem`

读取系统类型和可视化配置，页面启动调一次。`data` 含 `value`（当前系统，汽车为 `carAir`）、`typeArr`、`maxObj`（颜色上限，`carAir` 默认 `616`）、`optimalObj`。

```bash
curl http://127.0.0.1:19245/getSystem
```

### 2.6 `GET /app`

返回前端页面及静态资源。

| 查询参数 | 说明 |
| --- | --- |
| `remoteControl=1` | 该页面的操作会广播为远程 UI 命令 |
| `showTitle=1` | 显示标题栏 |
| `homeUrl=` | 覆盖本机主页地址 |
| `apiBase=` | 只对 `#/api-debug` 生效，指定调试页要访问的服务地址 |

`frontend-build` 缺失时返回 HTTP `404`。

---

## 3. 主副驾自适应独立开关

主驾和副驾的自适应调节**分别独立开启和关闭**，互不影响。

### 3.1 三种模式

| `mode` | 对外含义 | 算法 | 自动写气囊串口 | 手动 `writeCommand` |
| --- | --- | --- | --- | --- |
| `auto` | 自适应开启 | 运行 | 每 `500 ms` 写一次 | 允许，但会被下一周期覆盖 |
| `manual` | 自适应关闭 | 运行并继续返回算法数据 | 不写 | 允许，稳定生效 |
| `paused` | 自适应完全暂停 | 暂停 | 不写 | 允许 |

常规业务用 `auto` / `manual` 作为「自适应开启 / 关闭」。

三种模式都**不影响串口采集和压力数据推送**，暂停的只是算法。

- `manual`：算法继续跑，`algorData`、活体 / 体型 / 座椅状态继续推送，`frame_count` 继续累加，但不再自动下发命令。
- `paused`：不再调用 Python，`algorData` 停止更新，`frame_count` 冻结。**气囊保持当前充气量不动**，不会自动放气。
- `POST /carAdaptive/processFrame` 是显式提交，**不受 `paused` 影响**，暂停期间仍可调用。

**恢复到 `auto` 时的两种后端动作**：

| 来源 | 动作 | 响应字段 |
| --- | --- | --- |
| 从 `manual` 恢复 | 调 Python `resetMessage(sensor_id)` 清空该路按摩状态，避免手动期间的按压被当成拍打触发信号 | `massageReset: true` |
| 从 `paused` 恢复 | 调 Python `resetSystem(sensor_id)`，只重建恢复运行的目标算法实例，另一路不受影响 | `algorithmReset: true` |

Python 调用失败时对应字段为 `false`，只记后端日志，不影响模式切换本身。

### 3.2 `GET /carAdaptive/mode`

| 查询参数 | 必填 | 说明 |
| --- | --- | --- |
| `sensorId` | 否 | `1` 或 `2`；省略时使用当前兼容投影通道 |

```bash
curl "http://127.0.0.1:19245/carAdaptive/mode?sensorId=1"
```

响应顶层是目标通道的状态，`sensors` 同时给出主副两路：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "sensorId": 1,
    "role": "主",
    "mode": "auto",
    "previousMode": null,
    "source": "default",
    "reason": "",
    "sequence": 0,
    "changedAt": 1785305414424,
    "autoWrite": true,
    "algorithmRunning": true,
    "commandIntervalMs": 500,
    "view": "module",
    "independent": true,
    "sensors": [
      { "sensorId": 1, "role": "主", "mode": "auto", "autoWrite": true, "algorithmRunning": true },
      { "sensorId": 2, "role": "副", "mode": "manual", "autoWrite": false, "algorithmRunning": true }
    ]
  }
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `sensorId` / `role` | `1\|2` / `主\|副` | 顶层状态对应的目标通道 |
| `mode` | `"auto" \| "manual" \| "paused"` | 该通道当前模式 |
| `previousMode` | `string \| null` | 上一个模式，从未切换过为 `null` |
| `source` | `"default" \| "api" \| "view" \| "ecu"` | 谁改的：启动默认值 / 接口调用 / 页面视图切换 / 整车回传 |
| `reason` | `string` | 变更原因，最长 120 字符 |
| `sequence` | `number` | 变更次数，可用来判断状态是否比本地缓存新 |
| `changedAt` | `number` | 最近一次变更的毫秒时间戳 |
| `autoWrite` | `boolean` | 是否正在自动写串口，等价于 `mode === "auto"` |
| `algorithmRunning` | `boolean` | 算法是否在处理串口帧，等价于 `mode !== "paused"` |
| `commandIntervalMs` | `number` | 自动写入周期，当前为 `500` |
| `view` | `string` | 当前 SDK 页面视图，模式会跟随它自动切换 |
| `independent` | `true` | 固定为 `true`，表示主副两路独立 |
| `sensors` | `array` | 主、副两路完整状态，元素字段同顶层（不含 `independent` / `sensors`） |

### 3.3 `POST /carAdaptive/mode`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `mode` | `string` | 是 | `auto` / `manual` / `paused`；也接受别名 `algor`、`handle`、`pause`、`stop` 和协议字节 `0` / `1` |
| `sensorId` | `1 \| 2` | 建议必填 | 指定后只改该路；**不传时为兼容旧客户端会同时修改主副两路** |
| `reason` | `string` | 否 | 变更原因，会记入状态并广播，便于现场排查 |
| `source` | `string` | 否 | `api`（默认）/ `ecu`，未知来源回落到 `api` |

主驾自适应开启：

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":1,"mode":"auto","reason":"主驾自适应开启"}'
```

主驾自适应关闭（副驾不受影响）：

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":1,"mode":"manual","reason":"主驾自适应关闭"}'
```

副驾自适应开启 / 关闭把 `sensorId` 改为 `2`。完全暂停一路算法用 `"mode":"paused"`。

响应在 [3.2](#32-get-caradaptivemode) 的字段之上追加：

```json
{
  "code": 0,
  "message": "控制模式已切换",
  "data": {
    "sensorId": 1,
    "role": "主",
    "mode": "manual",
    "previousMode": "auto",
    "source": "api",
    "reason": "主驾自适应关闭",
    "sequence": 1,
    "changedAt": 1785305431771,
    "autoWrite": false,
    "algorithmRunning": true,
    "changed": true,
    "massageReset": false,
    "algorithmReset": false,
    "changes": [
      { "sensorId": 1, "changed": true, "previousMode": "auto", "massageReset": false, "algorithmReset": false }
    ]
  }
}
```

| 附加字段 | 说明 |
| --- | --- |
| `changed` | 本次调用是否真的改变了模式 |
| `massageReset` | 是否有通道从 `manual` 切回 `auto` 并成功清空了按摩状态 |
| `algorithmReset` | 是否有通道从 `paused` 恢复并成功重建了算法实例 |
| `changes[]` | 本次实际处理的每一路结果。传了 `sensorId` 时只有一项，未传时为两项 |

行为约定：

- **重复设置同一模式是幂等的**：返回 `code: 0`、`message: "控制模式未变化"`、`changed: false`，`sequence` 和 `changedAt` 都不变，可以安全地反复调用。
- `mode` 非法或缺失返回 HTTP `400`，`message` 为 `mode 只允许为 auto、manual、paused`。
- `sensorId` 非 `1` / `2` 返回 HTTP `400`，`message` 为 `sensorId 只允许为 1（主驾）或 2（副驾）`。
- 每次真正切换都会向所有 WebSocket 客户端广播 `carAdaptiveControlMode` 和 `carAdaptiveSensorsData`，后端日志打印 `[car-adaptive] sensor 1 control mode: auto -> manual (api)`。
- 新建 WebSocket 连接时会立即收到一条当前模式，不需要额外查询。
- 模式**不持久化**，后端重启回到 `auto`。需要默认关闭时设置环境变量 `JQTOOLS_CONTROL_MODE=manual`。

### 3.4 模式跟随页面自动切换

后端会根据 SDK 页面当前视图自动切模式，不需要业务方调用：

| 页面视图 | 目标模式 | 说明 |
| --- | --- | --- |
| `module` 自适应模块主页 | 恢复各路原模式 | 主、副分别恢复暂停前的 `auto` 或 `manual`，无记录时回 `auto` |
| `host-home` 宿主主页 | `paused` | 离开 SDK，暂停算法 |
| `raw-serial` 原始数据页 | 保持不变 | 观察压力和气囊命令，不干预算法 |
| `other` | `paused` | 同上 |

**只在视图真正发生变化时才切换。** 模块页内切换主副驾会重复上报 `view=module`，不会打断正在进行的手动标定 —— 切到 `manual` 后，切主副驾、刷新状态都不会被拉回 `auto`，只有真正离开再回来才会。

触发点有两个：`POST /carAdaptive/ui/command` 改变视图时，以及页面通过 WebSocket 上报 `carAdaptiveUiReport` 时。这类变更的 `source` 记为 `view`，可据此区分是页面切换还是业务方主动调的接口。

两个注意点：

- **服务启动时默认 `auto`**，不等页面上报。纯接口集成（不用前端页面）也能正常工作。
- 宿主程序直接导航离开而**不发** `return-home`、页面也不上报时，后端无法感知，模式保持不变。这种情况需要显式调 `POST /carAdaptive/mode` 切 `paused`。

> 协议第 49 字节的模式位与这个开关**无关**。算法输出的第 49 字节恒为 `0`，`protocol.mode_manual` 配置项没有被任何代码读取。这个开关控制的是「后端要不要自动写串口」，不是写进命令里的模式位。
>
> 后端保留了由 ECU 51 字节回传帧驱动的模式跟随逻辑（`source: 'ecu'`），但该分支整段注释停用。这一版没有物理按键，模式只能由接口或页面视图切换。

---

## 4. 气囊展示状态控制

气囊展示采用固定归属：**API 独占 3、4、5、6 号气囊的界面状态，ECU 只决定其余 20 路**。即使 ECU 回传 3–6 号非零档位，后端也会忽略。

该接口**只修改界面展示，不写串口、不控制真实气囊**，也不会把 `feedbackOnline` 伪造成 `true`。要控制真实气囊见[第 5 节](#5-气囊真实控制写串口)。

### 4.1 逐通道合并规则

界面使用的 24 路档位（`algorFeed`）按通道合并，主副两路各自独立：

| 气囊编号 | 已设置 API 状态 | 未设置或清除 API 状态 |
| --- | --- | --- |
| `3、4、5、6` | 使用 API 提交的档位 | 固定为 `0`，ECU 回传值无效 |
| `1、2、7–24` | 始终使用 ECU 回传档位 | 始终使用 ECU 回传档位 |

ECU 不在线且配置了 `JQTOOLS_AIRBAG_FEEDBACK_SOURCE=command` 时，最近下发命令仅作为其余 20 路的基础档位；命令中的 3–6 号同样被忽略。仍无基础状态时，其余 20 路按 `0` 显示。

`source=api` 表示四路存在显式 API 状态，`baseSource` 始终表示另外 20 路的来源，取值为 `ecu`、`command` 或 `none`。当 `source=ecu` 或 `command` 时，也不代表 ECU 或命令能控制 3–6 号。

界面判定：**档位严格等于 `3`（快速充气）才点亮**。档位 `0` 保持、`1` 慢速、`2` 中速、`4` 放气都不点亮。下发 `1` / `2` 档时硬件在动但界面无变化，这是预期行为。

`airbagDisplayAvailable` 为 `false`（即没有 API 覆盖且没有基础状态）时，自适应页面「区域调节」标题下方显示黄色提示「未收到气囊状态回传」，整块气囊图降低透明度表示状态未知。设置四路接口覆盖后该提示消失，但其余 20 路仍为未知并按 `0` 显示。

`feedbackOnline` 始终只表示真实 ECU 回传，不受展示覆盖影响。

四路 API 展示状态**不依赖算法结果**：算法还没产出、传感器离座甚至该路没有压力数据时，调用本接口也会立即点亮 3、4、5、6 号中的目标气囊。

命令下发和状态回传是两件独立的事，展示接口不会伪造硬件 ACK：

```text
ECU 回传 51 字节  -->  只提取 1、2、7–24 --+
API 展示接口      -->  只设置 3、4、5、6 ----+--> algorFeed
```

### 4.2 `GET /carAdaptive/display`

| 查询参数 | 必填 | 说明 |
| --- | --- | --- |
| `sensorId` | 否 | `1` 或 `2`；省略时使用当前兼容投影通道 |

```bash
# 主驾
curl "http://127.0.0.1:19245/carAdaptive/display?sensorId=1"

# 副驾
curl "http://127.0.0.1:19245/carAdaptive/display?sensorId=2"
```

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "sensorId": 1,
    "role": "主",
    "gears": [0, 0, 3, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "available": true,
    "source": "api",
    "baseSource": "ecu",
    "override": true,
    "overrideAirbagIds": [3, 4, 5, 6],
    "stamp": 1785306916763,
    "feedbackOnline": true,
    "feedbackStamp": 1785306916700,
    "independent": true,
    "sensors": [
      { "sensorId": 1, "role": "主", "source": "api", "override": true },
      { "sensorId": 2, "role": "副", "source": "none", "override": false }
    ]
  }
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `gears` | `number[24]` | 当前界面使用的 24 路档位；`source=none` 时为 `[]` |
| `available` | `boolean` | 界面是否有状态可画 |
| `source` | `"api" \| "ecu" \| "command" \| "none"` | `api` 表示 3–6 号存在显式 API 状态；否则表示其余 20 路的基础来源 |
| `baseSource` | `"ecu" \| "command" \| "none"` | ECU 所属其余 20 路的来源 |
| `override` | `boolean` | 3–6 号是否存在显式 API 状态，等价于 `source === "api"` |
| `overrideAirbagIds` | `number[]` | 显式 API 状态存在时固定为 `[3,4,5,6]`，否则为空数组 |
| `stamp` | `number` | 当前展示状态的毫秒时间戳 |
| `feedbackOnline` | `boolean` | ECU 最近是否真实回传，与展示覆盖无关 |
| `feedbackStamp` | `number` | 最近一条 ECU 回传的毫秒时间戳 |
| `independent` | `true` | 固定为 `true`，表示主副两路独立 |
| `sensors` | `array` | 主、副两路完整展示状态 |

### 4.3 `POST /carAdaptive/display`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sensorId` | `1 \| 2` | 是 | 目标通道 |
| `gears` | `number[24]` | 二选一 | 每项必须是 `0`-`4` 的整数；只有第 3–6 项允许非零，其余必须为 `0` |
| `controlCommand` | `number[51\|55]` | 二选一 | 直接传一条 51 或 55 字节命令；同样只允许 3–6 号为非零，也接受字段名 `command` |

`gears` 优先。两者都不合法时返回 HTTP `400`，`message` 为
`gears 必须是 24 项 0-4 档位数组，或传入 51/55 字节 controlCommand`。

主驾第 3 个气囊由 API 点亮；1、2、7–24 号继续显示 ECU 回传状态：

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/display \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":1,"gears":[0,0,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}'
```

副驾腰托（5、6 号）点亮：

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/display \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":2,"gears":[0,0,0,0,3,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}'
```

用一条 55 字节命令帧直接同步界面（不写串口）：

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/display \
  -H 'Content-Type: application/json' \
  -d '{
    "sensorId":1,
    "controlCommand":[31,
      1,0,2,0,3,0,4,0,5,3,6,3,7,0,8,0,9,0,10,0,11,0,12,0,
      13,0,14,0,15,0,16,0,17,0,18,0,19,0,20,0,21,0,22,0,23,0,24,0,
      0,0,170,85,3,153]
  }'
```

响应结构同 [4.2](#42-get-caradaptivedisplay)，`message` 为 `3、4、5、6 号气囊展示状态已覆盖`。如果 1、2、7–24 号存在非零档位，返回 HTTP `400`。

调用后：

- 立即向所有 WebSocket 客户端广播 `carAdaptiveSensorsData`，界面同步刷新。
- 3–6 号 API 状态**持续有效**，直到调 DELETE 清除或服务重启；ECU 新回传只会实时更新其余 20 路。
- 记入气囊指令历史 `apiDisplay` 类型，`active: true`。

### 4.4 `DELETE /carAdaptive/display/:sensorId`

清除该路 3–6 号 API 状态并将这四路固定为 `0`；其余 20 路继续跟随 ECU 回传（或配置的命令回落）。

```bash
# 主驾清除 3–6 号 API 状态并熄灭
curl -X DELETE http://127.0.0.1:19245/carAdaptive/display/1

# 副驾清除 3–6 号 API 状态并熄灭
curl -X DELETE http://127.0.0.1:19245/carAdaptive/display/2
```

响应结构同 [4.2](#42-get-caradaptivedisplay)，`message` 为 `3、4、5、6 号 API 展示状态已清除并熄灭`。清除动作会以 `active: false` 记入 `apiDisplay` 历史。

未设置过覆盖时调用也返回 `code: 0`，属于幂等操作。

### 4.5 与整机回落开关的区别

环境变量 `JQTOOLS_AIRBAG_FEEDBACK_SOURCE=command` 是整机级开关，影响两路 ECU 所属的 20 路且不区分指令，亮的含义退化为「已下发」。它不会接管 3–6 号。

3–6 号始终使用本节接口设置；清除后四路熄灭，不会恢复读取 ECU。

---

## 5. 气囊真实控制（写串口）

### 5.1 调用前提

手动控制前先把目标通道切到 `manual`：

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":1,"mode":"manual","reason":"手动控制气囊"}'
```

在 `auto` 模式下调 `writeCommand` **不会被拒绝**，但命令会在下一个 500 ms 周期被算法命令覆盖。

客户手动 API 只开放 `3`、`4`、`5`、`6` 号气囊。命令仍须保持完整 55 字节，
其他 20 路档位必须为 `0`。后端会强制校验该白名单，伪造 `source: "algorithm"` 也不会绕过；
此限制只针对客户接口，Python 算法内部仍使用完整 24 路命令。

### 5.2 55 字节控制命令协议

| 索引 | 长度 | 内容 |
| --- | --- | --- |
| `0` | 1 | 帧头 `31`（`0x1F`） |
| `1..48` | 48 | 24 组 `[气囊编号, 档位]` |
| `49` | 1 | 工作模式：`0` 自动，`1` 手动。算法输出恒为 `0` |
| `50` | 1 | 方向：`0` 下行（控制器→气囊），`1` 上行 |
| `51..54` | 4 | 帧尾 `[170, 85, 3, 153]`（`0xAA 0x55 0x03 0x99`） |

```text
[31, 1, 档位1, 2, 档位2, 3, 档位3, ... , 24, 档位24, 0, 0, 170, 85, 3, 153]
```

档位取值：

| 值 | 含义 |
| --- | --- |
| `0` | 保持当前状态 |
| `1` | 1 档（慢速充/放气） |
| `2` | 2 档（中速） |
| `3` | 3 档（快速充气） |
| `4` | 初始档（快速放气） |

手动 API 可控编号：

| 编号 | 部位 |
| --- | --- |
| `3` | 右侧翼下 |
| `4` | 左侧翼下 |
| `5` | 腰托 1 |
| `6` | 腰托 2 |

编号 `1`、`2`、`7..24` 是算法协议保留通道，客户调用 `writeCommand` 时保持为 `0`。

### 5.3 `POST /carAdaptive/writeCommand`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `controlCommand` | `number[55]` | 是 | 完整 55 字节协议帧，每项为 `0..255` 整数 |
| `sensorId` | `1 \| 2` | 否 | 目标通道，省略时使用当前兼容投影通道；显式传其他值返回 `400` |

主驾 5、6 号腰托快速充气：

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/writeCommand \
  -H 'Content-Type: application/json' \
  -d '{
    "sensorId":1,
    "controlCommand":[31,
      1,0,2,0,3,0,4,0,5,3,6,3,7,0,8,0,9,0,10,0,11,0,12,0,
      13,0,14,0,15,0,16,0,17,0,18,0,19,0,20,0,21,0,22,0,23,0,24,0,
      0,0,170,85,3,153]
  }'
```

控制副驾时把 `sensorId` 改为 `2`。手动快速放气时只能把 3、4、5、6 号填 `4`，其余 20 路仍必须为 `0`；空操作（验证链路）全部填 `0`。

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "length": 55,
    "sensorId": 1,
    "allowedAirbagIds": [3, 4, 5, 6],
    "controlMode": "manual",
    "queued": true,
    "portPaths": ["COM3"]
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `length` | 后端实际接收到的字节数，可用来验证命令没被截断 |
| `sensorId` | 本次命令归属的通道 |
| `allowedAirbagIds` | 后端实际执行的客户手动气囊白名单 |
| `controlMode` | 目标通道当前模式，`auto` 表示本命令会被算法覆盖 |
| `queued` | 是否进入串口写队列。**不是硬件 ACK** |
| `portPaths` | 命令被排入哪些串口 |

### 5.4 调用边界（必读）

- 后端强制校验 55 字节长度、帧头、1..24 编号顺序、0..4 档位、下行方向和帧尾，并拒绝 1、2、7..24 号的非零档位。
- 校验不通过返回 HTTP `400` 和 `code: 1`，`message` 说明具体原因，例如
  `客户手动接口只允许控制 3、4、5、6 号气囊，7 号档位必须为 0`；此时**不写任何串口**。
- **返回 `code: 0` 不代表硬件已执行**，`queued` 也只表示进了队列。
- 目标通道还没记录来源串口时，会尝试写到**所有已打开的 `carAir` 串口**。
- **没有可用串口时接口仍可能返回成功**，但不产生任何物理写入。
- 串口异步写入错误只记录后端日志，**不会回写到本次 HTTP 响应**。

下发前建议先确认通道在线：

```bash
curl http://127.0.0.1:19245/carAdaptive/sensors
```

「命令下发了但气囊没动」的排查顺序：

1. `GET /carAdaptive/sensors` 看目标通道 `online` 是否为 `true`。
2. `GET /getPort`、`GET /connPort` 确认串口已连接。
3. 检查命令长度是否为 55、帧头 `31`、帧尾 `[170, 85, 3, 153]`。
4. `GET /carAdaptive/commands/history?sensorId=1` 检查算法下发、接口写串口和 ECU 回传三类记录。
5. `GET /carAdaptive/mode?sensorId=1` 确认目标通道不是 `auto`。
6. 查后端控制台日志里的串口写错误。

界面不亮但命令正常的另一种情况：目标通道不是当前显示的那一路，前端只渲染当前选中通道的快照。

### 5.5 `POST /carAdaptive/processFrame`

把 144 点压力直接喂给后端算法实例，可选顺手写回串口。适用于数据不是来自本机串口的场景（回放、外部采集卡、仿真）。

| 字段 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `sensorData` | `number[144]` | 是 | — | 压力值 `0..255` |
| `sensorId` | `1 \| 2` | 否 | 当前投影通道 | 目标算法实例 |
| `writeSerial` | `boolean` | 否 | `false` | 是否把返回的 `control_command` 写回串口 |

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/processFrame \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":1,"writeSerial":false,"sensorData":[50,50,"...共 144 项"]}'
```

`data` 为该路算法结果，字段见 [7.3](#73-algordata-字段)。同时广播 `carAdaptiveSensorsData`。

`sensorData` 不是 144 项时返回 `code=1`，`message` 为 `sensorData must be an array with 144 numbers`。

---

## 6. 气囊指令历史与回传诊断

### 6.1 `GET /carAdaptive/commands/history`

| 查询参数 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `sensorId` | 否 | 当前投影通道 | `1` 或 `2` |
| `type` | 否 | 全部 | 见下表；`all` 或省略表示全部 |
| `limit` | 否 | `200` | `1`-`1000` |

| `type` | 含义 |
| --- | --- |
| `algorithmGenerated` | 算法生成的命令 |
| `algorithmSent` | 算法实际写入串口的命令 |
| `ecuFeedback` | ECU 回传帧 |
| `apiSerial` | 接口 `writeCommand` 写串口 |
| `apiDisplay` | 接口 `display` 覆盖界面展示 |

```bash
# 主驾全部来源，最新 200 条
curl "http://127.0.0.1:19245/carAdaptive/commands/history?sensorId=1&limit=200"

# 副驾只查 ECU 回传
curl "http://127.0.0.1:19245/carAdaptive/commands/history?sensorId=2&type=ecuFeedback&limit=200"
```

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "sensorId": 1,
    "role": "主",
    "type": "all",
    "limit": 200,
    "total": 512,
    "counts": {
      "all": 512,
      "algorithmGenerated": 240,
      "algorithmSent": 240,
      "ecuFeedback": 28,
      "apiSerial": 3,
      "apiDisplay": 1
    },
    "records": [
      {
        "id": "1-7742",
        "sequence": 7742,
        "sensorId": 1,
        "role": "主",
        "type": "apiSerial",
        "command": [31, 1, 0, "...共 55 项"],
        "length": 55,
        "gears": [0, 0, 0, 0, 3, 3, "...共 24 项"],
        "stamp": 1785306916763,
        "source": "api",
        "target": "serial",
        "queued": true,
        "portPaths": ["COM3"]
      }
    ]
  }
}
```

| 记录字段 | 出现于 | 说明 |
| --- | --- | --- |
| `id` / `sequence` | 全部 | 记录标识和顺序号 |
| `command` / `length` | 全部 | 原始字节和长度 |
| `gears` | 全部 | 提取出的 24 路档位 |
| `stamp` | 全部 | 毫秒时间戳 |
| `source` | 全部 | `algorithm` / `api` / `ecu` |
| `target` | `apiSerial` / `apiDisplay` | `serial` 写串口，`display` 只改界面 |
| `queued` / `portPaths` | `algorithmSent` / `apiSerial` | 是否入队、写到哪些串口 |
| `trusted` / `wireCommand` / `portPath` | `ecuFeedback` | 是否通过全部校验、还原成 55 字节的完整帧、来源串口 |
| `active` / `clearedAt` | `apiDisplay` | 覆盖是否仍生效、清除时间 |

`type` 传未知值返回 HTTP `400`。历史只保存在当前服务进程内存中，每个通道每种类型最多 500 条，服务退出后清空。

### 6.2 `DELETE /carAdaptive/commands/history/:sensorId`

| 查询参数 | 必填 | 说明 |
| --- | --- | --- |
| `type` | 否 | 只清该类型；省略清空全部 |

```bash
# 只清空主驾 ECU 回传历史
curl -X DELETE "http://127.0.0.1:19245/carAdaptive/commands/history/1?type=ecuFeedback"

# 清空副驾全部气囊指令历史
curl -X DELETE http://127.0.0.1:19245/carAdaptive/commands/history/2
```

响应在 [6.1](#61-get-caradaptivecommandshistory) 的结构上追加 `removed`（本次删除条数）。

清空历史**不会**改变算法模式、串口状态、真实气囊或展示覆盖。

### 6.3 `GET /carAdaptive/feedbackDiagnostics`

只读诊断接口，用于确认 ECU 是否回传气囊状态，以及回传帧的实际长度和布局。

背景：串口解析器的分隔符是 `[170, 85, 3, 153]`，正好是控制命令的帧尾。ECU 回传一条 55 字节命令帧时帧尾被分隔符消费，业务层收到的是剩下的 **51 字节**。

```bash
curl http://127.0.0.1:19245/carAdaptive/feedbackDiagnostics
```

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "feedbackFrameLength": 51,
    "delimiter": [170, 85, 3, 153],
    "feedbackSource": "ecu",
    "feedbackTimeoutMs": 2000,
    "observedFeedback": true,
    "sensors": [
      {
        "sensorId": 1,
        "role": "主",
        "portPath": "COM3",
        "feedbackOnline": true,
        "feedbackStamp": 1785306916763,
        "feedbackMode": 0,
        "gears": [0, 0, 0, 0, 3, 3, "...共 24 项"],
        "display": { "source": "ecu", "override": false, "available": true }
      }
    ],
    "ports": {
      "COM3": {
        "type": "carAir",
        "portOpen": true,
        "lengthCounts": { "51": 128 },
        "feedbackFrames": 128,
        "lastFeedback": {
          "at": 1785306916763,
          "frameHeader": 31,
          "headerMatches": true,
          "airbagIdsMatch": true,
          "mode": 0,
          "modeLabel": "auto",
          "direction": 1,
          "isUpstream": true,
          "trusted": true,
          "appliedSensorIds": [1],
          "sharedPort": false,
          "gears": [0, 0, 0, 0, 3, 3, "...共 24 项"]
        },
        "samples": {}
      }
    }
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `observedFeedback` | 是否观察到符合回传格式的帧。**判断 ECU 有没有回传就看这一个字段** |
| `feedbackSource` | 当前反馈数据源，`ecu` 或 `command` |
| `feedbackTimeoutMs` | 回传中断判定时长，当前为 `2000` |
| `sensors[]` | 主副两路的 `portPath`、`feedbackOnline`、`feedbackStamp`、`feedbackMode`、当前 24 路档位、展示状态和命令诊断 |
| `lengthCounts` | 各长度未识别帧的累计条数。回传帧长度不是 51 时，从这里能看出实际长度 |
| `feedbackFrames` | 符合 51 字节回传格式的帧累计条数 |
| `headerMatches` / `airbagIdsMatch` | 帧头是否为 `31`、编号位是否依次为 `1..24` |
| `mode` / `direction` | 第 49、50 字节。`direction === 1` 表示上行，即确实是 ECU 发回来的 |
| `trusted` | 该帧是否通过全部校验并被采用为气囊状态 |
| `appliedSensorIds` | 该帧被归属到哪几路 |
| `sharedPort` | 主副驾是否共用该串口导致无法区分 |
| `samples` | 每种未识别长度保留一条前 24 字节样本，便于比对未知协议 |

只统计未被业务分支处理的帧，145 字节传感器帧不会出现在这里。后端同时会按串口节流打印诊断日志（每 5 秒最多一条）。

**回传通道归属**：回传帧本身**不含主副驾标识**，只能按来源串口归属。主副驾共用同一串口时无法区分，两路都会写入并在 `sharedPort` 标记。

**回传模式位不参与控制**：第 49 字节只记录在 `feedbackMode` 里做诊断，**不会**改变 `/carAdaptive/mode`。因为下发命令的模式位恒为 `0`，跟随它会把软件开关强行拉回自动。

**回传被丢弃的情况**：方向位不为 `1`、帧头不为 `31`、编号布局不是 `1..24`、档位越界。丢弃的帧不作为气囊状态使用。

---

## 7. 传感器与算法数据

### 7.1 `GET /carAdaptive/sensors`

主副两路运行摘要，不含 144 点数组，适合轮询。

```bash
curl http://127.0.0.1:19245/carAdaptive/sensors
```

```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "sensorId": 1,
      "role": "主",
      "online": true,
      "stamp": 1753670000000,
      "HZ": 20,
      "algorithmReady": true,
      "frameCount": 1234,
      "feedbackOnline": true,
      "feedbackStamp": 1753670000000,
      "controlMode": "auto",
      "airbagDisplayAvailable": true,
      "airbagDisplaySource": "ecu",
      "airbagDisplayOverride": false
    },
    {
      "sensorId": 2,
      "role": "副",
      "online": false,
      "stamp": 0,
      "HZ": null,
      "algorithmReady": false,
      "frameCount": 0,
      "feedbackOnline": false,
      "feedbackStamp": 0,
      "controlMode": "manual",
      "airbagDisplayAvailable": false,
      "airbagDisplaySource": "none",
      "airbagDisplayOverride": false
    }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `online` | 最近一帧压力数据距今小于 `1000 ms` |
| `stamp` / `HZ` | 最近一帧时间戳和当前接收频率 |
| `algorithmReady` / `frameCount` | 是否已有算法结果、该路累计帧数 |
| `feedbackOnline` | 最近一条 ECU 气囊状态回传距今小于 `2000 ms` |
| `feedbackStamp` | 最近一条 ECU 回传的毫秒时间戳 |
| `controlMode` | 该路独立的自适应开关状态 |
| `airbagDisplayAvailable` / `airbagDisplaySource` / `airbagDisplayBaseSource` / `airbagDisplayOverride` / `airbagDisplayOverrideAirbagIds` | 四路 API 与其余 20 路 ECU 合并后的界面状态，见 [4.1](#41-逐通道合并规则) |

`online` 和 `feedbackOnline` 相互独立：串口在线但 ECU 不回传时，`online=true` 而 `feedbackOnline=false`。

### 7.2 `GET` / `POST /carAdaptive/sensor`

旧版单路兼容投影。新集成应改用 WebSocket 的 `carAdaptiveSensorsData` 在本地选择通道。

```bash
curl http://127.0.0.1:19245/carAdaptive/sensor

curl -X POST http://127.0.0.1:19245/carAdaptive/sensor \
  -H 'Content-Type: application/json' -d '{"sensorId":2}'
```

`data` 为 `{ sensorId, role, displayOnly: true }`。切换只影响兼容投影和单路 `algorData` 推送，**不会**停止、清空或重置任何一路算法。

### 7.3 `algorData` 字段

`POST /carAdaptive/processFrame` 的响应，以及 WebSocket 快照中的 `algorData`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `control_command` | `number[55] \| null` | 控制命令；`null` 表示本帧无需下发 |
| `living_status` | `string` | `活体` / `静物` / `检测中` / `离座` / `未启用` |
| `body_type` | `string` | `大人` / `小孩` / `静物` / `未判断` |
| `seat_state` | `string` | `OFF_SEAT` / `CUSHION_ONLY` / `ADAPTIVE_LOCKED` / `RESETTING` |
| `cushion_sum` / `backrest_sum` | `number` | 坐垫 / 靠背中间矩阵压力总和 |
| `living_confidence` | `number` | 活体置信度 `0.0..1.0` |
| `body_features` | `object` | 体型检测特征；未启用为 `{}` |
| `control_decision_data` | `object` | `lumbar` / `side_wings` / `leg_support` 三组决策详情，含 `action`（`INFLATE` / `DEFLATE` / `HOLD`） |
| `living_detection_data` | `object` | 活体状态机详情 |
| `frame_count` | `number` | 该路累计帧数 |
| `sensor_id` / `sensor_role` | `1\|2` / `主\|副` | 来源通道 |

只有 `seat_state = ADAPTIVE_LOCKED` 时算法才会真正调节气囊，`CUSHION_ONLY` 阶段在做活体和体型判断。

---

## 8. WebSocket 消息

### 8.1 连接

```text
ws://127.0.0.1:19999?role=data&clientId=my-client
```

| 查询参数 | 默认 | 说明 |
| --- | --- | --- |
| `role` | `data` | 业务显示端用 `ui-display`，会计入 `displayClients` |
| `clientId` | `ip+port` | 客户端标识，用于状态上报归属 |

连接建立后立即依次推送：空对象、`carAdaptiveSensor`、`carAdaptiveSensors`、`carAdaptiveControlMode`、`carAdaptiveSensorsData`、`carAdaptiveHistoryState`。所有消息是 JSON 文本，按顶层键区分类型。

```javascript
const socket = new WebSocket('ws://127.0.0.1:19999');

socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (!Array.isArray(message.carAdaptiveSensorsData)) return;

  const driver = message.carAdaptiveSensorsData.find((item) => item.sensorId === 1);
  const passenger = message.carAdaptiveSensorsData.find((item) => item.sensorId === 2);

  console.log('主驾 144 点压力:', driver?.sitData?.carAir?.arr);
  console.log('主驾 24 路气囊展示:', driver?.algorFeed, driver?.airbagDisplaySource);
  console.log('副驾算法:', passenger?.algorData);
};
```

### 8.2 `carAdaptiveSensorsData`（主要数据源）

主副两套完整快照一起推，调用方各自缓存、本地切换展示：

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
          "arr": [0, 12, 35, "... 共 144 项"],
          "stamp": 1753670000000,
          "HZ": 20
        }
      },
      "algorData": { "control_command": ["...55 项"], "seat_state": "ADAPTIVE_LOCKED", "frame_count": 1234 },
      "algorFeed": [0, 0, 0, 0, 3, 3, "... 共 24 项"],
      "feedbackOnline": true,
      "feedbackStamp": 1753670000000,
      "feedbackSource": "ecu",
      "airbagDisplayAvailable": true,
      "airbagDisplaySource": "ecu",
      "airbagDisplayOverride": false,
      "airbagDisplayStamp": 1753670000000,
      "airbagCommands": {
        "algorithmGenerated": {}, "algorithmSent": {}, "ecuFeedback": {}, "apiSerial": {}, "apiDisplay": {}
      },
      "controlMode": "auto"
    },
    { "sensorId": 2, "role": "副", "sitData": { "carAir": { "status": "offline" } }, "algorData": null, "algorFeed": [], "controlMode": "manual" }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `sitData.carAir.arr` | 144 点压力数组 |
| `algorData` | 该路算法结果，字段见 [7.3](#73-algordata-字段) |
| `algorFeed` | 当前有效的 24 路展示档位，来源看 `airbagDisplaySource` |
| `feedbackOnline` / `feedbackStamp` | 只表示 ECU 真实回传，不受展示覆盖影响 |
| `feedbackSource` | 后端配置的反馈数据源，`ecu` 或 `command` |
| `airbagDisplayAvailable` / `airbagDisplaySource` / `airbagDisplayBaseSource` / `airbagDisplayOverride` / `airbagDisplayOverrideAirbagIds` / `airbagDisplayStamp` | 四路 API 与其余 20 路 ECU 合并后的展示状态，见 [4.1](#41-逐通道合并规则) |
| `airbagCommands` | 五类最近命令诊断，字段同 [6.1](#61-get-caradaptivecommandshistory) 的记录 |
| `controlMode` | 生成该快照时该路的自适应开关状态 |

144 点布局：靠背 72 点 + 坐垫 72 点，每块为左侧翼 `1×4`（索引 `0-3`）、右侧翼 `1×4`（`4-7`）、中心区 `8×8`（`8-71`）。

### 8.3 其他消息

| 顶层键 | 触发时机 | 内容 |
| --- | --- | --- |
| `carAdaptiveSensors` | 状态变化和周期广播 | 与 `GET /carAdaptive/sensors` 相同的摘要数组 |
| `carAdaptiveControlMode` | 连接建立时、模式切换时 | 与 `GET /carAdaptive/mode` 相同的模式状态 |
| `carAdaptiveSensor` | 兼容投影切换 | `{ sensorId, role, displayOnly }` |
| `carAdaptiveUiCommand` | 远程 UI 命令下发 | 已广播命令，含 `action`、`sequence`，`return-home` 可能带 `homeUrl` |
| `carAdaptiveUiState` | 随命令一起广播 | 与 `GET /carAdaptive/ui/state` 相同 |
| `algorData` / `algorFeed` | 兼容单路推送 | 当前投影通道的算法结果和展示档位 |
| `sitData` | 实时数据、回放 | 压力数据映射；回放时附带 `carAdaptiveHistoryFrame=true`、`index`、`timestamp` |
| `carAdaptiveHistoryState` | 载入或取消回放 | `{ active, name?, length? }`；`active=false` 后恢复双路实时展示 |
| `playEnd` | 回放开始 / 结束 | `true` 开始，`false` 结束 |
| `contrastData` | 对比数据载入 | `{ left, right }` |

### 8.4 客户端上报

客户端可向后端发送两类 JSON 消息，非 JSON 和未知 `type` 会被忽略：

```json
{ "type": "carAdaptiveUiReport", "view": "module", "selectedSensorId": 1 }
{ "type": "carAdaptiveUiAcknowledgement", "commandId": "...", "ok": true }
```

`carAdaptiveUiReport` 的 `view` 变化会触发模式自动切换，见 [3.4](#34-模式跟随页面自动切换)。

---

## 9. 远程控制页面

用于 SDK 作为客户主程序中的一个模块时，由局域网内另一台设备（通常是 iPad）控制：返回主页、打开模块、打开原始数据页、切换主副驾展示。

**主副驾切换只影响前端展示**，两路串口数据、算法实例和控制命令始终独立运行。

**页面跳转会影响算法**：`return-home` 会把两路切为 `paused`；`open-module` 分别恢复两路暂停前的模式；`open-raw-serial` 是只读观察页，不改变模式。串口采集始终不受影响。需要强制指定最终状态时，再调 `POST /carAdaptive/mode`。

### 9.1 `GET /carAdaptive/ui/state`

```bash
curl http://192.168.1.20:19245/carAdaptive/ui/state
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `selectedSensorId` | `1 \| 2` | 当前展示通道 |
| `view` | `string` | `host-home` / `module` / `raw-serial` / `other` |
| `sequence` | `number` | 命令序号 |
| `lastCommand` / `lastAcknowledgement` / `lastClientReport` | `object \| null` | 最近命令、回执、页面上报 |
| `tokenRequired` | `boolean` | 是否配置了控制令牌 |
| `homeUrlConfigured` | `boolean` | 是否配置了主页地址 |
| `displayClients` / `webSocketClients` | `number` | 显示端 / 总连接数 |
| `lanAddresses` | `string[]` | 可访问的 IPv4 地址，物理网卡优先 |
| `httpPort` / `webSocketPort` | `number` | 服务端口 |

### 9.2 `POST /carAdaptive/ui/command`

| `action` | 附加字段 | 效果 |
| --- | --- | --- |
| `return-home` | — | 页面返回宿主主页；配置了主页地址时命令里会带 `homeUrl` |
| `open-module` | — | 打开汽车自适应业务模块 |
| `open-raw-serial` | — | 打开 `#/raw-serial` 串口原始数据页 |
| `select-sensor` | `sensorId` 必填 | 切换主副驾展示 |

```bash
# 切换到副驾展示
curl -X POST http://192.168.1.20:19245/carAdaptive/ui/command \
  -H 'Content-Type: application/json' \
  -H 'X-JQTools-Control-Token: customer-secret' \
  -d '{"action":"select-sensor","sensorId":2}'

# 切换到主驾展示
curl -X POST http://192.168.1.20:19245/carAdaptive/ui/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"select-sensor","sensorId":1}'

# 返回宿主页
curl -X POST http://192.168.1.20:19245/carAdaptive/ui/command \
  -H 'Content-Type: application/json' -d '{"action":"return-home"}'

# 打开自适应模块
curl -X POST http://192.168.1.20:19245/carAdaptive/ui/command \
  -H 'Content-Type: application/json' -d '{"action":"open-module"}'

# 打开原始数据模块
curl -X POST http://192.168.1.20:19245/carAdaptive/ui/command \
  -H 'Content-Type: application/json' -d '{"action":"open-raw-serial"}'
```

成功响应 `data` 为 `{ command, state }`，同时向所有 WebSocket 客户端广播 `carAdaptiveUiCommand` 和 `carAdaptiveUiState`。

错误码：`400` 表示 `action` 非法或 `select-sensor` 缺少合法 `sensorId`；`401` 表示令牌不匹配。

页面执行命令后会回传 `carAdaptiveUiAcknowledgement`，可从 `GET /carAdaptive/ui/state` 的 `lastAcknowledgement` 读到执行结果。

### 9.3 页面控制端

不写代码时可以直接用页面。

**同界面控制**：另一台设备打开和宿主里同一份业务界面，操作即广播。

```text
http://<SDK电脑IP>:19245/app?remoteControl=1&showTitle=1
```

- 点「主驾 / 副驾」分段按钮 → 广播 `select-sensor`
- 点左上角品牌标识 → 广播 `return-home`
- 从原始数据页返回 → 广播 `open-module`
- 不带 `remoteControl=1` 的普通 `/app` 只切换本页面，不广播

**接口调试页**：本文档的接口都可以在这个页面上点着调，不用写代码。每次调用都显示完整请求地址、请求体、HTTP 状态码、耗时和原始响应，可直接照抄成自己的调用。

```text
http://<SDK电脑IP>:19245/app#/api-debug
```

| 区块 | 能力 | 对应接口 |
| --- | --- | --- |
| 服务与串口 | 健康检查、串口列表、一键连接、设备识别 | `/health`、`/getPort`、`/connPort`、`/sendMac` |
| 主副驾自适应 | 按 `sensorId` 单独开启 / 关闭 / 暂停，查询两路状态 | [3.2](#32-get-caradaptivemode)、[3.3](#33-post-caradaptivemode)、`/carAdaptive/sensors` |
| 真实气囊命令 | 点选 3/4/5/6 号档位，自动拼出 55 字节并写串口，可复制命令 | [5.3](#53-post-caradaptivewritecommand) |
| 气囊展示覆盖 | API 控制 3/4/5/6 号，其他 20 路保留 ECU 状态；支持查询、清除和回传诊断 | [4.2](#42-get-caradaptivedisplay)、[4.3](#43-post-caradaptivedisplay)、[4.4](#44-delete-caradaptivedisplaysensorid)、[6.3](#63-get-caradaptivefeedbackdiagnostics) |
| 远程页面命令 | 切换显示通道、返回宿主页、打开模块和原始数据页 | [9.2](#92-post-caradaptiveuicommand) |
| 自定义请求 | 任填方法、路径和 JSON 请求体，调本文档任意接口 | 全部 |
| 请求记录 / 响应 | 保留本次会话的调用记录，可回看和复制响应 | — |

页面顶部可以直接改服务地址，也可以用 `apiBase` 预填。前端是 HashRouter，**`apiBase` 必须写在 `#` 前面**：

```text
http://<SDK电脑IP>:19245/app?apiBase=http://<SDK电脑IP>:19245#/api-debug
```

| 查询参数 | 说明 |
| --- | --- |
| `apiBase=<URL>` | 调试页要访问的 HTTP 服务根地址；省略时用当前页面来源。用一台设备调另一台 SDK 主机时填对方地址 |

页面顶部可填控制令牌，按会话保存（`sessionStorage`）并自动带上 `X-JQTools-Control-Token`。

**精简局域网控制页**：只做常用操作，适合现场平板。

```text
http://<SDK电脑IP>:19245/app#/remote-control
```

| 区块 | 能力 | 对应接口 |
| --- | --- | --- |
| 状态条 | 显示端数、当前页面、当前通道、气囊模式、主副驾在线 / 有回传、最近回执 | `/carAdaptive/ui/state`、`/carAdaptive/mode`、`/carAdaptive/sensors` |
| 页面控制 | 返回宿主页、自适应模块、原始数据 | `POST /carAdaptive/ui/command` |
| 显示通道 | 主驾 / 副驾切换 | `POST /carAdaptive/ui/command` |
| 气囊控制 | 目标通道、自动 / 手动 / 暂停模式、3/4/5/6 号气囊档位、「3-6 号保持」和「3-6 号放气」预设 | `POST /carAdaptive/mode`、`POST /carAdaptive/writeCommand` |
| 令牌 | 会话内保存控制令牌 | 请求头 `X-JQTools-Control-Token` |
| 执行状态 | 最近命令、命令编号、回执时间、通道在线 / 频率 / 帧数、本机操作历史 | `/carAdaptive/ui/state`、`/carAdaptive/sensors` |

两个页面的真实串口手动控制和接口展示覆盖都只开放 `3`、`4`、`5`、`6` 号。展示覆盖不写串口，后端只替换这四路界面档位；其余 `1`、`2`、`7`–`24` 号始终由 ECU 回传点亮。

气囊区的「目标通道」独立于「显示通道」，可以显示主驾、控制副驾。气囊命令直接写串口，不要求显示端在线，只要求目标通道在线。

气囊指令历史在 `http://<SDK电脑IP>:19245/app#/raw-serial` 右侧「气囊指令 → 历史记录」查看，对应 [6.1](#61-get-caradaptivecommandshistory)。

访问不了先查：两台设备是否同一局域网、Windows 防火墙是否放行专用网络的 TCP `19245` 和 `19999`、服务是否在跑。

### 9.4 `return-home` 的落地

`return-home` 不假设主页是什么。后端只负责广播，页面收到后：

1. 在 WPF 宿主里 → 通过 WebView2 消息通知宿主控件，由宿主程序执行真正的导航。
2. 在普通浏览器里 → 触发 DOM 事件 `jqtools:car-adaptive-home-requested`，并向父窗口 postMessage 同名对象。
3. 无宿主处理 → 回到 SDK 模块首页 `/`。

主页地址优先级：页面 `homeUrl` 查询参数 > 后端 `JQTOOLS_HOME_URL` 广播的 `HomeUrl` > SDK 模块首页。

单台设备要用不同主页时在该设备 URL 上覆盖：

```text
http://192.168.1.20:19245/app?remoteControl=1&homeUrl=https%3A%2F%2Fipad.example%2Fhome
```

---

## 10. 数据采集与回放

采集是**单一全局任务**，主界面和 `#/raw-serial` 原始数据页共享同一状态。开始采集时后端会自动退出历史回放，并把本次 `sensorId` 固定到整个采集段；之后切换页面显示的主副驾不会改变正在存储的通道。

### 10.1 采集

| 接口 | 请求体 | 说明 |
| --- | --- | --- |
| `GET /carAdaptive/collection` | — | 查询是否采集中、名称、主副驾、起止时间、已保存帧数 |
| `POST /startCol` | `{ fileName, sensorId, select }` | 开始采集；已在采集时返回当前状态；没有可采集串口返回 `code=1` |
| `GET /endCol` | — | 停止采集并返回最终状态 |
| `GET /getColHistory` | — | 最近 500 条记录的 `date`、`timestamp`、`select` |

```bash
curl http://127.0.0.1:19245/carAdaptive/collection

# 采集副驾；主驾改为 sensorId=1
curl -X POST http://127.0.0.1:19245/startCol \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":2,"fileName":"副驾测试"}'

curl http://127.0.0.1:19245/endCol
```

### 10.2 `GET /carAdaptive/collection/export`

直接从 SQLite 读取指定采集段的原始 145 字节帧，不经过算法、滤波或点图插值。

| 查询参数 | 必填 | 说明 |
| --- | --- | --- |
| `fileName` | 否 | 采集段名称；省略时用最近一次采集名 |
| `sensorId` | 否 | 只导出该路 |

```powershell
curl.exe -OJ "http://127.0.0.1:19245/carAdaptive/collection/export?fileName=%E5%89%AF%E9%A9%BE%E6%B5%8B%E8%AF%95&sensorId=2"
```

CSV 每行一帧，字段固定为 `frameIndex,timestamp,datetime,sensorId,p0...p143`，即 4 个元数据字段和 144 个原始压力字节，UTF-8 带 BOM。响应头 `X-JQTools-Frame-Count` 返回导出帧数。名称不存在或筛选后没有有效帧时返回 HTTP `404`。

### 10.3 回放

| 接口 | 请求体 | 说明 |
| --- | --- | --- |
| `POST /getDbHistory` | `{ time }` | 按 `date` 载入整段，返回 `{ length, pressArr, areaArr, skippedRows, playbackHz }` 并推送第一帧 |
| `POST /getDbHistoryPlay` | — | 开始回放；未载入数据返回 `code=1` |
| `POST /getDbHistoryStop` | — | 暂停回放 |
| `POST /cancalDbPlay` | — | 取消回放并清空已载入数据 |
| `POST /changeDbplaySpeed` | `{ speed }` | 推送频率为 `原始频率 × speed` |
| `POST /getDbHistoryIndex` | `{ index }` | 跳转并立即推送；未载入数据返回 `code=555` |
| `POST /downlaod` | `{ fileArr }` | 导出 CSV 到 `data/`；自动替换 Windows 非法文件名字符；空数组返回 `code=555` |
| `POST /delete` | `{ fileArr }` | 删除采集记录 |
| `POST /changeDbName` | `{ newDate, oldDate }` | 重命名采集日期 |
| `POST /getCsvData` | `{ fileName }` | 读取 CSV 文件内容 |

回放数据通过 WebSocket 的 `carAdaptiveHistoryState`、`sitData`（附带 `carAdaptiveHistoryFrame`、`index`、`timestamp`）和 `playEnd` 推送。损坏 JSON 会跳过并通过 `skippedRows` 报告，单帧记录默认按 `12 Hz` 回放。

**回放共享单一全局游标，同一时间只支持一路回放。**

---

## 11. 算法参数

### 11.1 `GET /algorithm/config`

返回参数树，每个叶子含当前值和 YAML 中文注释。

```bash
curl http://127.0.0.1:19245/algorithm/config
```

### 11.2 `POST /algorithm/config`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `changes` | `object` | 是 | 非空对象，键为参数路径，值为新参数值 |

```bash
curl -X POST http://127.0.0.1:19245/algorithm/config \
  -H 'Content-Type: application/json' \
  -d '{
    "changes": {
      "lumbar.back_total_threshold": 25.0,
      "side_wings.left_right_ratio_inflate_left": 0.7,
      "integrated_system.init_inflate.cycles": 26
    }
  }'
```

Python 落盘后会**重建主副两套算法实例**使参数立即生效，即参数修改同时作用于主驾和副驾。响应 `data` 为 `{ result, config }`。

`changes` 缺失、非对象、为数组或空对象返回 `code=1`，`message` 为 `changes 必须是非空参数对象`。

### 11.3 兼容接口

| 接口 | 说明 |
| --- | --- |
| `GET /getPyConfig` | 旧版读取参数，等价于 `GET /algorithm/config` |
| `POST /changePy` | 旧版单参数修改，请求体 `{ path, value }`，`value` 为 JSON 字符串 |

新集成用 `/algorithm/config`。

---

## 12. 环境变量与安全边界

### 12.1 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `JQTOOLS_HTTP_PORT` | `19245` | HTTP 端口 |
| `JQTOOLS_WS_PORT` | `19999` | WebSocket 端口 |
| `JQTOOLS_REMOTE_CONTROL_TOKEN` | 空 | 远程控制令牌，空表示不校验 |
| `JQTOOLS_HOME_URL` | 空 | 随 `return-home` 广播的主页地址 |
| `JQTOOLS_CONTROL_MODE` | `auto` | 启动时主副两路的自适应开关，可设为 `manual` 或 `paused` |
| `JQTOOLS_AIRBAG_FEEDBACK_SOURCE` | `ecu` | 气囊反馈数据源。设为 `command` 时 `algorFeed` 回落到最近一次写入串口的命令 |
| `JQTOOLS_FRONTEND_BUILD_DIR` | `build/` | 前端资源目录 |

### 12.2 安全边界

- 服务默认只监听本机；供局域网设备访问时应限制在受控网络内。
- 除 `POST /carAdaptive/ui/command` 的可选令牌外，其余接口**无鉴权**。
- `POST /carAdaptive/writeCommand` 直接驱动气囊硬件；客户命令只允许 3、4、5、6 号为非零档位。
- `POST /getCsvData` 按传入路径读取本机文件，**不应暴露到不受信任的网络**。
