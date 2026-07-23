import { garyColors } from "./constant";

/**
 * 
 * @param {Array} arr 添加边框前的数组
 * @param {number} width 数据矩阵的宽
 * @param {number} height 数据矩阵的高
 * @param {number} wnum 数据矩阵横向插值的长度
 * @param {number} hnum 数据矩阵纵向插值的长度
 * @param {number} sideNum 插值的数字
 * @returns 
 */
export function addSide(arr, width, height, wnum, hnum, sideNum = 0) {
  let narr = new Array(height);
  let res = [];
  for (let i = 0; i < height; i++) {
    narr[i] = [];

    for (let j = 0; j < width; j++) {
      if (j == 0) {
        narr[i].push(
          ...new Array(wnum).fill(sideNum >= 0 ? sideNum : 1),
          arr[i * width + j]
        );
      } else if (j == width - 1) {
        narr[i].push(
          arr[i * width + j],
          ...new Array(wnum).fill(sideNum >= 0 ? sideNum : 1)
        );
      } else {
        narr[i].push(arr[i * width + j]);
      }
    }
  }
  for (let i = 0; i < height; i++) {
    res.push(...narr[i]);
  }

  return [
    ...new Array(hnum * (width + 2 * wnum)).fill(sideNum >= 0 ? sideNum : 1),
    ...res,
    ...new Array(hnum * (width + 2 * wnum)).fill(sideNum >= 0 ? sideNum : 1),
  ];
}

/**
 * 
 * @param {Array} scl 高斯前的数组
 * @param {number} w 矩阵的宽
 * @param {number} h 矩阵的高
 * @param {number} r 高斯的卷积核
 * @returns 
 */
export function gaussBlur_return(scl, w, h, r) {
  const res = new Array(scl.length).fill(1)
  var rs = Math.ceil(r * 2.57); // significant radius
  for (var i = 0; i < h; i++) {
    for (var j = 0; j < w; j++) {
      var val = 0,
        wsum = 0;
      for (var iy = i - rs; iy < i + rs + 1; iy++)
        for (var ix = j - rs; ix < j + rs + 1; ix++) {
          var x = Math.min(w - 1, Math.max(0, ix));
          var y = Math.min(h - 1, Math.max(0, iy));
          var dsq = (ix - j) * (ix - j) + (iy - i) * (iy - i);
          var wght = Math.exp(-dsq / (2 * r * r)) / (Math.PI * 2 * r * r);
          val += scl[y * w + x] * wght;
          wsum += wght;
        }
      res[i * w + j] = Math.round(val / wsum);
    }
  }
  return res
}


/**
 * 
 * @param {Array} smallMat 插值前的数组
 * @param {number} Length 正方形矩阵的长
 * @param {number} num 插值的倍数
 * @returns 
 */
export function interpSquare(smallMat, Length, num) {
  const res = new Array(Length * num * Length * num).fill(1);

  for (let x = 1; x <= Length; x++) {
    for (let y = 1; y <= Length; y++) {
      res[
        Length * num * (num * (y - 1)) +
        (Length * num * num) / 2 +
        num * (x - 1) +
        num / 2
      ] = smallMat[Length * (y - 1) + x - 1] * 10;
    }
  }

  return res
}


/**
 * 给一个数字 输出一个颜色
 * @param {number} min 自定义颜色最小刻度
 * @param {number} max 自定义颜色最大刻度
 * @param {number} x 真实数值
 * @returns 颜色
 */
export function jet(min, max, x) {
  let red, g, blue;
  let dv;
  red = 1.0;
  g = 1.0;
  blue = 1.0;
  if (x < min) {
    x = min;
  }
  if (x > max) {
    x = max;
  }
  dv = max - min;
  if (x < min + 0.25 * dv) {
    // red = 0;
    // g = 0;
    // blue = 0;

    red = 0;
    g = (4 * (x - min)) / dv;
  } else if (x < min + 0.5 * dv) {
    red = 0;
    blue = 1 + (4 * (min + 0.25 * dv - x)) / dv;
  } else if (x < min + 0.75 * dv) {
    red = (4 * (x - min - 0.5 * dv)) / dv;
    blue = 0;
  } else {
    g = 1 + (4 * (min + 0.75 * dv - x)) / dv;
    blue = 0;
  }
  var rgb = new Array();
  rgb[0] = parseInt(255 * red + '');
  rgb[1] = parseInt(255 * g + '');
  rgb[2] = parseInt(255 * blue + '');
  return rgb;
}



/**
 * 给一个数字 输出一个颜色
 * @param {number} min 自定义颜色最小刻度
 * @param {number} max 自定义颜色最大刻度
 * @param {number} x 真实数值
 * @returns 颜色
 */
export function jetgGrey(min, max, x) {
  if (!x) {
    return garyColors[garyColors.length - 1]
  }
  const length = garyColors.length;
  const count = (max - min) / length;
  const num = Math.floor(x / count) >= length - 1 ? length - 1 : Math.floor(x / count) < 0 ? 0 : Math.floor(x / count);
  // console.log(length,count,x  , num,Math.floor(x / count))
  return garyColors[length - 1 - num];
}


export function endiSitPressFn(y) {
  const ySplit = 49.77606662;
  const yMax = 98.64822263;

  if (y <= ySplit) {
    // 线性段：y = 84.1215525878 * x  =>  x = y / 84.1215525878
    return y / 84.1215525878;
  }

  if (y <= yMax) {
    // 指数段：y = 101 - 64.3561 * e^(-0.3857x)
    // 反解：x = -(1 / 0.3857) * ln( (101 - y) / 64.3561 )
    return -(1 / 0.3857) * Math.log((101 - y) / 64.3561);
  }
}

export function endiBackPressFn(y) {
  const ySplit = 72.28252249;
  const yMax = 142.0380303;

  // 线性段：y = 119.26628 * x
  if (y <= ySplit) {
    return y / 119.26628;
  }

  // 指数段：y = 145 - 92.1735 * e^(-0.3912 x)
  if (y <= yMax) {
    return -(1 / 0.3912) * Math.log((145 - y) / 92.1735);
  }

  // 超出范围你可以钳制，也可以报错，这里先用钳制：
  return -(1 / 0.3912) * Math.log((145 - yMax) / 92.1735);
}

export function lineInterpnew(smallMat, width, height, interp1, interp2) {

  let bigMat = new Array((width * interp1) * (height * interp2)).fill(0)
  const interpValue = 1
  // return bigMat
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width - 1; j++) {
      if (j == width - 1) {
        const realValue = smallMat[i * width + j] * interpValue
        const rowValue = 0
        const colValue = smallMat[(i + 1) * width + j] * interpValue ? smallMat[(i + 1) * width + j] * interpValue : 0
        bigMat[(width * interp1) * i * interp2 + (j * interp1)
        ] = smallMat[i * width + j] * interpValue
        // for (let k = 0; k < interp1; k++) {
        //   // for (let z = 0; z < interp2; z++) {
        //   //   bigMat[(width * interp1) * (i * interp2 + k) + ((j * interp1) + z)
        //   //   ] = smallMat[i * width + j] * interpValue
        //   // }
        // }

        // for (let k = 0; k < interp2; k++) {
        //   bigMat[(width * interp1) * (i * interp2 + k) + ((j * interp1))] = realValue + (colValue - realValue) * (k) / interp2
        // }
        for (let k = 0; k < interp1; k++) {
          bigMat[(width * interp1) * (i * interp2) + ((j * interp1 + k))] = realValue + (rowValue - realValue) * (k) / interp1
        }
        continue
      }
      const realValue = smallMat[i * width + j] * interpValue
      const rowValue = smallMat[i * width + j + 1] * interpValue ? smallMat[i * width + j + 1] * interpValue : 0
      const colValue = smallMat[(i + 1) * width + j] * interpValue ? smallMat[(i + 1) * width + j] * interpValue : 0
      bigMat[(width * interp1) * i * interp2 + (j * interp1)
      ] = smallMat[i * width + j] * interpValue
      // for (let k = 0; k < interp1; k++) {
      //   // for (let z = 0; z < interp2; z++) {
      //   //   bigMat[(width * interp1) * (i * interp2 + k) + ((j * interp1) + z)
      //   //   ] = smallMat[i * width + j] * interpValue
      //   // }
      // }

      // for (let k = 0; k < interp2; k++) {
      //   bigMat[(width * interp1) * (i * interp2 + k) + ((j * interp1))] = realValue + (colValue - realValue) * (k) / interp2
      // }
      for (let k = 0; k < interp1; k++) {
        bigMat[(width * interp1) * (i * interp2) + ((j * interp1 + k))] = realValue + (rowValue - realValue) * (k) / interp1
      }
    }
  }




  // return bigMat

  const newWidth = width * interp1

  for (let i = 0; i < height - 1; i++) {
    for (let j = 0; j < newWidth; j++) {
      const realValue = bigMat[i * interp2 * newWidth + j]
      // const rowValue = bigMat[i * width + j + 1] * interpValue ? bigMat[i * width + j + 1] * interpValue : 0
      // const colValue = bigMat[(i + 1) * width + j] * interpValue ? bigMat[(i + 1) * width + j] * interpValue : 0
      const colValue = bigMat[((i + 1) * interp2) * newWidth + j] ? bigMat[(((i + 1) * interp2)) * newWidth + j] : 0
      for (let k = 0; k < interp2; k++) {
        bigMat[newWidth * (i * interp2 + k) + ((j))] = realValue + (colValue - realValue) * (k) / interp2
      }
    }
  }

  const newArr = []
  for (let i = 0; i < 1 + (height - 1) * interp2; i++) {
    for (let j = 0; j < 1 + (width - 1) * interp1; j++) {
      newArr.push(bigMat[i * width * interp1 + j])
    }
  }


  // bigMat = bigMat.map((a) => parseInt(a))
  return newArr
}