# JqToolsCarAdaptiveNative

这是标准 C/C++ Native DLL 方案。WPF 不能像托管 DLL 一样直接添加引用 Native DLL，需要用 `DllImport`/PInvoke 加载。

DLL 负责：

- 启动 `mock-sdk/mock-service.js`
- 注入 `JQTOOLS_MOCK_HOST`、`JQTOOLS_MOCK_HTTP_PORT`、`JQTOOLS_MOCK_WS_PORT`
- 等待 `/health` 服务可用
- 返回调试页 URL：`http://127.0.0.1:19345/debug`
- 停止由 DLL 启动的 Node.js 服务

## 构建

需要 Visual Studio C++ 工具链和 CMake。

```powershell
cd D:\jqtoolsWin1\native-dll\JqToolsCarAdaptiveNative
.\build-native.ps1 -Configuration Release
```

输出目录会包含：

- `JqToolsCarAdaptiveNative.dll`
- `mock-sdk\mock-service.js`
- `mock-sdk\mock-debug.html`
- `mock-sdk\node_modules\ws\...`

运行环境需要：

- Windows
- Node.js 18+
- WPF 侧如果要内嵌页面，需要 WebView2 Runtime

## 导出函数

```cpp
int __stdcall JqCarAdaptiveStart(
    const wchar_t* mockSdkDirectory,
    const wchar_t* nodeExecutablePath,
    const wchar_t* host,
    int httpPort,
    int webSocketPort,
    int startupTimeoutMs);

int __stdcall JqCarAdaptiveStop();
int __stdcall JqCarAdaptiveIsRunning();
int __stdcall JqCarAdaptiveGetDebugUrl(wchar_t* buffer, int bufferLength);
int __stdcall JqCarAdaptiveOpenDebugPage();
int __stdcall JqCarAdaptiveGetLastError(wchar_t* buffer, int bufferLength);
```

## WPF 加载方式

把 `wpf-loader/JqToolsCarAdaptiveNative.cs` 放进 WPF 项目，保证 `JqToolsCarAdaptiveNative.dll` 和 `mock-sdk` 目录复制到 WPF 输出目录。

```csharp
JqToolsCarAdaptiveNative.Start();
WebView.Source = new Uri(JqToolsCarAdaptiveNative.GetDebugUrl());
```

窗口关闭时：

```csharp
JqToolsCarAdaptiveNative.Stop();
```

如果 DLL 不和 `mock-sdk` 放在同一输出目录，可以启动时传入绝对路径：

```csharp
JqToolsCarAdaptiveNative.Start(mockSdkDirectory: @"D:\jqtoolsWin1\mock-sdk");
```
