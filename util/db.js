const sqlite3 = require("sqlite3").verbose();
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const fs = require('fs');
const { timeStampTo_Date } = require("./time");
const constantObj = require("./config");
const { backYToX, sitYToX } = require("./line");

const pointConfig = {
  'endi-back': {
    pointWidthDistance: 13,
    pointHeightDistance: 10,
  },
  'endi-sit': {
    pointWidthDistance: 10,
    pointHeightDistance: 10,
  },
};

/**
 * 输入当前系统名  返回可执行数据库
 * @param {*string} fileStr 输入当前选择系统名
 * @returns 数据库
 */
const initDb = (fileStr, filePath) => {
  const file = fileStr;
  let db, db1
  // if (isCar(file)) {
  //   db = genDb(`${filePath}/${file}sit.db` , filePath)
  //   db1 = genDb(`${filePath}/${file}back.db` , filePath)
  // } else 
  {
    // console.log(first)
    console.log(`${filePath}/${file}.db`)
    db = genDb(`${filePath}/${file}.db`, filePath)
  }
  return { db, db1 }
}

/**
 * 输入当前选择系统名
 * @param {*string} file 当前选择系统名
 * @returns 数据库
 */
function genDb(file, filePath) {
  if (fs.existsSync(file)) {

    const db = new sqlite3.Database(file);
    ensureRemarksTable(db);
    console.log('true')
    return db

  } else {
    console.log(file, filePath, 'err')
    let data = fs.readFileSync(`${filePath}/init.db`);
    fs.writeFileSync(file, data);
    const db = new sqlite3.Database(file);
    ensureRemarksTable(db);
    return db;
  }
}

function ensureRemarksTable(db) {
  db.run(
    `CREATE TABLE IF NOT EXISTS remarks (
      date TEXT PRIMARY KEY,
      alias TEXT,
      remark TEXT,
      select_json TEXT,
      updated_at INTEGER
    )`
  );
}

function isAllDigits(str) {
  return /^\d+$/.test(str) && str.includes('.') && str.length == 15;
}


function dbload(db, param, file, isPackaged, selectJson) {
  const selectQuery = "select * from matrix WHERE date=?";
  return new Promise((resolve, reject) => {
    db.all(selectQuery, param, async (err, rows) => {
      if (err) {
        console.error(err);
      } else {
        // console.log(rows)
        //把时间 压力面积 平均压力数据push进csvWriter进行汇总
        if (!rows.length) return;
        const csvWriteBackData = [];
        console.log(selectQuery, param, rows)
        let keyArr = Object.keys(JSON.parse(rows[0][`data`]))

        // 定义数据
        let selectOverride = selectJson;
        if (typeof selectOverride === 'string') {
          try {
            selectOverride = JSON.parse(selectOverride);
          } catch {
            selectOverride = null;
          }
        }

        for (var i = 0, j = 0; i < rows.length; i++, j++) {

          const newData = {}

          for (let j = 0; j < keyArr.length; j++) {

            const key = keyArr[j]
            console.log(key)
            if (!JSON.parse(rows[i][`data`])[key]) continue
            const data = JSON.parse(rows[i][`data`])[key].arr
            if (!data) continue

            if (j == 0) {
              newData.time = timeStampTo_Date(rows[i][`timestamp`])
            }
            const selectArr = [], selectObj = { width: 0, height: 0 }

            let obj = null;
            if (selectOverride && typeof selectOverride === 'object') {
              obj = selectOverride[key];
            } else if (rows[i][`select`]) {
              obj = JSON.parse(rows[i][`select`])[key];
            }
            if (obj && typeof obj == 'object') {
              const { xStart, xEnd, yStart, yEnd, width, height } = obj
              for (let i = yStart; i < yEnd; i++) {
                for (let j = xStart; j < xEnd; j++) {
                  selectArr.push(data[i * width + j])
                }
              }

              selectObj.width = xEnd - xStart
              selectObj.height = yEnd - yStart
            }
            // console.log(selectArr , 'selectArr')
            // const press = data.reduce((a, b) => a + b, 0);
            // const area = data.filter((a) => a > 0).length;
            // const max = Math.max(...data);
            // const min = Math.min(...data.filter((a) => a > 0));
            // const aver = (press / area).toFixed(1)

            const { press, area, max, min, aver } = colArrData(data)

            const { press: selectPress, area: selectArea, max: selectMax, min: selectMin, aver: selectAver } = colArrData(selectArr)

            const pointInfo = pointConfig[key]
            const pointArea =
              pointInfo
                ? pointInfo.pointWidthDistance * pointInfo.pointHeightDistance
                : null
            const pointValue = pointInfo ? area : null
            const pressureAreaValue = pointInfo ? area * pointArea : area

            if (file.includes('endi')) newData.sec = (i / 12).toFixed(2)
            newData[`${key}pressureArea`] = pressureAreaValue
            newData[`${key}pressure`] = press
            newData[`${key}max`] = max
            newData[`${key}min`] = min
            newData[`${key}aver`] = aver

            newData[`${key}selectMax`] = selectMax
            newData[`${key}selectMin`] = selectMin
            newData[`${key}selectAver`] = selectAver

            newData[`${key}realData`] = JSON.stringify(data)
            newData[`${key}selectData`] = JSON.stringify(selectArr)
            newData[`${key}selectW&H`] = JSON.stringify([selectObj.width, selectObj.height])

            if (key == 'endi-back') {
              newData[`${key}max`] = backYToX(max)
              newData[`${key}min`] = backYToX(min)
              newData[`${key}aver`] = backYToX(aver)
              newData[`${key}selectMax`] = backYToX(selectMax)
              newData[`${key}selectMin`] = backYToX(selectMin)
              newData[`${key}selectAver`] = backYToX(selectAver)
            }

            if (key == 'endi-sit') {
              newData[`${key}max`] = sitYToX(max)
              newData[`${key}min`] = sitYToX(min)
              newData[`${key}aver`] = sitYToX(aver)
              newData[`${key}selectMax`] = sitYToX(selectMax)
              newData[`${key}selectMin`] = sitYToX(selectMin)
              newData[`${key}selectAver`] = sitYToX(selectAver)
            }

            if (pointInfo) {
              const averValue = Number(newData[`${key}aver`]) || 0
              newData[`${key}point`] = pointValue
              newData[`${key}pressTotal`] = (averValue * pointArea * pointValue) / 1000
            }
          }


          csvWriteBackData.push(newData);
        }
        // 将汇总的压力数据写入 CSV 文件

        const remarkRow = await getRemark({ db, params: [param] })
        const aliasFromDb = remarkRow?.alias

        // let str = nowGetTime.replace(/[/:]/g, "-");
        let str = param;
        console.log(str, 'str')
        if (aliasFromDb) {
          str = String(aliasFromDb);
        } else if (isAllDigits(str)) {
          str = timeStampTo_Date(Number(str));
        }


        // 定义表头
        let handArr = []
        for (let j = 0; j < keyArr.length; j++) {
          const key = keyArr[j]
          if (j == 0) {
            if (file.includes('endi')) handArr.push({ id: "sec", title: "sec（s）" })
            handArr.push({ id: "time", title: "time" })
          }

          // const str = "endi";
          const res = key.replace(/endi/g, "car");
          console.log(res); // car
          handArr.push(
            { id: `${key}max`, title: `${res} Max（Kpa）` },
            { id: `${key}min`, title: `${res} Min（Kpa）` },
            { id: `${key}aver`, title: `${res} Aver（Kpa）` },
            { id: `${key}pressureArea`, title: `${res} Area（cm²）` },
          )
          if (key == 'endi-back' || key == 'endi-sit') {
            handArr.push(
              { id: `${key}point`, title: `${res} Points` },
              { id: `${key}pressTotal`, title: `${res} Pressure Sum（N）` },
            )
          }
          handArr.push(
            // { id: `${key}pressure`, title: `${res}pressure` },
            { id: `${key}realData`, title: `${res} Data` },
            { id: `${key}selectData`, title: `${res}select Data` },
            { id: `${key}selectMax`, title: `${res}select Max（Kpa）` },
            { id: `${key}selectMin`, title: `${res}select Min（Kpa）` },
            { id: `${key}selectAver`, title: `${res}select Aver（Kpa）` },
            { id: `${key}selectW&H`, title: `${res}select W&H` },
            // { id: `${key}aver`, title: `${res}aver` },
          )
        }

        handArr.push({ id: "remark", title: "remark" })

        let csvPath = __dirname + "/../data";
        if (isPackaged) {
          csvPath = 'resources/data'
        }

        const csvName = file == 'endi' ? 'car' : file
        const csvFilePath = `${csvPath}/${csvName}${str}.csv`

        const csvWriter1 = createCsvWriter({
          path: csvFilePath,
          // path: `./data/back${str}.csv`, // 指定输出文件的路径和名称
          header: handArr,
        });

        const remarkText = remarkRow?.remark ?? ''
        if (remarkText) {
          csvWriteBackData.push({ remark: remarkText })
        }

        csvWriter1
          .writeRecords(csvWriteBackData)
          .then(() => {
            const content = fs.readFileSync(csvFilePath)
            const hasBom =
              content.length >= 3 &&
              content[0] === 0xef &&
              content[1] === 0xbb &&
              content[2] === 0xbf
            if (!hasBom) {
              // Prepend UTF-8 BOM so Excel opens Chinese correctly.
              fs.writeFileSync(
                csvFilePath,
                Buffer.concat([Buffer.from('\ufeff'), content])
              )
            }
            console.log("导出csv成功！");
            let obj = {}
            obj[param] = 'sussess'
            resolve(obj)
          })
          .catch((err) => {
            console.error("导出csv失败：", err);
            let obj = {}
            obj[param] = err
            reject(obj)
          });

      }
    });
  })
}

async function dbLoadCsv({ db, params, file, isPackaged, selectJson }) {
  const selectQuery = "select * from matrix WHERE date=?";
  // params.forEach((param) => {
  //   db.all(selectQuery, param, (err, rows) => {
  //     if (err) {
  //       console.error(err);
  //     } else {
  //       // console.log(rows)
  //       //把时间 压力面积 平均压力数据push进csvWriter进行汇总
  //       if (!rows.length) return;
  //       const csvWriteBackData = [];

  //       let keyArr = Object.keys(JSON.parse(rows[0][`data`]))

  //       for (var i = 0, j = 0; i < rows.length; i++, j++) {

  //         const newData = {}

  //         for (let j = 0; j < keyArr.length; j++) {
  //           const key = keyArr[j]
  //           const data = JSON.parse(rows[i][`data`])[key].arr

  //           if (j == 0) {
  //             newData.time = timeStampTo_Date(rows[i][`timestamp`])
  //           }

  //           const press = data.reduce((a, b) => a + b, 0);
  //           const area = data.filter((a) => a > 10).length;
  //           const max = Math.max(...data);

  //           newData[`${key}pressureArea`] = area
  //           newData[`${key}pressure`] = press
  //           newData[`${key}max`] = max
  //           newData[`${key}realData`] = JSON.stringify(data)
  //         }


  //         csvWriteBackData.push(newData);
  //       }
  //       // 将汇总的压力数据写入 CSV 文件

  //       // let str = nowGetTime.replace(/[/:]/g, "-");
  //       let str = param;
  //       if (str.includes(" ")) {
  //         str = str.split(" ")[0];
  //       } else {
  //         str = timeStampTo_Date(Number(str));
  //       }

  //       let handArr = []
  //       for (let j = 0; j < keyArr.length; j++) {
  //         const key = keyArr[j]
  //         if (j == 0) {
  //           handArr.push({ id: "time", title: "time" })
  //         }
  //         handArr.push(
  //           { id: `${key}max`, title: `${key}max` },
  //           { id: `${key}pressureArea`, title: `${key}area` },
  //           { id: `${key}pressure`, title: `${key}pressure` },
  //           { id: `${key}realData`, title: `${key}data` },)
  //       }


  //       const csvWriter1 = createCsvWriter({
  //         path: `${csvPath}/${file}${str}.csv`,
  //         // path: `./data/back${str}.csv`, // 指定输出文件的路径和名称
  //         header: handArr,
  //       });

  //       csvWriter1
  //         .writeRecords(csvWriteBackData)
  //         .then(() => {
  //           console.log("导出csv成功！");

  //         })
  //         .catch((err) => {
  //           console.error("导出csv失败：", err);
  //         });

  //     }
  //   });
  // })
  const promises = params.map((param) => dbload(db, param, file, isPackaged, selectJson))
  const results = await Promise.all(promises);
  console.log(results, promises, 'result')
  return results
}

function dbDelete(db, param) {
  const createTableQuery = `delete from matrix  where date = ?`;
  return new Promise((resolve, reject) => {
    db.run(createTableQuery, [param], function (err) {
      if (err) {
        console.error(err);
        let obj = {}
        obj[param] = err
        reject(obj)
        return;
      } else {
        // console.log('删除')
        let obj = {}
        obj[param] = 'success'
        resolve(obj)
      }
    });
  })
}

async function deleteDbData({ db, params }) {
  const createTableQuery = `delete from matrix  where date = ?`;
  console.log(createTableQuery)
  const promises = params.map((param) => dbDelete(db, param))
  const results = await Promise.all(promises);
  await Promise.all(params.map((param) => deleteRemarkByDate({ db, params: [param] })));
  console.log(results, promises, 'result')
  return results
}

async function changeDbName({ db, params }) {
  const changeQuery = `UPDATE matrix SET "date" = ? WHERE "date" = ?`;
  const changeRemarkQuery = `UPDATE remarks SET "date" = ? WHERE "date" = ?`;
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(changeQuery, params, function (err) {
        if (err) {
          console.error('更新失败:', err.message);
          reject(err);
          return;
        }
        console.log(`更新成功，修改了 ${this.changes} 行`);
      });
      db.run(changeRemarkQuery, params, function (err) {
        if (err) {
          console.error('更新失败:', err.message);
          reject(err);
          return;
        }
        resolve({ success: true });
      });
    });
  });
}

async function dbGetData({ db, params }) {
  const selectQuery = "select * from matrix WHERE date=?";

  // const params = [time];
  return new Promise((resolve, reject) => {
    db.all(selectQuery, params, (err, rows) => {
      if (err) {
        console.error(err);
        reject(err)
      } else {
        let length = rows.length;
        indexArr = [0, length - 1];
        timeStamp = [];
        for (let i = 0; i < rows.length; i++) {
          timeStamp.push(rows[i].timestamp);
        }
        historyArr = [0, length];
        let press = [],
          area = [];
        // console.log(rows , 'rows',params)
        let keyArr = Object.keys(JSON.parse(rows[0][`data`]))
        let pressValue = {}, areaValue = {}
        for (let j = 0; j < keyArr.length; j++) {
          const key = keyArr[j]
          pressValue[key] = []
          areaValue[key] = []
        }
        for (let i = 0; i < rows.length; i++) {



          for (let j = 0; j < keyArr.length; j++) {
            const key = keyArr[j]
            if (!JSON.parse(rows[i][`data`])[key] || !JSON.parse(rows[i][`data`])[key].arr) continue
            console.log(JSON.parse(rows[i][`data`])[key])
            const data = JSON.parse(rows[i][`data`])[key].arr
            pressValue[key].push(data.reduce((a, b) => a + b, 0))
            areaValue[key].push(data.filter((a) => a > 0).length)
          }
          // press.push(pressValue);
          // area.push(areaValue);
        }

        resolve({
          length,
          pressArr: pressValue,
          areaArr: areaValue,
          rows: rows
        })

        // server.clients.forEach(function each(client) {
        //   /**
        //    * 首次读取串口，将数据长度和串口端口数
        //    *  */
        //   const jsonData = JSON.stringify({
        //     length: length,
        //     time: timeStamp,
        //     index: nowIndex,
        //     pressArr: press,
        //     areaArr: area,
        //     // length: csvSitData.length,
        //     sitData:
        //       file === "bigBed"
        //         ? new Array(2048).fill(0)
        //         : new Array(1024).fill(0),
        //   });
        //   if (client.readyState === WebSocket.OPEN) {
        //     client.send(jsonData);
        //   }
        // });

      }
    });
  })

}

async function getCsvData(file) {
  const results = []
  return new Promise((resolve) => {
    fs.createReadStream(file)
      .pipe(csv())
      .on("data", (data) => {

        results.push({ ...data, file: file })
      })
      .on("end", () => {
        // console.log(results)
        resolve(results)
      });
  })
}

async function changeDbDataName({ db, params }) {
  const sql = `UPDATE matrix SET "date" = ? WHERE "date" = ?`;
  const sqlRemark = `UPDATE remarks SET "date" = ? WHERE "date" = ?`;
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(sql, params, function (err) {
        if (err) {
          console.error('更新失败:', err.message);
          reject(err);
          return;
        }
        console.log(`更新完成，共修改了 ${this.changes} 行`);
      });
      db.run(sqlRemark, params, function (err) { 
        if (err) {
          console.error('更新失败:', err.message);
          reject(err);
          return;
        }
        resolve({ success: true });
      });
    });
  });
}

function normalizeSelectJson(select) {
  if (select === undefined) return null;
  if (select === null) return null;
  if (typeof select === 'string') return select;
  try {
    return JSON.stringify(select);
  } catch {
    return String(select);
  }
}

async function upsertRemark({ db, params }) {
  const { date, alias, remark, select } = params || {};
  const selectJson = normalizeSelectJson(select);
  const sql = `
    INSERT INTO remarks (date, alias, remark, select_json, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      alias = COALESCE(excluded.alias, remarks.alias),
      remark = COALESCE(excluded.remark, remarks.remark),
      select_json = COALESCE(excluded.select_json, remarks.select_json),
      updated_at = excluded.updated_at
  `;
  const now = Date.now();
  return new Promise((resolve, reject) => {
    db.run(sql, [date, alias ?? null, remark ?? null, selectJson, now], function (err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ date, alias, remark, select: selectJson, updated_at: now });
    });
  });
}

async function getRemark({ db, params }) {
  const sql = `SELECT date, alias, remark, select_json as "select", updated_at FROM remarks WHERE date = ?`;
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row || null);
    });
  });
}

async function deleteRemarkByDate({ db, params }) {
  const sql = `DELETE FROM remarks WHERE date = ?`;
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ success: true });
    });
  });
}

function colArrData(arr) {
  if(!arr.length){
    return {press : 0,
    area : 0,
    max : 0,
    min : 0,
    aver : 0}
  }
  const data = [...arr]
  const press = data.reduce((a, b) => a + b, 0);
  const area = data.filter((a) => a > 0).length;
  const max = Math.max(...data);
  const min = Math.min(...data.filter((a) => a > 0));
  const aver = (press / area).toFixed(1)

  return {
    press,
    area,
    max,
    min,
    aver
  }
}

module.exports = {
  initDb,
  dbLoadCsv,
  deleteDbData,
  dbGetData,
  getCsvData,
  changeDbDataName,
  changeDbName,
  upsertRemark,
  getRemark,
  deleteRemarkByDate
}
