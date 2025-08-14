/**
 * https://serialport.io/docs/guide-errors  you can find serialport document from the url
 * npm install -g @serialport/list or @serialport/terminal or  serialport-repl  you can install a software that make you get serialport list
 * @author icezhang
 */
const { SerialPort, DelimiterParser } = require('serialport')
const WebSocket = require('ws');
var dgram = require('dgram');
var udp_client = dgram.createSocket('udp4');
const server = new WebSocket.Server({ port: 19999 });

const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});


server.on('open', function open() {
  console.log('connected');
});

server.on('close', function close() {
  console.log('disconnected');
});

server.on('connection', function connection(ws, req) {
  const ip = req.connection.remoteAddress;
  const port = req.connection.remotePort;
  const clientName = ip + port;
  console.log('%s is connected', clientName)
  //ws.send("Welcome " + clientName);
  ws.on('message', function incoming(message) {
    console.log('received: %s from %s', message, clientName);
  });
});


/**
 * there are serveral Parsers that parse the serialport data
 *
 * const Readline = require('@serialport/parser-readline')
 * const parser = new Readline()
 * const ByteLength = require('@serialport/parser-byte-length')
 * const parser = new ByteLength({length: 1025})
 * const Delimiter = require('@serialport/parser-delimiter')
 * let splitBuffer = Buffer.from([0x68, 0x65 ,0x6C,0x6C ,0x6F ,0x77 ,0x6F ,0x72 ,0x6C ,0x64]);
 * @author icezhang
 */

//声明串口数据  分行解析器
var pointArr = new Array();
var pointArr2 = new Array();
// const Readline = require('@serialport/parser-readline')
// const parser = new Readline()
// const Delimiter = require('@serialport/parser-delimiter')
let splitBuffer = Buffer.from([0xAA, 0x55, 0x03, 0x99]);
const parser = new DelimiterParser({ delimiter: splitBuffer })
//串口初始化
// const SerialPort = require('serialport')
const path = 'COM15'
const baudRate = 1000000

SerialPort.list().then(ports => {
  console.info("=========================================================================================\r\n")
  console.info("hello ,there are serialport lists that we selected from your device\r\n")
  ports.forEach(function (port) {
    console.info('port:%s\r\n', port.path);
    try {
      readline.question(`请输入串口\r\n`, (name) => {
        const port1 = new SerialPort(
          {
            path: name,
            baudRate: baudRate,
            autoOpen: true,
          },
          function (err) {
            console.log(err, 'err');
          }
        );
        //管道添加解析器
        port1.pipe(parser);

        readline.close();
      });

      //  const port1 = new SerialPort(
      //    { path: 'COM6', baudRate: 2000000, autoOpen: true },
      //    function (err) {
      //      console.log(err, 'err');
      //    }
      //  );
      //  //管道添加解析器
      //  port1.pipe(parser);
    } catch (e) {
      console.log(e, 'e');
    }
  });
  console.info("=========================================================================================\r\n")
});

// const path = 'COM15'
// const baudRate = 1000000

// const port = new SerialPort({
//   path,
//   baudRate: baudRate,
//   autoOpen: true,
// },)
//管道添加解析器
let flag = false
// port.pipe(parser)

function jqbed(arr) {
  let wsPointData = [...arr];
  // 1-15行调换
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 32; j++) {
      [wsPointData[i * 32 + j], wsPointData[(14 - i) * 32 + j]] = [
        wsPointData[(14 - i) * 32 + j],
        wsPointData[i * 32 + j],
      ];
    }
  }

  let b = wsPointData.splice(0, 15 * 32);

  wsPointData = wsPointData.concat(b);
  // wsPointData = press6(wsPointData, 32, 32, 'col')
  return wsPointData
}

parser.on('data', function (data) {
  let buffer = Buffer.from(data);

  console.info(buffer.length)
  if (buffer.length === buffer.length) {
    for (var i = 0; i < buffer.length; i++) {
      pointArr[i] = buffer.readUInt8(i);
    }

    pointArr = jqbed(pointArr)
    let accelerate = false;
    turnInput = 0;

    const width = 32
    const height = 32
    const arr = [0, 0, 0, 0]

    for (let i = 0; i < height / 2; i++) {
      for (let j = 0; j < width / 2; j++) {
        arr[0] += pointArr[i * width + j]
      }
    }


    for (let i = 0; i < height / 2; i++) {
      for (let j = width / 2; j < width; j++) {
        arr[1] += pointArr[i * width + j]
      }
    }

    for (let i = height / 2; i < height; i++) {
      for (let j = 0; j < width / 2; j++) {
        arr[2] += pointArr[i * width + j]
      }
    }

    for (let i = height / 2; i < height; i++) {
      for (let j = width / 2; j < width; j++) {
        arr[3] += pointArr[i * width + j]
      }
    }

    pointArr = arr.map((a) => a / (width / 2) * (height / 2))

    let upSum = pointArr[0] + pointArr[1];
    let downSum = pointArr[2] + pointArr[3];
    let leftSum = pointArr[0];
    let rightSum = pointArr[1];
    if (upSum / downSum > 1.1) {
      accelerate = true;
    } else {
      accelerate = false;
    }
    
    //console.info("leftSum  "+leftSum+"   "+"rightSum: "+rightSum);
    let num = pointArr[0] + pointArr[1] + pointArr[2] + pointArr[3]
    if (leftSum / rightSum > 1.1) {
      turnInput = Math.abs((leftSum / rightSum / (width/2 *height/2)) - 1).toFixed(2);
      // turnInput *= 1.5;
    } else if (rightSum / leftSum > 1.1) {
      turnInput = -Math.abs((rightSum / leftSum/ (width/2 *height/2)) - 1).toFixed(2);
      // turnInput *= 1.5;
    } else {
      turnInput = 0;
    }
    flag = !flag
    let a = 100
    if (flag) {
      a = 500
    }
    num = a

    console.info(`1:${pointArr[0]}  2:${pointArr[1]}  3:${pointArr[2]}  4:${pointArr[3]}`)
    let jsonData = JSON.stringify({ "turnInput": turnInput, "accelerate": accelerate, "num": num, "numArr": pointArr });

    //let jsonData = JSON.stringify({ "data": pointArr });
    server.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {

        client.send(jsonData);

      }
    });
  }
})
