const { app, BrowserWindow, Menu } = require('electron')
const path = require('path')
const { fork, spawn } = require('child_process')
const { getHardwareFingerprint } = require('./util/getWinConfig')
const { getKeyfromWinuuid } = require('./util/getServer')
const { initDb, getCsvData } = require('./util/db')
const http = require('http')
const fs = require('fs')
// const { startWorker, callPy } = require('./pyWorker')
const isPackaged = app.isPackaged

function openWeb({ hostname, port, fn }) {
  const server = http.createServer((req, res) => {
    if (req.url === "/") {
      // 读取打包后的 index.html 文件

      const filePath = isPackaged ? path.join(__dirname, '..', "build", "index.html") : path.join(__dirname, "build", "index.html");

      console.log(filePath)

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain");
          res.end("Internal Server Error");
        } else {
          // 设置响应头和内容，发送网页文件
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html");
          res.end(data);
        }
      });
    } else {
      // 处理其他请求（如样式表、脚本、图片等）
      const filePath = isPackaged ? path.join(__dirname, '..', "build", req.url) : path.join(__dirname, "build", req.url);
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain");
          res.end("Not Found");
        } else {
          res.statusCode = 200;
          res.setHeader("Content-Type", getContentType(filePath));
          res.end(data);
        }
      });
    }
  });

  server.listen(port, hostname, () => {
    const url = `http://${hostname}:${port}`;
    // console.log(`Server running at http://${hostname}:${port}/`);
    // exec(`start chrome "${url}"`, (err, stdout, stderr) => {
    //     if (err) {
    //         console.error(`exec error: ${err}`);
    //         return;
    //     }
    //     console.log(`stdout: ${stdout}`);
    //     console.error(`stderr: ${stderr}`);
    // });
    fn()
  });

  function getContentType(filePath) {
    const extname = path.extname(filePath);
    switch (extname) {
      case ".html":
        return "text/html";
      case ".css":
        return "text/css";
      case ".js":
        return "text/javascript";
      case ".png":
        return "image/png";
      case ".jpg":
        return "image/jpg";
      default:
        return "text/plain";
    }
  }
}



function startApiChild() {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, './server/serialServer.js'), {
      env: {
        isPackaged: isPackaged,
        appPath: app.getAppPath()
      }
    })

    const readyTimer = setTimeout(() => {
      reject(new Error('API child not ready in time'));
    }, 15000);

    child.on('message', (msg) => {
      if (msg.type === 'ready') {
        clearTimeout(readyTimer);
        apiPort = msg.port;
        resolve(msg.port);
      } else if (msg?.type === 'error') {
        clearTimeout(readyTimer);
        reject(new Error(`API child error: ${msg.code || ''} ${msg.message || ''}`));
      }
    })

    child.on('exit', (code, signal) => {
      // 如果需要可在这里做自动重启
      console.log(`API child exited: code=${code} signal=${signal}`);
    });
  })
}

// const child1 = fork(path.join(__dirname, './pyWorker.js'), {
//   env: {
//     isPackaged: isPackaged,
//     appPath: app.getAppPath()
//   }
// })

const createWindow = () => {
  const win = new BrowserWindow({
    // width: 800,
    // height: 600,
    // fullscreen: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'logo.ico')

  })

  const hostname = "127.0.0.1";
  const port = 2999;

  win.maximize()
  // win.loadURL('http://sensor.bodyta.com/4096')

  // win.loadURL('https://sensor.bodyta.com/jqtools2')

  function fn() {
    win.loadURL(`http://${hostname}:${port}`)
  }

  openWeb({ hostname, port, fn })
}







function pyBin() {
  const isDev = !app.isPackaged
  if (process.platform === 'win32') {
    return isDev
      ? path.join(__dirname, 'python', 'venv', 'Scripts', 'python.exe')
      : path.join(process.resourcesPath, 'python', 'venv', 'Scripts', 'python.exe')
  } else {
    return isDev
      ? path.join(__dirname, 'python', 'venv', 'bin', 'python')
      : path.join(process.resourcesPath, 'python', 'venv', 'bin', 'python')
  }
}
function apiPy() {
  const isDev = !app.isPackaged
  return isDev
    ? path.join(__dirname, 'python', 'app', 'api.py')
    : path.join(process.resourcesPath, 'python', 'app', 'api.py')
}

/** 主进程里直接像调用函数一样用 */
// function callPy(fn, args) {
//   return new Promise((resolve, reject) => {
//     const child = spawn(pyBin(), [apiPy()], {
//       stdio: ['pipe', 'pipe', 'pipe'],
//       env: { ...process.env, PYTHONUNBUFFERED: '1' }
//     })
//     let out = '', err = ''
//     child.stdout.on('data', d => (out += d.toString()))
//     child.stderr.on('data', d => (err += d.toString()))
//     child.on('error', e => reject(new Error('spawn error: ' + e.message)))
//     child.on('close', code => {
//       if (code !== 0) return reject(new Error(`Python exit ${code}\n${err}`))
//       try {
//         const last = (out.trim().split(/\r?\n/).pop() || '{}')
//         // console.log(last, 'last')
//         const res = JSON.parse(last)
//         if (res.ok) resolve(res.data)
//         else reject(new Error(res.error + '\n' + (res.trace || '')))
//       } catch (e) {
//         reject(new Error('Parse fail: ' + e.message + '\nraw: ' + out))
//       }
//     })
//     child.stdin.write(JSON.stringify({ fn, args }) + '\n')
//     child.stdin.end()
//   })
// }

let py = null;
let buf = '';
const pending = new Map();

// function startPy() {
//   py = spawn(pyBin(), [apiPy()], { stdio: ['pipe','pipe','pipe'] });
//   py.stdout.on('data', d => {
//     buf += d.toString();
//     const lines = buf.split(/\r?\n/); buf = lines.pop() || '';
//     for (const line of lines) {
//       if (!line.trim()) continue;
//       const msg = JSON.parse(line);
//       const cb = pending.get(msg.id);
//       if (cb) { pending.delete(msg.id); cb(msg.data); }
//     }
//   });
//   py.stderr.on('data', d => console.error('[PY]', d.toString()));
//   py.on('exit', ()=>{ py=null; setTimeout(startPy, 300); });
// }

// function callPy(fn, args) {
//   if (!py) startPy();
//   const id = Math.random().toString(36).slice(2);
//   return new Promise(resolve => {
//     pending.set(id, resolve);
//     py?.stdin.write(JSON.stringify({ id, fn, args }) + '\n');
//   });
// }


// child.on('message', (msg) => {
//   console.log('主线程', msg)
// })

function startServerProcess() {

}

// 调用你的函数（示例）
// async function demo(matrix) {
//   // 构造一条 1024 长度的测试数据

//   // console.log(matrix)
//   // const data = new Array(10).fill(new Array(1024).fill(50)); // 可以放多条
//   // const res = await callPy('cal_cop_fromData', { data : matrix });
//   const res = await callPy('cal_cop_fromData', { data: matrix });
//   console.log(res);
//   console.log('结果:', res, new Date().getTime()); // { left: [...], right: [...] }
// }

app.whenReady().then(async () => {
  const uuid = await getHardwareFingerprint()
  const dateKey = await getKeyfromWinuuid(uuid)
  console.log(uuid, dateKey)

  // 开始本地api线程
  await startApiChild()
  // 开启python线程
  // startWorker(); // 
  createWindow()

  Menu.setApplicationMenu(null);

  // const data1 = await getCsvData('D:/jqtoolsWin - 副本/python/app/静态数据集1.csv')

  // const matrix = data1.map((a) => JSON.parse(a.data))

  // try {
  //   console.log('setTimeout')
  //   const data = await callPy('getData', { data: new Array(1024).fill(20)})

  //   //  {
  //   //   'frameData': new Array(1024).fill(0),
  //   //   'tim': new Date().getTime() % 1000,
  //   //   'threshold_factor': 25,
  //   //   'continuous_on_bed_duration_minutes': 1.0,
  //   //   'unlock_sitting_alarm_duration_minutes': 1.0,
  //   //   'unlock_falling_alarm_duration_minutes': 1.0,
  //   //   'sosPeakThreshold': 25.0,
  //   //   'points_threshold_in': 3.0
  //   // }
  //   console.log(data, 'data')
  // }
  // catch (e) {
  //   console.error('[PY ERROR]', e)
  // }


  // try {
  //   const r1 = await callPy('cal_cop_fromData', {data : new Array(10).fill(new Array(1024).fill(0))})
  //   // const r2 = await callPy('add_and_scale', { a: 1, b: 2, scale: 10 })
  //   console.log('[PY] add =>', r1)
  //   console.log('[PY] add_and_scale =>', r2)
  // } catch (e) {
  //   console.error('[PY ERROR]', e)
  // }
  // try {
  //   const a = await demo(matrix)
  //   await demo(matrix)
  //   await demo(matrix)
  //   await demo(matrix)
  //   await demo(matrix)
  //   await demo(matrix)
  //   await demo(matrix)
  //   await demo(matrix)
  // } catch (e) {
  //   console.log(e)
  // }
})



