# JQTools 汽车自适应客户 SDK

这是客户交付版目录，客户不需要源码工程即可验证链路。默认启动入口是 WPF 程序，WPF 内部会自动启动真实协议假数据服务，并加载项目当前真实前端；Three.js 模型资源已随 SDK 一起输出。

## 目录结构

```text
customer-sdk/
  app/                       # 客户直接运行的 WPF 程序，默认加载 /app 真实前端
  mock-service/              # 真实协议假数据服务，HTTP + WebSocket + 当前前端静态资源
  wpf-control/               # WPF 自定义控件 DLL，客户自己的 WPF 项目可引用
  native-dll/                # 标准 C/C++ Native DLL 和 WPF P/Invoke 示例
  docs/FAKE_API.md           # 假数据接口和真实 WS 协议说明
  scripts/start-wpf.ps1      # 启动 WPF
  scripts/start-mock-service.ps1
  scripts/stop-mock-service.ps1
  scripts/verify-sdk.ps1     # 本地验收脚本
```

## 客户怎么启动

直接双击：

```text
app\JqTools.CarAdaptive.ClientWpf.exe
```

或执行：

```powershell
cd customer-sdk
powershell -ExecutionPolicy Bypass -File .\scripts\start-wpf.ps1
```

默认端口：

```text
HTTP: http://127.0.0.1:19245
WebSocket: ws://127.0.0.1:19999
真实前端: http://127.0.0.1:19245/app
```

## 本地怎么验证

执行：

```powershell
cd customer-sdk
powershell -ExecutionPolicy Bypass -File .\scripts\verify-sdk.ps1
```

验收脚本会用备用端口启动 `mock-service`，验证：

- 必要文件是否存在
- HTTP `/health`
- HTTP `/fake/connect`
- WebSocket 是否按真实协议推送
- `{ sitData }` 中 144 点压力数据长度
- `{ algorFeed }` 中 24 路反馈长度
- `{ algorData }` 中 144 点压力数据和 51 字节控制命令长度

需要顺便验证 WPF 能否启动时：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-sdk.ps1 -IncludeWpfSmokeTest
```

## WPF 控件 DLL 引用

客户自己的 WPF 项目可引用：

```text
wpf-control\JqTools.CarAdaptive.Wpf.dll
```

XAML 示例：

```xml
<Window
    x:Class="CustomerApp.MainWindow"
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    xmlns:jq="clr-namespace:JqTools.CarAdaptive.Wpf;assembly=JqTools.CarAdaptive.Wpf">
    <Grid>
        <jq:CarAdaptiveDebugControl
            AutoStartService="True"
            StopServiceOnUnload="True"
            StopServiceOnApplicationExit="True"
            Host="127.0.0.1"
            HttpPort="19345"
            WebSocketPort="19399" />
    </Grid>
</Window>
```

## Native DLL 引用

Native DLL：

```text
native-dll\JqToolsCarAdaptiveNative.dll
```

WPF P/Invoke 示例：

```text
native-dll\wpf-loader\JqToolsCarAdaptiveNative.cs
```

## 真实 WebSocket 协议

该假数据服务按真实后端协议推送：

```json
{}
```

```json
{ "sitData": { "carAir": { "arr": [144点压力数据] } } }
```

```json
{ "algorFeed": [24路反馈] }
```

```json
{ "algorData": { "sensor_data_144": [144点压力数据], "control_command": [51字节控制命令] } }
```

完整接口见：

```text
docs\FAKE_API.md
```

## 前端和 Three.js 资源

当前项目的 `build/` 前端已复制到各个内置服务目录：

```text
frontend-build\
```

其中包含：

```text
frontend-build\static\
frontend-build\model\
```

说明：SDK 只保留这一份真实前端资源，WPF 程序、WPF 控件和独立 mock-service 都会共用它，避免 Three.js 模型文件被重复复制。

所以 Three.js 的 `.glb`、`.fbx`、贴图等模型资源会跟随 SDK 一起交付。WPF 默认加载 `/app`，不是之前的 `/debug` 简化调试页。
# 当前默认：真实数据模式

当前 `customer-sdk` 默认启动真实后端链路：WPF 会启动 `server/serialServer.js`，读取真实串口，调用 `pyWorker.js / Python` 算法，并把算法返回的 `control_command` 写回气囊串口。

详细说明见：

```text
docs\REAL_DATA_SDK.md
```

`docs\FAKE_API.md` 只保留为早期假数据调试协议参考，不代表当前默认启动模式。
