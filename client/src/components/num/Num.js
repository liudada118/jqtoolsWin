import React, { useContext, useEffect, useState } from 'react'
import { pageContext } from '../../page/test/Test';
import { Button } from 'antd';
let oldTime
export default function Num() {
    const pageInfo = useContext(pageContext);
    // console.log(pageInfo.equipStatus.data)
    const wsData = pageInfo.equipStatus.data
    const [data, setData] = useState([])
    useEffect(() => {

        // setInterval(() => {
        //     if (wsData) {
        //         // console.log(wsData)
        //         const res = []
        //         for (let i = 0; i < 64; i++) {
        //             res[i] = []
        //             for (let j = 0; j < 64; j++) {
        //                 res[i].push(wsData[i * 64 + j])
        //             }
        //         }
        //         const date = new Date().getTime()
        //         // setData(() => {
        //         //     console.log(new Date().getTime() - date , 'setState')
        //         //     return res
        //         // })

        //     }
        // }, 33);


        if (wsData) {
            // console.log(wsData)
            let res = []
            for (let i = 0; i < 64; i++) {
                res[i] = []
                let numAll = 0;
                for (let j = 0; j < 64; j++) {
                    numAll += wsData[i * 64 + j]
                    res[i].push(wsData[i * 64 + j])
                }
                res[i].push(numAll)
            }
            const date = new Date().getTime()

            res = [res[20]]
            setData(() => {
                // console.log(new Date().getTime() - oldTime, 'setState')
                oldTime = date
                return res
            })

        }


    }, [pageInfo])

    const [resArr, setResArr] = useState()

    return (
        <div style={{ position: 'fixed', top: '30%' }}>
            {
                data.map((a, index) => {
                    return (
                        <div style={{ display: 'flex', color: '#000' }}>{a.map((b, index) => {
                            return <div style={{ width: '20px' }}>{b}</div>
                        })}</div>
                    )
                })
            }
            {
               resArr ? resArr.map((a, index) => {
                    return (
                        <div style={{ display: 'flex', color: '#000' }}>{a.map((b, index) => {
                            return <div style={{ width: '20px' }}>{b}</div>
                        })}</div>
                    )
                }) : ''
            }
            <Button onClick={() => {

                let arr
                if(resArr){
                    arr = [...resArr]
                }else{
                }
                
                if(arr  && arr.length > 0){
                   
                    const zeroFlag = [...arr[0]]
                    const nowData = [...data[0]]
                    const arr0sum = [...zeroFlag].splice(32,32)
                    const firstArr = [...nowData].splice(0,32)
                    const lastArr = [...nowData].splice(32,32)
                    const firstArrNum = firstArr.filter((a) => a> 0).length
                    const mult = lastArr.reduce((a,b) => a+b , 0) / arr0sum.reduce((a,b) => a+b , 0)
                    console.log(...data , firstArr,lastArr,arr0sum,arr)
                    // const res = 
                    arr.push([...nowData ,mult.toFixed(1) , firstArrNum] )
                }else{
                    arr = []
                    arr.push(...data)
                }
               
                setResArr(arr)
            }}>col</Button>
        </div>
    )
}
