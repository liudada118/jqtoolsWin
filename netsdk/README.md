# 汽车自适应 SDK 交付与更新流程

本文档说明本项目如何从新的前端、后端、算法或调试页面代码，构建并输出到 `netsdk` 交付目录。当前方案不生成 `.tgz`，直接输出可被 WPF 使用的目录和 DLL。

## 1. 当前交付目标

最终建议输出到 `D:\jqtoolsWin1\netsdk`，目录结构如下：

```text
netsdk/
  README.md                         # 本说明文档
  wpf-control/                      # .NET 8 WPF 自定义控件库交付目录
    JqTools.CarAdaptive.Wpf.dll
    Microsoft.Web.WebView2.*.dll
    runtimes/
    mock-sdk/
  native-dll/                       # 标准 C/C++ Native DLL 交付目录
    JqToolsCarAdaptiveNative.dll
    mock-sdk/
  sdk-service/                      # 正式 SDK HTTP/WS 服务
    service.js
    index.js
    index.d.ts
    debug.html
    python/
    node_modules/
  mock-service/                     # 假数据调试 HTTP/WS 服务
    mock-service.js
    mock-debug.html
    package.json
    node_modules/
```

客户 WPF 项目有两种接入方式：

- 新 WPF / .NET 8：优先使用 `wpf-control/JqTools.CarAdaptive.Wpf.dll`。
- 老 WPF / .NET Framework：使用 `native-dll/JqToolsCarAdaptiveNative.dll` + P/Invoke 包装类。

## 2. 环境要求

当前机器已安装并验证：

- Node.js 18 或以上，当前为 Node.js 22。
- npm。
- Python 3.11。
- .NET SDK 8。
- CMake。
- Visual Studio 2022 Build Tools C++ 工具链。
- Microsoft Edge WebView2 Runtime。

首次换机器时，至少要执行：

```powershell
cd D:\jqtoolsWin1
npm install

cd D:\jqtoolsWin1\sdk
npm install

cd D:\jqtoolsWin1\mock-sdk
npm install

cd D:\jqtoolsWin1
python -m pip install -r .\sdk\python\app\requirements.txt
```

## 3. 文件职责

### 3.1 正式 SDK 服务

目录：`D:\jqtoolsWin1\sdk`

主要文件：

- `service.js`：启动正式 HTTP 服务和 WebSocket 服务。
- `index.js`：SDK 客户端逻辑，负责调用 Python 算法、接口封装和串口代理。
- `index.d.ts`：TypeScript 类型声明。
- `debug.html`：正式 SDK 调试页面。
- `python/app/`：SDK 内置 Python 算法文件。

默认端口：

- HTTP：`http://127.0.0.1:19245`
- WebSocket：`ws://127.0.0.1:19999`
- 调试页：`http://127.0.0.1:19245/debug`

启动命令：

```powershell
cd D:\jqtoolsWin1\sdk
npm start
```

### 3.2 假数据调试服务

目录：`D:\jqtoolsWin1\mock-sdk`

主要文件：

- `mock-service.js`：启动假数据 HTTP 服务和 WebSocket 服务。
- `mock-debug.html`：假数据调试页面。
- `package.json`：假数据服务依赖声明。

默认端口：

- HTTP：`http://127.0.0.1:19345`
- WebSocket：`ws://127.0.0.1:19399`
- 调试页：`http://127.0.0.1:19345/debug`

启动命令：

```powershell
cd D:\jqtoolsWin1\mock-sdk
npm start
```

### 3.3 WPF 控件库

目录：`D:\jqtoolsWin1\dotnet-wrapper\JqTools.CarAdaptive.Wpf`

输出：

```text
D:\jqtoolsWin1\dotnet-wrapper\JqTools.CarAdaptive.Wpf\bin\Release\net8.0-windows\
```

核心 DLL：

```text
JqTools.CarAdaptive.Wpf.dll
```

这个目录会自动带上：

- WebView2 相关 DLL。
- `mock-sdk/` 假数据调试服务。

构建命令：

```powershell
cd D:\jqtoolsWin1
dotnet build .\dotnet-wrapper\JqTools.CarAdaptive.Wpf\JqTools.CarAdaptive.Wpf.csproj -c Release
```

### 3.4 Native DLL

目录：`D:\jqtoolsWin1\native-dll\JqToolsCarAdaptiveNative`

输出：

```text
D:\jqtoolsWin1\native-dll\JqToolsCarAdaptiveNative\build\Release\
```

核心 DLL：

```text
JqToolsCarAdaptiveNative.dll
```

构建命令：

```powershell
cd D:\jqtoolsWin1
& 'C:\Program Files\CMake\bin\cmake.exe' -S .\native-dll\JqToolsCarAdaptiveNative -B .\native-dll\JqToolsCarAdaptiveNative\build -G "Visual Studio 17 2022" -A x64
& 'C:\Program Files\CMake\bin\cmake.exe' --build .\native-dll\JqToolsCarAdaptiveNative\build --config Release
```

## 4. 如果有新的前端文件，应该怎么做

根据前端属于哪一类，放到对应位置。

### 4.1 新的正式 SDK 调试页面

替换或修改：

```text
D:\jqtoolsWin1\sdk\debug.html
```

验证：

```powershell
cd D:\jqtoolsWin1\sdk
npm start
```

打开：

```text
http://127.0.0.1:19245/debug
```

### 4.2 新的假数据调试页面

替换或修改：

```text
D:\jqtoolsWin1\mock-sdk\mock-debug.html
```

验证：

```powershell
cd D:\jqtoolsWin1\mock-sdk
npm start
```

打开：

```text
http://127.0.0.1:19345/debug
```

如果你希望 WPF 控件库和 Native DLL 使用新的假数据页面，修改 `mock-sdk/mock-debug.html` 后必须重新构建：

```powershell
cd D:\jqtoolsWin1
dotnet build .\dotnet-wrapper\JqTools.CarAdaptive.Wpf\JqTools.CarAdaptive.Wpf.csproj -c Release

& 'C:\Program Files\CMake\bin\cmake.exe' --build .\native-dll\JqToolsCarAdaptiveNative\build --config Release
```

原因：

- WPF 控件库构建时会把 `mock-sdk` 复制到 WPF 输出目录。
- Native DLL 构建时会把 `mock-sdk` 复制到 Native DLL 输出目录。

## 5. 如果有新的后端文件，应该怎么做

### 5.1 正式 SDK 后端

常见修改位置：

```text
D:\jqtoolsWin1\sdk\service.js
D:\jqtoolsWin1\sdk\index.js
D:\jqtoolsWin1\sdk\index.d.ts
```

处理原则：

- 新增 HTTP 接口：改 `sdk/service.js`。
- 新增 SDK 调用方法：改 `sdk/index.js`。
- 给客户 TypeScript 类型提示：同步改 `sdk/index.d.ts`。
- 新增 Python 算法入口或参数：改 `sdk/python/app/`。

验证：

```powershell
cd D:\jqtoolsWin1\sdk
npm start
```

检查健康接口：

```powershell
Invoke-RestMethod http://127.0.0.1:19245/health
```

### 5.2 假数据后端

常见修改位置：

```text
D:\jqtoolsWin1\mock-sdk\mock-service.js
```

处理原则：

- 新增假串口数据：改 WebSocket 推送里的 `serial` 数据。
- 新增假算法数据：改 WebSocket 推送里的 `algorithm` 数据。
- 新增 144 压力矩阵或 51 控制字节逻辑：保持返回长度稳定，前端才能正确可视化。
- 新增接口：在 `mock-service.js` 里增加 HTTP route。

验证：

```powershell
cd D:\jqtoolsWin1\mock-sdk
npm start
```

检查健康接口：

```powershell
Invoke-RestMethod http://127.0.0.1:19345/health
```

## 6. 一次完整构建流程

每次改完前端、后端、算法、假数据服务后，按下面顺序执行。

### 6.1 安装或刷新依赖

```powershell
cd D:\jqtoolsWin1
npm install

cd D:\jqtoolsWin1\sdk
npm install

cd D:\jqtoolsWin1\mock-sdk
npm install

cd D:\jqtoolsWin1
python -m pip install -r .\sdk\python\app\requirements.txt
```

### 6.2 构建 WPF 控件库

```powershell
cd D:\jqtoolsWin1
dotnet build .\dotnet-wrapper\JqTools.CarAdaptive.Wpf\JqTools.CarAdaptive.Wpf.csproj -c Release
```

成功后检查：

```powershell
dir .\dotnet-wrapper\JqTools.CarAdaptive.Wpf\bin\Release\net8.0-windows\JqTools.CarAdaptive.Wpf.dll
dir .\dotnet-wrapper\JqTools.CarAdaptive.Wpf\bin\Release\net8.0-windows\mock-sdk\mock-service.js
dir .\dotnet-wrapper\JqTools.CarAdaptive.Wpf\bin\Release\net8.0-windows\mock-sdk\mock-debug.html
```

### 6.3 构建 Native DLL

第一次或清理后执行：

```powershell
cd D:\jqtoolsWin1
& 'C:\Program Files\CMake\bin\cmake.exe' -S .\native-dll\JqToolsCarAdaptiveNative -B .\native-dll\JqToolsCarAdaptiveNative\build -G "Visual Studio 17 2022" -A x64
```

每次构建执行：

```powershell
& 'C:\Program Files\CMake\bin\cmake.exe' --build .\native-dll\JqToolsCarAdaptiveNative\build --config Release
```

成功后检查：

```powershell
dir .\native-dll\JqToolsCarAdaptiveNative\build\Release\JqToolsCarAdaptiveNative.dll
dir .\native-dll\JqToolsCarAdaptiveNative\build\Release\mock-sdk\mock-service.js
dir .\native-dll\JqToolsCarAdaptiveNative\build\Release\mock-sdk\mock-debug.html
```

## 7. 输出到 netsdk 目录

推荐直接执行一键脚本：

```powershell
cd D:\jqtoolsWin1
powershell -ExecutionPolicy Bypass -File .\netsdk\build-netsdk.ps1
```

如果已经手动构建过，只想重新复制输出目录：

```powershell
cd D:\jqtoolsWin1
powershell -ExecutionPolicy Bypass -File .\netsdk\build-netsdk.ps1 -SkipBuild
```

执行下面命令，把本次构建产物复制到 `D:\jqtoolsWin1\netsdk`。

```powershell
cd D:\jqtoolsWin1

New-Item -ItemType Directory -Force .\netsdk\wpf-control | Out-Null
New-Item -ItemType Directory -Force .\netsdk\native-dll | Out-Null
New-Item -ItemType Directory -Force .\netsdk\sdk-service | Out-Null
New-Item -ItemType Directory -Force .\netsdk\mock-service | Out-Null

robocopy .\dotnet-wrapper\JqTools.CarAdaptive.Wpf\bin\Release\net8.0-windows .\netsdk\wpf-control /E
robocopy .\native-dll\JqToolsCarAdaptiveNative\build\Release .\netsdk\native-dll /E
robocopy .\sdk .\netsdk\sdk-service /E /XD .git
robocopy .\mock-sdk .\netsdk\mock-service /E /XD .git
```

`robocopy` 返回码 `0` 到 `7` 通常都表示复制成功或有文件更新，不一定是失败。

如果想清空旧输出后再复制，执行前先删这几个目录：

```powershell
cd D:\jqtoolsWin1

Remove-Item .\netsdk\wpf-control -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item .\netsdk\native-dll -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item .\netsdk\sdk-service -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item .\netsdk\mock-service -Recurse -Force -ErrorAction SilentlyContinue
```

## 8. 输出后本地验证

### 8.1 验证 WPF 控件目录

```powershell
cd D:\jqtoolsWin1\netsdk\wpf-control

dir JqTools.CarAdaptive.Wpf.dll
dir Microsoft.Web.WebView2.Wpf.dll
dir mock-sdk\mock-service.js
dir mock-sdk\mock-debug.html
dir mock-sdk\node_modules\ws
```

如果客户 WPF 项目引用 `JqTools.CarAdaptive.Wpf.dll`，运行时需要把整个 `wpf-control` 目录内容一起带上。

### 8.2 验证 Native DLL 目录

```powershell
cd D:\jqtoolsWin1\netsdk\native-dll

dir JqToolsCarAdaptiveNative.dll
dir mock-sdk\mock-service.js
dir mock-sdk\mock-debug.html
dir mock-sdk\node_modules\ws
```

如果客户 WPF 项目使用 P/Invoke，运行时需要保证 `JqToolsCarAdaptiveNative.dll` 在 exe 同级目录，`mock-sdk` 目录也在同级目录。

### 8.3 验证正式 SDK 服务

```powershell
cd D:\jqtoolsWin1\netsdk\sdk-service
npm start
```

打开：

```text
http://127.0.0.1:19245/debug
```

或检查：

```powershell
Invoke-RestMethod http://127.0.0.1:19245/health
```

### 8.4 验证假数据服务

```powershell
cd D:\jqtoolsWin1\netsdk\mock-service
npm start
```

打开：

```text
http://127.0.0.1:19345/debug
```

或检查：

```powershell
Invoke-RestMethod http://127.0.0.1:19345/health
```

## 9. WPF 客户端如何引用

### 9.1 引用 WPF 控件库

客户 WPF 是 .NET 8 时，引用：

```text
netsdk\wpf-control\JqTools.CarAdaptive.Wpf.dll
```

XAML 示例：

```xml
<Window
    ...
    xmlns:jq="clr-namespace:JqTools.CarAdaptive.Wpf;assembly=JqTools.CarAdaptive.Wpf">

    <Grid>
        <jq:CarAdaptiveDebugControl
            AutoStartService="True"
            StopServiceOnUnload="True"
            Host="127.0.0.1"
            HttpPort="19345"
            WebSocketPort="19399" />
    </Grid>
</Window>
```

### 9.2 引用 Native DLL

客户 WPF 是 .NET Framework 或不方便引用 .NET 8 控件库时，使用：

```text
netsdk\native-dll\JqToolsCarAdaptiveNative.dll
```

把下面包装类复制到客户 WPF 项目：

```text
D:\jqtoolsWin1\native-dll\JqToolsCarAdaptiveNative\wpf-loader\JqToolsCarAdaptiveNative.cs
```

调用：

```csharp
JqTools.CarAdaptive.NativeLoader.JqToolsCarAdaptiveNative.Start();

var url = JqTools.CarAdaptive.NativeLoader.JqToolsCarAdaptiveNative.GetDebugUrl();
webView.Source = new Uri(url);
```

窗口关闭时：

```csharp
JqTools.CarAdaptive.NativeLoader.JqToolsCarAdaptiveNative.Stop();
```

## 10. 每次交付前检查清单

- `sdk-service` 能启动，`/health` 返回 `code: 0`。
- `mock-service` 能启动，`/health` 返回 `code: 0`。
- 假数据页面一键连接后有 144 压力数据。
- 假数据页面能看到 51 字节控制数据。
- WPF 控件库 Release 构建通过。
- Native DLL Release 构建通过。
- `netsdk/wpf-control/mock-sdk` 存在。
- `netsdk/native-dll/mock-sdk` 存在。
- 没有生成 `.tgz`。
