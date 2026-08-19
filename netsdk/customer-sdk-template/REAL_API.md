# JQTools 汽车自适应 SDK 真实业务接口

本文档只描述客户 `customer-sdk` 实际业务使用的接口，不包含完整平台遗留接口。

接口范围根据以下真实调用链确定：

- WPF 启动、健康检查和真实串口连接。
- 当前 React/Three.js 汽车自适应页面。
- 主驾、副驾两套独立 Python 算法，以及两路自适应的独立开启和关闭。
- 55 字节气囊控制命令串口写入。
- ECU 回传不完整时，用接口直接控制气囊界面展示状态。
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
| `GET` | `/carAdaptive/mode` | 查询主驾或副驾自适应开关状态 |
| `POST` | `/carAdaptive/mode` | 按 `sensorId` 独立开启或关闭一路自适应 |
| `GET` `POST` | `/carAdaptive/display` | 查询或覆盖气囊界面展示状态 |
| `DELETE` | `/carAdaptive/display/:sensorId` | 清除一路界面展示覆盖 |
| `GET` | `/carAdaptive/feedbackDiagnostics` | 只读诊断 ECU 是否回传及回传帧长度 |
| `GET` | `/carAdaptive/commands/history` | 查询一路气囊指令历史 |
| `DELETE` | `/carAdaptive/commands/history/:sensorId` | 清空一路全部或指定类型历史 |
| `POST` | `/carAdaptive/processFrame` | 手动提交 144 点算法帧 |
| `POST` | `/carAdaptive/writeCommand` | 手动写入气囊控制命令 |
| `GET` | `/carAdaptive/ui/state` | 查询局域网 UI 状态 |
| `POST` | `/carAdaptive/ui/command` | 主副驾切换、返回主页和页面切换 |
| `GET` | `/carAdaptive/collection` | 查询主界面和原始数据页共享的采集状态 |
| `GET` | `/carAdaptive/collection/export` | 直接下载指定采集段的原始帧 CSV |
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
      "frameCount": 235,
      "feedbackOnline": false,
      "feedbackStamp": 0,
      "controlMode": "auto",
      "airbagDisplayAvailable": true,
      "airbagDisplaySource": "api",
      "airbagDisplayOverride": true
    },
    {
      "sensorId": 2,
      "role": "副",
      "online": true,
      "stamp": 1785292800010,
      "HZ": 12,
      "algorithmReady": true,
      "frameCount": 232,
      "feedbackOnline": true,
      "feedbackStamp": 1785292799880,
      "controlMode": "manual",
      "airbagDisplayAvailable": true,
      "airbagDisplaySource": "ecu",
      "airbagDisplayOverride": false
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
| `feedbackOnline` | 该路 ECU 最近 2000 ms 内是否真实回传气囊状态 |
| `feedbackStamp` | 最近一条 ECU 回传的时间戳，从未回传为 `0` |
| `controlMode` | 该路独立的 `auto`、`manual` 或 `paused` |
| `airbagDisplayAvailable` | 当前是否有可供界面点亮的气囊档位 |
| `airbagDisplaySource` | 展示来源 `api`、`ecu`、`command` 或 `none` |
| `airbagDisplayOverride` | 是否正被 `/carAdaptive/display` 接口覆盖 |

`feedbackOnline` 只表示真实硬件回传，不受接口展示覆盖影响；界面点亮与否看
`airbagDisplayAvailable` 和 `airbagDisplaySource`。

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

该接口由后端强制校验完整 55 字节协议，并且只允许 3、4、5、6 号气囊为非零档位。
1、2、7..24 号必须为 `0`；请求体中的 `source` 不会绕过白名单。Python 算法内部的
24 路控制走独立内部链路，不受此限制。

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
    "allowedAirbagIds": [3, 4, 5, 6],
    "controlMode": "manual",
    "queued": true,
    "portPaths": ["COM3"]
  }
}
```

必须注意：

- 后端校验 55 字节长度、帧头、气囊编号顺序、档位、方向和帧尾。
- 只有 3、4、5、6 号允许非零档位，其他气囊会返回 HTTP `400` 和 `code: 1`，且不会进入串口队列。
  `message` 写明是哪一号气囊，例如 `客户手动接口只允许控制 3、4、5、6 号气囊，7 号档位必须为 0`。
- `queued: true` 只表示命令进入串口队列，不表示硬件已执行；`queued: false` 表示没有目标串口。
- 如果目标通道尚未记录来源串口，会尝试写到所有已打开的 `carAir` 串口。
- 没有可用串口时，当前接口仍可能返回成功，但不会产生物理写入。
- 串口异步写错误只写后端日志，不会回写到本次 HTTP 响应。
- 当前接口不返回硬件 ACK。

生产调用前应确认 `/carAdaptive/sensors` 中目标通道为 `online: true`。

### 5.6 `GET` / `POST /carAdaptive/mode` 主副驾自适应独立开关

主驾和副驾各自维护一份控制模式，互不影响。请求带 `sensorId` 即只作用于该一路。

| `mode` | 对外含义 | 算法 | 自动写气囊串口 | 手动 `writeCommand` |
| --- | --- | --- | --- | --- |
| `auto` | 自适应开启 | 运行 | 每 500 ms 写一次 | 允许，但会被下一周期覆盖 |
| `manual` | 自适应关闭 | 运行并继续返回算法数据 | 不写 | 允许，稳定生效 |
| `paused` | 自适应完全暂停 | 暂停 | 不写 | 允许 |

三种模式都不影响串口压力采集和 `carAdaptiveSensorsData` 推送。日常“开启 / 关闭自适应”
用 `auto` 和 `manual`；只有需要连算法一起停时才用 `paused`。

查询一路状态；响应顶层为目标通道，`sensors` 同时给出主副两路：

```http
GET /carAdaptive/mode?sensorId=1
```

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
    "changedAt": 1785292800000,
    "autoWrite": true,
    "algorithmRunning": true,
    "commandIntervalMs": 500,
    "view": "module",
    "independent": true,
    "sensors": [
      {
        "sensorId": 1,
        "role": "主",
        "mode": "auto",
        "autoWrite": true,
        "algorithmRunning": true
      },
      {
        "sensorId": 2,
        "role": "副",
        "mode": "manual",
        "autoWrite": false,
        "algorithmRunning": true
      }
    ]
  }
}
```

`sensors` 中每一项与顶层结构相同，示例做了截断。

关闭主驾自适应，副驾保持不变：

```http
POST /carAdaptive/mode
Content-Type: application/json
```

```json
{
  "sensorId": 1,
  "mode": "manual",
  "reason": "主驾自适应关闭"
}
```

POST 响应在上面的查询结构之上附加本次切换结果：

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
    "autoWrite": false,
    "algorithmRunning": true,
    "independent": true,
    "changed": true,
    "massageReset": false,
    "algorithmReset": false,
    "changes": [
      { "sensorId": 1, "changed": true, "previousMode": "auto" }
    ],
    "sensors": []
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `changed` | 本次调用是否真的改变了模式；重复设置同一模式为 `false` |
| `massageReset` | 是否因 `manual` → `auto` 清空了按摩触发状态 |
| `algorithmReset` | 是否因 `paused` → 非 `paused` 重建了算法实例 |
| `changes` | 本次实际修改的通道列表；不传 `sensorId` 时有两项 |
| `autoWrite` | 等价于 `mode === "auto"` |
| `algorithmRunning` | 等价于 `mode !== "paused"` |
| `view` | 当前 SDK 页面视图，控制模式会跟随它自动切换 |

请求规则：

- `mode` 支持 `auto`、`manual`、`paused`，并兼容历史值 `algor`、`handle` 和协议值 `0`、`1`。
  非法值返回 HTTP `400`，`message` 为 `mode 只允许为 auto、manual、paused`。
- `sensorId` 只允许 `1`（主驾）或 `2`（副驾）。非法值返回 HTTP `400`，`message` 为
  `sensorId 只允许为 1（主驾）或 2（副驾）`。
- **不传 `sensorId` 时为兼容旧客户端，会同时修改主副两路。**需要独立控制时不要省略。
- 重复设置同一模式是幂等操作，返回 `changed: false`，且不会广播。
- 从 `manual` 切回 `auto` 时，只清空目标通道的按摩触发状态（`resetMessage`），
  避免手动期间的拍打被算法当成触发信号。
- 从 `paused` 切到 `auto` 或 `manual` 时，只重建目标通道的算法实例（`resetSystem`），
  并清空该路的 `algorData` 和上一条 `control_command`；另一路完全不受影响。
- 模式切换通过 WebSocket 顶层字段 `carAdaptiveControlMode` 广播。
- 模式默认不持久化，后端重启回到 `auto`；可用环境变量
  `JQTOOLS_CONTROL_MODE=manual` 修改启动默认值。

### 5.7 `GET` / `POST` / `DELETE /carAdaptive/display` 气囊展示状态控制

气囊展示采用固定归属：API 独占 3、4、5、6 号，ECU 只控制其余 20 路；
ECU 回传中的 3–6 号会被后端忽略。该接口**只改界面：不写串口、不控制真实气囊，
也不会把 `feedbackOnline` 伪造成 `true`**。

#### 逐通道合并

后端按通道合并当前展示档位：

| 气囊编号 | 展示来源 |
| --- | --- |
| `3、4、5、6` | 只取 API；未设置或清除后固定为 `0`，不读取 ECU |
| `1、2、7–24` | 始终取 ECU；无回传时取可选命令回落或熄灭 |

界面当前只把档位 `3` 显示为点亮，`0` 显示为熄灭。设置覆盖后，界面上的
「未收到气囊状态回传」提示也会消失。

#### 设置覆盖

```http
POST /carAdaptive/display
Content-Type: application/json
```

用 24 路档位。只有第 3–6 项允许非零，其余 20 项必须为 `0`：

```json
{
  "sensorId": 1,
  "gears": [0, 0, 3, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
}
```

或直接给一条 51 / 55 字节命令帧，由后端提取 24 路档位（字段名 `controlCommand`
或 `command` 均可）：

```json
{
  "sensorId": 1,
  "controlCommand": [31,
    1, 0, 2, 0, 3, 0, 4, 0, 5, 3, 6, 3, 7, 0, 8, 0, 9, 0, 10, 0, 11, 0, 12, 0,
    13, 0, 14, 0, 15, 0, 16, 0, 17, 0, 18, 0, 19, 0, 20, 0, 21, 0, 22, 0, 23, 0, 24, 0,
    0, 0, 170, 85, 3, 153]
}
```

`sensorId` 必填，只允许 `1` 或 `2`。两种入参都不合法时返回 HTTP `400`；如果其他 20 路
存在非零值，`message` 会说明展示接口只允许控制 3、4、5、6 号。

#### 查询与清除

```http
GET    /carAdaptive/display?sensorId=1
DELETE /carAdaptive/display/1
```

三个方法都返回同一结构：顶层为目标通道，`sensors` 附带主副两路。

```json
{
  "code": 0,
  "message": "3、4、5、6 号气囊展示状态已覆盖",
  "data": {
    "sensorId": 1,
    "role": "主",
    "gears": [0, 0, 3, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "available": true,
    "source": "api",
    "baseSource": "ecu",
    "override": true,
    "overrideAirbagIds": [3, 4, 5, 6],
    "stamp": 1785292800000,
    "feedbackOnline": false,
    "feedbackStamp": 0,
    "independent": true,
    "sensors": []
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `gears` | 当前生效的 24 路档位；`source` 为 `none` 时为空数组 |
| `available` | 是否有可展示档位 |
| `source` | `api` 表示 3–6 号存在显式 API 状态，否则表示其余 20 路的基础来源 |
| `baseSource` | 其余 20 路来源：`ecu`、`command` 或 `none` |
| `override` | 3–6 号是否存在显式 API 状态 |
| `overrideAirbagIds` | 显式 API 状态存在时固定为 `[3,4,5,6]` |
| `stamp` | 当前展示状态的时间戳 |
| `feedbackOnline` | 始终只表示真实 ECU 回传，不因覆盖变为 `true` |

`DELETE` 清除后 3–6 号固定为 `0`，不会恢复读取 ECU；其余 20 路继续跟随 ECU（或配置的命令回落）。API 状态的设置和清除都会记入
`apiDisplay` 类型的气囊指令历史，并立即通过 WebSocket 广播新的快照。

#### 与整机回落开关的区别

`JQTOOLS_AIRBAG_FEEDBACK_SOURCE=command` 是全局回落策略，对两路 ECU 所属的 20 路同时生效，且只在没有
ECU 回传时用“已下发命令”充当基础展示；命令中的 3–6 号同样被忽略。`/carAdaptive/display`
按 `sensorId` 设置 API 独占四路，并保持到调用 `DELETE` 为止。

### 5.7.1 `GET /carAdaptive/feedbackDiagnostics`

只读接口，用于确认 ECU 到底有没有回传，以及回传帧的实际长度。

```http
GET /carAdaptive/feedbackDiagnostics
```

| 字段 | 说明 |
| --- | --- |
| `observedFeedback` | 任一串口是否收到过合法回传帧 |
| `feedbackFrameLength` | 业务层预期的回传帧长度，当前为 `51` |
| `delimiter` | 串口分隔符，即命令帧尾 `[170, 85, 3, 153]` |
| `feedbackSource` | 当前回落策略：`ecu` 或 `command` |
| `feedbackTimeoutMs` | 判定回传离线的超时，当前为 `2000` |
| `sensors[]` | 每路的 `feedbackOnline`、`gears`、`display` 和最近各来源命令 |
| `ports.<串口>.lengthCounts` | 该串口收到的各种帧长计数 |
| `ports.<串口>.feedbackFrames` | 该串口累计合法回传帧数 |

ECU 回传的是 55 字节命令帧，4 字节帧尾被串口分隔符消费，业务层收到 51 字节。
若 `observedFeedback` 为 `false`，或 `lengthCounts` 里出现的不是 `51`，说明回传缺失或
协议长度不符，此时应使用 `/carAdaptive/display` 直接控制界面展示。

### 5.7.2 气囊指令历史

原始数据页右侧切到“气囊指令”后，点击“历史记录”打开弹窗。记录按主驾和副驾完全隔离，弹窗随页面当前通道切换；支持五类来源筛选、每秒自动刷新、完整字节和 24 路档位查看以及清空。

```http
GET /carAdaptive/commands/history?sensorId=1&type=ecuFeedback&limit=200
DELETE /carAdaptive/commands/history/1?type=ecuFeedback
```

`type` 可省略，或取 `algorithmGenerated`、`algorithmSent`、`ecuFeedback`、`apiSerial`、`apiDisplay`。GET 返回 `counts`、`total` 和按最新优先排列的 `records`；DELETE 返回 `removed`。每个通道每种类型最多在内存保留 500 条，服务退出后清空。清空历史只影响诊断数据，不改变算法模式、串口写入、ECU 状态或界面覆盖。

### 5.8 自动写入

真实串口数据进入后端后，每路按自己的模式运行。处于 `auto` 的通道每 500 ms 把最近
一次非空 `control_command` 排队写回数据来源串口；`manual` 继续算但不自动写；`paused`
停止该路算法。前端显示哪一路不影响另一侧。

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

这一组接口由主界面工具栏“采集”面板和 `#/raw-serial` 原始数据页共同调用。两处入口
共享一个全局采集任务。

### 8.1 `GET /carAdaptive/collection`

查询当前采集任务：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "collecting": true,
    "fileName": "副驾-20260810-143000",
    "sensorId": 2,
    "role": "副",
    "startedAt": 1786343400000,
    "stoppedAt": 0,
    "frameCount": 126
  }
}
```

主界面和原始数据页每秒查询该接口，所以从任一入口操作后另一页面会同步状态。

### 8.2 `POST /startCol`

请求：

```json
{
  "fileName": "2026-07-29-test",
  "sensorId": 1,
  "select": []
}
```

`fileName` 是采集段名称；`sensorId=1` 采集主驾，`sensorId=2` 采集副驾；可选的
`select` 数组只作为采集元数据写入数据库。开始后本采集段固定使用该通道，前端切换展示
不会改变已经选择的存储通道。

只有已连接设备类型包含当前系统 `carAir` 时才开始采集。开始新采集会自动退出历史回放，
避免回放状态阻止实时帧写入。

成功：

```json
{
  "code": 0,
  "message": "开始采集",
  "data": {
    "collecting": true,
    "fileName": "2026-07-29-test",
    "sensorId": 1,
    "role": "主",
    "startedAt": 1785292800000,
    "stoppedAt": 0,
    "frameCount": 0
  }
}
```

传感器类型不匹配：

```json
{
  "code": 1,
  "message": "error",
  "data": "没有可采集的汽车传感器，请先连接串口"
}
```

重复开始时不会重置已有任务，而是返回当前采集状态。

### 8.3 `GET /endCol`

停止采集：

```json
{
  "code": 0,
  "message": "停止采集",
  "data": {
    "collecting": false,
    "fileName": "2026-07-29-test",
    "sensorId": 1,
    "role": "主",
    "startedAt": 1785292800000,
    "stoppedAt": 1785292860000,
    "frameCount": 780
  }
}
```

### 8.4 `GET /carAdaptive/collection/export`

直接下载一个采集段，不需要先调用旧版 `/downlaod` 在服务器目录生成文件：

```http
GET /carAdaptive/collection/export?fileName=2026-07-29-test&sensorId=1
```

查询参数：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `fileName` | 否 | SQLite 中的采集段名称；省略时使用本次服务进程当前或最近一次采集段 |
| `sensorId` | 否 | `1` 只导出主驾，`2` 只导出副驾；省略时不额外筛选 |

成功响应是 UTF-8 BOM CSV 文件，不是通用 JSON。响应头包含：

```text
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; ...
X-JQTools-Frame-Count: 780
```

每行对应一帧数据库原始数据，字段固定为：

```text
frameIndex,timestamp,datetime,sensorId,p0,p1,...,p143
```

其中 `sensorId` 是原 145 字节串口帧的首字节，`p0...p143` 是其后 144 个原始压力
字节。接口不使用 Python 算法结果、滤波值或点图插值值。采集段不存在或筛选后没有有效
144 点帧时返回 HTTP `404` JSON；没有可用采集段名称时返回 HTTP `400` JSON。

### 8.5 `GET /getColHistory`

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

### 8.6 `POST /downlaod`

真实路径保留了旧拼写 `downlaod`，不能改为 `/download`。

请求：

```json
{
  "fileArr": ["2026-07-29-test"]
}
```

空数组返回 `code: 555` 和 `message: "error"`。

CSV 会写入 SDK 的 `real-backend/data/`。采集名称中的 `/`、`\\`、`:` 等 Windows
非法文件名字符会自动替换为 `_`，不会再因为名称包含身高格式（例如 `155/88`）而导出失败。
数据库查询失败、没有对应采集段或 CSV 写入失败时，接口会返回 HTTP `500` 和明确错误信息，
不会一直等待。

### 8.7 `POST /delete`

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

### 8.8 `POST /changeDbName`

请求：

```json
{
  "newDate": "new-name",
  "oldDate": "old-name"
}
```

当前成功消息沿用旧值 `"删除成功"`，调用方不要用该中文消息判断操作类型。

### 8.9 `POST /getDbHistory`

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
    },
    "skippedRows": 0,
    "playbackHz": 12
  }
}
```

该调用会把有效历史帧缓存在后端，供播放接口使用。损坏的 JSON 行会被跳过并计入
`skippedRows`；单帧采集段也可以回放，无法从时间戳计算频率时默认使用 `12 Hz`。
载入成功后会立即通过 WebSocket 推送索引 `0` 的第一帧。

### 8.10 `POST /getDbHistoryPlay`

开始或继续播放由 `/getDbHistory` 加载的数据。无请求体。

播放期间通过 WebSocket 推送：

```json
{
  "carAdaptiveHistoryFrame": true,
  "sitData": {},
  "index": 10,
  "timestamp": 1785292800000
}
```

### 8.11 `POST /getDbHistoryStop`

暂停播放，无请求体。当前索引和已加载数据继续保留。

### 8.12 `POST /cancalDbPlay`

取消播放并清空已加载历史。无请求体。`cancal` 是真实旧拼写。

### 8.13 `POST /changeDbplaySpeed`

请求：

```json
{
  "speed": 2
}
```

实际播放频率为原始频率乘以 `speed`。应传大于 `0` 的有限数字。

### 8.14 `POST /getDbHistoryIndex`

请求：

```json
{
  "index": 10
}
```

立即推送该索引帧，并在 HTTP `data` 中返回对应数据库原始行。调用方必须保证索引位于
`0..length-1`。

### 8.15 `POST /getCsvData`

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
      "algorFeed": [0, 0, 0, 0],
      "feedbackOnline": false,
      "feedbackStamp": 0,
      "feedbackSource": "ecu",
      "airbagDisplayAvailable": true,
      "airbagDisplaySource": "api",
      "airbagDisplayOverride": true,
      "airbagDisplayStamp": 1785292800000,
      "airbagCommands": {
        "algorithmGenerated": null,
        "algorithmSent": null,
        "ecuFeedback": null,
        "apiSerial": null,
        "apiDisplay": null
      },
      "controlMode": "auto"
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
      "algorFeed": [],
      "feedbackOnline": false,
      "feedbackStamp": 0,
      "feedbackSource": "ecu",
      "airbagDisplayAvailable": false,
      "airbagDisplaySource": "none",
      "airbagDisplayOverride": false,
      "airbagDisplayStamp": 0,
      "controlMode": "manual"
    }
  ]
}
```

示例数组已截断。实际规则：

- 在线压力 `sitData.carAir.arr` 为 144 项。
- 非空 `algorData.control_command` 为 55 项。
- `algorFeed` 为 24 项当前有效展示档位，来源必须结合 `airbagDisplaySource` 判断。
- 算法尚未返回时，`algorData` 可能不出现在 JSON 中。
- 压力尚未到达时，`arr` 可能不出现在 JSON 中。

气囊展示与模式相关字段：

| 字段 | 说明 |
| --- | --- |
| `feedbackOnline` | 该路 ECU 是否真实回传，不受接口展示覆盖影响 |
| `feedbackStamp` | 最近一条 ECU 回传的时间戳 |
| `feedbackSource` | 全局回落策略：`ecu` 或 `command` |
| `airbagDisplayAvailable` | 当前是否有可点亮的档位 |
| `airbagDisplaySource` | `api`、`ecu`、`command` 或 `none` |
| `airbagDisplayOverride` | 是否正被 `/carAdaptive/display` 覆盖 |
| `airbagDisplayStamp` | 当前展示状态的时间戳 |
| `airbagCommands` | 该路最近的算法生成/下发、ECU 回传、接口写串口和接口展示命令 |
| `controlMode` | 生成该快照时该路的 `auto`、`manual` 或 `paused` |

`airbagCommands` 的五个成员结构相同，无记录时为 `null`：

```json
{
  "command": [31, 1, 0],
  "length": 55,
  "gears": [0, 0, 0],
  "stamp": 1785292800000,
  "source": "api",
  "target": "display",
  "active": true,
  "clearedAt": 0
}
```

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
      "frameCount": 235,
      "feedbackOnline": false,
      "controlMode": "auto",
      "airbagDisplaySource": "api"
    }
  ]
}
```

示例做了截断，字段与 5.2 的表格一致。

### 9.4 `carAdaptiveControlMode`

新建 WebSocket 连接时会立即收到当前控制模式；每次真实切换后也会广播。结构与
`GET /carAdaptive/mode` 的 `data` 相同：顶层是当前展示通道，`sensors` 才是主副两路
各自的开关状态。判断某一路是否开启自适应，必须读 `sensors` 中对应 `sensorId` 的项。

```json
{
  "carAdaptiveControlMode": {
    "sensorId": 1,
    "role": "主",
    "mode": "manual",
    "previousMode": "auto",
    "source": "api",
    "reason": "主驾自适应关闭",
    "sequence": 1,
    "changedAt": 1785292800000,
    "autoWrite": false,
    "algorithmRunning": true,
    "commandIntervalMs": 500,
    "view": "module",
    "independent": true,
    "sensors": [
      {
        "sensorId": 1,
        "role": "主",
        "mode": "manual",
        "autoWrite": false,
        "algorithmRunning": true
      },
      {
        "sensorId": 2,
        "role": "副",
        "mode": "auto",
        "autoWrite": true,
        "algorithmRunning": true
      }
    ]
  }
}
```

重复设置同一模式不会触发广播。

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
| `{ "carAdaptiveHistoryState": { "active": true, "name": "test", "length": 120 } }` | 进入历史模式 |
| `{ "carAdaptiveHistoryFrame": true, "sitData": {}, "index": 10, "timestamp": 1785292800000 }` | 当前历史帧；该标识防止双传感器实时流覆盖回放 |
| `{ "carAdaptiveHistoryState": { "active": false } }` | 取消回放并恢复双路实时展示 |
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
- `/carAdaptive/mode`、`/carAdaptive/display`、`/carAdaptive/writeCommand`、算法参数、
  串口连接和采集接口当前没有鉴权。
- 建议通过 Windows 防火墙限制来源 IP，不要把端口暴露到互联网。
- `/carAdaptive/writeCommand` 成功不是硬件 ACK。
- `/carAdaptive/display` 只改界面，成功不代表真实气囊改变；它也不会把
  `feedbackOnline` 变为 `true`。判断硬件是否真的回传，用 `feedbackOnline` 或
  `/carAdaptive/feedbackDiagnostics`。
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
7. `GET /carAdaptive/mode?sensorId=1` 和 `?sensorId=2` 分别确认两路自适应开关；
   正常运行保持 `auto`。
8. 单独关闭一路时，`POST /carAdaptive/mode` 必须带 `sensorId`，否则会同时改两路。
9. 手动调试先把目标通道切 `manual`，再调用 `/carAdaptive/writeCommand`，完成后切回 `auto`。
10. ECU 回传不稳定时，先用 `/carAdaptive/feedbackDiagnostics` 确认，再用
    `POST /carAdaptive/display` 按 `sensorId` 控制界面展示，恢复跟随硬件用
    `DELETE /carAdaptive/display/:sensorId`。
11. 参数修改使用 `/algorithm/config`。
12. 局域网控制使用 `/carAdaptive/ui/command`。
