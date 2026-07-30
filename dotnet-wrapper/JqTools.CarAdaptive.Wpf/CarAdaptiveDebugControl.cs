using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace JqTools.CarAdaptive.Wpf;

/// <summary>
/// 可嵌入 WPF 页面或窗口的汽车自适应调试控件。
/// </summary>
public sealed class CarAdaptiveDebugControl : UserControl
{
    private readonly Grid _root = new();
    private readonly WebView2 _webView = new();
    private readonly Border _errorPanel;
    private readonly TextBlock _errorMessage;
    private CarAdaptiveMockServiceHost? _serviceHost;
    private bool _isLoading;
    private bool _isStopping;
    private bool _webMessageBridgeAttached;

    /// <summary>
    /// 服务日志输出。
    /// </summary>
    public event EventHandler<string>? ServiceLogReceived;

    /// <summary>
    /// SDK 页面收到远程返回主页命令时触发，由宿主程序执行实际页面导航。
    /// </summary>
    public event EventHandler<CarAdaptiveHomeRequestedEventArgs>? HomeRequested;

    /// <summary>
    /// 内部 WebView2 实例，供高级调用方配置 WebView2 行为。
    /// </summary>
    public WebView2 Browser => _webView;

    /// <summary>
    /// 创建汽车自适应调试控件。
    /// </summary>
    public CarAdaptiveDebugControl()
    {
        _errorMessage = new TextBlock
        {
            Foreground = Brushes.White,
            FontSize = 14,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 10, 0, 18)
        };
        _errorPanel = CreateErrorPanel();
        _root.Children.Add(_webView);
        _root.Children.Add(_errorPanel);
        Content = _root;
        Loaded += HandleLoaded;
        Unloaded += HandleUnloaded;
        Dispatcher.ShutdownStarted += HandleDispatcherShutdownStarted;

        if (Application.Current != null)
        {
            Application.Current.Exit += HandleApplicationExit;
        }
    }

    /// <summary>
    /// 是否在控件加载时自动启动 mock-sdk 服务。
    /// </summary>
    public bool AutoStartService
    {
        get => (bool)GetValue(AutoStartServiceProperty);
        set => SetValue(AutoStartServiceProperty, value);
    }

    /// <summary>
    /// AutoStartService 依赖属性。
    /// </summary>
    public static readonly DependencyProperty AutoStartServiceProperty =
        DependencyProperty.Register(nameof(AutoStartService), typeof(bool), typeof(CarAdaptiveDebugControl), new PropertyMetadata(true));

    /// <summary>
    /// 控件卸载时是否停止由控件启动的 Node.js 服务。
    /// </summary>
    public bool StopServiceOnUnload
    {
        get => (bool)GetValue(StopServiceOnUnloadProperty);
        set => SetValue(StopServiceOnUnloadProperty, value);
    }

    /// <summary>
    /// StopServiceOnUnload 依赖属性。
    /// </summary>
    public static readonly DependencyProperty StopServiceOnUnloadProperty =
        DependencyProperty.Register(nameof(StopServiceOnUnload), typeof(bool), typeof(CarAdaptiveDebugControl), new PropertyMetadata(true));

    /// <summary>
    /// WPF 应用退出或 Dispatcher 关闭时是否强制停止由控件启动的 Node.js 服务。
    /// </summary>
    public bool StopServiceOnApplicationExit
    {
        get => (bool)GetValue(StopServiceOnApplicationExitProperty);
        set => SetValue(StopServiceOnApplicationExitProperty, value);
    }

    /// <summary>
    /// StopServiceOnApplicationExit 依赖属性。
    /// </summary>
    public static readonly DependencyProperty StopServiceOnApplicationExitProperty =
        DependencyProperty.Register(nameof(StopServiceOnApplicationExit), typeof(bool), typeof(CarAdaptiveDebugControl), new PropertyMetadata(true));

    /// <summary>
    /// HTTP/WS 服务监听地址。
    /// </summary>
    public string Host
    {
        get => (string)GetValue(HostProperty);
        set => SetValue(HostProperty, value);
    }

    /// <summary>
    /// Host 依赖属性。
    /// </summary>
    public static readonly DependencyProperty HostProperty =
        DependencyProperty.Register(nameof(Host), typeof(string), typeof(CarAdaptiveDebugControl), new PropertyMetadata("127.0.0.1"));

    /// <summary>
    /// HTTP 服务端口。
    /// </summary>
    public int HttpPort
    {
        get => (int)GetValue(HttpPortProperty);
        set => SetValue(HttpPortProperty, value);
    }

    /// <summary>
    /// HttpPort 依赖属性。
    /// </summary>
    public static readonly DependencyProperty HttpPortProperty =
        DependencyProperty.Register(nameof(HttpPort), typeof(int), typeof(CarAdaptiveDebugControl), new PropertyMetadata(19245));

    /// <summary>
    /// WebSocket 服务端口。
    /// </summary>
    public int WebSocketPort
    {
        get => (int)GetValue(WebSocketPortProperty);
        set => SetValue(WebSocketPortProperty, value);
    }

    /// <summary>
    /// WebSocketPort 依赖属性。
    /// </summary>
    public static readonly DependencyProperty WebSocketPortProperty =
        DependencyProperty.Register(nameof(WebSocketPort), typeof(int), typeof(CarAdaptiveDebugControl), new PropertyMetadata(19999));

    /// <summary>
    /// Node.js 可执行文件路径。
    /// </summary>
    public string NodeExecutablePath
    {
        get => (string)GetValue(NodeExecutablePathProperty);
        set => SetValue(NodeExecutablePathProperty, value);
    }

    /// <summary>
    /// NodeExecutablePath 依赖属性。
    /// </summary>
    public static readonly DependencyProperty NodeExecutablePathProperty =
        DependencyProperty.Register(nameof(NodeExecutablePath), typeof(string), typeof(CarAdaptiveDebugControl), new PropertyMetadata("node"));

    /// <summary>
    /// mock-sdk 目录；为空时从应用输出目录自动查找。
    /// </summary>
    public string? MockSdkDirectory
    {
        get => (string?)GetValue(MockSdkDirectoryProperty);
        set => SetValue(MockSdkDirectoryProperty, value);
    }

    /// <summary>
    /// MockSdkDirectory 依赖属性。
    /// </summary>
    public static readonly DependencyProperty MockSdkDirectoryProperty =
        DependencyProperty.Register(nameof(MockSdkDirectory), typeof(string), typeof(CarAdaptiveDebugControl), new PropertyMetadata(null));

    /// <summary>
    /// WebView2 加载的页面路径；默认 /app 为项目真实业务前端，/debug 仅用于简化调试页。
    /// </summary>
    public string PagePath
    {
        get => (string)GetValue(PagePathProperty);
        set => SetValue(PagePathProperty, value);
    }

    /// <summary>
    /// PagePath 依赖属性。
    /// </summary>
    public static readonly DependencyProperty PagePathProperty =
        DependencyProperty.Register(nameof(PagePath), typeof(string), typeof(CarAdaptiveDebugControl), new PropertyMetadata("/app"));

    /// <summary>
    /// 远程返回主页命令使用的网页地址或路由；为空时由宿主处理 HomeRequested 事件。
    /// </summary>
    public string? HomeUrl
    {
        get => (string?)GetValue(HomeUrlProperty);
        set => SetValue(HomeUrlProperty, value);
    }

    /// <summary>
    /// HomeUrl 依赖属性。
    /// </summary>
    public static readonly DependencyProperty HomeUrlProperty =
        DependencyProperty.Register(
            nameof(HomeUrl),
            typeof(string),
            typeof(CarAdaptiveDebugControl),
            new PropertyMetadata(
                Environment.GetEnvironmentVariable("JQTOOLS_HOME_URL")));

    /// <summary>
    /// 局域网远程控制口令；为空时允许局域网内直接调用控制接口。
    /// </summary>
    public string? RemoteControlToken
    {
        get => (string?)GetValue(RemoteControlTokenProperty);
        set => SetValue(RemoteControlTokenProperty, value);
    }

    /// <summary>
    /// RemoteControlToken 依赖属性。
    /// </summary>
    public static readonly DependencyProperty RemoteControlTokenProperty =
        DependencyProperty.Register(
            nameof(RemoteControlToken),
            typeof(string),
            typeof(CarAdaptiveDebugControl),
            new PropertyMetadata(
                Environment.GetEnvironmentVariable("JQTOOLS_REMOTE_CONTROL_TOKEN")));

    /// <summary>
    /// 启动服务并加载调试页面。
    /// </summary>
    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        if (_isLoading)
        {
            return;
        }

        _isLoading = true;
        HideStartupError();
        try
        {
            var options = CreateOptions();
            if (AutoStartService)
            {
                _serviceHost ??= CreateServiceHost();
                await _serviceHost.StartAsync(options, cancellationToken).ConfigureAwait(true);
            }

            await _webView.EnsureCoreWebView2Async();
            AttachWebMessageBridge();
            _webView.Source = options.DebugUri;
        }
        finally
        {
            _isLoading = false;
        }
    }

    /// <summary>
    /// 停止由控件启动的 mock-sdk 服务。
    /// </summary>
    public async Task StopAsync(CancellationToken cancellationToken = default)
    {
        if (_serviceHost == null || _isStopping)
        {
            return;
        }

        _isStopping = true;
        try
        {
            await _serviceHost.StopAsync(cancellationToken).ConfigureAwait(true);
        }
        finally
        {
            _isStopping = false;
        }
    }

    /// <summary>
    /// 重新加载当前调试页面。
    /// </summary>
    public void Reload()
    {
        _webView.Reload();
    }

    /// <summary>
    /// 根据控件依赖属性创建当前服务启动配置。
    /// </summary>
    private CarAdaptiveDebugOptions CreateOptions()
    {
        return new CarAdaptiveDebugOptions
        {
            Host = Host,
            HttpPort = HttpPort,
            WebSocketPort = WebSocketPort,
            NodeExecutablePath = NodeExecutablePath,
            MockSdkDirectory = MockSdkDirectory,
            PagePath = PagePath,
            HomeUrl = HomeUrl,
            RemoteControlToken = RemoteControlToken
        };
    }

    /// <summary>
    /// 在 WebView2 初始化后注册一次页面到 WPF 的隐藏消息桥。
    /// </summary>
    private void AttachWebMessageBridge()
    {
        if (_webMessageBridgeAttached || _webView.CoreWebView2 == null)
        {
            return;
        }

        _webView.CoreWebView2.WebMessageReceived += HandleWebMessageReceived;
        _webMessageBridgeAttached = true;
    }

    /// <summary>
    /// 解析 SDK 页面消息，并把返回主页请求转换为 .NET 事件。
    /// </summary>
    private void HandleWebMessageReceived(
        object? sender,
        CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var document = JsonDocument.Parse(e.WebMessageAsJson);
            var root = document.RootElement;
            if (
                root.ValueKind != JsonValueKind.Object ||
                ReadString(root, "type") != "jqtools.carAdaptive.homeRequested"
            )
            {
                return;
            }

            var requestedAtMilliseconds = ReadInt64(root, "requestedAt");
            var requestedAt = requestedAtMilliseconds > 0
                ? DateTimeOffset.FromUnixTimeMilliseconds(requestedAtMilliseconds)
                : DateTimeOffset.UtcNow;

            HomeRequested?.Invoke(
                this,
                new CarAdaptiveHomeRequestedEventArgs(
                    ReadString(root, "commandId"),
                    ReadString(root, "source"),
                    ReadString(root, "homeUrl"),
                    requestedAt));
        }
        catch (JsonException error)
        {
            ServiceLogReceived?.Invoke(this, $"[wpf] ignore invalid page message: {error.Message}");
        }
        catch (ArgumentOutOfRangeException error)
        {
            ServiceLogReceived?.Invoke(this, $"[wpf] ignore invalid page timestamp: {error.Message}");
        }
    }

    /// <summary>
    /// 安全读取 JSON 对象中的字符串属性。
    /// </summary>
    private static string ReadString(JsonElement root, string propertyName)
    {
        return root.TryGetProperty(propertyName, out var value) &&
               value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? string.Empty
            : string.Empty;
    }

    /// <summary>
    /// 安全读取 JSON 对象中的 64 位整数属性。
    /// </summary>
    private static long ReadInt64(JsonElement root, string propertyName)
    {
        return root.TryGetProperty(propertyName, out var value) &&
               value.ValueKind == JsonValueKind.Number &&
               value.TryGetInt64(out var result)
            ? result
            : 0;
    }

    /// <summary>
    /// 创建服务宿主并转发服务日志。
    /// </summary>
    private CarAdaptiveMockServiceHost CreateServiceHost()
    {
        var host = new CarAdaptiveMockServiceHost();
        host.OutputReceived += (_, line) => ServiceLogReceived?.Invoke(this, line);
        return host;
    }

    /// <summary>
    /// 控件加载后安全启动服务和页面，失败时保留窗口并显示错误。
    /// </summary>
    private async void HandleLoaded(object sender, RoutedEventArgs e)
    {
        await TryStartAsync().ConfigureAwait(true);
    }

    /// <summary>
    /// 控件卸载时按配置停止由当前控件启动的服务。
    /// </summary>
    private async void HandleUnloaded(object sender, RoutedEventArgs e)
    {
        if (StopServiceOnUnload)
        {
            await StopAsync().ConfigureAwait(true);
        }
    }

    /// <summary>
    /// 应用退出时同步清理后台服务进程树。
    /// </summary>
    private void HandleApplicationExit(object sender, ExitEventArgs e)
    {
        StopServiceForApplicationExit();
    }

    /// <summary>
    /// Dispatcher 关闭时同步清理后台服务进程树。
    /// </summary>
    private void HandleDispatcherShutdownStarted(object? sender, EventArgs e)
    {
        StopServiceForApplicationExit();
    }

    /// <summary>
    /// 在应用退出阶段执行不抛异常的服务停止操作。
    /// </summary>
    private void StopServiceForApplicationExit()
    {
        if (!StopServiceOnApplicationExit || _serviceHost == null || _isStopping)
        {
            return;
        }

        _isStopping = true;
        try
        {
            _serviceHost.StopAsync(CancellationToken.None).GetAwaiter().GetResult();
        }
        catch (Exception error)
        {
            ServiceLogReceived?.Invoke(this, $"[wpf] stop service on application exit failed: {error.Message}");
        }
        finally
        {
            _isStopping = false;
        }
    }

    /// <summary>
    /// 捕获启动异常并切换到可重试的错误界面。
    /// </summary>
    private async Task TryStartAsync()
    {
        try
        {
            await StartAsync().ConfigureAwait(true);
        }
        catch (Exception error)
        {
            ServiceLogReceived?.Invoke(this, $"[wpf] start failed: {error}");
            ShowStartupError(error);
        }
    }

    /// <summary>
    /// 创建启动失败提示面板和重试按钮。
    /// </summary>
    private Border CreateErrorPanel()
    {
        var title = new TextBlock
        {
            Text = "汽车自适应服务启动失败",
            Foreground = Brushes.White,
            FontSize = 20,
            FontWeight = FontWeights.SemiBold
        };
        var retryButton = new Button
        {
            Content = "重试",
            Width = 96,
            Height = 34,
            HorizontalAlignment = HorizontalAlignment.Left
        };
        retryButton.Click += HandleRetryClick;

        var content = new StackPanel();
        content.Children.Add(title);
        content.Children.Add(_errorMessage);
        content.Children.Add(retryButton);

        return new Border
        {
            Background = new SolidColorBrush(Color.FromRgb(31, 35, 41)),
            BorderBrush = new SolidColorBrush(Color.FromRgb(78, 86, 96)),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(6),
            Padding = new Thickness(24),
            MaxWidth = 680,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            Child = content,
            Visibility = Visibility.Collapsed
        };
    }

    /// <summary>
    /// 点击重试后重新启动服务并加载页面。
    /// </summary>
    private async void HandleRetryClick(object sender, RoutedEventArgs e)
    {
        await TryStartAsync().ConfigureAwait(true);
    }

    /// <summary>
    /// 显示适合客户查看的启动错误，避免输出过长的 Node 日志撑开界面。
    /// </summary>
    private void ShowStartupError(Exception error)
    {
        var message = error.Message;
        if (message.Contains("EADDRINUSE", StringComparison.OrdinalIgnoreCase))
        {
            message = $"端口 {HttpPort} 或 {WebSocketPort} 已被其他程序占用。请关闭占用程序后点击重试。";
        }
        else if (message.Length > 1200)
        {
            message = $"{message[..1200]}...";
        }

        _errorMessage.Text = message;
        _webView.Visibility = Visibility.Collapsed;
        _errorPanel.Visibility = Visibility.Visible;
    }

    /// <summary>
    /// 开始新一轮启动前隐藏旧错误并恢复浏览器区域。
    /// </summary>
    private void HideStartupError()
    {
        _errorPanel.Visibility = Visibility.Collapsed;
        _webView.Visibility = Visibility.Visible;
    }
}
