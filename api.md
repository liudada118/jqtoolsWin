**Overview**
- HTTP (Serial Server): `http://localhost:19245`
- HTTP (Backend): `http://localhost:3000`
- WebSocket: `ws://localhost:19999`

**Conventions**
- `HttpResult` response shape: `{ code: number, message: string, data: any }`
- Most endpoints expect `Content-Type: application/json` unless noted.
- Some endpoints currently do not send a response in code (marked below).

**Serial Server APIs (Port 19245)**
`GET /`
Description: Health check.
Response: Plain text `Hello World!`.

`GET /OneStep/:name`
Description: Preview/download a PDF report from the `OneStep` directory.
Path params: `name` (file name, no path separators).
Response: `application/pdf`.
Notes: Returns 400 on invalid name, 403 on path traversal, 404 if not found.

`POST /bindKey`
Description: Bind device key (placeholder).
Body: `{ "key": string }`.
Response: `HttpResult`, code 0/1.

`POST /uploadCanvas`
Description: Upload heatmap image and generate PDF report.
Content-Type: `multipart/form-data`.
Form fields: `file` (required), `date` (required), `collectName`, `age`, `gender`, `userId`, `filename`.
Response: `HttpResult` with data `{ file, body, absolutePath }`.
Notes: Requires `date`. Also relies on `pdfArrData` populated by `POST /getDbHeatmap`.

`POST /uploadCanvas_old`
Description: Legacy placeholder.
Body: `{ "key": string }`.
Response: `HttpResult`, code 0/1.

`POST /selectSystem`
Description: Select system type and re-init DB.
Query: `file` (system type).
Response: No response in current code.

`GET /getSystem`
Description: Get system config and current system type.
Response: `HttpResult` with decrypted config object.
Notes: Server forces `result.value = 'foot'` before returning.

`GET /getPort`
Description: List available serial ports.
Response: `HttpResult` with port list.

`GET /connPort`
Description: Connect all detected ports and start parsing.
Response: `HttpResult` with port list.

`POST /startCol`
Description: Start data collection.
Body: `{ fileName, name, collectName, date, colName, select }`.
Response: `HttpResult` code 0 or error message.
Notes: Requires matching sensors already connected; otherwise returns error string. `select` is stored for DB.

`GET /endCol`
Description: Stop data collection.
Response: `HttpResult`.

`GET /getColHistory`
Description: List latest collection history (distinct by date).
Response: `HttpResult` with array of `{ date, timestamp, name, select }`.
Notes: Also pushes WebSocket message `{ sitData: {} }`.

`POST /downlaod`
Description: Export selected entries to CSV (typo in path kept as-is).
Body: `{ fileArr: string[] }`.
Response: `HttpResult` with CSV data.
Notes: Returns code 555 if `fileArr` is empty.

`POST /delete`
Description: Delete entries by date.
Body: `{ fileArr: string[] }`.
Response: `HttpResult`.

`POST /changeDbName`
Description: Rename a date key.
Body: `{ oldDate, newDate }`.
Response: `HttpResult`.

`POST /getDbHistory`
Description: Load all data for a date.
Body: `{ time }`.
Response: `HttpResult`.
Data (non-foot): `{ length, pressArr, areaArr, dataArr }`.
Data (foot): Python `replay_server` result with `length`.

`POST /getDbHeatmap`
Description: Get peak frame for foot data and cache for report.
Body: `{ time }`.
Response: `HttpResult` with `peak_frame` on success.
Notes: Sets global `pdfArrData` for `/uploadCanvas`.

`POST /getContrastData`
Description: Compare two dates.
Body: `{ left, right }`.
Response: `HttpResult` with `{ left: { length, pressArr, areaArr }, right: { length, pressArr, areaArr } }`.
Notes: Sends WebSocket `{ contrastData: { left, right } }` for first frame.

`POST /changeDbDataName`
Description: Rename a record name in DB.
Body: `{ oldName, newName }`.
Response: No response in current code.

`POST /cancalDbPlay`
Description: Cancel playback (typo in path kept as-is).
Response: `HttpResult`.

`POST /getDbHistoryPlay`
Description: Start playback of history data.
Response: `HttpResult` or error if no history selected.
Notes: Sends WebSocket `{ playEnd: true }`, then `{ sitDataPlay, index, timestamp }`, then `{ playEnd: false }`.

`POST /changeDbplaySpeed`
Description: Change playback speed.
Body: `{ speed }`.
Response: `HttpResult`.
Notes: If playing, server restarts timer and sends `{ sitData, index, timestamp }` via WebSocket.

`POST /changeSystemType`
Description: Change system type and re-init DB.
Body: `{ system }`.
Response: `HttpResult` with `{ optimalObj, maxObj }` for that system.

`POST /getDbHistoryStop`
Description: Pause playback.
Response: `HttpResult`.

`POST /getDbHistoryIndex`
Description: Jump to a specific index in current history data.
Body: `{ index }`.
Response: `HttpResult` with row data.
Notes: Sends WebSocket `{ sitData, index, timestamp }`.

`POST /getCsvData`
Description: Read CSV data from a file path.
Body: `{ fileName }`.
Response: `HttpResult` with CSV data.

`GET /sendMac`
Description: Send MAC query to connected ports.
Response: `HttpResult`.
Notes: Returns “请先连接串口” if no ports connected.

`POST /getSysconfig`
Description: Encrypt a config object.
Body: `{ config: object }`.
Response: `HttpResult` with encrypted string in `data`.

`GET /getPyConfig`
Description: Read Python config via `callPy('getParam')`.
Response: `HttpResult`.

`POST /changePy`
Description: Update Python config.
Body: `{ path: string, value: string }` (value is JSON string).
Response: `HttpResult`.

**Backend APIs (Port 3000)**
`GET /`
Description: Health check.
Response: Plain text `Hello World!`.

`GET /getKey`
Description: Query device key.
Query: `uuid`.
Response: `HttpResult` with `data: "data"` (placeholder).

`POST /bindKey`
Description: Bind device key (placeholder).
Response: No response in current code.

**WebSocket (Port 19999)**
Description: Server only pushes JSON messages. Client messages are ignored.
Possible message shapes:
- `{}` initial empty message on connect.
- `{ data: <object> }` real-time parsed data (bluetooth path).
- `{ sitData: <object> }` real-time parsed data (high HZ path) or history index playback.
- `{ sitDataPlay: <array>, index, timestamp }` history playback frames.
- `{ playEnd: true|false }` playback start/end marker.
- `{ macInfo: { [portPath]: { uniqueId, version } } }` after MAC query.
- `{ contrastData: { left: <array>, right: <array> } }` contrast preview.
- `{ handle: <array> }` manual control feed.
- `{ algorFeed: <array> }` algorithm control feed.

**Examples**
```bash
curl http://localhost:19245/getSystem
```

```bash
curl -X POST http://localhost:19245/getDbHistory \
  -H "Content-Type: application/json" \
  -d "{\"time\":\"2024-01-01\"}"
```

```bash
curl -X POST http://localhost:19245/uploadCanvas \
  -F "file=@heatmap.png" \
  -F "date=2024-01-01" \
  -F "collectName=张三" \
  -F "age=30" \
  -F "gender=male"
```
