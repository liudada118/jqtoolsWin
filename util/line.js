function hand(arr) {
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

    for (let i = 0; i < 32; i++) {
        for (let j = 0; j < 16; j++) {
            [wsPointData[i * 32 + j], wsPointData[i * 32 + 31 - j]] = [wsPointData[i * 32 + 31 - j], wsPointData[i * 32 + j],]
        }
    }
    // wsPointData = press6(wsPointData, 32, 32, 'col')
    return wsPointData
}

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

function arrToRealLine(arr, arrX, arrY, matrixLength) {
    const realX = [], realY = []
    arrX.forEach((a) => {
        if (Array.isArray(a)) {
            // for(let i = )
            if (a[0] > a[1]) {
                for (let i = a[0]; i >= a[1]; i--) {
                    realX.push(i)
                }
            } else {
                for (let i = a[0]; i <= a[1]; i++) {
                    realX.push(i)
                }
            }
        } else {
            realX.push(a)
        }
    })

    arrY.forEach((a) => {
        if (Array.isArray(a)) {
            // for(let i = )
            if (a[0] > a[1]) {
                for (let i = a[0]; i >= a[1]; i--) {
                    realY.push(i)
                }
            } else {
                for (let i = a[0]; i <= a[1]; i++) {
                    realY.push(i)
                }
            }
        } else {
            realY.push(a)
        }
    })

    let newArr = []
    for (let i = 0; i < realY.length; i++) {
        for (let j = 0; j < realX.length; j++) {
            const realXCoo = realY[i]
            const realYCoo = realX[j]
            newArr.push(arr[realXCoo * matrixLength + realYCoo])
        }
    }

    return newArr
}


// endi 1.0
// function endiSit(arr) {
//     let arrX = [[22, 0], [23, 44]]
//     let arrY = [[1, 32], 0, [63, 63 - 11]]

//     function rotate90(arr, height, width) {
//         //逆时针旋转 90 度
//         //列 = 行
//         //行 = n - 1 - 列(j);  n表示总行数
//         let matrix = [];
//         for (let i = 0; i < height; i++) {
//             matrix[i] = [];
//             for (let j = 0; j < width; j++) {
//                 matrix[i].push(arr[i * height + j]);
//             }
//         }

//         var temp = [];
//         var len = matrix.length;
//         for (var i = 0; i < len; i++) {
//             for (var j = 0; j < len; j++) {
//                 var k = len - 1 - j;
//                 if (!temp[k]) {
//                     temp[k] = [];
//                 }
//                 temp[k][i] = matrix[i][j];
//             }
//         }
//         let res = [];
//         for (let i = 0; i < temp.length; i++) {
//             res = res.concat(temp[i]);
//         }
//         return res;
//     }
//     let newArr = arrToRealLine(arr, arrX, arrY)
//     newArr = rotate90(newArr, 45, 45)
//     return newArr

// }

// endi 2.0

function endiSit(arr) {
    let arrX = [[63, 19]]
    let arrY = [[20, 32], 0, [63, 56], [33, 55]]

    let newArr = arrToRealLine(arr, arrX, arrY)
    // newArr = rotate90(newArr, 45, 45)
    return newArr

}



function endiBack(arr) {
    let arrX = [[14, 63]]
    let arrY = [[0, 63]]
    return arrToRealLine(arr, arrX, arrY)
}
// endiSit()

function lineInterp(smallMat, width, height, interp1, interp2) {

    let bigMat = new Array((width * interp1) * (height * interp2)).fill(0)
    const interpValue = 1
    // return bigMat
    for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
            const realValue = smallMat[i * width + j] * interpValue
            const rowValue = j == width - 1 ? 0 : smallMat[i * width + j + 1] * interpValue ? smallMat[i * width + j + 1] * interpValue : 0
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

    for (let i = 0; i < height; i++) {
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


    bigMat = bigMat.map((a) => parseInt(a))
    return bigMat
}

function press(arr, width, height, value, prop, type = "row") {
    let wsPointData = [...arr];

    if (type == "row") {
        let colArr = [];
        for (let i = 0; i < height; i++) {
            let total = 0;
            for (let j = 0; j < width; j++) {
                total += wsPointData[i * width + j];
            }
            colArr.push(total);
        }
        // //////okok
        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                wsPointData[i * width + j] = parseInt(
                    (wsPointData[i * width + j] /
                        (value - colArr[i] <= 0 ? 1 : value - colArr[i])) *
                    1000 * prop
                );
            }
        }
    } else {
        let colArr = [];
        for (let i = 0; i < height; i++) {
            let total = 0;
            for (let j = 0; j < width; j++) {
                total += wsPointData[j * height + i];
            }
            colArr.push(total);
        }
        // //////okok

        // console.log(first)

        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                wsPointData[j * height + i] = parseInt(
                    (wsPointData[j * height + i] /
                        (value - colArr[i] <= 0 ? 1 : value - colArr[i])) *
                    1000 * prop
                );
            }
        }
    }

    //////

    // wsPointData = wsPointData.map((a,index) => {return calculateY(a)})
    return wsPointData;
}

function endiSit1024(arr) {
    let arrX = [[22, 0]]
    // let arrY = [[11, 22], [10, 0]]
    let arrY = [[0, 10], [22, 11]]

    // const pressArr = press([...arr], 32, 32, 700, 0.2, 'col')

    const pressArr = pressNew1220({ arr: arr, width: 32, height: 32, type: 'col', value: 683 })


    let newArr = arrToRealLine(pressArr, arrX, arrY, 32)
    // console.log(JSON.stringify(newArr))
    newArr = lineInterp(newArr, 23, 23, 2, 2)



    const yArr = []
    for (let i = 0; i < 46; i++) {
        yArr.push(45 - i)
    }

    const res = []
    for (let i = 0; i < 46; i++) {
        for (let j = 0; j < 46; j++) {
            const width = yArr[i]
            res.push(newArr[width * 46 + 45 - j])
        }
    }
 

    // newArr = rotate90(newArr, 45, 45)

    // console.log(newArr.length)
    return res
}

function endiBack1024(arr) {
    let arrX = [[0, 24]]
    // let arrY = [[0, 14], [31, 15]]

    let arrY = [[15, 31], [14, 0]]


    const pressArr = pressNew1220({ arr: arr, width: 32, height: 32, type: 'col', value: 683 }) //press([...arr], 32, 32, 700, 0.3, 'col')

    let newArr = arrToRealLine(pressArr, arrX, arrY, 32)

    newArr = lineInterp(newArr, 25, 32, 2, 2)

    const yArr = []
    for (let i = 0; i < 64; i++) {
        yArr.push(63 - i)
    }

    const res = []
    for (let i = 0; i < 64; i++) {
        for (let j = 0; j < 50; j++) {
            const width = yArr[i]
            res.push(newArr[width * 50 + 49 - j])
        }
    }
    


    // newArr = rotate90(newArr, 45, 45)

    // console.log(newArr.length)
    return res
}

function pressNew1220({ arr, width, height, type = "row", value }) {
    let wsPointData = [...arr];

    if (type == "row") {
        let colArr = [];
        for (let i = 0; i < height; i++) {
            let total = 0;
            for (let j = 0; j < width; j++) {
                total += wsPointData[i * width + j];
            }
            colArr.push(total);
        }
        // //////okok
        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {

                let den = wsPointData[i * width + j] + value - colArr[i]
                if (den <= 0) {
                    den = 1
                }

                wsPointData[i * width + j] = parseInt(
                    wsPointData[i * width + j] * value / den
                );
            }
        }
    } else {
        let colArr = [];
        for (let i = 0; i < height; i++) {
            let total = 0;
            for (let j = 0; j < width; j++) {
                total += wsPointData[j * height + i];
            }
            colArr.push(total);
        }
        // //////okok
        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                let den = wsPointData[j * height + i] + value - colArr[i]
                if (den <= 0) {
                    den = 1
                }

                wsPointData[j * height + i] = parseInt(
                    (wsPointData[j * height + i] * value / den) / 2
                );
            }
        }
    }

    //////

    // wsPointData = wsPointData.map((a,index) => {return calculateY(a)})
    return wsPointData;
}

function backYToX(y) {
     if (!Number.isFinite(y)) return 0;

    // 饱和平台
    if (y >= 108) return 25;

    // 下限保护，看你需不需要，可以改阈值
    if (y <= 6) return 0;

    return Math.exp((y - 25.6628) / 25.26) - 0.362;
}

function sitYToX(y) {
   if (!Number.isFinite(y)) return 0;

    // 饱和平台
    if (y >= 90) return 25;

    // 下限保护（可以按你实际业务调）
    if (y <= 0) return 0;

    return Math.exp((y - 38.2932) / 15.76) - 0.088;
}

module.exports = {
    hand,
    jqbed,
    endiSit,
    endiBack,
    endiSit1024,
    endiBack1024,
    backYToX,
    sitYToX
}