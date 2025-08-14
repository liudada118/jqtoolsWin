

const express = require('express')
const cors = require('cors');
const WebSocket = require("ws");
const HttpResult = require('./HttpResult')
const { SerialPort, DelimiterParser } = require('serialport')
const { getPort } = require('../util/serialport')
const { blue, splitArr } = require('../util/config');
const constantObj = require('../util/config');
const { bytes4ToInt10 } = require('../util/parseData');
const { initDb, dbLoadCsv, deleteDbData, dbGetData, getCsvData } = require('../util/db');
const { hand } = require('../util/line');


const app = express()
app.use(cors());
app.use(express.json());

let dbPath = __dirname + '/../db'

// console.log(appExe.isPackaged , 'app.isPackaged')

// if (appExe.isPackaged) {
//   if (os.platform() == 'darwin') {
//     // filePath = '../..' + '/db'
//     // filePath = path.join(app.getAppPath(), 'Resources/db',);
//     dbPath = path.join(__dirname, '../../db')
//     csvPath = path.join(__dirname, '../../data')
//     nameTxt = path.join(__dirname, '../../config.txt')
//     console.log(dbPath, path.join(appExe.getAppPath(), 'Resources/db',))
//     // nameTxt = 
//     // csvPath = '../..' + '/data'
//     // nameTxt = '../..' + "/config.txt";
//   } else {

//     dbPath = 'resources' + '/db'
//     csvPath = 'resources' + '/data'
//     nameTxt = 'resources' + "/config.txt";
//     console.log(dbPath, path.join(appExe.getAppPath(), 'Resources/db',))
//   }

// }

const port = 19245

// 当前的软件系统 , 当前的波特率
var file = '', baudRate = 3000000, parserArr = {}, dataMap = {},
  // 发送HZ , 串口最大hz, 采集开关 , 采集命名 , 历史数据开关 , 历史播放开关 , 数据播放索引 , 回放定时器 , 保存数据最大HZ
  HZ = 30, MaxHZ, colFlag = false, colName, historyFlag = false, historyPlayFlag = false, playIndex = 0, colTimer, colMaxHZ, colplayHZ
let splitBuffer = Buffer.from(splitArr);

// 选择数据库数据
let historyDbArr;

const { db } = initDb('hand', dbPath)

console.log(__dirname,dbPath, '__dirname')

app.get('/', (req, res) => {
  res.send('Hello World!')
})





// 绑定密钥
app.post('/bindKey', (req, res) => {
  console.log(req.body.key)
  try {

    const { key } = req.body;

    res.json(new HttpResult(0, {}, '绑定成功'));
  } catch {
    res.json(new HttpResult(1, {}, '绑定失败'));
  }

})

/**
 * 1. 选择系统
 * 2. 初始化数据库
 * 3. 关闭串口
 * */
app.post('/selectSystem', (req, res) => {
  file = req.query.file;
  initDb('file', dbPath)
  if (blue.includes(file)) {
    baudRate = 921600
  } else {
    baudRate = 1000000
  }
})

// 查询串口
app.get('/getPort', async (req, res) => {
  const ports = await SerialPort.list()
  const portsRes = getPort(ports)
  res.json(new HttpResult(0, portsRes, '获取设备列表成功'));
})

// 一键连接
app.get('/connPort', async (req, res) => {
  try {
    let port = connectPort()
    res.json(new HttpResult(0, port, '连接成功'));
  } catch {
    res.json(new HttpResult(1, {}, '连接失败'));
  }

})

// 开始采集
app.post('/startCol', async (req, res) => {
  try {
    const { fileName } = req.body
    colFlag = true
    colName = fileName
    res.json(new HttpResult(0, port, '开始采集'));
  } catch {

  }

})


// 停止采集
app.get('/endCol', async (req, res) => {
  colFlag = false
  res.json(new HttpResult(0, 'success', '停止采集'));
})

// 获取数据库所有存取列表
app.get('/getColHistory', async (req, res) => {
  const selectQuery =
    "select DISTINCT date from matrix ORDER BY timestamp DESC LIMIT ?,?";
  const params = [0, 500];

  db.all(selectQuery, params, (err, rows) => {
    if (err) {
      console.error(err);
    } else {
      console.log(rows);
      let jsonData;
      let sitTimeArr = rows;
      let timeArr = rows;


      jsonData = JSON.stringify({
        timeArr: timeArr,
        // index: nowIndex,
        sitData: new Array(4096).fill(0),
      });

      res.json(new HttpResult(0, timeArr, '停止采集'));

      // socketSendData(server, jsonData)


    }
  });
})

// 下载成csv
app.post('/downlaod', async (req, res) => {
  try {
    const { fileArr } = req.body

    const params = fileArr;
    const data = await dbLoadCsv({ db, params, file })
    res.json(new HttpResult(0, data, '下载'));
  } catch {

  }
})

// 删除数据库某个文件
app.post('/delete', async (req, res) => {
  try {
    const { fileArr } = req.body

    const params = fileArr;
    const data = await deleteDbData({ db, params })
    console.log(data)
    res.json(new HttpResult(0, data, '删除成功'));
  } catch {

  }
})

// 获取数据库某个时间的所有数据
app.post('/getDbHistory', async (req, res) => {
  const { time } = req.body

  const selectQuery = "select * from matrix WHERE date=?";

  const params = [time];

  const { length, pressArr, areaArr, rows } = await dbGetData({ db, params })

  const data = { length, pressArr, areaArr, }

  historyDbArr = rows
  colMaxHZ = 1000 / (historyDbArr[1].timestamp - historyDbArr[0].timestamp)
  colplayHZ = colMaxHZ
  historyFlag = true
  playIndex = 0

  res.json(new HttpResult(0, data, 'success'));
})

// 取消播放
app.post('/cancalDbPlay', async (req, res) => {
  historyFlag = false
  res.json(new HttpResult(0, {}, 'success'));
})

// 开始播放
app.post('/getDbHistoryPlay', async (req, res) => {
  historyPlayFlag = true

  if (colTimer) {
    clearInterval(colTimer)
  }

  colTimer = setInterval(() => {
    if (historyPlayFlag) {
      console.log(historyDbArr[playIndex])
      socketSendData(server, JSON.stringify({
        sitData: JSON.parse(historyDbArr[playIndex].data),
        index: playIndex,
        timestamp: JSON.parse(historyDbArr[playIndex].timestamp)
      }))
      if (playIndex < historyDbArr.length - 1) {
        playIndex++
      } else {
        historyPlayFlag = false
        clearInterval(colTimer)
      }
    }
  }, 1000 / colplayHZ)
  res.json(new HttpResult(0, {}, 'success'));
})

app.post('/changeDbplaySpeed', async (req, res) => {
  const { speed } = req.body
  // historyPlayFlag = true
  colplayHZ = colMaxHZ * speed
  if (historyPlayFlag) {
    if (colTimer) {
      clearInterval(colTimer)
    }
    colTimer = setInterval(() => {
      if (historyPlayFlag) {
        console.log(historyDbArr[playIndex])
        socketSendData(server, JSON.stringify({
          sitData: JSON.parse(historyDbArr[playIndex].data),
          index: playIndex,
          timestamp: JSON.parse(historyDbArr[playIndex].timestamp)
        }))
        if (playIndex < historyDbArr.length - 1) {
          playIndex++
        } else {
          historyPlayFlag = false
          clearInterval(colTimer)
        }
      }
    }, 1000 / (colplayHZ))
  }

  res.json(new HttpResult(0, {}, 'success'));
})

// 取消播放
app.post('/getDbHistoryStop', async (req, res) => {
  historyPlayFlag = false
  res.json(new HttpResult(0, {}, 'success'));
})

// 获取某个时间的数据的某个索引数据
app.post('/getDbHistoryIndex', async (req, res) => {
  const { index } = req.body
  playIndex = index
  socketSendData(server, JSON.stringify({
    sitData: JSON.parse(historyDbArr[playIndex].data),
    index: playIndex,
    timestamp: JSON.parse(historyDbArr[playIndex].timestamp)
  }))
  res.json(new HttpResult(0, historyDbArr[index], 'success'));
})

// 读取csv
app.post('/getCsvData', async (req, res) => {
  const { fileName } = req.body
  const data = getCsvData(fileName)
  console.log(data)
  csvArr = data
  res.json(new HttpResult(0, data, 'success'));
})


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})


const server = new WebSocket.Server({ port: 19999 });

server.on("open", function open() {
  console.log("connected");
});

server.on("close", function close() {
  console.log("disconnected");
});

server.on("connection", function connection(ws, req) {
  const ip = req.connection.remoteAddress;
  const port = req.connection.remotePort;
  const clientName = ip + port;
  console.log("%s is connected", clientName);

  socketSendData(server, JSON.stringify({}))

  ws.on("message", () => {

  });
});

/**
 * 
 * @param {obj} server websocket服务器
 * @param {JSON} data 发送的数据
 */
const socketSendData = (server, data) => {
  server.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

/**
 * 将串口跟 parser连接起来
 */
const newSerialPortLink = ({ path, parser, baudRate = 1000000 }) => {
  let port
  console.log(path, baudRate)
  try {
    port = new SerialPort(
      {
        path,
        baudRate: baudRate,
        autoOpen: true,
      },
      function (err) {
        console.log(err, "err");
      }
    );
    //管道添加解析器
    port.pipe(parser);
  } catch (e) {
    console.log(e, "e");
  }
  return port
}

/**
 * 
 * @param {Array} parserArr 
 * @param {object} objs 
 * @returns 解析蓝牙分包数据
 */
function parseData(parserArr, objs, type) {
  let json = {}
  // console.log(objs)
  Object.keys(objs).forEach((key) => {
    const obj = parserArr[key]
    const data = objs[key]
    if (obj.port.isOpen) {
      let blueArr = []

      if (type == 'blue') {
        const { order } = constantObj
        const lastData = data[order[1]]
        const nextData = data[order[2]]

        if (lastData && lastData.length && nextData && nextData.length) {
          blueArr = [...lastData, ...nextData]
        }
      } else if (type == 'highHZ') {
        blueArr = data.arr
      }

      // 当前时间戳与发数据时间戳之差
      const dataStamp = new Date().getTime() - data.stamp
      json[data.type] = {}

      // 根据发送时间与最新时间戳的差值  判断设备的在离线状态
      if (dataStamp < 1000) {
        // json[data.type].status = 'online'
        json[data.type].arr = blueArr
        json[data.type].rotate = data.rotate
        json[data.type].stamp = data.stamp
        json[data.type].HZ = data.HZ
        // json[data.type].stampDiff = new Date().getTime() - data.stamp
      } else {
        json[data.type].status = 'offline'
      }


    }

  })
  return json
}

/**
 * 连接成功并且发送数据
 * @returns 
 * 
 */

const oldTimeObj = {}
async function connectPort() {
  let ports = await SerialPort.list()
  console.log(ports, 'ports')
  // 创建并连接数据通道并且设置回调
  for (let i = 0; i < ports.length; i++) {
    const portInfo = ports[i]
    const { path } = portInfo
    // parserArr[path]
    const parserItem = parserArr[path] = parserArr[path] ? parserArr[path] : {}
    const dataItem = dataMap[path] = dataMap[path] ? dataMap[path] : {}
    // parserItem 
    parserItem.parser = new DelimiterParser({ delimiter: splitBuffer })

    const { parser } = parserItem

    // if()

    if (!(parserItem.port && parserItem.port.isOpen)) {
      const port = newSerialPortLink({ path, parser: parserItem.parser, baudRate })

      parserItem.port = port
      parser.on("data", function (data) {

        let buffer = Buffer.from(data);
        pointArr = new Array();

        if (![18, 1024, 130, 146].includes(buffer.length)) {

          // console.log(JSON.stringify(buffer) , path,pointArr, pointArr.length, new Date().getTime())
          // console.log(pointArr)
        }

        for (var i = 0; i < buffer.length; i++) {
          pointArr[i] = buffer.readUInt8(i);
        }
        // console.log(pointArr.length)
        console.log(pointArr.length)
        // 陀螺仪
        if (pointArr.length == 18) {
          const length = pointArr.length
          const arr = pointArr.splice(2, length)
          dataItem.rotate = bytes4ToInt10(arr)
        }
        // 256矩阵分包
        else if (pointArr.length == 130) {
          // 解析包数据  类型+前后帧类型+128矩阵
          const length = pointArr.length
          const order = pointArr[0]
          const type = pointArr[1]
          // console.log(constantObj.type[type], order, path, pointArr.length, new Date().getTime())

          const arr = pointArr.splice(2, length)
          const orderName = constantObj.order[order]
          // 前后帧赋值,类型赋值
          dataItem[orderName] = arr
          dataItem.type = constantObj.type[type]
          dataItem.stamp = new Date().getTime()
        } else if (pointArr.length == 1024) {
          // dataItem[path]
          dataItem.arr1024 = hand(pointArr)
        } else if (pointArr.length == 146) {
          const length = pointArr.length
          const arr = pointArr.splice(length - 16, length)
          pointArr.splice(0, 2)
          // 下一帧赋值  时间戳赋值 四元数赋值
          dataItem.next = pointArr
          const stamp = new Date().getTime()
          dataItem.stamp = stamp
          dataItem.rotate = bytes4ToInt10(arr)
        } else if (pointArr.length == 4096) {
          dataItem.type = 'sit'
          dataItem.arr = pointArr
          const stamp = new Date().getTime()
          if (oldTimeObj[dataItem.type]) {
            dataItem.HZ = stamp - oldTimeObj[dataItem.type]
            if (!MaxHZ) {
              MaxHZ = Math.floor(1000 / dataItem.HZ)
              HZ = MaxHZ
              setInterval(() => {
                colAndSendData()
              }, 1000 / HZ)
            }
          }
          dataItem.stamp = stamp
          // if(!oldTimeObj[dataItem.type]){
          oldTimeObj[dataItem.type] = dataItem.stamp
          // }else{

          // }
        }


        else if (![18, 1024, 130].includes(pointArr.length)) {

          // console.log(path,pointArr, pointArr.length, new Date().getTime())
          // console.log(pointArr)
        }
      })
    }

  }

  return ports
}

function colAndSendData() {
  if (!historyFlag) {
    const obj = sendData()
    if (colFlag) {
      storageData(obj)
    }
  }

  // else {
  //   if (historyPlayFlag) {
  //     console.log(historyDbArr[playIndex])
  //     socketSendData(server, JSON.stringify({
  //       sitData: JSON.parse(historyDbArr[playIndex].data),
  //       index: playIndex,
  //       timestamp: JSON.parse(historyDbArr[playIndex].timestamp)
  //     }))
  //     if (playIndex < historyDbArr.length - 1) {
  //       playIndex++
  //     } else {
  //       historyPlayFlag = false
  //     }
  //   }
  // }
}



/**
 * 发送数据给前端
 */
function sendData() {
  let obj
  if (baudRate == 921600) {
    // 将采集到的串口数据转化成前端需要的数据
    obj = parseData(parserArr, JSON.parse(JSON.stringify({ ...dataMap })))

    // 如果机器人所有type都不包含这个type  便删除这个type
    for (let i = 0; i < Object.keys(obj).length; i++) {
      const key = Object.keys(obj)[i]
      if (!Object.values(constantObj.type).includes(key)) {
        delete obj[key]
      }
    }
    // 如果obj里面包含  机器人type 发送数据
    if (Object.keys(obj).filter((a) => Object.values(constantObj.type).includes(a)).length) {
      socketSendData(server, JSON.stringify({ data: obj }))
    }
  } else {
    // 如果串口发送数据
    const arr = []
    // console.log(dataMap)
    obj = parseData(parserArr, JSON.parse(JSON.stringify({ ...dataMap })), 'highHZ')
    for (let i = 0; i < 4096; i++) {
      arr.push(Math.floor(Math.random() * 100))
    }

    // const dataMap = {
    //   com3: {
    //     data: arr
    //   }
    // }
    socketSendData(server, JSON.stringify({ sitData: obj }))
  }
  return obj
}

/**
 * 将收到的
 */
function storageData(data) {
  const timestamp = Date.now(); // 获取当前时间的时间戳
  // const date = saveTime;
  const insertQuery =
    "INSERT INTO matrix (data, timestamp,date) VALUES (?, ?,?)";

  db.run(
    insertQuery,
    [JSON.stringify(data), timestamp, colName],
    function (err) {
      if (err) {
        console.error(err);
        return;
      }
      console.log(`Event inserted with ID ${this.lastID}`);
    }
  );
}