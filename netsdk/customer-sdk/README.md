# JQTools 汽车自适应客户 SDK

这是可独立交付的客户版目录。客户不需要安装 Node.js、Python，也不需要保留原项目源码即可运行。默认入口是 WPF 程序，它会启动真实串口后端、内置 Python 算法并加载当前 Three.js 前端。

## 目录结构

```text
customer-sdk/
  app/                       # 客户直接运行的 WPF 程序，默认加载 /app 真实前端
  mock-service/              # 兼容命名的真实后端独立启动入口
  wpf-control/               # WPF 自定义控件 DLL，客户自己的 WPF 项目可引用
  native-dll/                # 标准 C/C++ Native DLL 和 WPF P/Invoke 示例
  real-backend/              # 受保护后端 EXE、加密业务包、Python 字节码和生产依赖
  runtime/node/node.exe      # 随 SDK 交付的 Node.js 运行时
  frontend-build/            # 当前前端和 Three.js 模型资源
  docs/QUICKSTART.md         # 客户快速接入、取数、控气囊和远程控制
  docs/API.md                # 客户 SDK 完整业务接口
  scripts/start-wpf.ps1      # 启动 WPF
  scripts/start-mock-service.ps1
  scripts/stop-mock-service.ps1
  scripts/verify-sdk.ps1     # 本地验收脚本
```

## 新电脑运行要求

客户电脑需满足：

- Windows 10/11 x64
- 安装 .NET 8 Desktop Runtime x64（WPF 程序使用框架依赖方式发布）
- 安装 Microsoft Edge WebView2 Runtime x64（用于加载内置前端）

官方下载：

```text
.NET 8: https://dotnet.microsoft.com/en-us/download/dotnet/8.0
WebView2: https://developer.microsoft.com/en-us/microsoft-edge/webview2?form=MT00D7
```

Node.js 与 Python 已放在 SDK 内，客户不需要另外安装。复制到新电脑时必须把整个
`customer-sdk` 文件夹作为一个整体复制。请先删除目标电脑上的旧目录，再复制新目录，
不要只覆盖 `backend-host.exe` 或 `backend.jqpack`，否则加密宿主和业务包可能不配套。
建议使用不含特殊字符的短路径，例如 `D:\CarAdaptiveSDK\customer-sdk`。

## 客户怎么启动

直接双击：

```text
app\JqTools.CarAdaptive.ClientWpf.exe
```

或执行：

```powershell
cd customer-sdk
powershell -ExecutionPolicy Bypass `
    -File .\scripts\start-wpf.ps1 `
    -HomeUrl "https://customer.example/home"
```

`-HomeUrl` 可省略。省略时，客户 WPF 主程序通过 `HomeRequested` 事件返回自己的原生主页。

默认端口：

```text
HTTP: http://127.0.0.1:19245
WebSocket: ws://127.0.0.1:19999
真实前端: http://127.0.0.1:19245/app
原始数据: http://127.0.0.1:19245/app#/raw-serial
接口调试: http://127.0.0.1:19245/app#/api-debug
```

原始数据页可开始或停止真实采集，并把当前采集段直接导出为 CSV。导出文件保留每帧的
传感器标识和 144 个原始压力字节，不包含算法或可视化处理值。

WPF 默认允许真实后端和 Python 算法使用 30 秒完成首次启动。汽车自适应页首次加载、从其他
页面返回、远程重新打开或 WebView 隐藏后恢复时，都会自动按顺序调用 `/connPort` 和
`/sendMac`，不需要客户再次点击“一键连接”。完整标题栏默认隐藏，页面最右上角保留一个
不可见的 `48 x 48` 像素点击区域；点击可显示标题栏，再次点击可隐藏。现场调试也可通过参数默认打开：

```text
http://127.0.0.1:19245/app?showTitle=1
```

`19245` 或 `19999` 被其他程序占用时，WPF 程序会保留窗口并显示端口冲突。关闭占用程序后点击“重试”即可，不需要重启 WPF。

## 新电脑怎么验证

先在新电脑的 PowerShell 中执行无硬件验收：

```powershell
Set-Location D:\CarAdaptiveSDK\customer-sdk
powershell -ExecutionPolicy Bypass -File .\scripts\verify-sdk.ps1
```

看到下面一行表示 SDK 文件、加密后端、双路 Python 算法、HTTP 和 WebSocket 链路通过：

```text
CUSTOMER_SDK_REAL_VERIFY_OK
```

再验证 WPF 窗口能否启动并自动关闭：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-sdk.ps1 -IncludeWpfSmokeTest
```

以上两步不需要连接传感器。需要连真实串口做现场验收时执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-sdk.ps1 -ConnectSerial
```

验收脚本会用备用端口启动 `mock-service`，验证：

- 必要文件是否存在
- `backend-host.exe` 与 `backend.jqpack` 是否来自同一次构建且文件未损坏
- HTTP `/health`
- HTTP `/getPort` 真实串口后端
- HTTP `/algorithm/config` 内置 Python 算法与参数
- HTTP `/carAdaptive/collection/export` 原始 CSV 下载路由
- 主、副两套 `.pyc` 算法各处理一帧 144 点数据
- 主驾和副驾的 `auto/manual/paused` 模式可以独立切换，互不影响
- API 独占每路 3–6 号展示，清除后四路熄灭；ECU 只控制其余 20 路
- WebSocket 同时记录算法命令、ECU 回传、接口串口命令和接口展示命令
- 局域网 UI 命令广播、主副驾切换和 SDK 页面执行回执
- 第一方 Node/Python 明文源码已从交付目录删除
- 当前前端和 Three.js 座椅模型资源

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
            HomeRequested="HandleCarAdaptiveHomeRequested"
            Host="127.0.0.1"
            HttpPort="19245"
            WebSocketPort="19999"
            StartupTimeoutSeconds="30"
            PagePath="/app"
            HomeUrl="https://customer.example/home" />
    </Grid>
</Window>
```

当局域网设备下发“返回主页”命令时，控件触发 `HomeRequested`，客户主程序在事件中导航到自己的主页，不需要修改 SDK 页面：

```csharp
private void HandleCarAdaptiveHomeRequested(
    object? sender,
    CarAdaptiveHomeRequestedEventArgs e)
{
    MainFrame.Navigate(new HomePage());
}
```

网页主页使用 `HomeUrl`；原生 WPF 页面使用 `HomeRequested`。事件参数还包含 `HomeUrl`，客户可按该值映射自己的导航路由。

## Native DLL 引用

Native DLL：

```text
native-dll\JqToolsCarAdaptiveNative.dll
```

WPF P/Invoke 示例：

```text
native-dll\wpf-loader\JqToolsCarAdaptiveNative.cs
```

## 真实接口文档

客户首次接入先阅读快速说明：

```text
docs\QUICKSTART.md
```

客户 SDK 业务使用的 HTTP、WebSocket、双传感器算法、自动/手动控制模式、55 字节
串口写入、采集回放和远程控制接口见：

```text
docs\API.md
```

其中新版页面使用 `carAdaptiveSensorsData` 同时接收主、副两套完整状态。顶层
`sitData`、`algorData` 和 `algorFeed` 只保留给旧版单路客户端。

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

## 串口原始数据页面

完整标题栏默认隐藏；需要查看原始数据时可以直接访问：

```text
http://127.0.0.1:19245/app#/raw-serial
```

该页面直接订阅真实 WebSocket 的 `carAdaptiveSensorsData`，读取 `sitData.carAir.arr` 中未经算法、滤波、插值和预压力置零的 144 个压力字节。靠背和坐垫各占 72 点，每块按宽 1、高 4 的侧翼 A、宽 1、高 4 的侧翼 B、`8×8` 中心区排列。页面支持：

- 主驾（标识符 `1`）和副驾（标识符 `2`）本地切换
- 按现有座椅点图形状展示靠背、坐垫及左右侧区
- 同时查看完整 145 字节帧、原始索引、刷新频率和统计值
- 十进制/十六进制切换、数值显隐和实时暂停
- 在右侧切换“气囊指令”，查看算法生成/下发、ECU 回传、接口写串口和接口展示覆盖
- 点击“历史记录”打开弹窗，按来源筛选并查看完整字节、24 路档位或清空当前通道历史
- 在页面顶部开始或停止当前主副驾的真实数据采集，并与主界面采集面板同步状态

使用非默认 WebSocket 端口调试时，在 `/app` 后增加查询参数，例如：

```text
http://127.0.0.1:19645/app?wsPort=19699#/raw-serial
```

## 算法参数调节

完整标题栏及其中的调节工具栏启动时默认隐藏。点击页面最右上角透明热区或使用 `/app?showTitle=1` 打开标题栏，再点击左上角品牌图标展开或收起工具栏；展开工具栏不会自动打开可视化、视图、气囊位置或算法调节面板。

“气囊位置”面板按肩部、侧翼、腰部、坐垫和七排按摩气囊分组。左右气囊共用纵向位置和尺寸，只调左侧 `X`，右侧会围绕 `50%` 中线自动镜像；两个腰部中央气囊按宽度自动居中。按住面板标题栏可拖动浮窗，位置始终限制在当前窗口内。修改实时显示并保存到本机，面板中的“复制配置”会输出可直接替换前端 `airArr` 的 `const airArr = [...]` JavaScript 格式。

进入汽车自适应页面后，点击右上角的滑杆图标可拉出“算法参数”抽屉。参数按功能分组并显示 YAML 中文注释，支持搜索、数字/开关/数组编辑、撤销修改和批量保存。保存后配置写入：

```text
real-backend\python\app\sensor_config.yaml
```

后端会同时重建主、副两套常驻 Python 算法实例，因此修改立即作用于两路后续压力帧。

## 主副传感器切换

点击页面最右上角透明热区或使用 `/app?showTitle=1` 后，标题栏中的“显示”分段按钮支持“主驾 / 副驾”切换。默认隐藏标题栏时也可使用局域网远程控制页或接口切换。后端始终接收两种 145 字节串口帧：首字节 `1` 使用主驾独立算法实例，首字节 `2` 使用副驾独立算法实例，并通过 `carAdaptiveSensorsData` 同时推送两套完整数据。前端分别缓存两路数据，切换只改变当前页面读取哪份缓存，不会影响两路后端算法。

```text
GET  /carAdaptive/sensors  # 查询两路在线状态、频率和算法帧计数
```

`GET/POST /carAdaptive/sensor` 仅为旧版单路 WebSocket 客户端保留；当前 WPF 前端不依赖该接口切换页面。

## 局域网远程控制

客户联调接口时直接打开：

```text
http://<SDK电脑IP>:19245/app#/api-debug
```

该页面可以检查 HTTP/WebSocket/串口状态，独立开启或关闭主副驾自适应，控制客户 API 开放的
`3`、`4`、`5`、`6` 号气囊，设置这四路 API 独占的界面状态（其余 20 路继续跟随 ECU），发送页面命令，并保留每次 HTTP 请求和响应。

现有汽车自适应页面没有新增按钮或修改布局。iPad 可直接打开同一套业务界面，并让已有的“主驾 / 副驾”切换广播到 WPF 和其他显示端：

```text
http://<SDK电脑IP>:19245/app?remoteControl=1&showTitle=1
```

在该模式下，点击“主驾 / 副驾”会同步所有显示端，点击左上角 Faway 标识会广播“返回主页”。普通 `/app` 页面仍只切换本机展示，不会误发远程命令。

也可打开独立调试控制页：

```text
http://<SDK电脑IP>:19245/app#/remote-control
```

或直接调用：

```text
GET  /carAdaptive/ui/state
POST /carAdaptive/ui/command
```

支持 `return-home`、`open-module`、`open-raw-serial` 和 `select-sensor`。返回网页主页可通过 WPF `HomeUrl`、启动脚本 `-HomeUrl` 或环境变量 `JQTOOLS_HOME_URL` 配置；原生 WPF 主页继续由 `HomeRequested` 处理。生产环境可通过 `RemoteControlToken` 或启动脚本的 `-RemoteControlToken` 启用控制口令。

# 当前默认：真实数据模式

当前 `customer-sdk` 默认启动真实后端链路：WPF 会启动 `real-backend/backend-host.exe`，在内存加载 `backend.jqpack`，读取真实串口，调用 `python/app/server.pyc` 算法，并把算法返回的 `control_command` 写回区域控制串口。

详细说明见：

```text
docs\QUICKSTART.md
docs\API.md
```
