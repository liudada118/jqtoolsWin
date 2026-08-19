# JQTools 汽车自适应 SDK 快速使用说明

五件事：[取数据](#一取数据)、[控制气囊](#二控制气囊)、[主副驾自适应单独开关](#三主副驾自适应单独开启和关闭)、[控制气囊展示状态](#四接口控制气囊展示状态)、[远程操控页面](#五远程操控页面)。

本文只写接口怎么调。完整字段见 `API.md`。

## 0. 启动

双击运行：

```text
app\JqTools.CarAdaptive.ClientWpf.exe
```

启动后自动连接串口，服务地址：

| 用途 | 地址 |
| --- | --- |
| 接口 | `http://127.0.0.1:19245` |
| 实时数据 | `ws://127.0.0.1:19999` |
| 页面 | `http://127.0.0.1:19245/app` |
| 接口调试页 | `http://127.0.0.1:19245/app#/api-debug` |

局域网设备访问时把 `127.0.0.1` 换成这台电脑的 IP。

本文所有接口都能在**接口调试页**上点着调，不用写代码：页面会显示每次调用的完整请求地址、请求体和原始响应，照抄即可。
用另一台设备调这台电脑时，在页面顶部把服务地址改成这台电脑的地址，或者直接打开：

```text
http://这台电脑的IP:19245/app?apiBase=http://这台电脑的IP:19245#/api-debug
```

`apiBase` 要写在 `#` **前面**。

主驾是 `sensorId = 1`，副驾是 `sensorId = 2`，两路数据和算法各自独立运行。

接口统一返回 `{"code":0,"message":"success","data":{}}`，`code = 0` 为成功。
配置了远程控制口令时，请求头加 `X-JQTools-Control-Token: 你的口令`。

---

## 一、取数据

连上 WebSocket 即可，主副驾数据一起实时推送。取 JSON 里的 `carAdaptiveSensorsData`：

```javascript
const socket = new WebSocket('ws://127.0.0.1:19999');

socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (!Array.isArray(message.carAdaptiveSensorsData)) return;

  const main = message.carAdaptiveSensorsData.find((item) => item.sensorId === 1); // 主驾
  console.log('压力数据 144 点:', main.sitData.carAir.arr);
  console.log('气囊当前档位 24 路:', main.algorFeed);
  console.log('在座状态:', main.algorData?.living_status);   // 活体 / 静物 / 离座
  console.log('体型:', main.algorData?.body_type);           // 大人 / 小孩
};
```

查通道是否在线：

```bash
curl http://127.0.0.1:19245/carAdaptive/sensors
```

| 字段 | 说明 |
| --- | --- |
| `online` | 该路是否收到压力数据 |
| `controlMode` | 该路当前 `auto` / `manual` / `paused` |
| `feedbackOnline` | ECU 最近是否真的回传气囊状态 |
| `airbagDisplaySource` | 界面气囊档位来自 `api` / `ecu` / `command` / `none` |

---

## 二、控制气囊

**默认是全自动的**，算法每 500 ms 自动调节气囊，你不需要做任何事。

只有需要手动控制时（标定、测试、单气囊验证）才按下面几步走。

### 前提：串口已连接

气囊命令是直接写串口的，**串口没连就发不出去**。双击 EXE 启动时会自动连，串口是后插的或者连接掉了就手动连一次：

```bash
# 看有哪些串口
curl http://127.0.0.1:19245/getPort

# 一键连接
curl http://127.0.0.1:19245/connPort
```

`connPort` 可以重复调，也可以和界面上的一键连接同时调，已连上的串口会直接复用，不会被打断。

再确认目标通道有数据进来：

```bash
curl http://127.0.0.1:19245/carAdaptive/sensors
```

对应 `sensorId` 那一项的 `online` 为 `true` 才说明这一路真的在收数据。

### 第 1 步：把目标通道切到手动

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":1,"mode":"manual"}'
```

不切的话，你下发的命令会在下一个 500 ms 被算法命令覆盖。详见[第三节](#三主副驾自适应单独开启和关闭)。

### 第 2 步：下发命令

命令是 55 个字节：

```text
[31, 气囊1, 档位1, 气囊2, 档位2, ... , 气囊24, 档位24, 0, 0, 170, 85, 3, 153]
 帧头                24 组编号和档位                  模式 方向    帧尾
```

档位：`0` 保持、`1` 慢速、`2` 中速、`3` 快速充气、`4` 快速放气。

客户手动接口只允许控制 `3`、`4`、`5`、`6` 号气囊。55 字节协议仍保留 24 组编号和档位，
但调用 `writeCommand` 时其余气囊必须填 `0`。后端会强制拒绝其他气囊的非零档位，
算法内部的 24 路控制不受此限制。

被拒绝时返回 HTTP `400`、`code` 为 `1`，`message` 写明是哪一号气囊，串口不会被写入。

手动 API 可控编号：

| 编号 | 部位 |
| --- | --- |
| `3` | 右侧翼下 |
| `4` | 左侧翼下 |
| `5` | 腰托 1 |
| `6` | 腰托 2 |

```bash
# 给主驾腰托（5、6 号气囊）快速充气，其余保持不动
curl -X POST http://127.0.0.1:19245/carAdaptive/writeCommand \
  -H 'Content-Type: application/json' \
  -d '{
    "sensorId": 1,
    "controlCommand": [31,
      1,0, 2,0, 3,0, 4,0, 5,3, 6,3, 7,0, 8,0, 9,0, 10,0, 11,0, 12,0,
      13,0, 14,0, 15,0, 16,0, 17,0, 18,0, 19,0, 20,0, 21,0, 22,0, 23,0, 24,0,
      0, 0, 170, 85, 3, 153]
  }'
```

| 参数 | 说明 |
| --- | --- |
| `sensorId` | `1` 主驾，`2` 副驾 |
| `controlCommand` | 上面那 55 个字节，每项 `0`–`255` |

返回：

```json
{
  "code": 0,
  "message": "success",
  "data": { "length": 55, "sensorId": 1, "controlMode": "manual", "queued": true, "portPaths": ["COM3"] }
}
```

| 字段 | 说明 |
| --- | --- |
| `queued` | **命令是否真的进了串口队列。串口没连时这里是 `false`，但 `code` 仍然是 `0`** |
| `portPaths` | 实际写入的串口；`queued` 为 `false` 时是空数组 |
| `controlMode` | 确认这一路是不是已经在手动模式 |

`queued: true` 也只代表命令进了写入队列，不代表硬件已执行。

### 第 3 步：切回自动

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":1,"mode":"auto"}'
```

**必须切回**，否则这一路的算法一直不会自动调节气囊。

---

## 三、主副驾自适应单独开启和关闭

主驾和副驾各自独立，请求带上 `sensorId` 就只改那一路。

| `mode` | 对外含义 | 算法 | 自动调节气囊 |
| --- | --- | --- | --- |
| `auto` | 自适应开启 | 运行 | 开启 |
| `manual` | 自适应关闭 | 运行，压力和算法数据照常推送 | 关闭 |
| `paused` | 自适应完全暂停 | 暂停 | 关闭 |

日常开关用 `auto` 和 `manual`。三种模式都不影响串口压力采集。

### 开启

```bash
# 主驾自适应开启
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":1,"mode":"auto","reason":"主驾自适应开启"}'

# 副驾自适应开启
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":2,"mode":"auto","reason":"副驾自适应开启"}'
```

### 关闭

```bash
# 主驾自适应关闭
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":1,"mode":"manual","reason":"主驾自适应关闭"}'

# 副驾自适应关闭
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":2,"mode":"manual","reason":"副驾自适应关闭"}'
```

### 完全暂停一路算法

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":1,"mode":"paused","reason":"主驾算法暂停"}'
```

### 查询

```bash
curl "http://127.0.0.1:19245/carAdaptive/mode?sensorId=1"
curl "http://127.0.0.1:19245/carAdaptive/mode?sensorId=2"
```

查询和切换返回同一结构，顶层是本次目标通道，**`sensors` 数组才是主副两路各自的状态**：

| 字段 | 说明 |
| --- | --- |
| `mode` | 该路当前模式 |
| `autoWrite` | 是否在自动调节气囊，等价于 `mode === "auto"` |
| `algorithmRunning` | 算法是否在跑，等价于 `mode !== "paused"` |
| `changed` | 本次是否真的改变了模式，重复设置同一模式为 `false` |
| `sensors` | 主副两路各自的状态，判断某一路开关看这里 |

**不要省略 `sensorId`**，不传时为兼容旧客户端会同时改主副两路。

---

## 四、接口控制气囊展示状态

气囊展示按固定归属控制：API 独占 3、4、5、6 号，ECU 只负责 1、2、7–24 号。ECU 回传中的 3–6 号会被后端忽略。

该接口**只改界面**：不写串口、不控制真实气囊，也不会把 `feedbackOnline` 伪造成 `true`。
设置后界面上的「未收到气囊状态回传」提示会消失。主副驾各自独立。

四路 API 状态不依赖算法：算法还没出结果、座位上没人、这一路没有压力数据时，调完也会立即点亮 3–6 号中的目标气囊。

界面按通道合并：

| 气囊编号 | 展示来源 |
| --- | --- |
| `3、4、5、6` | 只取 API；未设置或清除后固定为 `0`，不读取 ECU |
| `1、2、7–24` | 始终取 ECU；ECU 无回传时熄灭 |

### 设置展示

`gears` 必须传 24 个 `0`–`4` 档位，下标 `0`–`23` 对应气囊 `1`–`24`。只有第 3–6 项允许非零，其余 20 项必须为 `0`；这些零值表示“该通道归 ECU 控制”，不会清掉 ECU 状态。界面**只有档位 `3` 才点亮**。

```bash
# 主驾；副驾把 sensorId 改成 2
curl -X POST http://127.0.0.1:19245/carAdaptive/display \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":1,"gears":[0,0,3,0,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}'
```

也可以直接传一条 51 或 55 字节命令帧，由后端提取 24 路档位：

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/display \
  -H 'Content-Type: application/json' \
  -d '{
    "sensorId": 1,
    "controlCommand": [31,
      1,0, 2,0, 3,0, 4,0, 5,3, 6,3, 7,0, 8,0, 9,0, 10,0, 11,0, 12,0,
      13,0, 14,0, 15,0, 16,0, 17,0, 18,0, 19,0, 20,0, 21,0, 22,0, 23,0, 24,0,
      0, 0, 170, 85, 3, 153]
  }'
```

### 查询展示

```bash
curl "http://127.0.0.1:19245/carAdaptive/display?sensorId=1"
curl "http://127.0.0.1:19245/carAdaptive/display?sensorId=2"
```

| 字段 | 说明 |
| --- | --- |
| `gears` | 当前生效的 24 路档位，`source` 为 `none` 时是空数组 |
| `source` | `api` 表示 3–6 号已显式设置；否则表示其余 20 路的基础来源，3–6 号仍固定为 `0` |
| `baseSource` | 其余 20 路的来源：`ecu`、`command` 或 `none` |
| `override` | 3–6 号是否存在显式 API 展示状态 |
| `overrideAirbagIds` | 显式 API 状态存在时固定为 `[3,4,5,6]` |
| `feedbackOnline` | 始终只表示 ECU 是否真的回传，不因覆盖变成 `true` |
| `sensors` | 主副两路各自的展示状态 |

### 清除四路 API 状态并熄灭

```bash
curl -X DELETE http://127.0.0.1:19245/carAdaptive/display/1
curl -X DELETE http://127.0.0.1:19245/carAdaptive/display/2
```

清除后 3–6 号固定为 `0`，不会恢复读取 ECU；其余 20 路继续跟随 ECU。

### 先确认 ECU 到底回不回传

```bash
curl http://127.0.0.1:19245/carAdaptive/feedbackDiagnostics
```

只读接口。`data.observedFeedback` 为 `false` 就是没收到过回传；回传帧长度不是 51 时，
从 `data.ports.<串口>.lengthCounts` 能看出实际长度。

---

## 五、远程操控页面

用另一台设备控制这台电脑上显示的页面。

查看当前页面状态（在哪个页面、当前主副驾、连接了几个显示端）：

```bash
curl http://127.0.0.1:19245/carAdaptive/ui/state
```

切换主副驾显示：

```bash
# 切到主驾；副驾填 2
curl -X POST http://127.0.0.1:19245/carAdaptive/ui/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"select-sensor","sensorId":1}'
```

返回首页：

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/ui/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"return-home"}'
```

打开自适应模块：

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/ui/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"open-module"}'
```

打开原始数据页：

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/ui/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"open-raw-serial"}'
```

切换主副驾**只改变页面显示**，两路的数据采集和算法始终都在运行。
返回首页和打开模块会按页面策略改变模式；要强制指定最终状态，再调[第三节](#三主副驾自适应单独开启和关闭)的接口。
