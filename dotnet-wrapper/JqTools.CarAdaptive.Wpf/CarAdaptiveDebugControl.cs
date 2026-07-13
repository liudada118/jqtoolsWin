using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Wpf;

namespace JqTools.CarAdaptive.Wpf;

/// <summary>
/// 可嵌入 WPF 页面或窗口的汽车自适应调试控件。
/// </summary>
public sealed class CarAdaptiveDebugControl : UserControl
{
    private readonly WebView2 _webView = new();
    private CarAdaptiveMockServiceHost? _serviceHost;
    private bool _isLoading;
    private bool _isStopping;

    /// <summary>
    /// 服务日志输出。
    /// </summary>
    public event EventHandler<string>? ServiceLogReceived;

    /// <summary>
    /// 内部 WebView2 实例，供高级调用方配置 WebView2 行为。
    /// </summary>
    public WebView2 Browser => _webView;

    /// <summary>
    /// 创建汽车自适应调试控件。
    /// </summary>
    public CarAdaptiveDebugControl()
    {
        Content = _webView;
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
        DependencyProperty.Register(nameof(HttpPort), typeof(int), typeof(CarAdaptiveDebugControl), new PropertyMetadata(19345));

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
        DependencyProperty.Register(nameof(WebSocketPort), typeof(int), typeof(CarAdaptiveDebugControl), new PropertyMetadata(19399));

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
    /// WebView2 加载的页面路径；/debug 为 SDK 调试页，/app 为项目当前真实前端。
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
        DependencyProperty.Register(nameof(PagePath), typeof(string), typeof(CarAdaptiveDebugControl), new PropertyMetadata("/debug"));

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
        try
        {
            var options = CreateOptions();
            if (AutoStartService)
            {
                _serviceHost ??= CreateServiceHost();
                await _serviceHost.StartAsync(options, cancellationToken).ConfigureAwait(true);
            }

            await _webView.EnsureCoreWebView2Async();
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

    private CarAdaptiveDebugOptions CreateOptions()
    {
        return new CarAdaptiveDebugOptions
        {
            Host = Host,
            HttpPort = HttpPort,
            WebSocketPort = WebSocketPort,
            NodeExecutablePath = NodeExecutablePath,
            MockSdkDirectory = MockSdkDirectory,
            PagePath = PagePath
        };
    }

    private CarAdaptiveMockServiceHost CreateServiceHost()
    {
        var host = new CarAdaptiveMockServiceHost();
        host.OutputReceived += (_, line) => ServiceLogReceived?.Invoke(this, line);
        return host;
    }

    private async void HandleLoaded(object sender, RoutedEventArgs e)
    {
        await StartAsync().ConfigureAwait(true);
    }

    private async void HandleUnloaded(object sender, RoutedEventArgs e)
    {
        if (StopServiceOnUnload)
        {
            await StopAsync().ConfigureAwait(true);
        }
    }

    private void HandleApplicationExit(object sender, ExitEventArgs e)
    {
        StopServiceForApplicationExit();
    }

    private void HandleDispatcherShutdownStarted(object? sender, EventArgs e)
    {
        StopServiceForApplicationExit();
    }

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
}
