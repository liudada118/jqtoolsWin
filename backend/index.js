const express = require('express')
const HttpResult = require('./server/HttpResult')
const app = express()
const port = 3000

app.get('/', (req, res) => {
  res.send('Hello World!')
})

// 查询密钥
app.get('/getKey' , (req , res) => {
    const uuid = req.query.uuid;
    console.log(JSON.stringify(uuid))
    res.json(new HttpResult(0, 'data', '获取设备列表成功'));
})

// 绑定密钥
app.post('/bindKey', (req ,res) => {
  
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})