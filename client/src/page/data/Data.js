import React from 'react'


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

function jqbedOppo(arr) {
    let wsPointData = [...arr];

    let b = wsPointData.splice(0, 17 * 32);

    wsPointData = wsPointData.concat(b);

    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 32; j++) {
            [wsPointData[i * 32 + j], wsPointData[(14 - i) * 32 + j]] = [
                wsPointData[(14 - i) * 32 + j],
                wsPointData[i * 32 + j],
            ];
        }
    }

    return wsPointData
}



export default function Data() {



    let arr = []

    for (let i = 0; i < 32; i++) {
        for (let j = 0; j < 32; j++) {
            arr.push(i * 32 + j)
        }
    }

    arr = jqbed(arr)
    arr = jqbedOppo(arr)
    console.log(arr)

    const resArr = []
    for (let i = 0; i < 32; i++) {
        resArr[i] = []
        for (let j = 0; j < 32; j++) {
            resArr[i].push(arr[i * 32 + j])
        }
    }

    return (
        <div>
            {
                resArr.map((a) => {
                    return <div style={{ display: 'flex' }}>
                        {
                            a.map((b) => {
                                return <div style={{ width: 40 }}>{b}</div>
                            })
                        }
                    </div>
                })
            }
        </div>
    )
}
