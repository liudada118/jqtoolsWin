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

function arrToRealLine(arr, arrX, arrY) {
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
            newArr.push(arr[realXCoo * 64 + realYCoo])
        }
    }

    return newArr
}

function endiSit(arr) {
    let arrX = [[22, 0], [23, 44]]
    let arrY = [[1, 32], 0, [63, 63 - 11]]
    return arrToRealLine(arr, arrX, arrY)
}

function endiBack(arr) {
    let arrX = [[14, 63]]
    let arrY = [[0, 63]]
    return arrToRealLine(arr, arrX, arrY)
}
// endiSit()


module.exports = {
    hand,
    jqbed,
    endiSit,
    endiBack
}