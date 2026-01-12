项目架构

概览
- Electron 桌面应用（入口：index.js）启动本地 UI、Node.js 串口/HTTP/WS 服务和 Python 算法进程。
- Node.js 服务负责串口采集、SQLite 存储与回放，并桥接 Python 算法。
- Python 层运行座椅算法，通过 stdin/stdout 的 JSON 行协议提供服务。
- 前端资源由 Electron 内置的本地 HTTP 服务提供（build/）。

运行时组件
1) Electron 主进程
   - 入口：index.js
   - 职责：
     - fork 子进程启动 API：server/serialServer.js
     - 启动 Python worker：pyWorker.js
     - 在 http://127.0.0.1:2999 提供 build/ 静态资源
     - 打开 BrowserWindow 加载本地 UI

2) Node.js API + 串口服务
   - 入口：server/serialServer.js
   - Express REST API：端口 19245
   - WebSocket：端口 19999
   - 串口采集（serialport），解析传感器帧
   - SQLite 存储在 db/（打包后 resources/db）
   - CSV 导出到 data/（打包后 resources/data）
   - 通过 callPy() 调用 Python 算法（pyWorker.js）

3) Python Worker + 算法
   - 入口：python/app/server.py
   - 采用按行 JSON 请求/响应：
     - 请求：{"id": "...", "fn": "...", "args": {...}}
     - 响应：{"id": "...", "ok": true, "data": ...}
   - 核心算法：python/app/integrated_system.py（IntegratedSeatSystem）
   - 配置：python/app/sensor_config.yaml

关键数据流
1) 传感器 -> Node
   - server/serialServer.js 读取串口数据。
   - 原始帧解析、重组与归一化（util/line.js、util/parseData.js）。

2) Node -> Python（算法）
   - 对特定帧调用 Python：callPy('server', { sensor_data: pointArr })。
   - Python 返回 control_command 与其他分析结果。

3) Node -> UI
   - WebSocket 实时推送数据（端口 19999）。
   - REST 接口提供历史数据、CSV 导出、配置修改等功能。

4) 存储
   - SQLite：
     - db/<system>.db，表：matrix
     - 写入路径：server/serialServer.js 的 storageData() + util/db.js
   - CSV：
     - data/<system><timestamp>.csv
     - 导出逻辑在 util/db.js

配置与加密
- config.txt：AES-ECB 加密配置，由 server/serialServer.js 读取解密。
- util/config.js：运行时常量（波特率、类型映射、帧分隔符等）。
- python/app/sensor_config.yaml：算法阈值与参数。

打包路径
- 打包模式下资源位于 process.resourcesPath：
  - db -> resources/db
  - data -> resources/data
  - python -> resources/python

关键模块
- index.js：Electron 启动与本地静态服务
- server/serialServer.js：REST + WS、串口解析、存储、Python 桥接
- pyWorker.js：Python 常驻进程与请求映射
- python/app/server.py：Python JSON 协议入口
- python/app/integrated_system.py：算法主体
- util/db.js：SQLite 与 CSV 工具
- util/config.js：波特率与传感器映射

端口
- 2999：本地 UI 静态服务（Electron）
- 19245：REST API（Express）
- 19999：WebSocket 数据流

优化
- 串口解析与数据库写入放到独立队列/批量写入，降低高频数据下的阻塞与抖动。
- Python 调用增加超时与错误回传到 UI/日志（pyWorker.js 目前吞掉了部分错误）。
- 统一配置路径与打包路径处理，避免 isPackaged 分支重复与 hardcode。
- REST 与 WS 的数据结构做版本化（如 schemaVersion），便于前后端演进。
- 关键日志分级与轮转，避免大量 console.log 影响性能。
- 数据库与 CSV 导出增加并发保护与取消机制，防止大量导出时阻塞主流程。
