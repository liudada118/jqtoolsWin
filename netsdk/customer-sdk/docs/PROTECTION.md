# 客户 SDK 源码保护说明

## 已保护内容

- Node 第一方业务模块不以 `.js` 交付，而是压缩、AES-256-GCM 加密到 `real-backend/backend.jqpack`。
- `real-backend/backend-host.exe` 是 Node.js SEA 宿主，启动后只在内存中解密和加载业务模块。
- Python 第一方算法不以 `.py` 交付，只保留 `server.pyc`、`integrated_system.pyc`、`config.pyc`、`control.pyc` 和 `tap_massage.pyc`。
- WPF、WPF 控件和 Native DLL 都通过同一薄启动器调用受保护后端，客户调用方式不变。

## 有意保留明文

- `sensor_config.yaml`：现场算法参数调节需要读写。
- `config.txt`：串口和系统运行配置。
- `frontend-build/`：浏览器/WebView2 必须加载 HTML、JavaScript、Three.js 模型等静态资源；当前前端是压缩构建产物，不是 React 源目录。
- `node_modules/`、Python 标准库和第三方依赖：用于串口、SQLite、数值计算等运行能力，其中可能包含第三方源码。

## 安全边界

这是一层防止直接查看和复制业务源码的交付保护，不等于不可逆。任何必须在客户电脑离线执行的代码和密钥，理论上都可能通过调试、内存抓取或逆向分析被恢复；`.pyc` 也属于提高分析成本，而不是密码学加密。

更高保护要求应叠加：

1. 对 EXE、DLL 和安装包做企业代码签名。
2. 增加客户许可证、机器绑定和到期策略。
3. 对算法核心使用 Cython/Nuitka 或 C/C++ 原生扩展编译。
4. 将最高价值算法放到受控服务器，仅向客户提供 API。

## 交付前检查

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-sdk.ps1
```

验收脚本会确认保护产物存在，并确认以下第一方明文源码不存在：

```text
real-backend/server/
real-backend/util/
real-backend/pyWorker.js
real-backend/python/app/server.py
```
