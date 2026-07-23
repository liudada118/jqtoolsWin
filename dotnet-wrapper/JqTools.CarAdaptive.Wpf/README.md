# JqTools.CarAdaptive.Wpf

这是一个 WPF 自定义控件库，编译后输出 `JqTools.CarAdaptive.Wpf.dll`。控件会启动 `mock-sdk` 的两个调试服务，并用 WebView2 加载现有调试页面。

## 构建

当前机器只有 .NET Runtime，没有 .NET SDK。安装 .NET 8 SDK 后执行：

```powershell
cd D:\jqtoolsWin1\dotnet-wrapper\JqTools.CarAdaptive.Wpf
dotnet restore
dotnet build -c Release
```

输出目录会包含：

- `JqTools.CarAdaptive.Wpf.dll`
- `mock-sdk\mock-service.js`
- `mock-sdk\mock-debug.html`
- `mock-sdk\node_modules\ws\...`

运行环境需要：

- Windows WPF 应用
- .NET 8 Desktop Runtime
- WebView2 Runtime
- Node.js 18+

## WPF 使用

在客户 WPF 项目里引用 DLL 后：

```xml
<Window
    x:Class="Demo.MainWindow"
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    xmlns:jq="clr-namespace:JqTools.CarAdaptive.Wpf;assembly=JqTools.CarAdaptive.Wpf">
    <Grid>
        <jq:CarAdaptiveDebugControl
            Host="127.0.0.1"
            HttpPort="19245"
            WebSocketPort="19999"
            PagePath="/app"
            AutoStartService="True" />
    </Grid>
</Window>
```

也可以只使用非 UI 服务启动类：

```csharp
var host = new CarAdaptiveMockServiceHost();
await host.StartAsync(new CarAdaptiveDebugOptions
{
    HttpPort = 19245,
    WebSocketPort = 19999,
    PagePath = "/app"
});

// 默认打开 host.DebugUri 即可访问 /app 真实业务页面；需要简化调试页时显式设置 PagePath = "/debug"。
```
