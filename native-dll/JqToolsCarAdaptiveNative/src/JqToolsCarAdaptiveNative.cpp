#define JQTOOLS_CAR_ADAPTIVE_NATIVE_EXPORTS

#include "JqToolsCarAdaptiveNative.h"

#include <windows.h>
#include <winhttp.h>
#include <shellapi.h>

#include <algorithm>
#include <chrono>
#include <cwctype>
#include <filesystem>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "shell32.lib")

namespace
{
constexpr int kOk = 0;
constexpr int kInvalidArgument = -1;
constexpr int kMissingMockSdk = -2;
constexpr int kStartFailed = -3;
constexpr int kHealthTimeout = -4;
constexpr int kBufferTooSmall = -5;
constexpr int kWinApiFailed = -6;

std::mutex g_mutex;
PROCESS_INFORMATION g_process{};
bool g_hasProcess = false;
std::wstring g_host = L"127.0.0.1";
int g_httpPort = 19345;
int g_webSocketPort = 19399;
std::wstring g_lastError;

void SetLastErrorMessage(const std::wstring& message)
{
    g_lastError = message;
}

std::wstring GetLastWin32Message(const wchar_t* prefix)
{
    const DWORD code = GetLastError();
    wchar_t* systemMessage = nullptr;
    FormatMessageW(
        FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
        nullptr,
        code,
        MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
        reinterpret_cast<LPWSTR>(&systemMessage),
        0,
        nullptr);

    std::wstringstream stream;
    stream << prefix << L" Win32=" << code;
    if (systemMessage != nullptr)
    {
        stream << L" " << systemMessage;
        LocalFree(systemMessage);
    }
    return stream.str();
}

std::wstring EmptyToDefault(const wchar_t* value, const wchar_t* defaultValue)
{
    if (value == nullptr || value[0] == L'\0')
    {
        return defaultValue;
    }
    return value;
}

std::wstring Quote(const std::wstring& value)
{
    std::wstring quoted = L"\"";
    for (const wchar_t ch : value)
    {
        if (ch == L'"')
        {
            quoted += L'\\';
        }
        quoted += ch;
    }
    quoted += L"\"";
    return quoted;
}

std::wstring GetDllDirectory()
{
    HMODULE module = nullptr;
    const auto address = reinterpret_cast<LPCWSTR>(&JqCarAdaptiveStart);
    if (!GetModuleHandleExW(
            GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            address,
            &module))
    {
        return L"";
    }

    std::wstring path(MAX_PATH, L'\0');
    DWORD length = GetModuleFileNameW(module, path.data(), static_cast<DWORD>(path.size()));
    while (length == path.size())
    {
        path.resize(path.size() * 2);
        length = GetModuleFileNameW(module, path.data(), static_cast<DWORD>(path.size()));
    }

    path.resize(length);
    return std::filesystem::path(path).parent_path().wstring();
}

bool FileExists(const std::wstring& path)
{
    return std::filesystem::exists(std::filesystem::path(path));
}

std::wstring ResolveMockSdkDirectory(const wchar_t* mockSdkDirectory)
{
    if (mockSdkDirectory != nullptr && mockSdkDirectory[0] != L'\0')
    {
        return std::filesystem::absolute(std::filesystem::path(mockSdkDirectory)).wstring();
    }

    const auto dllCandidate = std::filesystem::path(GetDllDirectory()) / L"mock-sdk";
    if (FileExists((dllCandidate / L"mock-service.js").wstring()))
    {
        return dllCandidate.wstring();
    }

    const auto cwdCandidate = std::filesystem::current_path() / L"mock-sdk";
    return cwdCandidate.wstring();
}

std::wstring ResolveFrontendBuildDirectory(const std::wstring& mockSdkDirectory)
{
    const std::vector<std::filesystem::path> candidates = {
        std::filesystem::path(mockSdkDirectory) / L"frontend-build",
        std::filesystem::path(mockSdkDirectory) / L".." / L"frontend-build",
        std::filesystem::path(mockSdkDirectory) / L".." / L".." / L"frontend-build",
        std::filesystem::path(GetDllDirectory()) / L"frontend-build"
    };

    for (const auto& candidate : candidates)
    {
        const auto fullPath = std::filesystem::absolute(candidate);
        if (FileExists((fullPath / L"index.html").wstring()))
        {
            return fullPath.wstring();
        }
    }

    return std::filesystem::absolute(candidates.front()).wstring();
}

bool IsOwnProcessRunning()
{
    if (!g_hasProcess)
    {
        return false;
    }

    const DWORD waitResult = WaitForSingleObject(g_process.hProcess, 0);
    return waitResult == WAIT_TIMEOUT;
}

void CloseProcessHandles()
{
    if (g_process.hThread != nullptr)
    {
        CloseHandle(g_process.hThread);
        g_process.hThread = nullptr;
    }
    if (g_process.hProcess != nullptr)
    {
        CloseHandle(g_process.hProcess);
        g_process.hProcess = nullptr;
    }
    g_process.dwProcessId = 0;
    g_process.dwThreadId = 0;
    g_hasProcess = false;
}

std::wstring MakeDebugUrl()
{
    std::wstringstream stream;
    stream << L"http://" << g_host << L":" << g_httpPort << L"/app";
    return stream.str();
}

std::wstring MakeHealthPath()
{
    return L"/health";
}

bool IsEnvironmentKey(const std::wstring& entry, const std::wstring& key)
{
    if (entry.size() <= key.size())
    {
        return false;
    }
    if (entry[key.size()] != L'=')
    {
        return false;
    }

    for (size_t index = 0; index < key.size(); ++index)
    {
        if (std::towlower(entry[index]) != std::towlower(key[index]))
        {
            return false;
        }
    }
    return true;
}

std::vector<wchar_t> BuildEnvironmentBlock(const std::wstring& host, int httpPort, int webSocketPort, const std::wstring& frontendBuildDirectory)
{
    std::vector<std::wstring> entries;
    LPWCH rawEnvironment = GetEnvironmentStringsW();
    if (rawEnvironment != nullptr)
    {
        for (LPWCH cursor = rawEnvironment; *cursor != L'\0';)
        {
            std::wstring entry = cursor;
            cursor += entry.size() + 1;
            if (!IsEnvironmentKey(entry, L"JQTOOLS_MOCK_HOST") &&
                !IsEnvironmentKey(entry, L"JQTOOLS_MOCK_HTTP_PORT") &&
                !IsEnvironmentKey(entry, L"JQTOOLS_MOCK_WS_PORT") &&
                !IsEnvironmentKey(entry, L"JQTOOLS_MOCK_FRONTEND_DIR") &&
                !IsEnvironmentKey(entry, L"PORT"))
            {
                entries.push_back(entry);
            }
        }
        FreeEnvironmentStringsW(rawEnvironment);
    }

    entries.push_back(L"JQTOOLS_MOCK_HOST=" + host);
    entries.push_back(L"JQTOOLS_MOCK_HTTP_PORT=" + std::to_wstring(httpPort));
    entries.push_back(L"JQTOOLS_MOCK_WS_PORT=" + std::to_wstring(webSocketPort));
    entries.push_back(L"JQTOOLS_MOCK_FRONTEND_DIR=" + frontendBuildDirectory);

    std::sort(entries.begin(), entries.end(), [](const std::wstring& left, const std::wstring& right) {
        return _wcsicmp(left.c_str(), right.c_str()) < 0;
    });

    std::vector<wchar_t> block;
    for (const auto& entry : entries)
    {
        block.insert(block.end(), entry.begin(), entry.end());
        block.push_back(L'\0');
    }
    block.push_back(L'\0');
    return block;
}

bool HealthCheckOnce(const std::wstring& host, int httpPort)
{
    HINTERNET session = WinHttpOpen(
        L"JqToolsCarAdaptiveNative/1.0",
        WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS,
        0);
    if (session == nullptr)
    {
        return false;
    }

    WinHttpSetTimeouts(session, 500, 500, 500, 500);

    HINTERNET connect = WinHttpConnect(session, host.c_str(), static_cast<INTERNET_PORT>(httpPort), 0);
    if (connect == nullptr)
    {
        WinHttpCloseHandle(session);
        return false;
    }

    const std::wstring path = MakeHealthPath();
    HINTERNET request = WinHttpOpenRequest(
        connect,
        L"GET",
        path.c_str(),
        nullptr,
        WINHTTP_NO_REFERER,
        WINHTTP_DEFAULT_ACCEPT_TYPES,
        0);
    if (request == nullptr)
    {
        WinHttpCloseHandle(connect);
        WinHttpCloseHandle(session);
        return false;
    }

    bool ok = false;
    if (WinHttpSendRequest(request, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0) &&
        WinHttpReceiveResponse(request, nullptr))
    {
        DWORD statusCode = 0;
        DWORD statusCodeSize = sizeof(statusCode);
        if (WinHttpQueryHeaders(
                request,
                WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                WINHTTP_HEADER_NAME_BY_INDEX,
                &statusCode,
                &statusCodeSize,
                WINHTTP_NO_HEADER_INDEX))
        {
            ok = statusCode >= 200 && statusCode < 300;
        }
    }

    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return ok;
}

bool WaitForHealth(const std::wstring& host, int httpPort, int timeoutMs)
{
    const int timeout = timeoutMs > 0 ? timeoutMs : 8000;
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout);

    while (std::chrono::steady_clock::now() < deadline)
    {
        if (!IsOwnProcessRunning())
        {
            SetLastErrorMessage(L"Node.js 假数据服务进程已退出。");
            return false;
        }

        if (HealthCheckOnce(host, httpPort))
        {
            return true;
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(150));
    }

    return false;
}

int CopyStringToBuffer(const std::wstring& value, wchar_t* buffer, int bufferLength)
{
    if (buffer == nullptr || bufferLength <= 0)
    {
        return kInvalidArgument;
    }

    const int required = static_cast<int>(value.size()) + 1;
    if (bufferLength < required)
    {
        if (bufferLength > 0)
        {
            buffer[0] = L'\0';
        }
        return kBufferTooSmall;
    }

    wcscpy_s(buffer, static_cast<size_t>(bufferLength), value.c_str());
    return kOk;
}
}

JQTOOLS_NATIVE_API int __stdcall JqCarAdaptiveStart(
    const wchar_t* mockSdkDirectory,
    const wchar_t* nodeExecutablePath,
    const wchar_t* host,
    int httpPort,
    int webSocketPort,
    int startupTimeoutMs)
{
    std::lock_guard<std::mutex> lock(g_mutex);

    if (httpPort <= 0 || httpPort > 65535 || webSocketPort <= 0 || webSocketPort > 65535)
    {
        SetLastErrorMessage(L"端口号必须在 1-65535 之间。");
        return kInvalidArgument;
    }

    if (IsOwnProcessRunning())
    {
        return kOk;
    }

    CloseProcessHandles();

    const std::wstring resolvedMockSdkDirectory = ResolveMockSdkDirectory(mockSdkDirectory);
    const auto serviceFile = std::filesystem::path(resolvedMockSdkDirectory) / L"mock-service.js";
    if (!FileExists(serviceFile.wstring()))
    {
        SetLastErrorMessage(L"未找到 mock-sdk/mock-service.js：" + serviceFile.wstring());
        return kMissingMockSdk;
    }

    g_host = EmptyToDefault(host, L"127.0.0.1");
    g_httpPort = httpPort;
    g_webSocketPort = webSocketPort;

    const std::wstring nodePath = EmptyToDefault(nodeExecutablePath, L"node");
    std::wstring commandLine = Quote(nodePath) + L" mock-service.js";
    std::vector<wchar_t> commandLineBuffer(commandLine.begin(), commandLine.end());
    commandLineBuffer.push_back(L'\0');

    const std::wstring resolvedFrontendBuildDirectory = ResolveFrontendBuildDirectory(resolvedMockSdkDirectory);
    auto environment = BuildEnvironmentBlock(g_host, g_httpPort, g_webSocketPort, resolvedFrontendBuildDirectory);

    STARTUPINFOW startupInfo{};
    startupInfo.cb = sizeof(startupInfo);
    startupInfo.dwFlags = STARTF_USESHOWWINDOW;
    startupInfo.wShowWindow = SW_HIDE;

    PROCESS_INFORMATION processInfo{};
    const BOOL created = CreateProcessW(
        nullptr,
        commandLineBuffer.data(),
        nullptr,
        nullptr,
        FALSE,
        CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT,
        environment.data(),
        resolvedMockSdkDirectory.c_str(),
        &startupInfo,
        &processInfo);

    if (!created)
    {
        SetLastErrorMessage(GetLastWin32Message(L"启动 Node.js 假数据服务失败。"));
        return kStartFailed;
    }

    g_process = processInfo;
    g_hasProcess = true;

    if (!WaitForHealth(g_host, g_httpPort, startupTimeoutMs))
    {
        if (IsOwnProcessRunning())
        {
            TerminateProcess(g_process.hProcess, 1);
            WaitForSingleObject(g_process.hProcess, 3000);
        }
        CloseProcessHandles();
        if (g_lastError.empty())
        {
            SetLastErrorMessage(L"等待汽车自适应假数据服务健康检查超时：" + MakeDebugUrl());
        }
        return kHealthTimeout;
    }

    SetLastErrorMessage(L"");
    return kOk;
}

JQTOOLS_NATIVE_API int __stdcall JqCarAdaptiveStop()
{
    std::lock_guard<std::mutex> lock(g_mutex);

    if (!g_hasProcess)
    {
        return kOk;
    }

    if (IsOwnProcessRunning())
    {
        if (!TerminateProcess(g_process.hProcess, 0))
        {
            SetLastErrorMessage(GetLastWin32Message(L"停止 Node.js 假数据服务失败。"));
            return kWinApiFailed;
        }
        WaitForSingleObject(g_process.hProcess, 3000);
    }

    CloseProcessHandles();
    SetLastErrorMessage(L"");
    return kOk;
}

JQTOOLS_NATIVE_API int __stdcall JqCarAdaptiveIsRunning()
{
    std::lock_guard<std::mutex> lock(g_mutex);
    return IsOwnProcessRunning() ? 1 : 0;
}

JQTOOLS_NATIVE_API int __stdcall JqCarAdaptiveGetDebugUrl(wchar_t* buffer, int bufferLength)
{
    std::lock_guard<std::mutex> lock(g_mutex);
    return CopyStringToBuffer(MakeDebugUrl(), buffer, bufferLength);
}

JQTOOLS_NATIVE_API int __stdcall JqCarAdaptiveOpenDebugPage()
{
    std::lock_guard<std::mutex> lock(g_mutex);
    const std::wstring url = MakeDebugUrl();
    const HINSTANCE result = ShellExecuteW(nullptr, L"open", url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
    if (reinterpret_cast<intptr_t>(result) <= 32)
    {
        SetLastErrorMessage(L"打开调试页面失败：" + url);
        return kWinApiFailed;
    }
    return kOk;
}

JQTOOLS_NATIVE_API int __stdcall JqCarAdaptiveGetLastError(wchar_t* buffer, int bufferLength)
{
    std::lock_guard<std::mutex> lock(g_mutex);
    return CopyStringToBuffer(g_lastError, buffer, bufferLength);
}
