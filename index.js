const { app, BrowserWindow } = require('electron')
const path = require('path')
const { fork } = require('child_process')
const { getHardwareFingerprint } = require('./util/getWinConfig')
const { getKeyfromWinuuid } = require('./util/getServer')
const { initDb } = require('./util/db')



const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false
    }

  })

  win.loadURL('http://sensor.bodyta.com/4096')
}


const isPackaged = app.isPackaged

const child = fork(path.join(__dirname, './server/serialServer.js') , {
  workerData : {
    isPackaged : isPackaged
  }
})

child.on('message', (msg) => {
  console.log('主线程', msg)
})

function startServerProcess() {

}

app.whenReady().then(async () => {
  const uuid = await getHardwareFingerprint()
  const dateKey = await getKeyfromWinuuid(uuid)
  console.log(uuid, dateKey)

  createWindow()
})



