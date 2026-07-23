import React, { useEffect, useRef, useState } from 'react'
import './index.scss'
import * as echarts from "echarts";
import { Scheduler } from '../../../scheduler/scheduler';

const nameObj = {
    aver: '平均压力',
    max: '最大压力',
    press: '压力总和',
    aver: '点数'
}

export default function ChartAndData(props) {
    const { lineArr, data } = props
    const myChart1 = useRef()
    const myChart2 = useRef()
    const [uidata, setData] = useState({})
    const series = []

    for (let i = 0; i < Object.keys(lineArr).length; i++) {
        const key = Object.keys(lineArr)[i]
        const arr = lineArr[key]
        console.log(arr)
        series.push({
            symbol: "none",
            data: arr,
            type: "line",
            smooth: true,
            color: "#1FA7FC",
            areaStyle: {
                // 阴影/渐变填充
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(65,156,220 , 1)' }, // 上方浅
                    { offset: 0.65, color: 'rgba(59,26,144,0.29)' },
                    { offset: 1, color: 'rgba(26,28,32,0)' }  // 下方透明
                ])
            }
        },)
    }

    const initCharts1 = (props) => {




        let option = {
            animation: false,
            // tooltip: {
            //   trigger: "axis",
            //   show: "true",
            // },
            grid: {
                x: 10,
                x2: 10,
                y: 10,
                y2: 10,
            },
            xAxis: {
                type: "category",
                show: false,
                splitLine: {
                    show: false,

                },
                data: props.xData,
                axisLabel: {
                    show: false,

                },
            },

            yAxis: {
                type: "value",
                show: false,
                splitLine: {
                    show: false,
                },
                max: props.yMax,
                axisLabel: {
                    show: false,

                },
            },
            series: series


            // [
            //     {
            //         symbol: "none",
            //         data: props.yData,
            //         type: "line",
            //         smooth: true,
            //         color: "#1FA7FC",
            //         areaStyle: {
            //             // 阴影/渐变填充
            //             color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            //                 { offset: 0, color: 'rgba(65,156,220 , 1)' }, // 上方浅
            //                 { offset: 0.65, color: 'rgba(59,26,144,0.29)' },
            //                 { offset: 1, color: 'rgba(26,28,32,0)' }  // 下方透明
            //             ])
            //         }
            //     },

            // ],
        };
        option && props.myChart.setOption(option);

    };

    const handleCharts = (arr, value) => {

        if (myChart1.current) {

            initCharts1({
                yData: arr,
                xData: [
                    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
                    20,
                ],
                index: 0 + 1,
                name: "中风",
                myChart: myChart1.current,
                yMax: value
            });
        }
    }

    function renderCharts1() {
        // if (Object.keys(props.chartData.current).length) {
        // const max = Math.max(...props.chartData.current.bed.pressArr)
        console.log(lineArr)
        handleCharts(lineArr, 1000)
        // }
    }

    useEffect(() => {
        // myChart1.current = echarts.init(document.getElementById(`myChart1`))
        // myChart2.current = echarts.init(document.getElementById(`myChart2`))

        myChart1.current = echarts.init(echartsRef.current)

        Scheduler.onRender(renderCharts1)
        // Scheduler.onRender(renderCharts2)

        Scheduler.onUI(() => setData(() => { return { ...data, t: Date.now() } }))


    }, [])

    const echartsRef = useRef()

    return (
        <div className='chartAndDataContent'>
            <canvas ref={echartsRef} id="myChart1" style={{ height: `${300}px`, width: '100%', opacity: "0.8" }}></canvas>
            {
                Object.keys(uidata).map((a, index) => {
                    return (
                        <div>
                            {nameObj[a]} : {uidata[a]}
                        </div>
                    )
                })
            }
        </div>
    )
}
