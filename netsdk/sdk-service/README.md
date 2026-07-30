# JQTools Car Adaptive SDK

This SDK is for customer applications that need to call the JQTools car adaptive backend.

It only exposes car adaptive capabilities:

- Connect to the local backend
- List and connect serial ports
- Subscribe to car adaptive algorithm data
- Submit a 144-point sensor frame to the Python algorithm included in this SDK
- Optionally write the returned `control_command` to the car adaptive serial port
- Read and update Python algorithm parameters

Default backend addresses:

- REST API: `http://127.0.0.1:19245`
- WebSocket: `ws://127.0.0.1:19999`

The SDK includes the Python algorithm files under `python/app/` and starts a local Python worker on the first algorithm call.

The SDK does not start the desktop app or serial service. Start JQTools first when you need serial-port access or WebSocket data from hardware.

## Python Runtime

The customer machine must have Python and the algorithm dependencies installed.

Install dependencies from the SDK package:

```bash
pip install -r node_modules/@jqtools/client-sdk/python/app/requirements.txt
pip install scipy ruamel.yaml
```

If Python is not available as `python`, pass the executable path:

```js
const jqtools = createClient({
  pythonPath: 'C:/Python311/python.exe'
});
```

You can also point the SDK at a custom algorithm script:

```js
const jqtools = createClient({
  algorithmScriptPath: 'D:/your-algorithm/server.py'
});
```

## Install

Install from the delivered tarball:

```bash
npm install ./jqtools-client-sdk-1.0.0.tgz
```

For local development in this repository:

```bash
npm install ./sdk
```

## Start Services

The SDK can run as two services:

- HTTP API service
- WebSocket broadcast service

Start the services:

```bash
cd sdk
npm start
```

Open the debug page:

```text
http://127.0.0.1:19245/debug
```

Default addresses:

- HTTP: `http://127.0.0.1:19245`
- WebSocket: `ws://127.0.0.1:19999`

Environment variables:

```bash
JQTOOLS_SDK_HTTP_PORT=19245
JQTOOLS_SDK_WS_PORT=19999
JQTOOLS_PYTHON=C:/Python311/python.exe
JQTOOLS_SERIAL_BACKEND_URL=http://127.0.0.1:19245
```

`JQTOOLS_SERIAL_BACKEND_URL` is only required when the SDK service needs to call an existing JQTools backend for serial-port operations. Do not point it back to the SDK HTTP service itself.

## HTTP Interfaces

Health:

```bash
GET /health
```

Serial operations:

```bash
GET /getPort
GET /connPort
POST /carAdaptive/writeCommand
```

Python algorithm:

```bash
POST /carAdaptive/processFrame
POST /callPython
GET /getPyConfig
POST /changePy
```

Call the car adaptive algorithm:

```js
const response = await fetch('http://127.0.0.1:19245/carAdaptive/processFrame', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sensorData: new Array(144).fill(50),
    writeSerial: false
  })
});

console.log(await response.json());
```

`sensorData` must contain exactly 144 values.

## WebSocket Stream

Connect to:

```text
ws://127.0.0.1:19999
```

When `/carAdaptive/processFrame` is called, the SDK broadcasts:

- `algorData`
- `algorFeed`

## Function Usage

Function usage is still available for internal integration, but the recommended customer-facing mode is to start the SDK services and call the HTTP/WebSocket interfaces above.

## Mock Debug Services

The mock debug version has been moved to the independent `../mock-sdk` folder.
Use it when frontend or customer integration needs fake connection, fake sensor data,
fake algorithm data, airbag command responses, and the adaptive switch without real hardware.

## Quick Start as Library

```js
const { createClient } = require('@jqtools/client-sdk');

const jqtools = createClient({
  baseUrl: 'http://127.0.0.1:19245',
  wsUrl: 'ws://127.0.0.1:19999',
  unwrap: true
});

async function main() {
  const ports = await jqtools.listPorts();
  console.log('ports:', ports);

  await jqtools.connectCarAdaptivePorts();

  const sensorData = new Array(144).fill(50);
  const result = await jqtools.processCarAdaptiveFrame(sensorData, {
    sensorId: 1,
    writeSerial: true
  });

  console.log('algorithm result:', result);
}

main().catch(console.error);
```

## Real-Time Algorithm Stream

When the backend receives a 145-byte car adaptive serial frame, it treats the first byte as the sensor identifier and sends the remaining 144 pressure values to an independent Python algorithm instance. Sensor ID `1` is the main sensor and ID `2` is the secondary sensor. Both algorithms keep running, and `carAdaptiveSensorsData` carries both complete datasets so each frontend can select locally.

```js
const current = await jqtools.getCarAdaptiveSensor();
const statuses = await jqtools.getCarAdaptiveSensors();
await jqtools.selectCarAdaptiveSensor(2); // legacy single-stream clients only
```

```js
const socket = jqtools.connectCarAdaptiveStream({
  onAlgorithmData(data) {
    console.log('Python algorithm data:', data);
  },
  onControlFeedback(feed) {
    console.log('control feedback:', feed);
  },
  onSensorChange(selection) {
    console.log('display sensor:', selection.sensorId, selection.role);
  },
  onSensorStatus(statuses) {
    console.log('both algorithms:', statuses);
  },
  onSensorData(sensorSnapshots) {
    // Both datasets arrive together; select sensorId 1 or 2 locally for rendering.
    console.log('main and secondary datasets:', sensorSnapshots);
  },
  onRawMessage(message) {
    console.log('raw stream message:', message);
  },
  onError(error) {
    console.error('stream error:', error);
  }
});

// Stop receiving data:
// socket.close();
```

Common car adaptive fields:

- `algorData`: full Python algorithm result
- `algorFeed`: extracted control feedback values
- `control_command`: byte array returned by the Python algorithm
- `living_status`, `body_type`, `seat_state`, `frame_count`: algorithm status fields

## Call Python Algorithm Directly

Use `processCarAdaptiveFrame(sensorData, options)` when the customer application already has a 144-point car adaptive sensor frame and wants to call the Python package included in the SDK.

```js
const sensorData = [
  // 144 values, each expected to be 0-255
];

const result = await jqtools.processCarAdaptiveFrame(sensorData, {
  // 1: use the main algorithm instance; 2: use the secondary instance
  sensorId: 2,
  // false: only return algorithm result
  // true: also ask the backend to write result.control_command to the car adaptive serial port
  writeSerial: false
});
```

`sensorData` must contain exactly 144 numbers.

## Python Parameters

```js
const config = await jqtools.getPythonConfig();
console.log(config);

await jqtools.setPythonParam('lumbar.back_total_threshold', 500);

// Stop the SDK-local Python process when the customer app exits.
jqtools.stopPythonAlgorithm();
```

## API

- `health()`
- `listPorts()`
- `connectPorts()`
- `connectCarAdaptivePorts()`
- `getCarAdaptiveSensor()` / `selectCarAdaptiveSensor(sensorId)`
- `getCarAdaptiveSensors()`
- `processCarAdaptiveFrame(sensorData, { sensorId, writeSerial })`
- `writeCarAdaptiveCommand(controlCommand, sensorId)`
- `connectStream(handlers)`
- `connectCarAdaptiveStream(handlers)`
- `getPythonConfig()`
- `setPythonParam(path, value)`
- `callPythonFunction(fn, args)`
- `stopPythonAlgorithm()`
- `request(method, pathname, options)`

`request()` is kept only for custom or future endpoints.

## Return Format

By default, methods return the backend `HttpResult` envelope:

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

With `unwrap: true`, backend HTTP methods return `data` directly and throw `JqToolsError` when `code !== 0`.

`processCarAdaptiveFrame()`, `getPythonConfig()`, `setPythonParam()`, and `callPythonFunction()` call the SDK-local Python worker directly, so they return Python results directly rather than an HTTP envelope.
