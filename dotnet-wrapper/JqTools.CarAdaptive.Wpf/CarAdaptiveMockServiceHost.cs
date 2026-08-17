using System.Diagnostics;
using System.Net.Http;
using System.Net.Sockets;
using System.IO;
using System.Text;

namespace JqTools.CarAdaptive.Wpf;

/// <summary>
/// 负责启动和停止 SDK 里的 Node.js 真实数据服务。
/// </summary>
public sealed class CarAdaptiveMockServiceHost : IDisposable
{
    private readonly HttpClient _httpClient = new();
    private readonly StringBuilder _logBuffer = new();
    private Process? _process;

    /// <summary>
    /// Node 服务标准输出和错误输出。
    /// </summary>
    public event EventHandler<string>? OutputReceived;

    /// <summary>
    /// 最近一次启动使用的配置。
    /// </summary>
    public CarAdaptiveDebugOptions Options { get; private set; } = new();

    /// <summary>
    /// Node 服务进程是否仍在运行。
    /// </summary>
    public bool IsRunning => _process is { HasExited: false };

    /// <summary>
    /// 当前调试页面地址。
    /// </summary>
    public Uri DebugUri => Options.DebugUri;

    /// <summary>
    /// 已收到的服务日志。
    /// </summary>
    public string Logs => _logBuffer.ToString();

    /// <summary>
    /// 启动真实数据服务。如果当前 SDK 服务已经运行，则直接复用。
    /// </summary>
    public async Task StartAsync(CarAdaptiveDebugOptions? options = null, CancellationToken cancellationToken = default)
    {
        if (IsRunning)
        {
            return;
        }

        Options = options ?? Options;
        var mockSdkDirectory = Options.ResolveMockSdkDirectory();
        var serviceFile = Path.Combine(mockSdkDirectory, "mock-service.js");
        if (!File.Exists(serviceFile))
        {
            throw new FileNotFoundException("未找到 mock-sdk 服务入口 mock-service.js。", serviceFile);
        }

        if (await IsHealthyAsync(cancellationToken).ConfigureAwait(false))
        {
            return;
        }

        await EnsurePortsAvailableAsync(cancellationToken).ConfigureAwait(false);

        var startInfo = new ProcessStartInfo
        {
            FileName = Options.ResolveNodeExecutablePath(),
            Arguments = "mock-service.js",
            WorkingDirectory = mockSdkDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        startInfo.Environment["JQTOOLS_MOCK_HOST"] = Options.Host;
        startInfo.Environment["JQTOOLS_MOCK_HTTP_PORT"] = Options.HttpPort.ToString();
        startInfo.Environment["JQTOOLS_MOCK_WS_PORT"] = Options.WebSocketPort.ToString();
        startInfo.Environment["JQTOOLS_MOCK_FRONTEND_DIR"] = Options.ResolveFrontendBuildDirectory(mockSdkDirectory);
        startInfo.Environment["JQTOOLS_REMOTE_CONTROL_TOKEN"] = Options.RemoteControlToken ?? string.Empty;
        startInfo.Environment["JQTOOLS_HOME_URL"] = Options.HomeUrl ?? string.Empty;

        _process = Process.Start(startInfo) ?? throw new InvalidOperationException("Node.js 真实数据服务启动失败。");
        _process.OutputDataReceived += HandleOutput;
        _process.ErrorDataReceived += HandleOutput;
        _process.BeginOutputReadLine();
        _process.BeginErrorReadLine();

        try
        {
            await WaitForHealthAsync(cancellationToken).ConfigureAwait(false);
        }
        catch
        {
            await StopAsync(CancellationToken.None).ConfigureAwait(false);
            throw;
        }
    }

    /// <summary>
    /// 停止由当前实例启动的假数据服务。
    /// </summary>
    public async Task StopAsync(CancellationToken cancellationToken = default)
    {
        var process = _process;
        if (process == null)
        {
            return;
        }

        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
                await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
            }
        }
        finally
        {
            process.Dispose();
            _process = null;
        }
    }

    /// <summary>
    /// 释放服务进程和 HTTP 客户端。
    /// </summary>
    public void Dispose()
    {
        StopAsync().GetAwaiter().GetResult();
        _httpClient.Dispose();
    }

    /// <summary>
    /// 轮询健康检查接口，直到服务可用、进程退出或启动超时。
    /// </summary>
    private async Task WaitForHealthAsync(CancellationToken cancellationToken)
    {
        using var timeout = new CancellationTokenSource(Options.StartupTimeout);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeout.Token);

        while (!linked.IsCancellationRequested)
        {
            if (_process is { HasExited: true })
            {
                throw new InvalidOperationException($"Node.js 真实数据服务已退出，退出码：{_process.ExitCode}。{Environment.NewLine}{Logs}");
            }

            try
            {
                if (await IsHealthyAsync(linked.Token).ConfigureAwait(false))
                {
                    return;
                }
            }
            catch (OperationCanceledException) when (timeout.IsCancellationRequested)
            {
                break;
            }
            catch (HttpRequestException)
            {
            }

            try
            {
                await Task.Delay(150, linked.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (timeout.IsCancellationRequested)
            {
                break;
            }
        }

        throw new TimeoutException(
            $"等待汽车自适应真实数据服务启动超过 {Options.StartupTimeout.TotalSeconds:0} 秒：" +
            $"http://{Options.Host}:{Options.HttpPort}/health。服务进程仍在运行，但健康检查尚未就绪。");
    }

    /// <summary>
    /// 确认 HTTP 和 WebSocket 端口均未被其他程序占用。
    /// </summary>
    private async Task EnsurePortsAvailableAsync(CancellationToken cancellationToken)
    {
        var occupiedPorts = new List<int>();
        if (await IsPortInUseAsync(Options.HttpPort, cancellationToken).ConfigureAwait(false))
        {
            occupiedPorts.Add(Options.HttpPort);
        }

        if (Options.WebSocketPort != Options.HttpPort &&
            await IsPortInUseAsync(Options.WebSocketPort, cancellationToken).ConfigureAwait(false))
        {
            occupiedPorts.Add(Options.WebSocketPort);
        }

        if (occupiedPorts.Count > 0)
        {
            throw new InvalidOperationException(
                $"端口 {string.Join("、", occupiedPorts)} 已被其他程序占用。请关闭占用程序后重试。");
        }
    }

    /// <summary>
    /// 通过 TCP 连接探测指定端口是否已有监听程序。
    /// </summary>
    private async Task<bool> IsPortInUseAsync(int port, CancellationToken cancellationToken)
    {
        using var client = new TcpClient();
        try
        {
            await client.ConnectAsync(Options.Host, port, cancellationToken).ConfigureAwait(false);
            return true;
        }
        catch (SocketException)
        {
            return false;
        }
    }

    /// <summary>
    /// 检查目标 HTTP 服务是否已经可用。
    /// </summary>
    private async Task<bool> IsHealthyAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var response = await _httpClient.GetAsync(new Uri($"http://{Options.Host}:{Options.HttpPort}/health"), cancellationToken).ConfigureAwait(false);
            return response.IsSuccessStatusCode;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (HttpRequestException)
        {
            return false;
        }
    }

    /// <summary>
    /// 收集 Node 服务输出并转发给控件调用方。
    /// </summary>
    private void HandleOutput(object sender, DataReceivedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(e.Data))
        {
            return;
        }

        _logBuffer.AppendLine(e.Data);
        OutputReceived?.Invoke(this, e.Data);
    }
}
