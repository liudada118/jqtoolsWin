using System;
using System.Runtime.InteropServices;
using System.Text;

namespace JqTools.CarAdaptive.NativeLoader;

/// <summary>
/// WPF 通过 P/Invoke 加载标准 C/C++ Native DLL。
/// </summary>
public static class JqToolsCarAdaptiveNative
{
    private const string DllName = "JqToolsCarAdaptiveNative.dll";

    static JqToolsCarAdaptiveNative()
    {
        AppDomain.CurrentDomain.ProcessExit += (_, _) => StopQuietly();
    }

    [DllImport(DllName, CharSet = CharSet.Unicode, CallingConvention = CallingConvention.StdCall)]
    private static extern int JqCarAdaptiveStart(
        string? mockSdkDirectory,
        string? nodeExecutablePath,
        string? host,
        int httpPort,
        int webSocketPort,
        int startupTimeoutMs);

    [DllImport(DllName, CharSet = CharSet.Unicode, CallingConvention = CallingConvention.StdCall)]
    private static extern int JqCarAdaptiveStop();

    [DllImport(DllName, CharSet = CharSet.Unicode, CallingConvention = CallingConvention.StdCall)]
    private static extern int JqCarAdaptiveIsRunning();

    [DllImport(DllName, CharSet = CharSet.Unicode, CallingConvention = CallingConvention.StdCall)]
    private static extern int JqCarAdaptiveGetDebugUrl(StringBuilder buffer, int bufferLength);

    [DllImport(DllName, CharSet = CharSet.Unicode, CallingConvention = CallingConvention.StdCall)]
    private static extern int JqCarAdaptiveOpenDebugPage();

    [DllImport(DllName, CharSet = CharSet.Unicode, CallingConvention = CallingConvention.StdCall)]
    private static extern int JqCarAdaptiveGetLastError(StringBuilder buffer, int bufferLength);

    /// <summary>
    /// 启动 Native DLL 托管的 mock-sdk 假数据服务。
    /// </summary>
    public static void Start(
        string? mockSdkDirectory = null,
        string? nodeExecutablePath = "node",
        string host = "127.0.0.1",
        int httpPort = 19345,
        int webSocketPort = 19399,
        int startupTimeoutMs = 8000)
    {
        var code = JqCarAdaptiveStart(mockSdkDirectory, nodeExecutablePath, host, httpPort, webSocketPort, startupTimeoutMs);
        ThrowIfFailed(code);
    }

    /// <summary>
    /// 停止 Native DLL 启动的 mock-sdk 假数据服务。
    /// </summary>
    public static void Stop()
    {
        ThrowIfFailed(JqCarAdaptiveStop());
    }

    /// <summary>
    /// 服务是否正在运行。
    /// </summary>
    public static bool IsRunning => JqCarAdaptiveIsRunning() == 1;

    /// <summary>
    /// 获取当前调试页面地址。
    /// </summary>
    public static string GetDebugUrl()
    {
        var buffer = new StringBuilder(512);
        var code = JqCarAdaptiveGetDebugUrl(buffer, buffer.Capacity);
        ThrowIfFailed(code);
        return buffer.ToString();
    }

    /// <summary>
    /// 用系统默认浏览器打开调试页面。
    /// </summary>
    public static void OpenDebugPage()
    {
        ThrowIfFailed(JqCarAdaptiveOpenDebugPage());
    }

    /// <summary>
    /// 获取 Native DLL 最近一次错误信息。
    /// </summary>
    public static string GetLastError()
    {
        var buffer = new StringBuilder(2048);
        _ = JqCarAdaptiveGetLastError(buffer, buffer.Capacity);
        return buffer.ToString();
    }

    private static void ThrowIfFailed(int code)
    {
        if (code == 0)
        {
            return;
        }

        throw new InvalidOperationException($"JqTools native DLL call failed: {code}. {GetLastError()}");
    }

    private static void StopQuietly()
    {
        try
        {
            if (JqCarAdaptiveIsRunning() == 1)
            {
                _ = JqCarAdaptiveStop();
            }
        }
        catch
        {
        }
    }
}
