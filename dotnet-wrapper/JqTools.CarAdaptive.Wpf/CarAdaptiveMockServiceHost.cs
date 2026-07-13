using System.Diagnostics;
using System.Net.Http;
using System.IO;
using System.Text;

namespace JqTools.CarAdaptive.Wpf;

/// <summary>
/// 负责启动和停止 mock-sdk 里的 Node.js 假数据服务。
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
    /// 启动假数据服务。如果服务已经运行，则直接返回。
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

        var startInfo = new ProcessStartInfo
        {
            FileName = Options.NodeExecutablePath,
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

        _process = Process.Start(startInfo) ?? throw new InvalidOperationException("Node.js 假数据服务启动失败。");
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

    private async Task WaitForHealthAsync(CancellationToken cancellationToken)
    {
        using var timeout = new CancellationTokenSource(Options.StartupTimeout);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeout.Token);

        while (!linked.IsCancellationRequested)
        {
            if (_process is { HasExited: true })
            {
                throw new InvalidOperationException($"Node.js 假数据服务已退出，退出码：{_process.ExitCode}。{Environment.NewLine}{Logs}");
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

        throw new TimeoutException($"等待汽车自适应假数据服务启动超时：{Options.DebugUri}");
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
