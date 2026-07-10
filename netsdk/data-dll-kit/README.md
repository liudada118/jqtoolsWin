# 汽车自适应数据服务 + DLL 整包

这个目录用于验证“WPF 客户端 + 数据服务 + WPF DLL + Native DLL”整条链路。客户默认直接启动 WPF 程序；WPF 会自动启动内置假数据服务，并在退出时关闭服务。

## 目录内容

```text
data-dll-kit/
  wpf-app/                   # 客户可直接运行的 WPF 程序
  data-service/              # 数据服务和调试 Web，默认输出 144 点压力数据、51 字节控制数据、算法结果和气囊返回
  wpf-control/               # WPF 自定义控件库，WPF 项目可直接引用 JqTools.CarAdaptive.Wpf.dll
  native-dll/                # 标准 C/C++ Native DLL 和 WPF P/Invoke 示例
  start-wpf.ps1              # 启动客户 WPF 程序
  start-data-service.ps1     # 后台启动数据服务
  stop-data-service.ps1      # 停止数据服务，释放 19345/19399 端口
  open-debug-page.ps1        # 打开调试页面
  FAKE_API.md                # 假数据 HTTP/WS 接口文档
```

## 一键启动 WPF

```powershell
cd D:\jqtoolsWin1\netsdk\data-dll-kit
powershell -ExecutionPolicy Bypass -File .\start-wpf.ps1
```

也可以直接双击：

```text
D:\jqtoolsWin1\netsdk\data-dll-kit\wpf-app\JqTools.CarAdaptive.ClientWpf.exe
```

WPF 程序默认会自动启动内置数据服务：

```text
HTTP: http://127.0.0.1:19345
WebSocket: ws://127.0.0.1:19399
调试页面: http://127.0.0.1:19345/debug
```

假数据接口说明见：

```text
D:\jqtoolsWin1\netsdk\data-dll-kit\FAKE_API.md
```

如果端口被占用，先关闭旧服务：

```powershell
powershell -ExecutionPolicy Bypass -File .\stop-data-service.ps1
```

## 单独启动数据服务

只有需要用浏览器或外部接口调试时，才需要单独启动数据服务：

```powershell
cd D:\jqtoolsWin1\netsdk\data-dll-kit
powershell -ExecutionPolicy Bypass -File .\start-data-service.ps1 -OpenDebugPage
```

## WPF 控件引用

在 WPF 项目里引用：

```text
D:\jqtoolsWin1\netsdk\data-dll-kit\wpf-control\JqTools.CarAdaptive.Wpf.dll
```

XAML 示例：

```xml
<Window
    x:Class="VerifyCarAdaptiveWpf.MainWindow"
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

这个控件会自动启动内置数据服务，窗口卸载或 WPF 应用退出时会自动关闭服务。

## Native DLL 引用

Native DLL 路径：

```text
D:\jqtoolsWin1\netsdk\data-dll-kit\native-dll\JqToolsCarAdaptiveNative.dll
```

WPF P/Invoke 示例：

```text
D:\jqtoolsWin1\netsdk\data-dll-kit\native-dll\wpf-loader\JqToolsCarAdaptiveNative.cs
```

Native 方式建议在窗口关闭时显式调用：

```csharp
JqToolsCarAdaptiveNative.Stop();
```

包装类也注册了 `ProcessExit` 兜底逻辑，进程退出时会尝试停止由 Native DLL 启动的数据服务。

## 重新生成整包

源码修改后执行：

```powershell
cd D:\jqtoolsWin1
powershell -ExecutionPolicy Bypass -File .\netsdk\build-data-dll-kit.ps1
```

只复制当前已构建产物：

```powershell
cd D:\jqtoolsWin1
powershell -ExecutionPolicy Bypass -File .\netsdk\build-data-dll-kit.ps1 -SkipBuild
```
