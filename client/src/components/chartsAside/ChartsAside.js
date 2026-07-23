import React, { useEffect, useRef, useState } from 'react'
import Drawer from '../Drawer/Drawer'

import * as echarts from "echarts";
import { Scheduler } from '../../scheduler/scheduler';
import './index.scss'
import { useTranslation, withTranslation } from 'react-i18next';
import { pointConfig } from '../../util/constant';
import { getSysType } from '../../store/equipStore';

function ChartsAside(props) {

    const pressColorArr = { back: '#8AC287', sit: '#5D65FF' }
    const areaColorArr = { back: '#8AC287', sit: '#5D65FF' }

    const [show, setShow] = useState(true)

    const myChart1 = useRef()
    const myChart2 = useRef()

    const [data, setData] = useState({})

    // console.log(props.sitData)


    // useEffect(() => {

    // } , [])

    const initCharts1 = (props) => {
        let series = []
        // if(Object.keys(props.yData).length == 1){
        //     series
        // }
        const keyArr = Object.keys(props.yData)
        let areaStyle, color
        for (let i = 0; i < keyArr.length; i++) {
            const key = keyArr[i]

            if (props.type == 'press') {
                color = Object.values(pressColorArr)[i]
                 if (i == 1) {

                areaStyle = {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(65, 156, 220, 1)' },
                        { offset: 0.4, color: ' rgba(35, 26, 144, 0.29)' },
                        { offset: 1, color: 'rgba(26, 28, 32, 0)' }
                    ])
                }



            } else {
                areaStyle = {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(63, 211, 228, 1)' },
                        { offset: 0.65, color: 'rgba(39, 117, 143, 0.26)' },
                        { offset: 1, color: 'rgba(26, 28, 32, 0)' }
                    ])
                }

                // color = '#2DBCC1'
            }
            } else {
                color = Object.values(areaColorArr)[i]

                 if (i == 1) {

                areaStyle = {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(208, 220, 235, 0.94)' },
                        { offset: 0.4, color: '  rgba(120, 141, 167, 0.28)' },
                        { offset: 1, color: 'rgba(26, 28, 32, 0)' }
                    ])
                }



            } else {
                areaStyle = {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(216, 154, 234, 0.8)' },
                        { offset: 0.65, color: ' rgba(50, 47, 188, 0.29)' },
                        { offset: 1, color: 'rgba(26, 28, 32, 0)' }
                    ])
                }

                // color = '#2DBCC1'
            }
            }

           


            series.push({
                symbol: "none",
                data: props.yData[key],
                type: "line",
                smooth: true,
                color: color,
                // areaStyle: areaStyle
            })
        }

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
                yMax: value,
                type: 'press'
            });
        }
    }

    const handleChartsArea = (arr, value) => {
        if (myChart1.current) {
            initCharts1({
                yData: arr,
                xData: [
                    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
                    20,
                ],
                index: 0 + 1,
                name: "中风",
                myChart: myChart2.current,
                yMax: value,
                type: 'area'
            });
        }
    }

    function renderCharts1() {

        const chartData = props.chartData.current
        const keyArr = Object.keys(chartData)
        let areaObj = {}
        let allArr = []
        if (keyArr.length) {

            const chartData = props.chartData.current
            for (let i = 0; i < keyArr.length; i++) {
                const key = keyArr[i]
                areaObj[key] = chartData[key].pressArr
                allArr = allArr.concat(chartData[key].pressArr)
            }

            const max = Math.max(...allArr)

            handleCharts(areaObj, max + 5000)
        }

        // if (Object.keys(props.chartData.current).length) {
        //     const max = Math.max(...props.chartData.current.bed.pressArr)
        //     handleCharts(props.chartData.current.bed.pressArr, max + 30)
        // }

        // console.log(props.chartData.current.bed.areaArr)
    }

    function renderCharts2() {
        const chartData = props.chartData.current
        const keyArr = Object.keys(chartData)
        let areaObj = {}
        let allArr = []
        if (keyArr.length) {

            const chartData = props.chartData.current
            for (let i = 0; i < keyArr.length; i++) {
                const key = keyArr[i]
                areaObj[key] = chartData[key].areaArr
                allArr = allArr.concat(chartData[key].areaArr)
            }

            const max = Math.max(...allArr)

            handleChartsArea(areaObj, 3200)
        }

        // console.log(props.chartData.current.bed.areaArr)
    }

    function changeData() {
        setData(() => props.chartData.current.bed.data)
    }

    useEffect(() => {


        myChart1.current = echarts.init(document.getElementById(`myChart1`))
        myChart2.current = echarts.init(document.getElementById(`myChart2`))

        Scheduler.onRender(renderCharts1)
        Scheduler.onRender(renderCharts2)

        // const chartData = props.chartData.current
        // const keyArr = Object.keys(chartData)
        // const dataStateObj = {}
        // if (keyArr.length) {
        //     for (let i = 0; i < keyArr.length; i++) {
        //         const key = keyArr[i]
        //         const dataKeyArr = Object.keys(chartData[key].data)
        //         for(let i = 0 ; i < dataKeyArr.length ; i++){
        //             const dataKey = dataKeyArr[i]
        //             if(!dataStateObj[dataKey]) dataStateObj[dataKey] = []
        //             dataStateObj[dataKey] .push(chartData[key].data[dataKey])
        //         }
        //     }
        // }

        console.log(props.chartData.current)
        const system = getSysType()
        Scheduler.onUI(() => setData(() => {    

            const chartData = props.chartData.current
            const keyArr = Object.keys(chartData)
            let dataObj = {}
            let allArr = []
            if (keyArr.length) {

                const chartData = props.chartData.current
                for (let i = 0; i < keyArr.length; i++) {
                    const key = keyArr[i]
                    if (!dataObj[key]) dataObj[key] = {}
                    
                    const widthDistance = pointConfig[system][key].pointWidthDistance
                    const heightDistance = pointConfig[system][key].pointHeightDistance
                    dataObj[key].areaTotal = chartData[key].data.areaTotal * widthDistance * heightDistance
                    dataObj[key].pressTotal = chartData[key].data.pressTotal
                    
                    dataObj[key].pressAver = chartData[key].data.pressAver 
                    dataObj[key].pressMax = chartData[key].data.pressMax
                    dataObj[key].pressMin = chartData[key].data.pressMin
                    dataObj[key].pointTotal = chartData[key].data.areaTotal
                    // allArr = allArr.concat(chartData[key].area)
                }
                // console.log(areaObj)
                // const max = Math.max(...allArr)

                // handleChartsArea(areaObj, max + 30)
            }
            return { ...dataObj, t: Date.now() }
        })
        )


    }, [])

    const { t, i18n } = useTranslation()



    // const dataFromName = {
    //     areaTotal : ''
    // }

    const pressDataArr = ['pressAver', 'pressMax', 'pressMin']
    const areaDataArr = [ 'pointTotal' ,'areaTotal' ,]

    return (
        // <Drawer direction='left' show={show} asideClose setShow={setShow} title={'数据'} >
        <div className='leftChairContent'>
            <div className='chartAndDataContent'>
                <div className="chartTitle">
                    <div className="chartName">
                        {t('pressureCurve')}
                    </div>
                    <div className="chartType">
                        {
                            Object.keys(data).map((a, index) => {
                                if (a != 't') {
                                    return <div className='chartTypeItem'><div className='cirlce' style={{ backgroundColor: pressColorArr[a] }}></div> {t(a)}</div>
                                }
                            })
                        }
                    </div>


                </div>

                <canvas id="myChart1" style={{ height: `7.5rem`, width: '18.35rem', opacity: '0.8' }}></canvas>


                {
                    pressDataArr.map((item) => {
                        return (
                            <div className='chartData'>
                                {t(item)}
                                <div className='chartTypeContent'>{
                                    Object.keys(data).map((a, index) => {
                                        if (a != 't') {
                                            return <div className='chartTypeItem'>

                                                <div className='cirlce' style={{ backgroundColor: pressColorArr[a] }}></div> {(data[a][item]/1).toFixed(2)}Kpa</div>
                                        }
                                    })
                                }</div>
                            </div>
                        )
                    })
                }


            </div>
            {/* <canvas id="myChart2" style={{ height: `${120}px`, width: '100%' }}></canvas>
        
            {
                Object.keys(data).map((a) => {
                    if (a != 't') {
                        return <div style={{ color: '#fff' }}>{a} : {

                            Object.keys(data[a]).map((b, index) => {
                                return <>{b} :  {data[a][b]}</>
                            })

                        }</div>
                    }

                })
            } */}

            <div className='chartAndDataContent'>
                <div className="chartTitle">
                    <div className="chartName">
                        {t('areaCurve')}
                    </div>
                    <div className="chartType">
                        {
                            Object.keys(data).map((a, index) => {
                                if (a != 't') {
                                    return <div className='chartTypeItem'><div className='cirlce' style={{ backgroundColor: areaColorArr[a] }}></div> {t(a)}</div>
                                }
                            })
                        }
                    </div>


                </div>

                <canvas id="myChart2" style={{ height: `7.5rem`, width: '18.35rem', opacity: '0.8' }}></canvas>


                {
                    areaDataArr.map((item) => {
                        return (
                            <div className='chartData'>
                                {t(item)}
                                <div className='chartTypeContent'>{
                                    Object.keys(data).map((a, index) => {
                                        if (a != 't') {
                                            return <div className='chartTypeItem'>

                                                <div className='cirlce' style={{ backgroundColor: areaColorArr[a] }}></div> {data[a][item]}</div>
                                        }
                                    })
                                }</div>
                            </div>
                        )
                    })
                }


            </div>
        </div>
        // </Drawer>
    )
}


export default withTranslation('translation')(ChartsAside)