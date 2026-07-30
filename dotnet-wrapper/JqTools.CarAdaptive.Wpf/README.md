# JqTools.CarAdaptive.Wpf

这是一个 WPF 自定义控件库，编译后输出 `JqTools.CarAdaptive.Wpf.dll`。控件会启动汽车自适应真实数据服务，并用 WebView2 加载现有业务页面。

## 构建

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
            HomeUrl="https://customer.example/home"
            HomeRequested="HandleCarAdaptiveHomeRequested"
            AutoStartService="True" />
    </Grid>
</Window>
```

局域网设备下发 `return-home` 后，控件会触发 `HomeRequested`，宿主程序在事件中返回自己的主页：

```csharp
private void HandleCarAdaptiveHomeRequested(
    object? sender,
    CarAdaptiveHomeRequestedEventArgs e)
{
    MainFrame.Navigate(new HomePage());
}
```

`HomeUrl` 用于网页或 iPad 端直接跳转，也会随 `return-home` 命令广播给所有显示端。原生 WPF 应用可不设置 `HomeUrl`，只在 `HomeRequested` 中导航；事件参数的 `HomeUrl` 属性可读取本次配置值。

需要保护局域网控制接口时，可以设置：

```xml
<jq:CarAdaptiveDebugControl RemoteControlToken="customer-secret" />
```

也可以只使用非 UI 服务启动类：

```csharp
var host = new CarAdaptiveMockServiceHost();
await host.StartAsync(new CarAdaptiveDebugOptions
{
    HttpPort = 19245,
    WebSocketPort = 19999,
    PagePath = "/app",
    HomeUrl = "https://customer.example/home"
});

// 默认打开 host.DebugUri 即可访问 /app 真实业务页面；需要简化调试页时显式设置 PagePath = "/debug"。
```
