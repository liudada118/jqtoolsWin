using System.IO;

namespace JqTools.CarAdaptive.Wpf;

/// <summary>
/// 汽车自适应调试控件的服务启动配置。
/// </summary>
public sealed class CarAdaptiveDebugOptions
{
    /// <summary>
    /// 假数据 HTTP/WS 服务监听地址，默认只监听本机。
    /// </summary>
    public string Host { get; set; } = "127.0.0.1";

    /// <summary>
    /// 假数据 HTTP 服务端口。
    /// </summary>
    public int HttpPort { get; set; } = 19345;

    /// <summary>
    /// 假数据 WebSocket 服务端口。
    /// </summary>
    public int WebSocketPort { get; set; } = 19399;

    /// <summary>
    /// Node.js 可执行文件路径；如果已加入 PATH，可保持默认值 node。
    /// </summary>
    public string NodeExecutablePath { get; set; } = "node";

    /// <summary>
    /// mock-sdk 目录；为空时从程序输出目录下的 mock-sdk 自动查找。
    /// </summary>
    public string? MockSdkDirectory { get; set; }

    /// <summary>
    /// 等待假数据 HTTP 服务启动成功的最长时间。
    /// </summary>
    public TimeSpan StartupTimeout { get; set; } = TimeSpan.FromSeconds(8);

    /// <summary>
    /// 当前配置对应的调试页面地址。
    /// </summary>
    public Uri DebugUri => new($"http://{Host}:{HttpPort}/debug");

    /// <summary>
    /// 解析 mock-sdk 目录，兼容 DLL 输出目录和源码目录两种运行方式。
    /// </summary>
    public string ResolveMockSdkDirectory()
    {
        if (!string.IsNullOrWhiteSpace(MockSdkDirectory))
        {
            return Path.GetFullPath(MockSdkDirectory);
        }

        var outputCandidate = Path.Combine(AppContext.BaseDirectory, "mock-sdk");
        if (File.Exists(Path.Combine(outputCandidate, "mock-service.js")))
        {
            return outputCandidate;
        }

        var currentCandidate = Path.Combine(Environment.CurrentDirectory, "mock-sdk");
        if (File.Exists(Path.Combine(currentCandidate, "mock-service.js")))
        {
            return currentCandidate;
        }

        return outputCandidate;
    }
}
