# 真实数据版 SDK 说明

当前 `customer-sdk` 已切换为真实数据链路，不再默认启动假数据服务。

## 1. 当前链路

```text
WPF 启动程序
  -> app/mock-sdk/mock-service.js
  -> fork customer-sdk/real-backend/server/serialServer.js
  -> 读取真实串口
  -> 调用 pyWorker.js / Python 算法
  -> 写入气囊串口 control_command
  -> WebSocket 推送真实协议数据
  -> WebView2 加载 /app 真实前端
```

为了兼容原来的 WPF 控件启动逻辑，入口文件名仍然叫：

```text
mock-service.js
```

但现在这个文件实际是“真实服务启动器”，不是假数据生成器。

## 2. 默认端口

```text
HTTP: http://127.0.0.1:19245
WebSocket: ws://127.0.0.1:19999
真实前端: http://127.0.0.1:19245/app
```

真实前端仍然使用原项目跑通过的端口，所以前端代码不用改。

## 3. 真数据来自哪里

真实数据来自：

```text
server/serialServer.js
```

它会执行：

- `GET /getPort`：读取本机真实串口列表。
- `GET /connPort`：一键连接真实串口。
- 串口收到 144 点汽车自适应压力数据后，调用 Python 算法。
- Python 返回 `control_command` 后，后端写回 `carAir` 类型串口。
- WebSocket 推送 `sitData`、`algorData`、`algorFeed` 等真实协议字段。

## 4. Python 算法调用

真实后端通过：

```text
pyWorker.js
```

启动：

```text
python/Python311/python.exe
python/app/server.py
```

通信方式保持原来的 stdin/stdout JSON 行协议。

客户包内的实际位置为：

```text
real-backend/python/Python311/python.exe
real-backend/python/app/server.py
real-backend/python/app/sensor_config.yaml
```

算法参数接口：

```text
GET  /algorithm/config
POST /algorithm/config
```

批量保存示例：

```json
{
  "changes": {
    "system.hz": 15,
    "living_detection.enabled": true
  }
}
```

## 5. 前端资源

真实前端资源在：

```text
frontend-build/
```

真实后端现在会提供：

```text
GET /app
GET /static/...
GET /model/...
```

所以 Three.js 的 `.glb`、`.fbx` 和贴图资源仍然通过 HTTP 加载。

## 6. 验证方式

基础验证：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-sdk.ps1
```

验证内容：

- WPF EXE 是否存在。
- WPF DLL 是否存在。
- Native DLL 是否存在。
- `frontend-build/index.html` 是否存在。
- `frontend-build/model/seat2.glb` 是否存在。
- 真实后端 `/health` 是否正常。
- `/app` 是否能加载真实前端。
- `/model/seat2.glb` 是否能访问模型资源。
- `/getPort` 是否能读取真实串口列表。

如果要实际执行一键串口连接：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-sdk.ps1 -ConnectSerial
```

该命令会调用：

```text
GET /connPort
```

如果返回 `[OK] HTTP /connPort real serial connect`，说明 SDK 已经走真实串口连接。

## 7. 独立运行内容

当前客户包已经包含完整运行依赖：

```text
runtime/node/node.exe
real-backend/server/
real-backend/util/
real-backend/pyWorker.js
real-backend/python/
real-backend/node_modules/
real-backend/config.txt
real-backend/db/
```

启动器显式指向 `customer-sdk/real-backend`，不会回退到原项目目录。整个 `customer-sdk` 文件夹可复制到另一台 Windows x64 机器进行验证和交付。

