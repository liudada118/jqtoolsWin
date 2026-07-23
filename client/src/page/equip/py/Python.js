import { Input, message } from 'antd';
import axios from 'axios'
import React, { useEffect, useState } from 'react'

function debounce(fn, delay = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

// function setByPath(obj, path, value) {


//   const keys = Array.isArray(path) ? path : path.split(".");

//   // 复制一份，保证不可变
//   const newObj = structuredClone(obj); // 如果不兼容，可以用 JSON.parse(JSON.stringify(obj))
//   let cur = newObj;

//   for (let i = 0; i < keys.length - 1; i++) {
//     const k = keys[i];

//     // 如果这层不存在，就先创建一个对象
//     if (cur[k] === undefined || cur[k] === null || typeof cur[k] !== "object") {
//       cur[k] = {};
//     }

//     cur = cur[k];
//   }



//   // cur[keys[keys.length - 1]] = value;
//   // console.log(newObj)
//   // return newObj;

//     const lastKey = keys[keys.length - 1];
//   const oldVal = cur[lastKey];

//   // ⭐ 关键逻辑在这里
//   if (
//     typeof oldVal === "object" &&
//     oldVal !== null &&
//     !Array.isArray(oldVal) &&
//     typeof value === "object" &&
//     value !== null &&
//     !Array.isArray(value)
//   ) {
//     // 对象 → 合并
//     cur[lastKey] = {
//       ...oldVal,
//       ...value,
//     };
//   } else {
//     // 非对象 → 直接替换
//     cur[lastKey] = value;
//   }

//   return newObj;
// }


function setByPath(obj, path, value, { mergeObject = true } = {}) {
  const keys = Array.isArray(path) ? path : path.split(".");
  const newObj = structuredClone(obj);
  let cur = newObj;

  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] == null || typeof cur[k] !== "object") {
      cur[k] = {};
    }
    cur = cur[k];
  }

  const lastKey = keys[keys.length - 1];
  const oldVal = cur[lastKey];

  if (
    mergeObject &&
    oldVal &&
    typeof oldVal === "object" &&
    !Array.isArray(oldVal) &&
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    cur[lastKey] = { ...oldVal, ...value };
  } else {
    cur[lastKey] = value;
  }

  return newObj;
}

function setByPath2Level(obj, path, value) {
  const newObj = structuredClone(obj);

  // 统一把 path 变成字符串好处理
  const pathStr = Array.isArray(path) ? path.join(".") : String(path);

  // 1) 找到最“长”的 topKey，使得 pathStr 以 `${topKey}.` 开头 或者 pathStr === topKey
  const topKeys = Object.keys(newObj);
  const topKey = topKeys
    .filter((k) => pathStr === k || pathStr.startsWith(k + "."))
    .sort((a, b) => b.length - a.length)[0];

  if (!topKey) {
    // 没找到匹配的 topKey：你可以选择直接当普通深层对象处理，或直接返回
    console.warn("No matched topKey for path:", pathStr);
    return newObj;
  }

  // 2) 取出 topKey 对应的对象，准备更新其内部字段
  const rest = pathStr === topKey ? "" : pathStr.slice(topKey.length + 1); // 去掉 `${topKey}.`
  const target = newObj[topKey];

  // 如果只传了 topKey（比如更新整个对象），这里用 merge（避免覆盖掉其它字段）
  if (!rest) {
    if (target && typeof target === "object" && value && typeof value === "object") {
      newObj[topKey] = { ...target, ...value };
    } else {
      newObj[topKey] = value;
    }
    return newObj;
  }

  // 3) rest 是第二层对象内部路径，比如 "value" / "meta.unit"
  const keys = rest.split(".");
  let cur = target ?? {};
  // 为了保证不可变，我们复制一份 topKey 对应对象
  const clonedTarget = structuredClone(cur);
  newObj[topKey] = clonedTarget;

  let node = clonedTarget;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (node[k] == null || typeof node[k] !== "object") node[k] = {};
    node = node[k];
  }
  node[keys[keys.length - 1]] = value;

  return newObj;
}

function ObjectViewer({ data, changeData }) {

  function deepTraverseObject(obj, visitor, path = [], seen = new WeakSet()) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      // 原始值 或 数组整体 —— 直接回调，但不继续递归
      visitor({
        key: path[path.length - 1] ?? null,
        value: obj,
        path,
      });
      return;
    }

    // 防止循环引用
    if (seen.has(obj)) return;
    seen.add(obj);

    // 只遍历对象 keys
    Object.keys(obj).forEach((key) => {
      deepTraverseObject(obj[key], visitor, [...path, key], seen);
    });
  }
  const items = [];

  deepTraverseObject(data, ({ key, value, path }) => {
    items.push({ key, value, path: path.join('.') });
  });

  function changaPyValue(path, value) {
    axios({
      method: 'post',
      url: 'http://localhost:19245/changePy',
      data: {
        path: path,
        value: value
      }
    }).then(() => {
      message.success('修改成功')
    }).catch(() => {
      message.error('修改失败')
    })
    // const obj = {...data}
    // const keyArr = path.split(".")
    // obj[path] = value
    // console.log(path , ' 11111111111111')

  }

  const change = debounce(changaPyValue, 300)

  function removeValueSuffix(str) {
    const arr = str.split('.');
    if (arr[arr.length - 1] === 'value') {
      arr.pop();
    }
    return arr.join('.');
  }

  return (
    <pre>
      {items.map((item) => {
        if (item.path.includes("value")) {
          return (

            <div key={item.path}>
              <strong>{item.path || '(root)'}</strong>:   <Input onChange={(e) => {
                console.log(e.target.value)
                changeData(prev =>{
                  console.log(prev , 'pppppppppppp')
                  return setByPath2Level(prev, item.path, e.target.value)})
                const path = removeValueSuffix(item.path)
                change(path, e.target.value)
              }} value={(item.value)} />

              {/* {JSON.stringify(item.value)} */}
            </div>
          )
        } else {
          return (
            <div style={{ marginBottom: '20px', fontSize: '18px' }} key={item.path}>
              {/* <strong>{item.path || '(root)'}</strong>:  */}
              <div>{item.value}</div>
              {/* {JSON.stringify(item.value)} */}
            </div>
          )
        }


      })}
    </pre>
  );
}

function stringifyValues(obj) {
  // null 或非对象 === 直接字符串化
  if (obj === null || typeof obj !== "object") {
    return String(obj);
  }

  // 数组整体字符串化（不进入内部）
  if (Array.isArray(obj)) {
    return String(obj);
  }

  // 普通对象 → 递归
  const result = {};
  for (const key in obj) {
    const val = obj[key];
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      result[key] = stringifyValues(val); // 递归
    } else {
      result[key] = JSON.stringify(val); // 字符串化
    }
  }
  return result;
}

export default function Python() {

  const [data, setData] = useState()
  useEffect(() => {
    axios.get('http://localhost:19245/getPyConfig', {}).then((res) => {
      console.log(res.data.data)
      // setData(res.data.data)
      const obj = stringifyValues(res.data.data)
      console.log(obj)
      setData(obj)
    })
  }, [])

  return (
    <ObjectViewer data={data} changeData={setData} />
  )
}
