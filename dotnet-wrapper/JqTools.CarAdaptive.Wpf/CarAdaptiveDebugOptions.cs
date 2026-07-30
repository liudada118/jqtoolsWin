using System.IO;

namespace JqTools.CarAdaptive.Wpf;

/// <summary>
/// 汽车自适应调试控件的服务启动配置。
/// </summary>
public sealed class CarAdaptiveDebugOptions
{
    /// <summary>
    /// 控件访问 HTTP/WS 服务时使用的本机地址。
    /// </summary>
    public string Host { get; set; } = "127.0.0.1";

    /// <summary>
    /// 汽车自适应真实数据 HTTP 服务端口。
    /// </summary>
    public int HttpPort { get; set; } = 19245;

    /// <summary>
    /// 汽车自适应真实数据 WebSocket 服务端口。
    /// </summary>
    public int WebSocketPort { get; set; } = 19999;

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
    /// WebView2 加载的页面路径；默认加载 /app 项目真实业务前端。
    /// </summary>
    public string PagePath { get; set; } = "/app";

    /// <summary>
    /// 远程返回主页命令使用的网页地址或路由；为空时由 WPF 宿主处理 HomeRequested 事件。
    /// </summary>
    public string? HomeUrl { get; set; } =
        Environment.GetEnvironmentVariable("JQTOOLS_HOME_URL");

    /// <summary>
    /// 局域网远程控制口令；为空时允许局域网内直接调用控制接口。
    /// </summary>
    public string? RemoteControlToken { get; set; } =
        Environment.GetEnvironmentVariable("JQTOOLS_REMOTE_CONTROL_TOKEN");

    /// <summary>
    /// 等待真实数据 HTTP 服务启动成功的最长时间。
    /// </summary>
    public TimeSpan StartupTimeout { get; set; } = TimeSpan.FromSeconds(8);

    /// <summary>
    /// 当前配置对应的调试页面地址。
    /// </summary>
    public Uri DebugUri => new($"http://{Host}:{HttpPort}{BuildPagePath()}");

    /// <summary>
    /// 生成带本机主页覆盖参数的页面路径，并把查询参数放在 Hash 路由之前。
    /// </summary>
    private string BuildPagePath()
    {
        var pagePath = NormalizePagePath(PagePath);
        if (string.IsNullOrWhiteSpace(HomeUrl))
        {
            return pagePath;
        }

        var fragmentIndex = pagePath.IndexOf('#');
        var pathAndQuery = fragmentIndex >= 0 ? pagePath[..fragmentIndex] : pagePath;
        var fragment = fragmentIndex >= 0 ? pagePath[fragmentIndex..] : string.Empty;
        var separator = pathAndQuery.Contains('?') ? "&" : "?";
        return $"{pathAndQuery}{separator}homeUrl={Uri.EscapeDataString(HomeUrl.Trim())}{fragment}";
    }

    /// <summary>
    /// 将页面路径规范化为以斜杠开头的 HTTP 路径。
    /// </summary>
    private static string NormalizePagePath(string pagePath)
    {
        if (string.IsNullOrWhiteSpace(pagePath))
        {
            return "/app";
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
    /// 解析 Node.js 可执行文件；客户 SDK 优先使用随包交付的 runtime/node/node.exe。
    /// </summary>
    public string ResolveNodeExecutablePath()
    {
        if (!string.IsNullOrWhiteSpace(NodeExecutablePath) &&
            !string.Equals(NodeExecutablePath, "node", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(NodeExecutablePath, "node.exe", StringComparison.OrdinalIgnoreCase))
        {
            return Path.GetFullPath(NodeExecutablePath);
        }

        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "runtime", "node", "node.exe"),
            Path.Combine(AppContext.BaseDirectory, "..", "runtime", "node", "node.exe"),
            Path.Combine(AppContext.BaseDirectory, "..", "..", "runtime", "node", "node.exe")
        };

        foreach (var candidate in candidates)
        {
            var fullPath = Path.GetFullPath(candidate);
            if (File.Exists(fullPath))
            {
                return fullPath;
            }
        }

        return string.IsNullOrWhiteSpace(NodeExecutablePath) ? "node" : NodeExecutablePath;
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
