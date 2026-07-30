# JQTools 汽车自适应 SDK 快速使用说明

三件事：[取数据](#一取数据)、[控制气囊](#二控制气囊)、[远程操控页面](#三远程操控页面)。

完整接口见 `API.md`。

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

局域网设备访问时把 `127.0.0.1` 换成这台电脑的 IP。

主驾是 `sensorId = 1`，副驾是 `sensorId = 2`，两路数据和算法各自独立运行。

---

## 一、取数据

连上 WebSocket 即可，主副驾数据一起实时推送。

```javascript
const { createClient } = require('@jqtools/client-sdk');
const jqtools = createClient({ unwrap: true });

jqtools.connectCarAdaptiveStream({
  onSensorData: (list) => {
    const main = list.find((item) => item.sensorId === 1);   // 主驾
    console.log('压力数据 144 点:', main.sitData.carAir.arr);
    console.log('气囊当前档位 24 路:', main.algorFeed);   // 来自 ECU 回传，无回传时为空
    console.log('是否有回传:', main.feedbackOnline);
    console.log('在座状态:', main.algorData?.living_status);   // 活体 / 静物 / 离座
    console.log('体型:', main.algorData?.body_type);           // 大人 / 小孩
  }
});
```

不用 Node 的话直接连 `ws://127.0.0.1:19999`，收到的 JSON 里取 `carAdaptiveSensorsData` 字段，结构相同。

查通道是否在线：

```bash
curl http://127.0.0.1:19245/carAdaptive/sensors
```

---

## 二、控制气囊

**默认是全自动的**，算法每 500 ms 自动调节气囊，你不需要做任何事。

气囊有三种模式，**在自适应模块页面时自动就是算法控制**，离开页面自动暂停：

| 模式 | 算法 | 气囊 | 什么时候 |
| --- | --- | --- | --- |
| `auto` 自动 | 运行 | 算法自动调节 | 打开自适应模块页面时自动进入 |
| `manual` 手动 | 运行 | 只听你的命令 | 你主动切，用于标定测试 |
| `paused` 暂停 | 暂停 | 冻结在当前充气量 | 返回宿主页或打开原始数据页时自动进入 |

页面切换是自动的，不用你调接口。回到自适应模块页面时算法会重新初始化，帧计数从零开始。
在模块页内切换主副驾不会打断手动模式，只有真正离开页面再回来才会。

只有需要手动控制时（标定、测试、单气囊验证）才按下面三步走。

> 不想写代码的话，直接用[远程调试页](#方式二独立远程调试页面)，下面这三步在页面上都是点按钮完成的。

### 第 1 步：切到手动模式

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"mode":"manual"}'
```

不切的话，你下发的命令会在下一个 500 ms 被算法命令覆盖。

### 第 2 步：下发命令

命令是 55 个字节：

```text
[31, 气囊1, 档位1, 气囊2, 档位2, ... , 气囊24, 档位24, 0, 0, 170, 85, 3, 153]
 帧头                24 组编号和档位                  模式 方向    帧尾
```

档位：`0` 保持、`1` 慢速、`2` 中速、`3` 快速充气、`4` 快速放气。

气囊编号：

| 编号 | 部位 | 编号 | 部位 |
| --- | --- | --- | --- |
| `1` | 右侧翼上 | `2` | 左侧翼上 |
| `3` | 右侧翼下 | `4` | 左侧翼下 |
| `5` `6` | 腰托 | `7` `8` | 臀托 |
| `9` `10` | 腿托 | `11`–`18` | 靠背按摩 |
| `19`–`24` | 坐垫按摩 | | |

下发接口是 `POST /carAdaptive/writeCommand`，任何语言都能调：

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

返回 `{"code":0,"message":"success","data":{"length":55,"sensorId":1,"controlMode":"manual"}}`，其中 `controlMode` 可以确认你是不是已经在手动模式。

用 Node SDK 的话有现成封装，不用自己拼数组：

```javascript
/** gears 传 {气囊编号: 档位}，没写的气囊保持不动 */
function buildCommand(gears = {}) {
  const command = [31];
  for (let id = 1; id <= 24; id += 1) command.push(id, gears[id] || 0);
  command.push(0, 0, 170, 85, 3, 153);
  return command;
}

// 腰托快速充气，最后一个参数 1 主驾 / 2 副驾
await jqtools.writeCarAdaptiveCommand(buildCommand({ 5: 3, 6: 3 }), 1);

// 全部快速放气
await jqtools.writeCarAdaptiveCommand(buildCommand(
  Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, 4]))
), 1);
```

C# 示例：

```csharp
var command = new List<int> { 31 };
for (int id = 1; id <= 24; id++) { command.Add(id); command.Add(id == 5 || id == 6 ? 3 : 0); }
command.AddRange(new[] { 0, 0, 170, 85, 3, 153 });

var body = JsonSerializer.Serialize(new { sensorId = 1, controlCommand = command });
await http.PostAsync("http://127.0.0.1:19245/carAdaptive/writeCommand",
    new StringContent(body, Encoding.UTF8, "application/json"));
```

### 第 3 步：切回自动

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"mode":"auto"}'
```

**必须切回**，否则算法一直不会自动调节气囊。离开页面再回到自适应模块页面也会自动切回。

需要暂停算法（比如临时停止座椅自适应）：

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/mode \
  -H 'Content-Type: application/json' \
  -d '{"mode":"paused"}'
```

暂停时气囊冻结在当前充气量，不会自动放气；压力数据照常推送。

### 气囊没反应？

1. `curl http://127.0.0.1:19245/carAdaptive/sensors` 看目标通道 `online` 是不是 `true`
2. `curl http://127.0.0.1:19245/carAdaptive/mode` 看是不是还在 `auto`
3. 检查命令是不是 55 个字节，帧头 `31`、帧尾 `170, 85, 3, 153`
4. 看 `curl http://127.0.0.1:19245/carAdaptive/feedbackDiagnostics` 的 `observedFeedback`，确认 ECU 是否回传了状态

接口返回成功只代表命令已进入写入队列，不代表硬件已执行。

### 界面上的气囊不亮？

**界面气囊的亮暗由 ECU 回传的真实状态决定，不是由你下发的命令决定。**

```text
你的命令 --写串口--> ECU --回传状态--> 界面亮暗
```

所以命令发成功了界面也不一定亮，要 ECU 报回来才亮。这是刻意设计的：界面亮
就代表硬件确实在充气，不会因为气泵故障、硬件未上电而误报。

**收不到回传时界面会明确告诉你**，不会只是静悄悄全灭：「区域调节」标题下方出现黄色
提示「未收到气囊状态回传」，整块气囊图同时变暗表示状态未知。

不亮的几种原因，按可能性排序：

| 原因 | 怎么确认 |
| --- | --- |
| 档位不是 `3` | 界面**只有档位 `3`（快速充气）才点亮**，`1`、`2`、放气档硬件在动但界面无变化 |
| ECU 没有回传 | 页面「区域调节」会显示黄色提示「未收到气囊状态回传」，气囊图整体变暗；也可查 `curl http://127.0.0.1:19245/carAdaptive/sensors` 的 `feedbackOnline` |
| 目标通道不是当前显示的那一路 | 给副驾下发、页面停在主驾，界面不会变 |
| 串口未连接 | `curl http://127.0.0.1:19245/connPort` 重连 |

回传中断超过 2 秒，界面气囊会全部熄灭。完整诊断：

```bash
curl http://127.0.0.1:19245/carAdaptive/feedbackDiagnostics
```

看 `observedFeedback` 是否为 `true`，就知道 ECU 到底有没有回传。

如果确认这批硬件不回传状态，启动时设 `JQTOOLS_AIRBAG_FEEDBACK_SOURCE=command`，
界面会回落成显示"已下发的命令"，不会全灭 —— 但此时亮不代表硬件真的在动。

---

## 三、远程操控页面

用另一台设备（iPad、手机、电脑）控制这台电脑上显示的页面。

### 方式一：iPad 上用同一个界面操作

iPad 浏览器打开：

```text
http://<这台电脑的IP>:19245/app?remoteControl=1&showTitle=1
```

打开后就是和电脑上一样的界面，直接点就行：

| 操作 | 效果 |
| --- | --- |
| 点"主驾 / 副驾"按钮 | 电脑上的页面同步切换主副驾 |
| 点左上角品牌标识 | 电脑上的页面返回首页 |

不需要装任何 App，也不需要额外配置。

### 方式二：独立远程调试页面

不需要编写代码，直接在 iPad、手机或另一台电脑的浏览器打开：

```text
http://<这台电脑的IP>:19245/app#/remote-control
```

例如 SDK 电脑地址为 `192.168.1.20`：

```text
http://192.168.1.20:19245/app#/remote-control
```

该页面是专用的局域网控制台，**不用写任何代码就能完成本文档里的全部操作**：

| 功能 | 说明 |
| --- | --- |
| 查看服务状态 | SDK 服务是否在线、显示端数量、WebSocket 客户端数量 |
| 查看当前页面 | WPF 当前位于宿主页、自适应模块还是原始数据页 |
| 查看通道状态 | 主驾、副驾各自的在线状态、采集频率和算法帧数 |
| 切换主副驾 | 向所有已连接的 SDK 显示端广播主驾或副驾 |
| 页面跳转 | 返回宿主页、打开自适应模块、打开原始数据 |
| **切换气囊模式** | 自动 / 手动 / 暂停三态一键切换，等价于调 `/carAdaptive/mode` |
| **手动控制气囊** | 点选气囊后选档位下发，等价于调 `/carAdaptive/writeCommand` |
| **一键全部放气** | 急停用，把 24 项气囊全设为放气档 |
| 查看执行回执 | 最近命令、命令编号、执行客户端和回执时间 |
| 输入控制令牌 | 启用了 `RemoteControlToken` 时，在页面内填写令牌后再操作 |

气囊控制区的用法：

1. 选「目标通道」主驾或副驾 —— 这是**命令发给谁**，和上面的「显示通道」是两件事，可以显示主驾、控制副驾。
2. 「控制模式」点手动（三个按钮：自动 / 手动 / 暂停）。还在自动模式时页面会给黄色提示，因为命令会被算法覆盖。
3. 点要控制的气囊（可多选），按分组排列，每个格子显示编号、部位和当前档位。
4. 点档位按钮下发。未选中的气囊自动填保持档，不会被动到。
5. 测完点「控制模式 → 自动」交回算法。

页面每秒自动刷新状态，气囊当前档位通过 WebSocket 实时更新。`SDK 显示端` 为 `0` 时
仍可下发命令，但当前没有 WPF 页面接收和执行；先确认客户程序已经启动并加载了汽车
自适应控件。注意气囊命令是直接写串口的，**不需要**显示端在线，只需要目标通道在线。

**主副驾切换只影响显示**，两路始终同时采集、同时执行算法，不会因为切换展示通道而中断。

**页面跳转会影响算法**：点「返回宿主页」或「原始数据」会让算法暂停、气囊冻结；点
「自适应模块」会恢复自动并重新初始化算法。这和上面「二、控制气囊」里的三种模式是
同一套机制，页面上的「气囊模式」会同步显示当前状态。串口采集始终不受影响。

### 方式三：用接口控制

切换到副驾：

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/ui/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"select-sensor","sensorId":2}'
```

`sensorId` 填 `1` 是主驾，`2` 是副驾。

返回首页：

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/ui/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"return-home"}'
```

重新打开自适应模块：

```bash
curl -X POST http://127.0.0.1:19245/carAdaptive/ui/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"open-module"}'
```

查看当前页面状态（在哪个页面、当前主副驾、连接了几个显示端）：

```bash
curl http://127.0.0.1:19245/carAdaptive/ui/state
```

切换主副驾**只改变页面显示**，主驾和副驾的数据采集、算法、气囊控制始终都在运行，不会因为切换而中断。

### 配置首页地址

"返回首页"要回到哪里，启动时指定：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-wpf.ps1 `
    -HomeUrl "https://你的主页地址"
```

如果是自己的 WPF 程序，用 `HomeRequested` 事件自己跳转：

```csharp
private void HandleCarAdaptiveHomeRequested(object? sender, CarAdaptiveHomeRequestedEventArgs e)
{
    MainFrame.Navigate(new HomePage());
}
```

### 加个口令（建议）

不设口令时，同一局域网内任何设备都能控制页面。设置方法：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-wpf.ps1 `
    -RemoteControlToken "你的口令"
```

之后调接口要带上：

```http
X-JQTools-Control-Token: 你的口令
```

### 连不上？

1. 两台设备在同一个局域网
2. 这台电脑的防火墙放行 TCP `19245` 和 `19999`
3. 程序正在运行
