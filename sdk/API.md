# JQTools 汽车自适应 SDK 使用文档

本文档面向集成方，重点说明三件事：

1. [怎么用 SDK](#2-怎么用-sdk)
2. [怎么控制气囊并写入串口](#3-控制气囊与串口写入)
3. [怎么远程控制 SDK 页面](#4-远程控制-sdk-页面)

后半部分是完整的 HTTP / WebSocket 接口参考，日常集成不需要通读。

本文档只覆盖 SDK 业务链路真实使用的接口，不包含 `/fake/*`、`/airbag/send` 等假数据调试接口。

---

## 1. 先理解这条链路

```text
145 字节串口帧
  -> 第 1 字节传感器标识：1=主驾，2=副驾
  -> 后 144 字节压力数据
  -> 主、副两套完全独立的 Python 算法实例
  -> 各自生成 55 字节 control_command（气囊控制命令）
  -> 按来源串口排队写回硬件
  -> 同时通过 HTTP / WebSocket 输出给业务
```

两个关键认知：

- **主驾（`sensorId=1`）和副驾（`sensorId=2`）是两条完全独立的链路**，算法状态、帧计数、控制命令互不共享。页面切换主副驾只影响展示，不会暂停任何一路。
- **正常运行时气囊是全自动的**，后端每 500 ms 把算法结果写回串口。需要人工干预、标定、测试时，用 `POST /carAdaptive/mode` 切到手动模式，再自己调 `writeCommand`。

默认地址：

| 服务 | 地址 |
| --- | --- |
| HTTP REST | `http://127.0.0.1:19245` |
| WebSocket | `ws://127.0.0.1:19999` |
| 业务页面 | `http://127.0.0.1:19245/app` |

局域网设备访问时，把 `127.0.0.1` 换成 SDK 主机的 IPv4 地址（可从 `GET /carAdaptive/ui/state` 的 `lanAddresses` 读到）。

---

## 2. 怎么用 SDK

有三种集成方式，按你的宿主技术栈选一种。

| 方式 | 适用场景 | 你要写的代码 |
| --- | --- | --- |
| A. WPF 交付包 | 客户是 Windows 桌面程序，想直接嵌一个完整模块 | XAML 里放一个控件 |
| B. Node SDK 包 | 你的业务是 Node.js / Electron，要拿数据和控气囊 | `createClient()` |
| C. 裸 HTTP + WebSocket | 任意语言（C#、Python、Java、浏览器） | 直接请求接口 |

### 2.1 方式 A：WPF 控件嵌入

交付包 `netsdk/customer-sdk/` 自带 Node 运行时、Python 算法和前端，客户机不需要装任何环境。

直接运行：

```text
app\JqTools.CarAdaptive.ClientWpf.exe
```

或用脚本启动并配置主页地址、控制令牌：

```powershell
cd customer-sdk
powershell -ExecutionPolicy Bypass `
    -File .\scripts\start-wpf.ps1 `
    -HomeUrl "https://customer.example/home" `
    -RemoteControlToken "customer-secret"
```

嵌进你自己的 WPF 工程：

```xml
<jq:CarAdaptiveDebugControl
    x:Name="CarAdaptiveControl"
    AutoStartService="True"
    StopServiceOnUnload="True"
    StartupTimeoutSeconds="30"
    HomeUrl="https://customer.example/home"
    RemoteControlToken="customer-secret"
    HomeRequested="HandleCarAdaptiveHomeRequested" />
```

控件默认等待真实服务启动 30 秒，可通过 `StartupTimeoutSeconds` 调整。汽车自适应页首次加载、
从其他页面返回、收到 `open-module` 或 WebView 从隐藏状态恢复时，都会自动依次调用
`/connPort` 和 `/sendMac`，不需要用户再点“一键连接”；同一时刻的重复触发会合并为一次。
标题栏默认隐藏，页面右上角有一个 `48 × 48` 的不可见热区，点击可显示或隐藏；也可以用
`/app?showTitle=1` 默认打开。

`19245` 或 `19999` 被占用时，程序会保留窗口并提示端口冲突，关闭占用程序后点“重试”即可，不必重启。

### 2.2 方式 B：Node SDK 包

安装：

```bash
npm install ./sdk
# 或交付的 tarball
npm install ./jqtools-client-sdk-1.0.0.tgz
```

最小可用示例：

```javascript
const { createClient } = require('@jqtools/client-sdk');

// unwrap: true 时直接拿到 data，code 非 0 会抛 JqToolsError
const jqtools = createClient({ unwrap: true });

async function main() {
  await jqtools.health();                    // 1. 确认后端在跑
  await jqtools.connectCarAdaptivePorts();   // 2. 一键连接串口

  // 3. 订阅实时数据：主副两路快照一起推，本地自己选要显示哪一路
  jqtools.connectCarAdaptiveStream({
    onSensorData: (snapshots) => {
      const main = snapshots.find((item) => item.sensorId === 1);
      if (!main) return;
      render(main.sitData.carAir.arr);   // 144 点压力
      renderAirbags(main.algorFeed);     // 24 路气囊当前档位
      console.log(main.algorData?.living_status, main.algorData?.seat_state);
    },
    onSensorStatus: (status) => updateStatusBar(status),  // 在线、频率、帧数
    onError: (error) => console.error(error)
  });
}

main().catch((error) => console.error(error.message, error.payload));
```

构造参数：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `baseUrl` | `http://127.0.0.1:19245` | REST 地址 |
| `wsUrl` | `ws://127.0.0.1:19999` | WebSocket 地址 |
| `timeout` | `15000` | HTTP 超时，毫秒 |
| `unwrap` | `false` | `true` 时直接返回 `data`，`code` 非 `0` 抛错 |
| `pythonPath` | `JQTOOLS_PYTHON` 或 `python` | Python 可执行文件 |
| `algorithmScriptPath` | `sdk/python/app/server.py` | 算法入口 |
| `pythonTimeout` | 同 `timeout` | Python 调用超时 |
| `onPythonLog` | — | 接收 Python 非协议日志 |
| `fetch` | 全局 `fetch` | 兼容旧运行环境，需 Node 18+ |

方法与底层调用的对应关系：

| SDK 方法 | 实际调用 |
| --- | --- |
| `health()` | `GET /` |
| `listPorts()` | `GET /getPort` |
| `connectPorts()` / `connectCarAdaptivePorts()` | `GET /connPort` |
| `getCarAdaptiveSensors()` | `GET /carAdaptive/sensors` |
| `getCarAdaptiveSensor()` | `GET /carAdaptive/sensor` |
| `selectCarAdaptiveSensor(sensorId)` | `POST /carAdaptive/sensor` |
| `getCarAdaptiveCollection()` | `GET /carAdaptive/collection` |
| `startCarAdaptiveCollection(options)` | `POST /startCol` |
| `stopCarAdaptiveCollection()` | `GET /endCol` |
| `getCarAdaptiveCollectionExportUrl(options)` | 生成 `GET /carAdaptive/collection/export` 下载地址 |
| `exportCarAdaptiveCollection(options)` | `GET /carAdaptive/collection/export`，返回 CSV 字节 |
| `writeCarAdaptiveCommand(command, sensorId)` | `POST /carAdaptive/writeCommand` |
| `getControlMode(sensorId?)` | `GET /carAdaptive/mode` |
| `setControlMode(mode, options)` | `POST /carAdaptive/mode` |
| `getAirbagDisplay(sensorId?)` | `GET /carAdaptive/display` |
| `setAirbagDisplay(gears, sensorId)` | `POST /carAdaptive/display`，只改界面 |
| `clearAirbagDisplay(sensorId)` | `DELETE /carAdaptive/display/:sensorId` |
| `getAirbagCommandHistory(options)` | `GET /carAdaptive/commands/history` |
| `clearAirbagCommandHistory(options)` | `DELETE /carAdaptive/commands/history/:sensorId` |
| `processCarAdaptiveFrame(data, options)` | **本地 Python** `server`；`writeSerial: true` 时再调 `writeCommand` |
| `getPythonConfig()` / `setPythonParam()` / `callPythonFunction()` | **本地 Python** `getParam` / `setParam` / 任意函数 |
| `stopPythonAlgorithm()` | 结束本地 Python 进程 |
| `connectStream()` / `connectCarAdaptiveStream()` | WebSocket |
| `request(method, path, options)` | 任意未封装接口 |

> **重要区别**：带“本地 Python”的方法走的是 SDK 自己拉起的 Python 常驻进程，**不经过后端**。想改后端正在跑的那两套算法实例，必须用 `GET`/`POST /algorithm/config`，不要用 `setPythonParam`。

错误统一抛 `JqToolsError`，可能带 `status`、`code`、`payload`、`stderr`、`cause`：

```javascript
try {
  await jqtools.writeCarAdaptiveCommand(command, 1);
} catch (error) {
  console.error(error.message, error.code, error.payload);
}
```

SDK 也可以自己作为服务跑起来（提供算法 HTTP 接口和调试页）：

```bash
cd sdk && npm start        # 默认 127.0.0.1:19245 / 19999
```

可用环境变量：`JQTOOLS_SDK_HOST`、`JQTOOLS_SDK_HTTP_PORT`、`JQTOOLS_SDK_WS_PORT`、`JQTOOLS_PYTHON`、`JQTOOLS_ALGORITHM_SCRIPT`、`JQTOOLS_PYTHON_TIMEOUT`、`JQTOOLS_SDK_SHOW_PYTHON_LOG`。

### 2.3 方式 C：裸 HTTP + WebSocket

任何语言都能接。启动顺序固定：

```text
GET  /health                 确认服务在跑
GET  /getSystem              读系统类型和可视化配置（carAir 默认颜色上限 616）
GET  /getPort                看串口
GET  /connPort               一键连接
WS   ws://host:19999         订阅 carAdaptiveSensorsData
GET  /carAdaptive/sensors    确认目标通道 online: true
```

所有接口返回统一结构：

```json
{ "code": 0, "message": "success", "data": {} }
```

`code` 为 `0` 成功，`1` / `555` 失败。**注意大多数接口业务失败仍返回 HTTP 200**，必须判断 `code`，不能只看状态码。只有 `/carAdaptive/ui/command` 会返回 `400` / `401`。

---

## 3. 控制气囊与串口写入

### 3.1 三种控制模式

模式按 `sensorId` **主副驾独立保存和执行**。请求带 `sensorId` 时只改目标一路；旧客户端不传 `sensorId` 时仍兼容为主、副两路同时切换。

| 模式 | 算法 | 自动写串口 | 手动 `writeCommand` | 典型场景 |
| --- | --- | --- | --- | --- |
| **`auto`** | 运行 | 每 `500 ms` 写 | 允许，但会被覆盖 | 正常运行，在自适应模块页面时 |
| **`manual`** | 运行 | 不写 | 允许 | 产线标定、单气囊测试、外部策略接管 |
| **`paused`** | **暂停** | 不写 | 允许 | 离开自适应模块页面 |

三种模式都**不影响串口采集和压力数据推送**，暂停的只是算法。

`manual` 下算法继续跑：`algorData`、活体 / 体型 / 座椅状态继续推送，`frame_count` 继续累加，你能看到"算法本来想做什么"，但它不再下发。

`paused` 下算法完全停止：不再调用 Python，`algorData` 停止更新，`frame_count` 冻结。**气囊保持当前充气量不动**，不会自动放气。压力数据照常推送，所以原始数据页仍可正常使用。

`algorFeed` 是界面当前使用的 24 路档位，优先级为：接口展示覆盖、ECU 回传、可选命令回落。是否真的收到 ECU 回传必须看 `feedbackOnline`，不能只看 `algorFeed`。

**恢复到 `auto` 时的两种行为**：

| 来源 | 后端动作 | 响应字段 |
| --- | --- | --- |
| 从 `manual` 恢复 | 调 Python `resetMessage` 清空按摩状态，避免手动期间的按压被当成拍打触发信号 | `massageReset: true` |
| 从 `paused` 恢复 | 调 Python `resetSystem(sensor_id)`，只重建恢复运行的目标算法实例 | `algorithmReset: true` |

**在 `auto` 模式下调 `writeCommand` 不会被拒绝**，但你的命令会在下一个 500 ms 周期被算法命令覆盖。要让手动命令稳定生效，先切 `manual`。

`POST /carAdaptive/processFrame` 是显式提交，**不受 `paused` 影响**，暂停期间仍可调用。

### 3.1.1 模式跟随页面自动切换

后端会根据 SDK 页面当前视图自动切模式，不需要业务方手动调用：

| 页面视图 | 目标模式 | 说明 |
| --- | --- | --- |
| `module` 自适应模块主页 | 恢复各路原模式 | 主、副分别恢复暂停前的 `auto` 或 `manual` |
| `host-home` 宿主主页 | `paused` | 离开 SDK，暂停算法 |
| `raw-serial` 原始数据页 | 保持不变 | 观察压力和气囊命令，不干预算法 |
| `other` | `paused` | 同上 |

**只在视图真正发生变化时才切换。** 在模块页内切换主副驾会重复上报 `view=module`，不会打断你正在进行的手动标定 —— 也就是说页面上切到 `manual` 后，切主副驾、刷新状态都不会把你拉回 `auto`，只有真正离开再回来才会。

触发点有两个：`POST /carAdaptive/ui/command` 改变视图时，以及页面通过 WebSocket 上报 `carAdaptiveUiReport` 时。

`source` 字段会记为 `view`，可以据此区分是页面切换还是业务方主动调的接口。

两个注意点：

- **服务启动时默认 `auto`**，不等页面上报。这样纯接口集成（不用前端页面）也能正常工作。
- 如果宿主程序直接导航离开而**不发** `return-home` 命令、页面也不上报，后端无法感知页面已离开，模式会保持不变。这种情况用远程调试页手动切 `paused`。

### 3.2 切换模式：软件开关

**`GET /carAdaptive/mode?sensorId=1`** — 查询目标通道。响应顶层是目标通道，`sensors` 同时包含主、副两路状态：

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
    "changedAt": 1785305414424,
    "autoWrite": true,
    "commandIntervalMs": 500,
    "independent": true,
    "sensors": [
      { "sensorId": 1, "role": "主", "mode": "auto", "autoWrite": true },
      { "sensorId": 2, "role": "副", "mode": "manual", "autoWrite": false }
    ]
  }
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `mode` | `"auto" \| "manual" \| "paused"` | 当前模式 |
| `sensorId` / `role` | `1\|2` / `主\|副` | 顶层状态对应的目标通道 |
| `sensors` | `array` | 主、副两路独立模式状态 |
| `previousMode` | `string \| null` | 上一个模式，从未切换过为 `null` |
| `source` | `"default" \| "api" \| "view" \| "ecu"` | 谁改的：启动默认值 / 接口调用 / 页面视图切换 / 整车回传 |
| `reason` | `string` | 变更原因，最长 120 字符 |
| `sequence` | `number` | 变更次数，可用来判断状态是否比本地缓存新 |
| `changedAt` | `number` | 最近一次变更的毫秒时间戳 |
| `autoWrite` | `boolean` | 是否正在自动写串口，等价于 `mode === "auto"` |
| `algorithmRunning` | `boolean` | 算法是否在处理串口帧，等价于 `mode !== "paused"` |
| `commandIntervalMs` | `number` | 自动写入周期，当前为 `500` |
| `view` | `string` | 当前 SDK 页面视图，模式跟随它自动切换 |

**`POST /carAdaptive/mode`** — 切换模式：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `mode` | `string` | 是 | `auto` / `manual` / `paused`；也接受别名 `algor`、`handle`、`pause`、`stop` 和协议字节 `0` / `1` |
| `sensorId` | `1 \| 2` | 否 | 指定后只改主驾或副驾；不传时兼容旧接口并同时修改两路 |
| `reason` | `string` | 否 | 变更原因，会记入状态并广播，便于现场排查 |
| `source` | `string` | 否 | `api`（默认）/ `ecu`，未知来源回落到 `api` |

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":1,"mode":"manual","reason":"主驾产线标定"}'
```

```json
{
  "code": 0,
  "message": "控制模式已切换",
  "data": {
    "mode": "manual",
    "previousMode": "auto",
    "source": "api",
    "reason": "产线标定",
    "sequence": 1,
    "changedAt": 1785305431771,
    "autoWrite": false,
    "commandIntervalMs": 500,
    "changed": true,
    "massageReset": false
  }
}
```

| 附加字段 | 说明 |
| --- | --- |
| `changed` | 本次调用是否真的改变了模式 |
| `massageReset` | 从 `manual` 切回 `auto` 时是否成功清空了按摩状态 |
| `algorithmReset` | 从 `paused` 切回 `auto` 时是否成功重建了算法实例 |

两者 Python 调用失败时为 `false`，只记后端日志，不影响模式切换本身。

行为约定：

- **重复设置同一模式是幂等的**：返回 `code: 0`、`message: "控制模式未变化"`、`changed: false`，`sequence` 和 `changedAt` 都不变。可以安全地反复调用。
- `mode` 非法或缺失返回 **HTTP `400`**，`message` 为 `mode 只允许为 auto、manual、paused`。
- 每次真正切换都会向所有 WebSocket 客户端广播 `carAdaptiveControlMode`，并在后端日志打印 `[car-adaptive] control mode: auto -> manual (api)`。
- 新建 WebSocket 连接时会立即收到一条当前模式，不需要额外查询。
- 模式**不持久化**，后端重启回到 `auto`。需要默认手动启动时设置环境变量 `JQTOOLS_CONTROL_MODE=manual`。

也可以在[远程调试页](#41-两种控制端)的「气囊控制 → 控制模式」直接点按钮切换，等价于调这个接口。

Node SDK：

```javascript
await jqtools.getControlMode();
await jqtools.setControlMode('manual', { reason: '产线标定' });
// ... 手动下发命令 ...
await jqtools.setControlMode('auto');

// 订阅模式变化
jqtools.connectCarAdaptiveStream({
  onControlModeChange: (state) => {
    console.log('当前模式:', state.mode, '自动写入:', state.autoWrite);
  }
});
```

典型标定流程：

```javascript
await jqtools.setControlMode('manual', { reason: '腰托行程标定' });
try {
  await jqtools.writeCarAdaptiveCommand(buildControlCommand({ 5: 3, 6: 3 }), 1);
  await wait(3000);
  await jqtools.writeCarAdaptiveCommand(buildControlCommand({ 5: 4, 6: 4 }), 1);
} finally {
  await jqtools.setControlMode('auto');   // 务必恢复，否则算法一直不下发
}
```

> 协议第 49 字节的模式位与这个开关**无关**。算法输出的第 49 字节恒为 `0`，`protocol.mode_manual` 配置项没有被任何代码读取。这个开关控制的是"后端要不要自动写串口"，不是写进命令里的模式位。
>
> 后端同时保留了由 ECU 51 字节回传帧驱动的模式跟随逻辑（`source: 'ecu'`），但该分支目前整段注释停用。这一版没有物理按键，模式只能由接口切换。

### 3.3 55 字节控制命令协议

| 索引 | 长度 | 内容 |
| --- | --- | --- |
| `0` | 1 | 帧头 `31`（`0x1F`） |
| `1..48` | 48 | 24 组 `[气囊编号, 档位]` |
| `49` | 1 | 工作模式：`0` 自动，`1` 手动。算法输出恒为 `0`，手动模式当前未启用 |
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

气囊编号：

| 编号 | 部位 | 分组 |
| --- | --- | --- |
| `1` | 右侧翼上 | 右侧翼 |
| `2` | 左侧翼上 | 左侧翼 |
| `3` | 右侧翼下 | 右侧翼 |
| `4` | 左侧翼下 | 左侧翼 |
| `5` | 腰托 1 | 腰托 |
| `6` | 腰托 2 | 腰托 |
| `7` | 臀托 1 | 初始化充气 |
| `8` | 臀托 2 | 初始化充气 |
| `9` | 腿托 1 | 右腿托 |
| `10` | 腿托 2 | 左腿托 |
| `11..18` | 靠背按摩气囊 | 拍打按摩 |
| `19..24` | 坐垫按摩气囊 | 拍打按摩 |

入座时会自动初始化充气的气囊为 `5, 6, 7, 8, 1, 2, 3, 4`，共 26 个周期。

### 3.4 构造并下发命令

通用构造函数：

```javascript
/**
 * 构造 55 字节控制命令。
 * @param {Record<number, number>} gears 气囊编号到档位的映射，未指定的气囊为 0（保持）
 */
function buildControlCommand(gears = {}) {
  const command = [31];
  for (let airbagId = 1; airbagId <= 24; airbagId += 1) {
    command.push(airbagId, gears[airbagId] || 0);
  }
  command.push(0, 0, 170, 85, 3, 153);   // 模式=自动，方向=下行，帧尾
  return command;                         // 共 55 字节
}
```

常用命令：

```javascript
// 全部保持（空操作，可用于验证链路通不通）
const hold = buildControlCommand();

// 全部快速放气（急停 / 复位）
const deflateAll = buildControlCommand(
  Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, 4]))
);

// 只给腰托快速充气
const inflateLumbar = buildControlCommand({ 5: 3, 6: 3 });

// 左侧翼充气、右侧翼放气
const tiltLeft = buildControlCommand({ 2: 2, 4: 2, 1: 4, 3: 4 });
```

用 Node SDK 下发：

```javascript
await jqtools.writeCarAdaptiveCommand(inflateLumbar, 1);   // 1=主驾，2=副驾
```

用裸 HTTP 下发：

```javascript
const response = await fetch('http://127.0.0.1:19245/carAdaptive/writeCommand', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sensorId: 1, controlCommand: inflateLumbar })
});
```

用 PowerShell 下发：

```powershell
$command = @(31)
1..24 | ForEach-Object { $command += @($_, 0) }
$command += @(0, 0, 170, 85, 3, 153)

$body = @{ sensorId = 1; controlCommand = $command } | ConvertTo-Json -Depth 3
Invoke-RestMethod -Method Post -ContentType 'application/json' `
    -Uri 'http://127.0.0.1:19245/carAdaptive/writeCommand' -Body $body
```

成功响应：

```json
{ "code": 0, "message": "success", "data": { "length": 55, "sensorId": 1 } }
```

### 3.5 用算法结果直接驱动气囊

如果你的数据不是来自本机串口（回放、外部采集卡、仿真），可以把 144 点喂给算法，并让 SDK 顺手把结果写回串口：

```javascript
const result = await jqtools.processCarAdaptiveFrame(sensorData144, {
  sensorId: 1,
  writeSerial: true      // 算出 control_command 后自动调 writeCommand
});

console.log(result.living_status, result.seat_state, result.control_command);
```

走后端算法实例（会同时广播给所有前端）则用：

```javascript
await jqtools.request('POST', '/carAdaptive/processFrame', {
  body: { sensorData: sensorData144, sensorId: 1, writeSerial: true }
});
```

算法返回字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `control_command` | `number[55] \| null` | 控制命令；`null` 表示本帧无需下发 |
| `living_status` | `string` | `活体` / `静物` / `检测中` / `离座` / `未启用` |
| `body_type` | `string` | `大人` / `小孩` / `静物` / `未判断` |
| `seat_state` | `string` | `OFF_SEAT` / `CUSHION_ONLY` / `ADAPTIVE_LOCKED` / `RESETTING` |
| `cushion_sum` / `backrest_sum` | `number` | 坐垫 / 靠背中间矩阵压力总和 |
| `living_confidence` | `number` | 活体置信度 `0.0..1.0` |
| `body_features` | `object` | 体型检测特征；未启用为 `{}` |
| `control_decision_data` | `object` | `lumbar` / `side_wings` / `leg_support` 三组决策详情，含 `action`（`INFLATE`/`DEFLATE`/`HOLD`） |
| `living_detection_data` | `object` | 活体状态机详情 |
| `frame_count` | `number` | 该路累计帧数 |
| `sensor_id` / `sensor_role` | `1\|2` / `主\|副` | 来源通道 |

只有 `seat_state = ADAPTIVE_LOCKED` 时算法才会真正调节气囊，`CUSHION_ONLY` 阶段在做活体和体型判断。

### 3.6 调用边界（必读）

`writeCommand` 有几个必须知道的限制：

- 后端**只校验数组非空且每项是 `0..255` 整数，不校验长度必须为 55**。协议完整性由你保证，传错长度不会报错但硬件行为不可预期。
- **返回 `code: 0` 不代表硬件已执行**。响应中的 `queued` 才表示是否进入串口队列；它仍然不是硬件 ACK。
- 目标通道还没记录来源串口时，会尝试写到**所有已打开的 `carAir` 串口**。
- **没有可用串口时接口仍可能返回成功**，但不产生任何物理写入。
- 串口异步写入错误只记录后端日志，**不会回写到本次 HTTP 响应**。

所以生产调用前的检查顺序是：

```javascript
const sensors = await jqtools.getCarAdaptiveSensors();
const target = sensors.find((item) => item.sensorId === 1);
if (!target?.online) throw new Error('主驾通道离线，禁止下发气囊命令');
await jqtools.writeCarAdaptiveCommand(command, 1);
```

排查“命令下发了但气囊没动”：

1. `GET /carAdaptive/sensors` 看目标通道 `online` 是否为 `true`。
2. `GET /getPort` / `GET /connPort` 确认串口已连接。
3. 检查命令长度是否为 55、帧头 `31`、帧尾 `[170, 85, 3, 153]`。
4. 打开 `#/raw-serial` 的「气囊指令」，检查算法下发、接口写串口和 ECU 回传三类记录。
5. `GET /carAdaptive/mode?sensorId=1` 看目标通道是否处于 `auto`，标定时应先切 `manual`。
6. 查后端控制台日志里的串口写错误。

### 3.7 界面气囊亮暗的语义

默认情况下 `algorFeed` 由 ECU 回传驱动。调用展示接口后，`algorFeed` 会临时使用接口档位，`airbagDisplaySource` 变为 `api`；但 `feedbackOnline` 仍只表示真实 ECU 回传。

```text
算法 / 手动命令  --写入-->  串口  -->  ECU  --回传 51 字节-->  algorFeed  -->  界面亮暗
```

命令下发和状态回传仍是两件独立的事。展示覆盖只解决“ECU 不回传但需要由接口控制界面”的场景，不会伪造硬件 ACK。

自适应页面「区域调节」的 24 个气囊图标，判定条件是**档位严格等于 `3`（快速充气）**。档位 `0` 保持、`1` 慢速、`2` 中速、`4` 放气都不点亮。下发 `1`/`2` 档时硬件在动但界面无变化，这是预期行为。

未设置展示覆盖且未启用命令回落时，没有回传会让 `algorFeed` 为空数组、界面全部气囊熄灭：

| 情况 | 结果 |
| --- | --- |
| ECU 从不回传 | `algorFeed` 恒为空，界面恒灭 |
| 回传中断超过 `2000 ms` | `algorFeed` 置空，界面熄灭 |
| 串口未连接 | 同上 |
| 回传帧方向位不为 `1`，或帧头、编号布局不符 | 该帧被丢弃，不作为状态使用 |

回传是否在线可以从三个地方读到：`/carAdaptive/sensors` 和 WebSocket 快照的 `feedbackOnline`、`/carAdaptive/feedbackDiagnostics` 的完整诊断、远程调试页「通道状态」的「有回传 / 无回传」。

**通道归属**：回传帧本身**不含主副驾标识**，只能按来源串口归属，取 `portPath` 等于该串口的通道。主副驾共用同一串口时无法区分，两路都会写入，并在诊断的 `lastFeedback.sharedPort` 中标记。

**模式位不参与控制**：回传帧第 49 字节的模式位只记录在 `feedbackMode` 里做诊断，**不会**改变 `/carAdaptive/mode` 的状态。因为算法和手动命令下发的模式位恒为 `0`，跟随它会把软件手动开关强行拉回自动。

**兼容开关**：如果某批硬件确认不回传，可以设 `JQTOOLS_AIRBAG_FEEDBACK_SOURCE=command` 让 `algorFeed` 回落到最近一次写入串口的命令。这样界面不会全灭，但亮的含义退化为"已下发"，不能用来判断硬件真实状态。默认值是 `ecu`。

**接口直接控制展示**：

```bash
# 主驾第 1 个气囊点亮，其余熄灭；只改界面，不写串口
curl -X POST http://127.0.0.1:19245/carAdaptive/display \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":1,"gears":[3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}'

# 清除覆盖，恢复跟随 ECU
curl -X DELETE http://127.0.0.1:19245/carAdaptive/display/1
```

查询 `GET /carAdaptive/display?sensorId=1`。`source=api` 和 `override=true` 表示正在覆盖；界面目前只把档位 `3` 显示为点亮。

**气囊指令历史**：打开 `http://127.0.0.1:19245/app#/raw-serial`，右侧切到“气囊指令”，点击“历史记录”即可打开弹窗。弹窗按当前主驾/副驾显示算法生成、算法实际下发、ECU 回传、接口写串口和接口展示五类记录，支持筛选、自动刷新、查看完整字节/24 路档位和清空。

```javascript
const history = await jqtools.getAirbagCommandHistory({
  sensorId: 1,
  type: 'all',
  limit: 200
});

// 只清空主驾“接口写串口”历史；不会改变算法、串口或气囊状态
await jqtools.clearAirbagCommandHistory({ sensorId: 1, type: 'apiSerial' });
```

REST 调用为 `GET /carAdaptive/commands/history?sensorId=1&type=ecuFeedback&limit=200` 和 `DELETE /carAdaptive/commands/history/1?type=ecuFeedback`。`type` 可省略或使用 `algorithmGenerated`、`algorithmSent`、`ecuFeedback`、`apiSerial`、`apiDisplay`。历史只保存在当前服务进程内，每个通道每种类型最多 500 条，服务退出后清空。

界面不亮但命令正常的另一种情况：目标通道不是当前显示的那一路，前端只渲染当前选中通道的快照。

**界面会说明原因**：收不到回传时，自适应页面「区域调节」标题下方显示黄色提示「未收到气囊状态回传」，整块气囊图同时降低透明度表示状态未知，避免把熄灭误读成"硬件正常但未动作"。远程调试页的「通道状态」也会显示「有回传 / 无回传」。

### 3.8 `GET /carAdaptive/feedbackDiagnostics`

诊断接口，用于在真实硬件上确认 ECU 是否回传气囊状态，以及回传帧的实际长度和布局。

背景：串口解析器的分隔符是 `[170, 85, 3, 153]`，正好是控制命令的帧尾。因此 ECU 回传一条 55 字节命令帧时，帧尾被分隔符消费，业务层收到的是剩下的 **51 字节**。

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "feedbackFrameLength": 51,
    "delimiter": [170, 85, 3, 153],
    "observedFeedback": true,
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
          "gears": [0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        "samples": {}
      }
    }
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `observedFeedback` | 是否观察到符合回传格式的帧。判断 ECU 有没有回传就看这一个字段 |
| `feedbackSource` | 当前反馈数据源，`ecu` 或 `command` |
| `feedbackTimeoutMs` | 回传中断判定时长，当前为 `2000` |
| `sensors[]` | 主副两路的 `portPath`、`feedbackOnline`、`feedbackStamp`、`feedbackMode` 和当前 24 路档位 |
| `lengthCounts` | 各长度未识别帧的累计条数。回传帧长度不是 51 时，从这里能看出实际长度 |
| `feedbackFrames` | 符合 51 字节回传格式的帧累计条数 |
| `headerMatches` / `airbagIdsMatch` | 帧头是否为 `31`、编号位是否依次为 `1..24`，用于确认回传沿用下行命令布局 |
| `mode` / `direction` | 第 49、50 字节。`direction === 1` 表示上行，即这确实是 ECU 发回来的 |
| `lastFeedback.trusted` | 该帧是否通过全部校验并被采用为气囊状态 |
| `lastFeedback.appliedSensorIds` | 该帧被归属到哪几路 |
| `lastFeedback.sharedPort` | 主副驾是否共用该串口导致无法区分 |
| `gears` | 回传的 24 路真实档位 |
| `samples` | 每种未识别长度保留一条前 24 字节样本，便于比对未知协议 |

后端同时会按串口节流打印诊断日志（每 5 秒最多一条）。WPF 宿主看不到控制台时用这个接口。

只统计未被业务分支处理的帧，145 字节传感器帧不会出现在这里。该接口只读，不改变任何运行状态。

---

## 4. 远程控制 SDK 页面

用于 SDK 作为客户主程序中的一个模块时，由局域网内另一台设备（通常是 iPad）控制：返回主页、打开模块、打开原始数据页、切换主副驾展示。

**主副驾切换只影响前端展示**，两路串口数据、算法实例和控制命令始终独立运行，不会因为切换展示通道而暂停。该功能没有在现有页面上增加任何按钮。

**页面跳转会影响算法**：`return-home` 会把主、副两路切为 `paused`；`open-module` 分别恢复两路暂停前的模式。`open-raw-serial` 是只读观察页，不改变模式。串口采集始终不受影响。

### 4.1 两种控制端

**同界面控制（推荐）**：iPad 打开和 WPF 里同一份业务界面，操作即广播。

```text
http://<SDK电脑IP>:19245/app?remoteControl=1&showTitle=1
```

- 点“主驾 / 副驾”分段按钮 → 广播 `select-sensor`
- 点左上角品牌标识 → 广播 `return-home`
- 从原始数据页返回 → 广播 `open-module`
- 不带 `remoteControl=1` 的普通 `/app` 只切换本页面，不广播

**独立调试页**：局域网控制台，覆盖本文档全部客户操作，无需写代码。

```text
http://<SDK电脑IP>:19245/app#/remote-control
```

| 区块 | 能力 | 对应接口 |
| --- | --- | --- |
| 状态条 | 显示端数、当前页面、当前通道、气囊模式、主副驾在线、最近回执 | `/carAdaptive/ui/state`、`/carAdaptive/mode`、`/carAdaptive/sensors` |
| 页面控制 | 返回宿主页、自适应模块、原始数据 | `POST /carAdaptive/ui/command` |
| 显示通道 | 主驾 / 副驾切换 | `POST /carAdaptive/ui/command` |
| 气囊控制 | 目标通道、自动 / 手动模式、24 项气囊点选下发档位、全部保持、全部放气 | `POST /carAdaptive/mode`、`POST /carAdaptive/writeCommand` |
| 令牌 | 会话内保存控制令牌 | 请求头 `X-JQTools-Control-Token` |
| 执行状态 | 最近命令、命令编号、回执时间、通道在线 / 频率 / 帧数、本机操作历史 | `/carAdaptive/ui/state`、`/carAdaptive/sensors` |

气囊区的「目标通道」独立于「显示通道」，可以显示主驾、控制副驾。24 项气囊按侧翼、腰托、臀托、腿托、靠背按摩、坐垫按摩分组，每格显示编号、部位和当前档位；当前档位来自该页额外建立的一条 WebSocket（`?role=remote-console`，不计入 `displayClients`）中的 `algorFeed`。

自动模式下页面会提示手动命令将被算法覆盖，目标通道离线时提示不会产生物理写入。气囊命令直接写串口，不要求显示端在线，只要求目标通道在线。

访问不了先查：两台设备是否同一局域网、Windows 防火墙是否放行专用网络的 TCP `19245` 和 `19999`、服务是否在跑。

### 4.2 用接口控制

查询状态：

```bash
curl http://192.168.1.20:19245/carAdaptive/ui/state
```

下发命令，`POST /carAdaptive/ui/command`：

```json
{ "action": "return-home" }
{ "action": "open-module" }
{ "action": "open-raw-serial" }
{ "action": "select-sensor", "sensorId": 2 }
```

| `action` | 效果 |
| --- | --- |
| `return-home` | 页面返回宿主主页；配置了主页地址时命令里会带 `homeUrl` |
| `open-module` | 打开汽车自适应业务模块 |
| `open-raw-serial` | 打开 `#/raw-serial` 串口原始数据页 |
| `select-sensor` | 切换主副驾展示，需要 `sensorId` 为 `1` 或 `2` |

PowerShell：

```powershell
$body = @{ action = 'select-sensor'; sensorId = 2 } | ConvertTo-Json

Invoke-RestMethod -Method Post -ContentType 'application/json' `
    -Headers @{ 'X-JQTools-Control-Token' = 'customer-secret' } `
    -Uri 'http://192.168.1.20:19245/carAdaptive/ui/command' -Body $body
```

成功响应 `data` 为 `{ command, state }`，同时向所有 WebSocket 客户端广播 `carAdaptiveUiCommand`。

错误码：`400` 表示 `action` 非法或 `select-sensor` 缺少合法 `sensorId`；`401` 表示令牌不匹配。

### 4.3 控制令牌

不设令牌时，局域网内任何设备都能下发命令。**生产环境建议设置**：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-wpf.ps1 `
    -RemoteControlToken "customer-secret"
```

```xml
<jq:CarAdaptiveDebugControl RemoteControlToken="customer-secret" />
```

后端也可直接读环境变量 `JQTOOLS_REMOTE_CONTROL_TOKEN`。

调用时把令牌放请求头（也支持放在请求体的 `token` 字段）：

```http
X-JQTools-Control-Token: customer-secret
```

调试页的“控制令牌”输入框只存在当前浏览器会话，不写入配置文件。联调可以用 URL 参数 `controlToken`，生产不建议。

### 4.4 返回主页怎么落地

`return-home` 不假设你的主页是什么。页面通过 WebView2 消息通知 `CarAdaptiveDebugControl`，控件再触发 `HomeRequested` .NET 事件，由你的程序执行真正的导航：

```csharp
private void HandleCarAdaptiveHomeRequested(
    object? sender,
    CarAdaptiveHomeRequestedEventArgs e)
{
    MainFrame.Navigate(new HomePage());
}
```

事件参数包含 `CommandId`、`Source`、`HomeUrl`、`RequestedAt`。

统一配置网页主页地址：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-wpf.ps1 `
    -HomeUrl "https://customer.example/home"
```

对应环境变量 `JQTOOLS_HOME_URL`。`HomeUrl` 会随 `return-home` 广播，WPF 和 iPad 收到同一目标。单台设备要用不同主页时，在该设备 URL 上覆盖：

```text
http://192.168.1.20:19245/app?remoteControl=1&showTitle=1&homeUrl=https%3A%2F%2Fipad.example%2Fhome
```

主页地址优先级：页面 `homeUrl` 查询参数 > 后端广播的 `HomeUrl` > SDK 模块首页 `/`。

页面不在 WPF 控件里时，还会触发 DOM 事件 `jqtools:car-adaptive-home-requested`、向父窗口 postMessage 同名对象，无宿主处理则回到 SDK 模块首页。

### 4.5 完整时序

```text
SDK 前端  --WS 连接并上报页面状态-->  后端
控制端    --POST /carAdaptive/ui/command-->  后端
后端      --广播 carAdaptiveUiCommand-->  所有前端
前端      --carAdaptiveUiAcknowledgement-->  后端
前端      --WebView2 postMessage-->  WPF 宿主（仅 return-home）
控制端    --GET /carAdaptive/ui/state-->  查看最近命令和回执
```

页面执行 `open-module` 或 `open-raw-serial` 时还会发送 `jqtools.carAdaptive.viewRequested` 宿主消息，使已返回主页的 WPF 宿主重新显示 SDK 模块，再完成内部路由切换。

自动验收：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-sdk.ps1
```

---

## 5. WebSocket 参考

### 5.1 连接

```text
ws://127.0.0.1:19999?role=data&clientId=my-client
```

| 查询参数 | 默认 | 说明 |
| --- | --- | --- |
| `role` | `data` | 业务显示端用 `ui-display`，会计入 `displayClients` |
| `clientId` | `ip+port` | 客户端标识，用于状态上报归属 |

连接建立后立即依次推送：空对象、`carAdaptiveSensor`、`carAdaptiveSensors`、`carAdaptiveSensorsData`。所有消息是 JSON 文本，按顶层键区分类型。

### 5.2 `carAdaptiveSensorsData`（主要数据源）

主副两套完整快照一起推，前端各自缓存、本地切换展示：

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
      "algorFeed": [0, 1, 2, "... 共 24 项"],
      "controlMode": "auto"
    },
    { "sensorId": 2, "role": "副", "sitData": { "carAir": { "status": "offline" } }, "algorData": null, "algorFeed": [], "controlMode": "auto" }
  ]
}
```

`algorFeed` 是当前有效展示档位。`airbagDisplaySource` 为 `api`、`ecu`、`command` 或 `none`；`airbagDisplayAvailable` 表示界面是否有状态可画；`feedbackOnline` 只表示 ECU 真实回传。`airbagCommands` 同时给出 `algorithmGenerated`、`algorithmSent`、`ecuFeedback`、`apiSerial` 和 `apiDisplay`，原始数据页据此展示完整命令链路。

144 点布局：靠背 72 点 + 坐垫 72 点，每块为左侧翼 `1×4`（索引 `0-3`）、右侧翼 `1×4`（`4-7`）、中心区 `8×8`（`8-71`）。

### 5.3 其他消息

| 顶层键 | 触发时机 | 内容 |
| --- | --- | --- |
| `carAdaptiveSensors` | 状态变化和周期广播 | 与 `GET /carAdaptive/sensors` 相同的摘要数组 |
| `carAdaptiveSensor` | 兼容投影切换 | `{ sensorId, role, displayOnly }` |
| `carAdaptiveControlMode` | 连接建立时、模式切换时 | 与 `GET /carAdaptive/mode` 相同的模式状态 |
| `carAdaptiveUiCommand` | 远程 UI 命令下发 | 已广播命令，含 `action`、`sequence`，`return-home` 可能带 `homeUrl` |
| `carAdaptiveUiState` | 随命令一起广播 | 与 `GET /carAdaptive/ui/state` 相同 |
| `algorData` / `algorFeed` | 兼容单路推送 | 当前投影通道的算法结果和气囊反馈 |
| `sitData` | 实时数据、回放 | 压力数据映射；回放时附带 `carAdaptiveHistoryFrame=true`、`index`、`timestamp` |
| `carAdaptiveHistoryState` | 载入或取消回放 | `{ active, name?, length? }`；`active=false` 后恢复双路实时展示 |
| `playEnd` | 回放开始 / 结束 | `true` 开始，`false` 结束 |
| `contrastData` | 对比数据载入 | `{ left, right }` |

客户端可上报 `{ type: 'carAdaptiveUiReport' }`（当前视图和展示通道）和 `{ type: 'carAdaptiveUiAcknowledgement' }`（命令执行回执）。非 JSON 消息和未知 `type` 会被忽略。

---

## 6. HTTP 接口参考

### 6.1 清单

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/health` | 服务启动验收 |
| `GET` | `/app` | 加载业务前端页面 |
| `GET` | `/getSystem` | 读取系统类型和可视化配置 |
| `GET` | `/getPort` | 枚举串口 |
| `GET` | `/connPort` | 一键连接串口 |
| `GET` | `/sendMac` | 页面启动兼容步骤 |
| `GET` | `/carAdaptive/sensors` | 主副两路运行摘要 |
| `GET` `POST` | `/carAdaptive/sensor` | 旧版单路兼容投影的查询和切换 |
| `POST` | `/carAdaptive/processFrame` | 提交 144 点算法帧 |
| `POST` | `/carAdaptive/writeCommand` | 写入 55 字节气囊控制命令 |
| `GET` `POST` | `/carAdaptive/mode` | 查询 / 切换自动、手动控制模式 |
| `GET` `POST` | `/carAdaptive/display` | 查询 / 覆盖气囊界面展示，不写串口 |
| `DELETE` | `/carAdaptive/display/:sensorId` | 清除目标通道的界面展示覆盖 |
| `GET` | `/carAdaptive/commands/history` | 查询一路气囊指令历史，可按类型筛选 |
| `DELETE` | `/carAdaptive/commands/history/:sensorId` | 清空一路全部或指定类型历史 |
| `GET` | `/carAdaptive/feedbackDiagnostics` | 诊断 ECU 是否回传气囊状态 |
| `GET` `POST` | `/algorithm/config` | 读取 / 批量保存算法参数 |
| `GET` | `/carAdaptive/ui/state` | 查询远程 UI 状态 |
| `POST` | `/carAdaptive/ui/command` | 下发远程 UI 命令 |
| `GET` | `/carAdaptive/collection` | 查询主界面和原始数据页共享的采集状态 |
| `GET` | `/carAdaptive/collection/export` | 直接下载指定采集段的原始帧 CSV |
| `POST` | `/startCol` · `GET /endCol` | 采集开始 / 停止 |
| `GET` | `/getColHistory` | 采集历史列表 |
| `POST` | `/getDbHistory` 等 | 回放相关，见 6.5 |

### 6.2 启动与串口

**`GET /health`** — 无参数：

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

**`GET /app`** — 返回前端页面及静态资源。查询参数：`remoteControl=1` 开启远程控制广播，`showTitle=1` 显示标题栏，`homeUrl=` 覆盖本机主页。`frontend-build` 缺失时返回 HTTP `404`。

**`GET /getSystem`** — 读取加密 `config.txt`，页面启动调一次。`data` 含 `value`（当前系统，汽车为 `carAir`）、`typeArr`、`maxObj`（颜色上限，`carAir` 默认 `616`）、`optimalObj`。

**`GET /getPort`** — `data` 为串口数组，字段同 `SerialPort.list()`。

**`GET /connPort`** — 按当前系统波特率（`carAir` 为 `1000000`）连接全部匹配串口。成功 `message="连接成功"`，失败 `code=1`。

**`GET /sendMac`** — 启动流程兼容步骤。未连接串口时返回 `code=0` 且 `message="请先连接串口"`。

### 6.3 传感器与算法

**`GET /carAdaptive/sensors`** — 主副摘要，不含 144 点数组，适合轮询：

```json
{
  "code": 0,
  "message": "success",
  "data": [
    { "sensorId": 1, "role": "主", "online": true, "stamp": 1753670000000, "HZ": 20, "algorithmReady": true, "frameCount": 1234, "feedbackOnline": true, "feedbackStamp": 1753670000000 },
    { "sensorId": 2, "role": "副", "online": false, "stamp": 0, "HZ": null, "algorithmReady": false, "frameCount": 0, "feedbackOnline": false, "feedbackStamp": 0 }
  ]
}
```

`online` 的判定是最近一帧距今小于 `1000 ms`；`feedbackOnline` 是最近一条 ECU 气囊状态回传距今小于 `2000 ms`。

两者相互独立：串口在线但 ECU 不回传时，`online` 为 `true` 而 `feedbackOnline` 为 `false`，此时界面气囊全灭并显示提示。

**`GET` / `POST /carAdaptive/sensor`** — 旧版单路兼容投影。新版前端应改用 `carAdaptiveSensorsData` 本地切换。`POST` 请求体 `{ "sensorId": 1 }`，切换只影响兼容投影和 `algorData` 单路推送。

**`POST /carAdaptive/processFrame`** — 请求体：

| 字段 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `sensorData` | `number[144]` | 是 | — | 压力值 `0..255` |
| `sensorId` | `1 \| 2` | 否 | 当前投影通道 | 目标算法实例 |
| `writeSerial` | `boolean` | 否 | `false` | 是否写回串口 |

返回该路算法结果（字段见 [3.5](#35-用算法结果直接驱动气囊)），并广播 `carAdaptiveSensorsData`。

**`POST /carAdaptive/writeCommand`** — 见 [3.4](#34-构造并下发命令) 和 [3.6](#36-调用边界必读)。响应额外返回 `controlMode`，用于确认命令是否会被自动写入覆盖。

**`GET` / `POST /carAdaptive/mode`** — 见 [3.2](#32-切换模式软件开关)。

**`GET /carAdaptive/feedbackDiagnostics`** — 见 [3.8](#38-get-caradaptivefeedbackdiagnostics)。

### 6.4 算法参数

**`GET /algorithm/config`** — 返回参数树，每个叶子含当前值和 YAML 中文注释。

**`POST /algorithm/config`** — 请求体 `{ "changes": { ... } }`，非空对象，键为参数路径：

```json
{
  "changes": {
    "lumbar.back_total_threshold": 25.0,
    "side_wings.left_right_ratio_inflate_left": 0.7,
    "integrated_system.init_inflate.cycles": 26
  }
}
```

Python 落盘后会**重建主副两套算法实例**使参数立即生效。响应 `data` 为 `{ result, config }`。`changes` 缺失、非对象、为数组或空对象返回 `code=1`。

### 6.5 采集与回放

| 接口 | 请求体 | 说明 |
| --- | --- | --- |
| `GET /carAdaptive/collection` | — | 查询是否采集中、名称、主副驾、起止时间和已保存帧数 |
| `GET /carAdaptive/collection/export?fileName=...&sensorId=1` | — | 直接下载原始帧 CSV；`sensorId` 可省略 |
| `POST /startCol` | `{ fileName, sensorId, select }` | 开始采集；`sensorId` 为 `1` 主驾或 `2` 副驾 |
| `GET /endCol` | — | 停止采集并返回最终状态 |
| `GET /getColHistory` | — | 最近 500 条记录的 `date`、`timestamp`、`select` |
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

回放数据通过 WebSocket 的 `carAdaptiveHistoryState` / `carAdaptiveHistoryFrame` / `sitData` /
`index` / `timestamp` / `playEnd` 推送。损坏 JSON 会跳过并通过 `skippedRows` 报告，单帧记录
默认按 `12 Hz` 回放。**采集回放共享单一全局游标，同一时间只支持一路回放。**

采集也是单一全局任务。主界面和 `#/raw-serial` 原始数据页都会轮询
`GET /carAdaptive/collection`，因此从任一页面开始或停止后，另一页面会同步显示状态。
开始采集时后端会自动退出历史回放，并把本次 `sensorId` 固定到整个采集段；之后切换
页面显示的主副驾不会改变正在存储的通道。

`/carAdaptive/collection/export` 直接从 SQLite 读取指定采集段，不经过算法、滤波或点图
插值。CSV 每行是一帧，字段固定为 `frameIndex,timestamp,datetime,sensorId,p0...p143`，
即 4 个元数据字段和 144 个原始压力字节。响应头 `X-JQTools-Frame-Count` 返回导出帧数；
名称不存在或筛选后没有有效帧时返回 HTTP `404`。

Node SDK 可直接取得文件字节：

```js
const fs = require('node:fs');

const exported = await jqtools.exportCarAdaptiveCollection({
  fileName: '副驾测试',
  sensorId: 2
});

fs.writeFileSync(exported.fileName, exported.data);
console.log(exported.frameCount);
```

### 6.6 远程 UI 状态字段

`GET /carAdaptive/ui/state` 的 `data`：

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

---

## 7. 环境变量与安全边界

后端可配置项：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `JQTOOLS_HTTP_PORT` | `19245` | HTTP 端口 |
| `JQTOOLS_WS_PORT` | `19999` | WebSocket 端口 |
| `JQTOOLS_REMOTE_CONTROL_TOKEN` | 空 | 远程控制令牌，空表示不校验 |
| `JQTOOLS_HOME_URL` | 空 | 随 `return-home` 广播的主页地址 |
| `JQTOOLS_CONTROL_MODE` | `auto` | 启动时的气囊控制模式，可设为 `manual` 或 `paused` |
| `JQTOOLS_AIRBAG_FEEDBACK_SOURCE` | `ecu` | 气囊反馈数据源。设为 `command` 时回落为已下发命令，仅在确认 ECU 不回传时使用 |
| `JQTOOLS_FRONTEND_BUILD_DIR` | `build/` | 前端资源目录 |

安全边界：

- 服务默认只监听本机；供局域网设备访问时应限制在受控网络内。
- 除 `POST /carAdaptive/ui/command` 的可选令牌外，其余接口**无鉴权**。
- `/carAdaptive/writeCommand` 直接驱动气囊硬件，协议正确性由调用方保证。
- `POST /getCsvData` 按传入路径读取本机文件，**不应暴露到不受信任的网络**。
