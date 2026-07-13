# 真实数据版 SDK 说明

当前 `customer-sdk` 已切换为真实数据链路，不再默认启动假数据服务。

## 1. 当前链路

```text
WPF 启动程序
  -> app/mock-sdk/mock-service.js
  -> fork 项目真实后端 server/serialServer.js
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

## 7. 注意事项

当前为了避免重复复制巨大的 Python 运行时和 Node 依赖，SDK 真实服务启动器会优先查找当前项目根目录：

```text
D:\jqtoolsWin1
```

也就是说当前版本适合本机真实链路验证。

如果要交付给客户独立运行，需要继续把以下内容一起打进客户包：

```text
server/
util/
pyWorker.js
python/
config.txt
db/
data/
node_modules/
```

或者把 Node 后端、Python 算法分别封装成 exe，再由 WPF 启动。

