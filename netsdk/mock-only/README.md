# 假数据链路验证包

这个目录只用于验证客户 WPF/服务/WebSocket/调试页面链路是否能跑通，不包含正式算法服务。

## 目录说明

```text
mock-only/
  mock-service/      # 独立假数据 HTTP/WS 服务
  wpf-control/       # WPF UI 控件库，内部自动启动 mock-sdk
  native-dll/        # Native DLL 方案，内部自动启动 mock-sdk
```

## 1. 先验证假数据服务

```powershell
cd D:\jqtoolsWin1\netsdk\mock-only\mock-service
npm start
```

打开：

```text
http://127.0.0.1:19345/debug
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:19345/health
```

页面里点击“一键连接”，应该能看到：

- 假串口数据持续刷新。
- 144 长度压力数据。
- 51 字节控制数据。
- 假算法结果。
- 气囊控制发送和返回。
- 自适应调节开关。

## 2. 验证 WPF UI 控件

客户 WPF 是 .NET 8 时，引用：

```text
D:\jqtoolsWin1\netsdk\mock-only\wpf-control\JqTools.CarAdaptive.Wpf.dll
```

运行时要保留整个 `wpf-control` 目录内容，不能只复制一个 DLL。

XAML 示例：

```xml
<Window
    ...
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

默认情况下，窗口控件卸载或 WPF 应用退出时都会停止由控件启动的假数据服务，避免关闭窗口后端口仍被占用。

## 3. 验证 Native DLL

客户 WPF 是 .NET Framework 或不方便引用 .NET 8 控件库时，使用：

```text
D:\jqtoolsWin1\netsdk\mock-only\native-dll\JqToolsCarAdaptiveNative.dll
```

包装类在：

```text
D:\jqtoolsWin1\netsdk\mock-only\native-dll\wpf-loader\JqToolsCarAdaptiveNative.cs
```

调用：

```csharp
JqTools.CarAdaptive.NativeLoader.JqToolsCarAdaptiveNative.Start();

var url = JqTools.CarAdaptive.NativeLoader.JqToolsCarAdaptiveNative.GetDebugUrl();
webView.Source = new Uri(url);
```

关闭时：

```csharp
JqTools.CarAdaptive.NativeLoader.JqToolsCarAdaptiveNative.Stop();
```

包装类已经注册 `ProcessExit` 兜底逻辑；即使客户忘记在窗口关闭时调用 `Stop()`，WPF 进程退出时也会尝试关闭 Native DLL 启动的假数据服务。仍建议在窗口 `Closed` 事件里显式调用 `Stop()`，退出更可控。

## 4. 重新输出假数据包

改完 `mock-sdk`、WPF 控件或 Native DLL 后执行：

```powershell
cd D:\jqtoolsWin1
powershell -ExecutionPolicy Bypass -File .\netsdk\build-mock-only.ps1
```

只复制不重新构建：

```powershell
powershell -ExecutionPolicy Bypass -File .\netsdk\build-mock-only.ps1 -SkipBuild
```

