export const garyColors = [
  [0, 0, 0],
  [17, 17, 17],
  [34, 34, 34],
  [51, 51, 51],
  [68, 68, 68],
  [85, 85, 85],
  // [102, 102, 102],
  // [119, 119, 119],
  // [136, 136, 136],
  // [153, 153, 153],
  // [170, 170, 170],
  // [187, 187, 187],
  // [204, 204, 204],
  // [221, 221, 221],
  // [238, 238, 238],
  // [255, 255, 255],
]

// 4096
// export const pointConfig = {
//   endi: {
//     back: {
//       pointLength: 64,
//       pointWidthDistance: 13,
//       pointHeightDistance: 10,
//     },
//     sit: {
//       pointLength: 45,
//       pointWidthDistance: 10,
//       pointHeightDistance: 10,
//     },
//   }
// }

// export const systemPointConfig = {
//   'endi-sit': {
//     width: 45,
//     height: 45
//   },
//   'endi-back': {
//     width: 50,
//     height: 64
//   },
// }

// 1024
export const pointConfig = {
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

export const systemPointConfig = {
  'endi-sit': {
    width: 46,
    height: 46
  },
  'endi-back': {
    width: 50,
    height: 64
  },
}

const point32 = ['car-sit', 'car-back', 'hand', 'bed']
point32.forEach((a) => {
  systemPointConfig[a] = {
    width: 50,
    height: 64
  }
})

export const systemConfig = {
  car: '汽车座椅',
  bed: '床垫',
  chair: '人体工学椅',
  hand: '压力点阵图',
  bigHand: '4096',
  foot: '脚部检测'
}

export const serverAddress = 'https://sensor.bodyta.com'

export const localAddress = 'http://localhost:19245'