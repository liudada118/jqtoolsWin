

const express = require('express')
const os = require('os')
const fs = require('fs')
const path = require('path')
const cors = require('cors');
const WebSocket = require("ws");
const HttpResult = require('./HttpResult')
const { SerialPort, DelimiterParser } = require('serialport')
const { getPort } = require('../util/serialport')
const { blue, splitArr } = require('../util/config');
const constantObj = require('../util/config');
const { bytes4ToInt10 } = require('../util/parseData');
const { initDb, dbLoadCsv, deleteDbData, dbGetData, getCsvData, changeDbName, changeDbDataName, upsertRemark, getRemark } = require('../util/db');
const { hand, jqbed, endiSit, endiBack, endiSit1024, endiBack1024 } = require('../util/line');
// const { callPy } = require('../pyWorker');
const { decryptStr } = require('../util/aes_ecb');
const { default: axios } = require('axios');
const module2 = require('../util/aes_ecb')

const pointConfig = {
  endi: {
    back: {
      pointLength: 64,
      pointWidthDistance: 13,
      pointHeightDistance: 10,
    },
    sit: {
      pointLength: 46,
      pointWidthDistance: 10,
      pointHeightDistance: 10,
    },
  }
}


console.log('userData from env:', typeof process.env.isPackaged);

let { isPackaged, appPath } = process.env
isPackaged = isPackaged == 'true'
const app = express()

const ORIGIN = 'https://sensor.bodyta.com';

// 1) 所有实际请求自动带上 CORS 头
// app.use(cors({
//   origin: ORIGIN,        // 不能是 *
//   credentials: true,
//   methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
//   allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
//   maxAge: 600,
// }));

// // 2) 统一处理预检；顺带支持 PNA（公网页面 -> 本地/内网）
// app.options('*', (req, res) => {
//   if (req.header('Access-Control-Request-Private-Network') === 'true') {
//     res.setHeader('Access-Control-Allow-Private-Network', 'true');
//   }
//   // 把常见 CORS 预检头也回上（有些环境需要显式返回）
//   res.setHeader('Access-Control-Allow-Origin', ORIGIN);
//   res.setHeader('Access-Control-Allow-Credentials', 'true');
//   res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
//   res.sendStatus(204);
// });


app.use(cors());
app.use(express.json());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

let dbPath = __dirname + '/../db'

console.log(isPackaged, appPath, 'app.isPackaged')

if (isPackaged) {
  if (os.platform() == 'darwin') {
    // filePath = '../..' + '/db'
    // filePath = path.join(app.getAppPath(), 'Resources/db',);
    dbPath = path.join(__dirname, '../../db')
    csvPath = path.join(__dirname, '../../data')
    nameTxt = path.join(__dirname, '../../config.txt')
    console.log(dbPath, path.join(appPath, 'Resources/db',))
    // nameTxt = 
    // csvPath = '../..' + '/data'
    // nameTxt = '../..' + "/config.txt";
  } else {

    dbPath = 'resources' + '/db'
    csvPath = 'resources' + '/data'
    nameTxt = 'resources' + "/config.txt";

    console.log(dbPath, path.join(appPath, 'Resources/db',))
  }

}

const port = 19245

const config = fs.readFileSync('./config.txt', 'utf-8',)
const result = JSON.parse(decryptStr(config))
console.log(result)
// 当前的软件系统 , 当前的波特率
var file = result.value, baudRate = 1000000, parserArr = {}, dataMap = {},
  // 发送HZ , 串口最大hz, 采集开关 , 采集命名 , 历史数据开关 , 历史播放开关 , 数据播放索引 , 回放定时器 , 保存数据最大HZ
  HZ = 30, MaxHZ, colFlag = false, colName, historyFlag = false, historyPlayFlag = false, playIndex = 0, colTimer, colMaxHZ, colplayHZ, playtimer
let splitBuffer = Buffer.from(splitArr);
let linkIngPort = [], currentDb, macInfo = {}, selectArr = []
let historySelectCache = null

// 选择数据库数据
let historyDbArr;


//对比数据
let leftDbArr, rightDbArr;


const { db } = initDb(file, dbPath)
currentDb = db

console.log(__dirname, dbPath, '__dirname')

app.get('/', (req, res) => {
  res.send('Hello World!')
})

// async function demo(matrix) {
//   // 构造一条 1024 长度的测试数据

//   // console.log(matrix)
//   // const data = new Array(10).fill(new Array(1024).fill(50)); // 可以放多条
//   // const res = await callPy('cal_cop_fromData', { data : matrix });
//   const res = await callPy('cal_cop_fromData', { data: matrix });
//   // console.log(res);
//   console.log(res, new Date().getTime()); // { left: [...], right: [...] }
// }


// async function main() {
//   const data1 = await getCsvData('D:/jqtoolsWin - 副本/python/app/静态数据集1.csv')

//   const matrix = data1.map((a) => JSON.parse(a.data))
//   await demo(matrix)
//   await demo(matrix)
//   await demo(matrix)
//   await demo(matrix)
//   await demo(matrix)
//   await demo(matrix)
//   await demo(matrix)
// }

// main()


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
  const { db } = initDb(file, dbPath)
  currentDb = db
  if (blue.includes(file)) {
    baudRate = 921600
  } else {
    baudRate = 1000000
  }
})

// 查询系统列表和当前系统
app.get('/getSystem', async (req, res) => {

  const config = fs.readFileSync('./config.txt', 'utf-8',)
  const result = JSON.parse(decryptStr(config))
  result.value = file

  // const result = {
  //   value: "bed",
  //   typeArr: ["bed", "hand", 'foot', 'bigHand']
  // }
  baudRate = constantObj.baudRateObj[result.value] ? constantObj.baudRateObj[result.value] : 1000000
  // baudRate = 3000000

  const { db } = initDb(file, dbPath)
  currentDb = db

  res.json(new HttpResult(0, result, '获取设备列表成功'));
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
    let port = await connectPort()
    res.json(new HttpResult(0, port, '连接成功'));

  } catch {
    res.json(new HttpResult(1, {}, '连接失败'));
  }

})

// 开始采集
app.post('/startCol', async (req, res) => {
  try {
    const { fileName, select } = req.body
    selectArr = select
    historySelectCache = null
    const sensorArr = Object.keys(dataMap).map((a) => dataMap[a].type)
    console.log(sensorArr, file)
    const length = sensorArr.filter((a) => typeof file == 'string' &&  a.includes(file)).length

    if (length > 0) {
      colFlag = true
      colName = String(fileName)
      res.json(new HttpResult(0, port, '开始采集'));
    } else {
      res.json(new HttpResult(0, '请选择正确传感器类型', 'error'));
    }

  } catch (e) {
    console.log(e)
  }

})


// 停止采集
app.get('/endCol', async (req, res) => {
  colFlag = false
  res.json(new HttpResult(0, 'success', '停止采集'));
})

// 获取数据库所有存取列表
app.get('/getColHistory', async (req, res) => {
  // const selectQuery =
  //   "select DISTINCT date,timestamp, `select` from matrix ORDER BY timestamp DESC LIMIT ?,?";

  const selectQuery = `
  SELECT 
    m.date,
    m.timestamp,
    COALESCE(r.select_json, m.\`select\`) AS \`select\`,
    r.alias,
    r.remark
  FROM matrix m
  INNER JOIN (
    SELECT date, MAX(timestamp) AS max_ts
    FROM matrix
    GROUP BY date
  ) t
  ON m.date = t.date  AND m.timestamp = t.max_ts
  LEFT JOIN remarks r
  ON r.date = m.date
  ORDER BY m.timestamp DESC
  LIMIT ?, ?
`;

  const params = [0, 500];

  historyFlag = true

  currentDb.all(selectQuery, params, (err, rows) => {
    if (err) {
      console.error(err);
    } else {

      let jsonData;
      let sitTimeArr = rows;
      console.log(rows, '1111')
      let timeArr = rows;


      jsonData = JSON.stringify({
        timeArr: timeArr,
        // index: nowIndex,
        sitData: new Array(4096).fill(0),
      });

      res.json(new HttpResult(0, timeArr, 'success'));

      // socketSendData(server, jsonData)


    }
  });
  socketSendData(server, JSON.stringify({ sitData: {} }))
})

// app.post('/changeSelect', async (req, res) => {
//   try {
//     const { select } = req.body
//     selectArr = select
//     console.log(first)
//     // if (!selectArr.length) {
//     //   res.json(new HttpResult(555, '请选择先数据', 'error'));
//     // }
//     // const params = selectArr;
//     // const data = await dbLoadCsv({ db: currentDb, params, file, isPackaged })
//     // res.json(new HttpResult(0, data, '下载'));
//   } catch {

//   }
// })

// 下载成csv
app.post('/downlaod', async (req, res) => {
  try {
    const { fileArr, selectJson } = req.body || {}
    if (!fileArr || !fileArr.length) {
      res.json(new HttpResult(555, '请选择先数据', 'error'));
    }
    const params = fileArr;
    const selectOverride = selectJson && typeof selectJson === 'object' ? selectJson : historySelectCache
    const data = await dbLoadCsv({ db: currentDb, params, file, isPackaged, selectJson: selectOverride })
    res.json(new HttpResult(0, data, '下载'));
  } catch {

  }
})

// 删除数据库某个文件
app.post('/delete', async (req, res) => {
  try {
    const { fileArr } = req.body

    const params = fileArr;
    const data = await deleteDbData({ db: currentDb, params })
    console.log(data)
    res.json(new HttpResult(0, data, '删除成功'));
  } catch {

  }
})

app.post('/changeDbName', async (req, res) => {
  try {
    const { newDate, oldDate } = req.body

    console.log([newDate, oldDate])
    const data = await changeDbName({ db: currentDb, params: [newDate, oldDate] })
    console.log(data)
    res.json(new HttpResult(0, data, '删除成功'));
  } catch {

  }
})

// 获取数据库某个时间的所有数据
app.post('/getDbHistory', async (req, res) => {
  const { time } = req.body

  historySelectCache = null


  const selectQuery = "select * from matrix WHERE date=?";

  const params = [time];

  const { length, pressArr, areaArr, rows } = await dbGetData({ db: currentDb, params })

  const data = { length, pressArr, areaArr, }

  historyDbArr = rows
  colMaxHZ = 1000 / (historyDbArr[1].timestamp - historyDbArr[0].timestamp)
  colplayHZ = colMaxHZ
  historyFlag = true
  playIndex = 0

  res.json(new HttpResult(0, data, 'success'));
})

// 历史回放：根据传入的框选 selectJson 计算所有帧的 areaArr/pressArr
app.post('/getDbHistorySelect', async (req, res) => {
  try {
    const { selectJson } = req.body || {}
    if (!selectJson || typeof selectJson !== 'object') {
      res.json(new HttpResult(1, {}, 'selectJson required'));
      return;
    }

    historySelectCache = selectJson

    if (!historyDbArr || !historyDbArr.length) {
      res.json(new HttpResult(1, {}, 'history not loaded'));
      return;
    }

    const rows = historyDbArr
    if (!rows.length) {
      res.json(new HttpResult(0, { length: 0, pressArr: {}, areaArr: {} }, 'success'));
      return;
    }

    const keyArr = Object.keys(JSON.parse(rows[0].data || '{}'))
    const pressArr = {}
    const areaArr = {}
    keyArr.forEach((key) => {
      pressArr[key] = []
      areaArr[key] = []
    })

    for (let i = 0; i < rows.length; i++) {
      const dataObj = JSON.parse(rows[i].data || '{}')
      for (let j = 0; j < keyArr.length; j++) {
        const key = keyArr[j]
        const item = dataObj[key]
        const arr = item && item.arr ? item.arr : []
        const sel = selectJson[key]
        if (!sel || typeof sel !== 'object') {
          pressArr[key].push(0)
          areaArr[key].push(0)
          continue;
        }
        const { xStart, xEnd, yStart, yEnd, width, height } = sel
        if (
          [xStart, xEnd, yStart, yEnd, width, height].some(
            (v) => typeof v !== 'number'
          )
        ) {
          pressArr[key].push(0)
          areaArr[key].push(0)
          continue;
        }

        let press = 0
        let area = 0
        for (let y = yStart; y < yEnd; y++) {
          for (let x = xStart; x < xEnd; x++) {
            const idx = y * width + x
            const v = arr[idx] || 0
            press += v
            if (v > 0) area++
          }
        }
        pressArr[key].push(press)
        areaArr[key].push(area)
      }
    }

    res.json(new HttpResult(0, { length: rows.length, pressArr, areaArr }, 'success'));
  } catch (err) {
    console.error(err);
    res.json(new HttpResult(1, {}, 'error'));
  }
})

app.post('/getContrastData', async (req, res) => {
  const { left, right } = req.body

  const selectQuery = "select * from matrix WHERE date=?";

  const params = [left];
  const params1 = [right]

  const { length: lengthL, pressArr: pressArrL, areaArr: areaArrL, rows: rowsL } = await dbGetData({ db: currentDb, params })
  const { length, pressArr, areaArr, rows } = await dbGetData({ db: currentDb, params: params1 })

  leftDbArr = rowsL
  rightDbArr = rows

  const data = { left: { length: lengthL, pressArr: pressArrL, areaArr: areaArrL, }, right: { length, pressArr, areaArr, } }

  socketSendData(server, JSON.stringify({
    contrastData: { left: JSON.parse(leftDbArr[0].data), right: JSON.parse(rightDbArr[0].data) },
    // index: playIndex,
    // timestamp: JSON.parse(historyDbArr[playIndex].timestamp)
  }))

  res.json(new HttpResult(0, data, 'success'));

})


app.post('/changeDbDataName', async (req, res) => {
  const { oldName, newName } = req.body

  changeDbDataName({ db: currentDb, params: [oldName, newName] })
})

// 备注/别名/框选保存
app.post('/upsertRemark', async (req, res) => {
  try {
    let { date, alias, remark, select } = req.body || {}
    if (!date) {
      res.json(new HttpResult(1, {}, 'date required'));
      return;
    }
    date = String(date)
    const data = await upsertRemark({ db: currentDb, params: { date, alias, remark, select } })
    res.json(new HttpResult(0, data, 'success'));
  } catch (err) {
    console.error(err);
    res.json(new HttpResult(1, {}, 'error'));
  }
})

// 获取单条备注
app.post('/getRemark', async (req, res) => {
  try {
    const { date } = req.body || {}
    if (!date) {
      res.json(new HttpResult(1, {}, 'date required'));
      return;
    }
    const data = await getRemark({ db: currentDb, params: [date] })
    res.json(new HttpResult(0, data, 'success'));
  } catch (err) {
    console.error(err);
    res.json(new HttpResult(1, {}, 'error'));
  }
})

// 取消播放
app.post('/cancalDbPlay', async (req, res) => {
  // 将回放flag置为false 并且将当前数据数组置为空
  historyFlag = false
  historyDbArr = null
  historySelectCache = null

  if (colTimer) {
    clearInterval(colTimer)
  }

  res.json(new HttpResult(0, {}, 'success'));
})

// 开始播放
app.post('/getDbHistoryPlay', async (req, res) => {


  if (historyDbArr) {


    if (playIndex == historyDbArr.length - 1) {
      playIndex = 0
    }
    // 播放flag打开
    historyPlayFlag = true

    if (colTimer) {
      clearInterval(colTimer)
    }

    socketSendData(server, JSON.stringify({ playEnd: true }))

    colTimer = setInterval(() => {
      if (historyPlayFlag && historyDbArr) {

        socketSendData(server, JSON.stringify({
          sitDataPlay: JSON.parse(historyDbArr[playIndex].data),
          index: playIndex,
          timestamp: JSON.parse(historyDbArr[playIndex].timestamp)
        }))
        if (playIndex < historyDbArr.length - 1) {
          playIndex++
        } else {
          historyPlayFlag = false
          socketSendData(server, JSON.stringify({ playEnd: false }))
          clearInterval(colTimer)
        }
      }
    }, 1000 / colplayHZ)
    res.json(new HttpResult(0, {}, 'success'));

  } else {
    res.json(new HttpResult(1, '请选择回放时间段', 'error'));
  }
})

// 修改播放速度
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

        socketSendData(server, JSON.stringify({
          sitDataPlay: JSON.parse(historyDbArr[playIndex].data),
          index: playIndex,
          timestamp: JSON.parse(historyDbArr[playIndex].timestamp)
        }))
        if (playIndex < historyDbArr.length - 1) {
          playIndex++
        } else {
          socketSendData(server, JSON.stringify({ playEnd: false }))
          historyPlayFlag = false
          clearInterval(colTimer)
        }
      }
    }, 1000 / (colplayHZ))
  }

  res.json(new HttpResult(0, {}, 'success'));
})

// 修改系统类型
app.post('/changeSystemType', async (req, res) => {
  const { system } = req.body
  file = system
  baudRate = constantObj.baudRateObj[system] ? constantObj.baudRateObj[system] : 1000000
  const { db } = initDb(file, dbPath)
  currentDb = db
  console.log(baudRate)
  // stopPort()
  socketSendData(server, JSON.stringify({ sitData: {} }))

  res.json(new HttpResult(0, { optimalObj: result.optimalObj[file], maxObj: result.maxObj[file] }, 'success'));
})


// 取消播放
app.post('/getDbHistoryStop', async (req, res) => {
  historyPlayFlag = false
  res.json(new HttpResult(0, {}, 'success'));
})

// 获取某个时间的数据的某个索引数据
app.post('/getDbHistoryIndex', async (req, res) => {
  const { index } = req.body

  if (!historyDbArr) {
    res.json(new HttpResult(555, '请选择回放时间段', 'error'));
    return
  }

  playIndex = index
  socketSendData(server, JSON.stringify({
    sitDataPlay: JSON.parse(historyDbArr[playIndex].data),
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

function portWirte(port) {
  return new Promise((resolve, reject) => {
    // const command = 'AT\r\n';
    const command = Buffer.from('41542B4E414D453D45535033320d0a', 'hex')
    port.write(command, err => {
      if (err) {
        return console.error('err2:', err.message);
      }
      // console.log('send:', command.trim());
      // resolve(command.trim())

      console.log('send:', 11);
      resolve(11)
    });
  })
}

app.get('/sendMac', async (req, res) => {

  if (Object.keys(parserArr).length) {
    const task = []
    for (let i = 0; i < Object.keys(parserArr).length; i++) {
      const key = Object.keys(parserArr)[i]
      const port = parserArr[key].port

      // const command = 'AT\r\n';
      // port.write(command, err => {
      //   if (err) {
      //     return console.error('err2:', err.message);
      //   }
      //   console.log('send:', command.trim());

      // });

      task.push(portWirte(port))
    }
    const results = await Promise.all(task);
    sendMacNum++
    console.log('sendTotal:', sendMacNum, '-----', 'success:', successNum)
    res.json(new HttpResult(0, {}, '发送成功'));
  } else {
    res.json(new HttpResult(0, {}, '请先连接串口'));
  }
})

app.post('/getSysconfig', async (req, res) => {
  const { config } = req.body
  // const data = getCsvData(fileName)
  const result = JSON.stringify(config)

  let str = module2.encStr(`${result}`);
  const data = str
  //   console.log(data)
  // csvArr = data
  res.json(new HttpResult(0, data, 'success'));
})

// 计算cop 
// let arr = []
// app.post('/getCop', async (req, res) => {
//   const { MatrixList } = req.body
//   // console.log(MatrixList)
//   const data = await callPy('cal_cop_fromData', { data: MatrixList })
//   // console.log(data)
//   // csvArr = data

//   // arr.push({ MatrixList, data })
//   // fs.writeFile('D:/jqtoolsWin - 副本/server/data.txt', JSON.stringify(arr), 'utf8', (err) => {
//   //   if (err) {
//   //     console.error('追加失败:', err);
//   //   } else {
//   //     console.log('追加成功');
//   //   }
//   // });
//   res.json(new HttpResult(0, data, 'success'));
// })



app.listen(port, () => {
  process.send?.({ type: 'ready', port });
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

        json[data.type].status = 'online'
        // console.log(first)
        // if (data.type.includes(file)) json[data.type].arr = blueArr
        json[data.type].arr = blueArr
        json[data.type].rotate = data.rotate
        json[data.type].stamp = data.stamp
        json[data.type].HZ = data.HZ
        if (data.cop) json[data.type].cop = data.cop
        if (data.breatheData) json[data.type].cop = data.breatheData
        // json[data.type].stampDiff = new Date().getTime() - data.stamp
      } else {
        json[data.type].status = 'offline'
      }
    } else {
      json[data.type] = {}
      json[data.type].status = 'offline'
    }

  })
  return json
}

/**
 * 连接成功并且发送数据
 * @returns 
 * 
 */

var sendMacNum = 0, successNum = 0, sendDataLength = 0
const oldTimeObj = {}
async function connectPort() {
  macInfo = {}
  let ports = await SerialPort.list()
  ports = getPort(ports)
  // console.log(ports, 'ports')
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

      // linkIngPort.push(port)

      // port.open(err => {
      //   if (err) {
      //     return console.error('err1:', err.message);
      //   }
      //   console.log('open');

      //   // 发送 AT 指令
      //   const command = 'AT\r\n';
      //   port.write(command, err => {
      //     if (err) {
      //       return console.error('err2:', err.message);
      //     }
      //     console.log('已发送:', command.trim());
      //   });
      // });

      // const command = 'AT\r\n';
      const command = Buffer.from('41542B4E414D453D45535033320d0a', 'hex')
      port.write(command, err => {
        if (err) {
          return console.error('err2:', err.message);
        }
        console.log('send:', 22);
        sendMacNum++
      });

      parserItem.port = port
      parser.on("data", async function (data) {



        let buffer = Buffer.from(data);

        pointArr = new Array();

        if (![18, 1024, 130, 146].includes(buffer.length)) {

          // console.log(JSON.stringify(buffer) , path,pointArr, pointArr.length, new Date().getTime())
          // console.log(pointArr)
        }

        for (var i = 0; i < buffer.length; i++) {
          pointArr[i] = buffer.readUInt8(i);
        }


        if (buffer.toString().includes('Unique ID')) {
          console.log(buffer.toString())
          const str = buffer.toString()
          if (str.includes('Unique ID')) {

            const uniqueIdMatch = str.match(/Unique ID:\s*([^\s-]+)/);
            const versionMatch = str.match(/Versions:\s*([^\s-]+)/);

            const uniqueId = uniqueIdMatch ? uniqueIdMatch[1] : null;
            const version = versionMatch ? versionMatch[1] : null;

            console.log("Unique ID:", uniqueId);  // 34463730155032138F
            console.log("Versions:", version);    // C40510
            successNum++

            console.log('sendTotal:', sendMacNum, '-----', 'success:', successNum)
            macInfo[path] = {
              uniqueId,
              version
            }

            try {


              const response = await axios.get(`${constantObj.backendAddress}/device-manage/device/getDetail/${uniqueId}`)
              const time = await axios.get(`http://sensor.bodyta.com:8080/rcv/login/getSystemTime`)


              // 截至时间
              if (!response.data.data) {
                dataItem.premission = false
              } else {
                const expireTime = response.data.data.expireTime
                const nowTime = time.data.time
                if (nowTime < expireTime) {
                  dataItem.premission = true
                }
                dataItem.type = JSON.parse(response.data.data.typeInfo)[0]
              }
            } catch (err) {
              console.log(err, 'err')
            }


            if (Object.keys(macInfo).length == ports.length) {
              // console.log(macInfo)
              // return macInfo

              socketSendData(server, JSON.stringify({ macInfo }))
            }
          }
        }
        // console.log(pointArr.length)
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
          // ret
          if (!dataItem.premission) return
          // dataItem.type = 'hand'
          // dataItem[path]
          // dataItem.type = 'sit'
          let matrix
          if (dataItem.type == 'hand') {
            matrix = hand(pointArr)
          } else if (dataItem.type == 'bed') {
            matrix = jqbed(pointArr)
          } else if (dataItem.type == 'car-back') {
            matrix = jqbed(pointArr)
          } else if (dataItem.type == 'endi-sit') {
            matrix = endiSit1024(pointArr)

          } else if (dataItem.type == 'endi-back') {
            matrix = endiBack1024(pointArr)
          } else {
            matrix = pointArr
          }

          // 设备型号跟传感器类型匹配上

          dataItem.arr = matrix



          // 如果是脚垫  添加算法包COP数据
          if (file == 'foot') {
            // console.log(matrix)
            if (!dataItem.arrList) {
              dataItem.arrList = []
            } else {
              if (dataItem.arrList.length < 60) {
                dataItem.arrList.push(matrix)
              } else {
                dataItem.arrList.shift()
                dataItem.arrList.push(matrix)
              }

              // dataItem.cop = await callPy('cal_cop_fromData', { data: dataItem.arrList })
            }

            // console.log(dataItem.cop)
          }


          const stamp = new Date().getTime()
          dataItem.stamp = stamp

          if (oldTimeObj[dataItem.type]) {
            dataItem.HZ = stamp - oldTimeObj[dataItem.type]
            if (dataItem.HZ < 50) {
              return
            }
            if (!MaxHZ && oldTimeObj[dataItem.type]) {
              MaxHZ = Math.floor(1000 / dataItem.HZ)
              HZ = MaxHZ
              console.log('playtimer', HZ)
              if (playtimer) {
                clearInterval(playtimer)
              }
              playtimer = setInterval(() => {
                colAndSendData()
              }, 80)
            }
            // if(!playtimer){
            //      playtimer = setInterval(() => {
            //     colAndSendData()
            //   }, 80)
            // }
          }
          // console.log(stamp, oldTimeObj[dataItem.type],dataItem.HZ,HZ,playtimer)
          // if (!oldTimeObj[dataItem.type]) {
          oldTimeObj[dataItem.type] = dataItem.stamp
          // } else {

          // }


        } else if (pointArr.length == 1025) {
          const type = pointArr.shift()
          dataItem.premission = true

          if (!Object.keys(constantObj.typeConfig).includes(String(type))) {
            dataItem.premission = false
            return
          }
          let matrix
          dataItem.type = constantObj.typeConfig[type]

          if (constantObj.typeConfig[type] == 'car-back') {
            matrix = jqbed(pointArr)
          } else if (constantObj.typeConfig[type] == 'car-sit') {
            matrix = jqbed(pointArr)
          } else if (constantObj.typeConfig[type] == 'bed') {
            matrix = jqbed(pointArr)
          }
          dataItem.arr = matrix

          const stamp = new Date().getTime()
          dataItem.stamp = stamp

          if (oldTimeObj[dataItem.type]) {
            dataItem.HZ = stamp - oldTimeObj[dataItem.type]
            if (dataItem.HZ < 50) {
              return
            }
            if (!MaxHZ && oldTimeObj[dataItem.type]) {
              MaxHZ = Math.floor(1000 / dataItem.HZ)
              HZ = MaxHZ
              console.log('playtimer', HZ)
              if (playtimer) {
                clearInterval(playtimer)
              }
              playtimer = setInterval(() => {
                colAndSendData()
              }, 80)
            }
          }

          oldTimeObj[dataItem.type] = dataItem.stamp


        }

        else if (pointArr.length == 146) {
          const length = pointArr.length
          const arr = pointArr.splice(length - 16, length)
          pointArr.splice(0, 2)
          // 下一帧赋值  时间戳赋值 四元数赋值
          dataItem.next = pointArr
          const stamp = new Date().getTime()
          dataItem.stamp = stamp
          dataItem.rotate = bytes4ToInt10(arr)
        } else if (pointArr.length == 4096) {
          // if (!dataItem.premission) return
          // dataItem.type = 'sit'
          if (!dataItem.premission) {
            dataItem.status = 'expired'
          } else {
            if (dataItem.type == 'endi-sit') {
              dataItem.arr = endiSit(pointArr)
            } else if (dataItem.type == 'endi-back') {
              dataItem.arr = endiBack(pointArr)
            } else {
              dataItem.arr = pointArr
            }
          }
          // console.log(444)
          const stamp = new Date().getTime()
          if (sendDataLength < 20) {
            sendDataLength++
          }
          if (oldTimeObj[dataItem.type]) {
            dataItem.HZ = stamp - oldTimeObj[dataItem.type]
            if (!MaxHZ && sendDataLength == 20) {
              MaxHZ = Math.floor(1000 / dataItem.HZ)
              HZ = MaxHZ
              playtimer = setInterval(() => {
                colAndSendData()
              }, 1000 / HZ)
              sendDataLength = 0
            }
          }
          dataItem.stamp = stamp
          // if (!oldTimeObj[dataItem.type]) {
          oldTimeObj[dataItem.type] = dataItem.stamp
          // } else {

          // }

          if (!dataItem.arrList) {
            dataItem.arrList = []
          } else {
            if (dataItem.arrList.length < 3) {
              dataItem.arrList.push(pointArr)
            } else {
              dataItem.arrList.shift()
              dataItem.arrList.push(pointArr)
            }

            // dataItem.cop = await callPy('cal_cop_fromData', { data_array: dataItem.arrList })
            // console.log(dataItem.arrList, pointArr.length, dataItem.cop)
          }

        } else if (pointArr.length == 4097) {
          // if (!dataItem.premission) return
          // dataItem.type = 'sit'

          const type = pointArr.shift()
          dataItem.premission = true

          if (!Object.keys(constantObj.typeConfig).includes(String(type))) {
            dataItem.premission = false
            return
          }

          dataItem.type = constantObj.typeConfig[type]

          if (dataItem.type == 'endi-sit') {
            dataItem.arr = endiSit(pointArr)
          } else if (dataItem.type == 'endi-back') {
            dataItem.arr = endiBack(pointArr)
          } else {
            dataItem.arr = pointArr
          }

          const stamp = new Date().getTime()
          if (oldTimeObj[dataItem.type]) {
            dataItem.HZ = stamp - oldTimeObj[dataItem.type]
            if (!MaxHZ) {
              MaxHZ = Math.floor(1000 / dataItem.HZ)
              HZ = MaxHZ
              playtimer = setInterval(() => {
                colAndSendData()
              }, 1000 / HZ)
            }
          }
          dataItem.stamp = stamp
          // if (!oldTimeObj[dataItem.type]) {
          oldTimeObj[dataItem.type] = dataItem.stamp
          // } else {

          // }

          if (!dataItem.arrList) {
            dataItem.arrList = []
          } else {
            if (dataItem.arrList.length < 3) {
              dataItem.arrList.push(pointArr)
            } else {
              dataItem.arrList.shift()
              dataItem.arrList.push(pointArr)
            }

            // dataItem.cop = await callPy('cal_cop_fromData', { data_array: dataItem.arrList })
            // console.log(dataItem.arrList, pointArr.length, dataItem.cop)
          }

        }


        else if (![18, 1024, 130].includes(pointArr.length)) {

        }
      })
    }

  }

  return ports
}

// 关闭正在连接的串口
async function stopPort() {
  // let ports = await SerialPort.list()

  // 关闭串口
  const portArr = Object.keys(parserArr).map((path) => {
    return parserArr[path].port
  })


  // 关闭串口,并且清除本地缓存数据
  portArr.forEach((port, index) => {
    if (port?.isOpen) {
      port.close((err) => {
        if (!err) {
          // linkIngPort.splice(index, 1)
          const path = Object.keys(parserArr)[index];
          // parserArr[path] = null;
          delete parserArr[path]
          delete dataMap[path]
          console.log(parserArr, 'delte')
        }
      });
    }
  })

  // 清除发送数据定时器
  clearInterval(playtimer)

  // 将hz清除掉
  MaxHZ = undefined
}

function colAndSendData() {
  if (!historyFlag && Object.keys(parserArr).length) {
    const obj = sendData()
    // selectArr
    // if (Object.keys(selectArr).length) {
    //   for (let i = 0; i < Object.keys(selectArr).length; i++) {
    //     const key = Object.keys(selectArr)[i]
    //     obj[key].select = selectArr[key]
    //   }
    // }

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


// if (file == 'sit') {
//   if(playtimer){
//     clearInterval(playtimer)
//   }
//   playtimer = setInterval(() => {
//     colAndSendData()
//   }, 80)
// }


// setInterval(async () => {
//   // console.log(dataMap)
//   const keyArr = Object.keys(dataMap)
//   const equipArr = {}
//   for (let i = 0; i < keyArr.length; i++) {
//     const key = keyArr[i]
//     // console.log(key)
//     // equipArr.push(dataMap[key].type)
//     equipArr[dataMap[key].type] = key
//   }

//   if (Object.keys(equipArr).includes('bed')) {
//     const dataObj = dataMap[equipArr['bed']]

//     // console.log(dataObj.arr, )
//     if (dataObj.arr) {


//       // const data = await callPy('getData', { data: dataObj.arr })
//       // if (data.rate != -1) {
//       //   dataMap[equipArr['bed']].breatheData = data
//       // }


//     }
//     // console.log(dataMap)
//   }
// }, 125);


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


  // const newData = Object.keys(data)
  const newData = { ...data }
  for (let i = 0; i < Object.keys(data).length; i++) {
    const key = Object.keys(data)[i]
    if (newData[key].status) delete newData[key].status
  }

  const insertQuery =
    "INSERT INTO matrix (data, timestamp,date ,`select`) VALUES (?, ?,? ,?)";

  currentDb.run(
    insertQuery,
    [JSON.stringify(newData), timestamp, colName, JSON.stringify(selectArr)],
    function (err) {
      if (err) {
        console.error(err);
        return;
      }
      console.log(`Event inserted with ID ${this.lastID}`);
    }
  );
}

// 做一个定时器任务  监听是否存在意外情况串口断开连接 然后重新连接 
setInterval(() => {
  if (Object.keys(parserArr).length) {
    Object.keys(parserArr).map((path) => {
      // parserArr[path].port
      if (parserArr[path] && !parserArr[path].port.isOpen) {
        parserArr[path].port = new SerialPort(
          {
            path: path,
            baudRate: baudRate,
            autoOpen: true,
          },
          function (err) {
            console.log(err, "err");
          }
        );
        //管道添加解析器
        parserArr[path].port.pipe(parserArr[path].parser);
      }
    })

  }

}, 3000)
