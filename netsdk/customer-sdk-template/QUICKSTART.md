# JQTools 汽车自适应接口快速调用

本文只保留客户业务需要的 HTTP 和 WebSocket 接口调用方法。完整字段定义见 `API.md`。

## 1. 接口约定

| 项目 | 值 |
| --- | --- |
| HTTP 地址 | `http://127.0.0.1:19245` |
| WebSocket 地址 | `ws://127.0.0.1:19999` |
| 主驾标识 | `sensorId = 1` |
| 副驾标识 | `sensorId = 2` |

局域网设备调用时，将 `127.0.0.1` 替换为运行 SDK 服务的电脑 IP。

HTTP 接口统一返回：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

`code = 0` 表示接口执行成功。需要远程控制口令时，在请求头增加：

```http
X-JQTools-Control-Token: 配置的口令
```

## 2. 服务与串口

### 2.1 检查服务

```bash
curl http://127.0.0.1:19245/health
```

### 2.2 查询串口

```bash
curl http://127.0.0.1:19245/getPort
```

### 2.3 自动连接串口

```bash
curl http://127.0.0.1:19245/connPort
curl http://127.0.0.1:19245/sendMac
```

## 3. 主副驾自适应独立开启和关闭

主驾和副驾必须分别传入 `sensorId`，两路互不影响。

| `mode` | 对外含义 | 算法 | 自动写气囊串口 |
| --- | --- | --- | --- |
| `auto` | 自适应开启 | 继续运行 | 开启 |
| `manual` | 自适应关闭 | 继续运行并返回算法数据 | 关闭 |
| `paused` | 自适应完全暂停 | 暂停 | 关闭 |

通常使用 `auto` 和 `manual` 作为自适应开启/关闭。`manual` 下仍有压力和算法数据，也可以通过 `/carAdaptive/writeCommand` 手动控制气囊。

### 3.1 查询主驾状态

```bash
curl "http://127.0.0.1:19245/carAdaptive/mode?sensorId=1"
```

### 3.2 查询副驾状态

```bash
curl "http://127.0.0.1:19245/carAdaptive/mode?sensorId=2"
```

### 3.3 主驾自适应开启

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":1,"mode":"auto","reason":"主驾自适应开启"}'
```

### 3.4 主驾自适应关闭

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":1,"mode":"manual","reason":"主驾自适应关闭"}'
```

### 3.5 副驾自适应开启

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":2,"mode":"auto","reason":"副驾自适应开启"}'
```

### 3.6 副驾自适应关闭

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":2,"mode":"manual","reason":"副驾自适应关闭"}'
```

### 3.7 完全暂停一路算法

```bash
# 主驾完全暂停；副驾改为 sensorId=2
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":1,"mode":"paused","reason":"主驾算法暂停"}'
```

接口成功后检查响应中的 `data.sensorId`、`data.mode`、`data.autoWrite` 和 `data.algorithmRunning`。调用时不要省略 `sensorId`；不传时会进入旧接口兼容逻辑并同时修改两路。

## 4. 查询主副驾实时状态

### 4.1 HTTP 状态

```bash
curl http://127.0.0.1:19245/carAdaptive/sensors
```

响应 `data` 中同时包含主驾和副驾，常用字段：

| 字段 | 说明 |
| --- | --- |
| `sensorId` | `1` 主驾，`2` 副驾 |
| `online` | 是否收到该路压力数据 |
| `controlMode` | 该路当前 `auto`、`manual` 或 `paused` 模式 |
| `algorithmReady` | 是否已经得到算法结果 |
| `feedbackOnline` | ECU 最近是否真实回传气囊状态 |
| `airbagDisplaySource` | 当前展示来源：`api`、`ecu`、`command` 或 `none` |

### 4.2 WebSocket 实时数据

```text
ws://127.0.0.1:19999
```

收到 JSON 后读取 `carAdaptiveSensorsData`。数组中同时包含主驾和副驾：

```javascript
const socket = new WebSocket('ws://127.0.0.1:19999');

socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (!Array.isArray(message.carAdaptiveSensorsData)) return;

  const driver = message.carAdaptiveSensorsData.find((item) => item.sensorId === 1);
  const passenger = message.carAdaptiveSensorsData.find((item) => item.sensorId === 2);

  console.log('主驾 144 点压力:', driver?.sitData?.carAir?.arr);
  console.log('主驾算法:', driver?.algorData);
  console.log('副驾 144 点压力:', passenger?.sitData?.carAir?.arr);
  console.log('副驾算法:', passenger?.algorData);
};
```

## 5. 接口控制气囊展示状态

ECU 有些指令回传、有些不回传时，可用该接口强制覆盖指定一路的界面展示。覆盖优先级高于 ECU 回传，并保持到 DELETE 清除。

该接口只修改界面，不写串口、不控制真实气囊，也不会把 `feedbackOnline` 伪造成 `true`。

### 5.1 设置主驾展示

`gears` 必须包含 24 个 `0` 到 `4` 的整数。当前界面将档位 `3` 显示为点亮，`0` 显示为熄灭。

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/display \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":1,"gears":[3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}'
```

### 5.2 设置副驾展示

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/display \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":2,"gears":[3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}'
```

### 5.3 查询展示状态

```bash
# 主驾
curl "http://127.0.0.1:19245/carAdaptive/display?sensorId=1"

# 副驾
curl "http://127.0.0.1:19245/carAdaptive/display?sensorId=2"
```

响应中的 `source: "api"` 和 `override: true` 表示接口覆盖正在生效。

### 5.4 清除展示覆盖

```bash
# 主驾恢复跟随 ECU
curl -X DELETE http://127.0.0.1:19245/carAdaptive/display/1

# 副驾恢复跟随 ECU
curl -X DELETE http://127.0.0.1:19245/carAdaptive/display/2
```

## 6. 接口控制真实气囊

手动控制前先把目标通道切换到 `manual`，否则 `auto` 模式会在下一个自动周期覆盖手动命令。

控制命令固定为 55 字节：

```text
[31, 气囊1, 档位1, ... , 气囊24, 档位24, 0, 0, 170, 85, 3, 153]
```

档位：`0` 保持、`1` 慢速、`2` 中速、`3` 快速充气、`4` 快速放气。

```bash
# 主驾 5、6 号腰托快速充气
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

控制副驾时把 `sensorId` 改为 `2`。响应 `queued: true` 只表示命令进入串口队列，不表示 ECU 已执行或已经回传。

## 7. 查询气囊指令历史

### 7.1 查询记录

```bash
# 主驾全部来源，最新 200 条
curl "http://127.0.0.1:19245/carAdaptive/commands/history?sensorId=1&limit=200"

# 副驾只查询 ECU 回传
curl "http://127.0.0.1:19245/carAdaptive/commands/history?sensorId=2&type=ecuFeedback&limit=200"
```

`type` 可取：

- `algorithmGenerated`
- `algorithmSent`
- `ecuFeedback`
- `apiSerial`
- `apiDisplay`

### 7.2 清空记录

```bash
# 只清空主驾 ECU 回传历史
curl -X DELETE "http://127.0.0.1:19245/carAdaptive/commands/history/1?type=ecuFeedback"

# 清空副驾全部气囊指令历史
curl -X DELETE http://127.0.0.1:19245/carAdaptive/commands/history/2
```

清空历史不会改变算法模式、串口状态、真实气囊或展示覆盖。

## 8. 远程切换页面与主副驾展示

### 8.1 查询显示端状态

```bash
curl http://127.0.0.1:19245/carAdaptive/ui/state
```

### 8.2 切换主驾展示

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/ui/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"select-sensor","sensorId":1}'
```

### 8.3 切换副驾展示

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/ui/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"select-sensor","sensorId":2}'
```

### 8.4 返回宿主页

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/ui/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"return-home"}'
```

### 8.5 打开自适应模块

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/ui/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"open-module"}'
```

### 8.6 打开原始数据模块

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/ui/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"open-raw-serial"}'
```

切换主副驾只改变前端展示，不会停止任何一路算法。返回宿主页和打开模块会按后端页面策略改变模式；需要强制指定最终状态时，再分别调用第 3 节的 `/carAdaptive/mode`。

## 9. 数据采集

### 9.1 查询采集状态

```bash
curl http://127.0.0.1:19245/carAdaptive/collection
```

### 9.2 开始采集

```bash
# 采集副驾；主驾改为 sensorId=1
curl -X POST http://127.0.0.1:19245/startCol \
  -H 'Content-Type: application/json' \
  -d '{"sensorId":2,"fileName":"副驾测试"}'
```

### 9.3 停止并保存

```bash
curl http://127.0.0.1:19245/endCol
```

### 9.4 导出 CSV

```powershell
curl.exe -OJ "http://127.0.0.1:19245/carAdaptive/collection/export?fileName=%E5%89%AF%E9%A9%BE%E6%B5%8B%E8%AF%95&sensorId=2"
```

## 10. 算法参数

### 10.1 查询算法参数

```bash
curl http://127.0.0.1:19245/algorithm/config
```

### 10.2 修改算法参数

```bash
curl -X POST http://127.0.0.1:19245/algorithm/config \
  -H 'Content-Type: application/json' \
  -d '{"changes":{"参数路径":参数值}}'
```

参数修改会同时作用于主驾和副驾的后续算法实例。
