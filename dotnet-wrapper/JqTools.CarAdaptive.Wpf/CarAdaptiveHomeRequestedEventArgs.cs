namespace JqTools.CarAdaptive.Wpf;

/// <summary>
/// SDK 页面请求宿主程序返回主页时携带的事件参数。
/// </summary>
public sealed class CarAdaptiveHomeRequestedEventArgs : EventArgs
{
    /// <summary>
    /// 创建返回主页事件参数。
    /// </summary>
    /// <param name="commandId">远程控制命令标识。</param>
    /// <param name="source">请求来源。</param>
    /// <param name="requestedAt">页面发起请求的时间。</param>
    public CarAdaptiveHomeRequestedEventArgs(
        string commandId,
        string source,
        DateTimeOffset requestedAt)
        : this(commandId, source, string.Empty, requestedAt)
    {
    }

    /// <summary>
    /// 创建包含配置主页地址的返回主页事件参数。
    /// </summary>
    /// <param name="commandId">远程控制命令标识。</param>
    /// <param name="source">请求来源。</param>
    /// <param name="homeUrl">SDK 配置的网页主页地址或路由。</param>
    /// <param name="requestedAt">页面发起请求的时间。</param>
    public CarAdaptiveHomeRequestedEventArgs(
        string commandId,
        string source,
        string homeUrl,
        DateTimeOffset requestedAt)
    {
        CommandId = commandId;
        Source = source;
        HomeUrl = homeUrl;
        RequestedAt = requestedAt;
    }

    /// <summary>
    /// 远程控制命令标识，可用于和控制端回执对应。
    /// </summary>
    public string CommandId { get; }

    /// <summary>
    /// 发起返回主页请求的页面来源。
    /// </summary>
    public string Source { get; }

    /// <summary>
    /// SDK 配置的网页主页地址或路由；原生 WPF 导航可忽略该值。
    /// </summary>
    public string HomeUrl { get; }

    /// <summary>
    /// 页面发起返回主页请求的时间。
    /// </summary>
    public DateTimeOffset RequestedAt { get; }
}
