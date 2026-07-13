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
    /// 真实前端 build 目录；为空时会从 SDK 根目录的 frontend-build 自动查找。
    /// </summary>
    public string? FrontendBuildDirectory { get; set; }

    /// <summary>
    /// WebView2 加载的页面路径；默认加载 SDK 调试页，可设置为 /app 加载项目真实前端。
    /// </summary>
    public string PagePath { get; set; } = "/debug";

    /// <summary>
    /// 等待假数据 HTTP 服务启动成功的最长时间。
    /// </summary>
    public TimeSpan StartupTimeout { get; set; } = TimeSpan.FromSeconds(8);

    /// <summary>
    /// 当前配置对应的调试页面地址。
    /// </summary>
    public Uri DebugUri => new($"http://{Host}:{HttpPort}{NormalizePagePath(PagePath)}");

    private static string NormalizePagePath(string pagePath)
    {
        if (string.IsNullOrWhiteSpace(pagePath))
        {
            return "/debug";
        }

        return pagePath.StartsWith("/", StringComparison.Ordinal) ? pagePath : $"/{pagePath}";
    }

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

    /// <summary>
    /// 解析真实前端 build 目录，兼容 app/mock-sdk、mock-service 和 wpf-control/mock-sdk 等运行位置。
    /// </summary>
    public string ResolveFrontendBuildDirectory(string mockSdkDirectory)
    {
        if (!string.IsNullOrWhiteSpace(FrontendBuildDirectory))
        {
            return Path.GetFullPath(FrontendBuildDirectory);
        }

        var candidates = new[]
        {
            Path.Combine(mockSdkDirectory, "frontend-build"),
            Path.Combine(mockSdkDirectory, "..", "frontend-build"),
            Path.Combine(mockSdkDirectory, "..", "..", "frontend-build"),
            Path.Combine(AppContext.BaseDirectory, "frontend-build")
        };

        foreach (var candidate in candidates)
        {
            var fullPath = Path.GetFullPath(candidate);
            if (File.Exists(Path.Combine(fullPath, "index.html")))
            {
                return fullPath;
            }
        }

        return Path.GetFullPath(candidates[0]);
    }
}
