#pragma once

#ifdef JQTOOLS_CAR_ADAPTIVE_NATIVE_EXPORTS
#define JQTOOLS_NATIVE_API extern "C" __declspec(dllexport)
#else
#define JQTOOLS_NATIVE_API extern "C" __declspec(dllimport)
#endif

// 返回值约定：
// 0  = 成功
// -1 = 参数错误
// -2 = mock-sdk 目录或 mock-service.js 不存在
// -3 = Node.js 服务进程启动失败
// -4 = 等待 HTTP 健康检查超时
// -5 = 缓冲区长度不足
// -6 = 操作系统 API 调用失败

JQTOOLS_NATIVE_API int __stdcall JqCarAdaptiveStart(
    const wchar_t* mockSdkDirectory,
    const wchar_t* nodeExecutablePath,
    const wchar_t* host,
    int httpPort,
    int webSocketPort,
    int startupTimeoutMs);

JQTOOLS_NATIVE_API int __stdcall JqCarAdaptiveStop();

JQTOOLS_NATIVE_API int __stdcall JqCarAdaptiveIsRunning();

JQTOOLS_NATIVE_API int __stdcall JqCarAdaptiveGetDebugUrl(
    wchar_t* buffer,
    int bufferLength);

JQTOOLS_NATIVE_API int __stdcall JqCarAdaptiveOpenDebugPage();

JQTOOLS_NATIVE_API int __stdcall JqCarAdaptiveGetLastError(
    wchar_t* buffer,
    int bufferLength);
