import { Button, Input } from 'antd'
import axios from 'axios'
import React, { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation, withTranslation } from 'react-i18next'
import Canvas from '../../components/three/canvas copy'
import Bed from '../../components/three/ThreeAndModel'
import Car from '../../components/three/ThreeAndCar'
import Title from '../../components/title/Title'
import TitleVisibilityHotspot from '../../components/title/TitleVisibilityHotspot'
import { useWindowSize } from '../../hooks/useWindowsize'
import ViewSetting from '../../components/viewSetting/ViewSetting'
import ColAndHistory from '../../components/ColAndHistory/ColAndHistory'
// import Num from '../../components/num/Num'
import Num3D from '../../components/num/Num3D'
import NumThree from '../../components/three/NumThreeColor copy 2'
import { SelectionHelper } from '../../components/selectBox/SelectBox'
import Aside from '../../components/aside/Aside'
import { brushInstance } from '../../components/selectBox/newSelecttBox'
import { getsetDisplayStatus, getSettingValue, getStatus, getSysType, useEquipStore } from '../../store/equipStore'
import { pointConfig, systemConfig, systemPointConfig } from '../../util/constant'
import CanvasShow from '../../components/canvasShow/CanvasShow'
import { shallow } from 'zustand/shallow'
import Endi from '../../components/three/ThreeAndCarPoint'
import Endi1 from '../../components/three/ThreeAndCarPoint copy'
import { lengthObj, } from '../../assets/util/constant'
import ChartsAside from '../../components/chartsAside/ChartsAside'
import { Scheduler } from '../../scheduler/scheduler'
import { newRuler } from '../../components/ruler/newRuler'
import NumThres from '../../components/three/NumThres'
import { endiBackPressFn, endiSitPressFn } from '../../util/util'
import AirAside from '../../airComponents/aside/AirAside'
import CarAir from '../../airComponents/three/CarAir'
import SceneAdjustPanel from '../../airComponents/sceneAdjust/SceneAdjustPanel'
import AlgorithmConfigDrawer from '../../airComponents/algorithmConfig/AlgorithmConfigDrawer'
import AirbagAdjustPanel from '../../airComponents/airbagAdjust/AirbagAdjustPanel'
import {
    readStoredAirbagLayout,
    storeAirbagLayout
} from '../../airComponents/airbagAdjust/airbagLayout'
import { useNavigate } from 'react-router-dom'
import {
    CAR_ADAPTIVE_UI_ACTIONS,
    CAR_ADAPTIVE_UI_VIEWS,
    applyCarAdaptiveUiCommand,
    createCarAdaptiveUiReport,
    getCarAdaptiveUiClientId,
    getStoredCarAdaptiveSensorId,
    isCarAdaptiveRemoteController,
    resolveCarAdaptiveUiWebSocketUrl,
    sendCarAdaptiveUiCommand,
    sendCarAdaptiveUiSocketMessage,
    storeCarAdaptiveSensorId
} from '../../util/carAdaptiveUiControl'
import {
    getCarAdaptiveHistoryPlaybackActive,
    shouldFilterCarAdaptiveSingleStream,
    shouldUseCarAdaptiveLiveSnapshot,
    stripCarAdaptiveSingleStreamFields
} from '../../util/carAdaptiveHistoryPlayback'
import {
    connectCarAdaptiveDevice,
    shouldShowCarAdaptiveTitle
} from '../../util/carAdaptiveStartup'

export const pageContext = createContext(null)
const carAdaptiveUiClientId = getCarAdaptiveUiClientId()
const carAdaptiveWsUrl = resolveCarAdaptiveUiWebSocketUrl(carAdaptiveUiClientId)
// const selectHelper = new SelectionHelper(document.body, 'selectBox');
function Test() {

    const { t, i18n } = useTranslation()
    const navigate = useNavigate()

    const [value, setValue] = useState('')
    const [showTitle, setShowTitle] = useState(shouldShowCarAdaptiveTitle())

    /**
     * 通过右上角透明热区切换完整标题栏，不在页面上显示按钮外观。
     */
    const toggleTitle = useCallback(() => {
        setShowTitle((currentValue) => !currentValue)
    }, [])

    const handInput = (e) => {
        const value = e.target.value
        setValue(value)
    }

    const postKey = () => {
        // axios.post('http://localhost:19245/bindKey', {
        //     key : value
        // }).then((res) => {
        //     console.log(res)
        // })
        axios({
            method: 'post',
            url: 'http://localhost:19245/bindKey',
            data: {
                key: value
            }
        })
    }

    useWindowSize()

    const sitDataRef = useRef({})

    
    const algorDataRef = useRef({})
    const handle = useRef({})
    const controlsMode = useRef('algor')
    const algorFeed = useRef({})
    // 当前是否有可展示的气囊状态；接口覆盖时可为 true，但不代表 ECU 已回传。
    const airbagFeedbackOnline = useRef(false)


    const disPlayDataRef = useRef({})
    const chartRef = useRef({})
    const onSitRef = useRef({})
    // const dataRef = useRef({})

    const initialCarAdaptiveSensorId = useRef(getStoredCarAdaptiveSensorId()).current
    const [carAdaptiveSensorId, setCarAdaptiveSensorId] = useState(initialCarAdaptiveSensorId)
    const carAdaptiveSensorIdRef = useRef(initialCarAdaptiveSensorId)
    const carAdaptiveWsRef = useRef(null)
    const carAdaptiveHistoryPlaybackRef = useRef(false)
    const carAdaptiveSensorCacheRef = useRef({ 1: null, 2: null })
    const carAdaptiveDualStreamRef = useRef(false)
    const carAdaptiveRemoteController = useRef(isCarAdaptiveRemoteController()).current
    const carAdaptiveSensorSwitching = false

    /** 清空当前渲染数据，等待下一条双路快照应用目标通道；不会重置后端算法。 */
    const clearCarAdaptiveDisplayData = useCallback(() => {
        const emptySensorData = new Array(144).fill(0)
        sitDataRef.current = { carAir: emptySensorData }
        disPlayDataRef.current = { carAir: emptySensorData }
        algorDataRef.current = {}
        algorFeed.current = {}
        airbagFeedbackOnline.current = false
        handle.current = {}
        controlsMode.current = 'algor'
        onSitRef.current.onSitState = 'outSeat'
        useEquipStore.getState().setDisplayStatus({ carAir: emptySensorData })
    }, [])

    /** 从前端缓存中选择主驾或副驾数据，不向后端发送切换命令。 */
    const selectCarAdaptiveSensor = useCallback((sensorId) => {
        const nextSensorId = Number(sensorId)
        if (![1, 2].includes(nextSensorId) || nextSensorId === carAdaptiveSensorIdRef.current) {
            return false
        }

        carAdaptiveSensorIdRef.current = nextSensorId
        setCarAdaptiveSensorId(nextSensorId)
        storeCarAdaptiveSensorId(nextSensorId)
        clearCarAdaptiveDisplayData()

        sendCarAdaptiveUiSocketMessage(
            carAdaptiveWsRef.current,
            createCarAdaptiveUiReport(
                carAdaptiveUiClientId,
                nextSensorId,
                CAR_ADAPTIVE_UI_VIEWS.MODULE
            )
        )
        return true
    }, [clearCarAdaptiveDisplayData])

    /** iPad 控制模式复用现有主副驾控件，并把本地选择广播给全部显示端。 */
    const selectCarAdaptiveSensorFromUi = useCallback((sensorId) => {
        const changed = selectCarAdaptiveSensor(sensorId)
        if (!changed || !carAdaptiveRemoteController) return changed

        sendCarAdaptiveUiCommand(CAR_ADAPTIVE_UI_ACTIONS.SELECT_SENSOR, sensorId)
            .catch((error) => console.error('[car-adaptive] 远程切换主副驾失败:', error))
        return true
    }, [carAdaptiveRemoteController, selectCarAdaptiveSensor])

    /** iPad 控制模式点击现有品牌标识时广播返回客户主页命令。 */
    const requestCarAdaptiveReturnHome = useCallback(() => {
        if (!carAdaptiveRemoteController) return false

        sendCarAdaptiveUiCommand(CAR_ADAPTIVE_UI_ACTIONS.RETURN_HOME)
            .catch((error) => console.error('[car-adaptive] 远程返回主页失败:', error))
        return true
    }, [carAdaptiveRemoteController])

    /**
     * 每次进入或重新显示汽车自适应页面时执行完整的一键连接流程。
     * connectCarAdaptiveDevice 会合并并发请求，远程命令和可见性恢复同时触发也只连接一次。
     */
    const reconnectCarAdaptiveDevice = useCallback((reason = '进入页面') => {
        return connectCarAdaptiveDevice()
            .then(() => console.info(`[car-adaptive] ${reason}，自动连接完成`))
            .catch((error) => console.error(`[car-adaptive] ${reason}，自动连接失败:`, error))
    }, [])

    useEffect(() => {
        const ws = new WebSocket(carAdaptiveWsUrl);
        carAdaptiveWsRef.current = ws
        ws.onopen = () => {
            // connection opened
            console.info("connect success");
            sendCarAdaptiveUiSocketMessage(
                ws,
                createCarAdaptiveUiReport(
                    carAdaptiveUiClientId,
                    carAdaptiveSensorIdRef.current,
                    CAR_ADAPTIVE_UI_VIEWS.MODULE
                )
            )
        };
        let data = {}
        ws.onmessage = (e) => {

            let incomingMessage
            try {
                incomingMessage = JSON.parse(e.data)
            } catch (_error) {
                return
            }

            if (
                incomingMessage?.carAdaptiveUiCommand?.action ===
                CAR_ADAPTIVE_UI_ACTIONS.OPEN_MODULE
            ) {
                reconnectCarAdaptiveDevice('远程重新打开页面')
            }

            const acknowledgement = applyCarAdaptiveUiCommand(incomingMessage, {
                sensorId: carAdaptiveSensorIdRef.current,
                view: CAR_ADAPTIVE_UI_VIEWS.MODULE,
                navigate,
                onSelectSensor: selectCarAdaptiveSensor
            })
            if (acknowledgement) {
                sendCarAdaptiveUiSocketMessage(ws, acknowledgement)
            }

            let jsonObj = incomingMessage

            carAdaptiveHistoryPlaybackRef.current = getCarAdaptiveHistoryPlaybackActive(
                carAdaptiveHistoryPlaybackRef.current,
                incomingMessage
            )

            if (Array.isArray(incomingMessage.carAdaptiveSensorsData)) {
                carAdaptiveDualStreamRef.current = true
                incomingMessage.carAdaptiveSensorsData.forEach((sensorSnapshot) => {
                    const sensorId = Number(sensorSnapshot?.sensorId)
                    if ([1, 2].includes(sensorId)) {
                        carAdaptiveSensorCacheRef.current[sensorId] = sensorSnapshot
                    }
                })

                const displaySnapshot = carAdaptiveSensorCacheRef.current[carAdaptiveSensorIdRef.current]
                if (
                    displaySnapshot &&
                    shouldUseCarAdaptiveLiveSnapshot(
                        incomingMessage,
                        carAdaptiveHistoryPlaybackRef.current
                    )
                ) {
                    jsonObj = {
                        ...incomingMessage,
                        sitData: displaySnapshot.sitData,
                        algorData: displaySnapshot.algorData,
                        algorFeed: displaySnapshot.algorFeed,
                        feedbackOnline: displaySnapshot.feedbackOnline,
                        airbagDisplayAvailable: displaySnapshot.airbagDisplayAvailable,
                        airbagDisplaySource: displaySnapshot.airbagDisplaySource,
                        airbagDisplayOverride: displaySnapshot.airbagDisplayOverride
                    }
                }
            } else if (shouldFilterCarAdaptiveSingleStream(
                incomingMessage,
                carAdaptiveDualStreamRef.current
            )) {
                jsonObj = stripCarAdaptiveSingleStreamFields(incomingMessage)
            }

            if (jsonObj.sitData) {
                // console.log(jsonObj.sitData.com3.data)
                // const date = new Date().getTime()


                const settingValue = getSettingValue()
                const { filter, backInit, sitInit } = settingValue

                if (Object.keys(jsonObj.sitData).length) {

                    const keyArr = Object.keys(jsonObj.sitData)
                    let arr = {}


                    // 赋矩阵初始值
                    for (let i = 0; i < keyArr.length; i++) {

                        const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]
                        if (!jsonObj.sitData[keyArr[i]].arr) continue
                        arr[key] = jsonObj.sitData[keyArr[i]].arr

                        if (keyArr[i].includes('endi')) {
                            if (key == 'sit') {
                                arr[key] = [...arr[key]].map((a) => {
                                    if (a > 98) {
                                        return 98
                                    } else {
                                        return a
                                    }
                                })
                            } else if (key == 'back') {
                                arr[key] = [...arr[key]].map((a) => {
                                    if (a > 143) {
                                        return 143
                                    } else {
                                        return a
                                    }
                                })
                            }
                        }

                        if (!data[key]) data[key] = {}
                        if (!data[key].areaArr) data[key].areaArr = []
                        if (!data[key].pressArr) data[key].pressArr = []
                        if (!data[key].data) data[key].data = {}




                        const unZeroArr = arr[key].filter((a) => a > 0)

                        const area = unZeroArr.length

                        const pressArr = [...unZeroArr].map((a) => {
                            if (keyArr[i].includes('endi')) {


                                if (key == 'sit') {
                                    return endiSitPressFn(a) / (pointConfig.endi.sit.pointWidthDistance * 0.001 * pointConfig.endi.sit.pointHeightDistance * 0.001) / 1000
                                } else if (key == 'back') {
                                    return endiBackPressFn(a) / (pointConfig.endi.back.pointWidthDistance * 0.001 * pointConfig.endi.back.pointHeightDistance * 0.001) / 1000
                                }
                            } else {
                                return a
                            }
                        })


                        const press = pressArr.reduce((a, b) => a + b, 0)

                        if (data[key].areaArr.length < 20) {
                            data[key].areaArr.push(area)
                        } else {
                            data[key].areaArr.shift()
                            data[key].areaArr.push(area)
                        }

                        if (data[key].pressArr.length < 20) {
                            data[key].pressArr.push(press)
                        } else {
                            data[key].pressArr.shift()
                            data[key].pressArr.push(press)
                        }



                        data[key].data.pressTotal = press
                        data[key].data.areaTotal = area
                        data[key].data.pressMax = Math.max(...pressArr)
                        data[key].data.pressMin = Math.min(...pressArr)
                        data[key].data.pressAver = (press / area).toFixed(2)


                    }

                    chartRef.current = data
                    sitDataRef.current = arr
                    disPlayDataRef.current = sitDataRef.current



                    // 赋值时间戳跟状态
                    let stamp = jsonObj.sitData[keyArr[0]].stamp
                    let cop = jsonObj.sitData[keyArr[0]].cop




                    // 赋值设备在线状态
                    const newObj = {}
                    for (let i = 0; i < keyArr.length; i++) {
                        const key = keyArr[i]
                        newObj[key] = jsonObj.sitData[keyArr[i]].status
                    }
                    useEquipStore.getState().setEquipStatus(newObj)



                    const sysType = getSysType()
                  
                    if (!arr || !keyArr.some((a) => a.includes(sysType))) {
                        return
                    }

                    // useEquipStore.getState().setDisplayStatus(arr);
                    useEquipStore.getState().setEquipStamp(stamp)
                    if (cop) useEquipStore.getState().setEquipCop(cop)
                    // console.log(wsLocalData)

                    const wsLocalData = wsLocalDataRef.current.data
                    const flag = wsLocalDataRef.current.flag


                    let resArr = {}
                    // console.log(arr)

                    for (let i = 0; i < keyArr.length; i++) {
                        const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]

                        if (!arr[key]) continue


                        resArr[key] = [...arr[key]].map((a, index) => {

                            if (!flag || !arr[key]) return a

                            if (a - wsLocalData[key][index] < 0) {
                                return 0
                            } else {
                                return a - wsLocalData[key][index]
                            }
                        })


                        disPlayDataRef.current = resArr
                    }


              


                    if (onSitRef.current?.onSitState == 'outSeat') {
                      
                        for (let i = 0; i < keyArr.length; i++) {
                            const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]

                            if (!arr[key]) continue

                            resArr[key] = new Array(144).fill(0)
                           
                            disPlayDataRef.current = resArr
                        }
                    }

                    if (filter) {
                        for (let i = 0; i < keyArr.length; i++) {
                            const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]

                            if (!arr[key]) continue

                            resArr[key] = resArr[key].map((a) => {
                                if (a < filter) {
                                    return 0
                                } else {
                                    return a
                                }
                            })
                            disPlayDataRef.current = resArr
                        }
                    }

                    if (backInit) {
                        for (let i = 0; i < keyArr.length; i++) {
                            const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]

                            if (!arr[key]) continue

                            const backArr = resArr[key].slice(0, 72)
                            if (backArr.reduce((a, b) => a + b, 0) < backInit) {
                                for (let i = 0; i < 72; i++) {
                                    resArr[key][i] = 0
                                }
                            }


                        }
                        disPlayDataRef.current = resArr
                    }

                    if (sitInit) {
                        for (let i = 0; i < keyArr.length; i++) {
                            const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]

                            if (!arr[key]) continue

                            const sitArr = resArr[key].slice(72, 144)
                            if (sitArr.reduce((a, b) => a + b, 0) < sitInit) {
                                for (let i = 72; i < 144; i++) {
                                    resArr[key][i] = 0
                                }
                            }


                        }
                        disPlayDataRef.current = resArr
                    }



                    // let length = 64
                    // if (systemType != 'bigHand') {
                    //     length = 32
                    // }





                    // if()

                    // 左右翻转数据
                    if (!dataDirection.current.left) {
                        const res = {}

                        for (let i = 0; i < keyArr.length; i++) {
                            const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]

                            res[key] = []
                            // const length = lengthObj[key]

                            const { width, height } = systemPointConfig[keyArr[i]]
                            console.log(width, height)
                            const indexArr = []
                            for (let i = width; i > 0; i--) {
                                indexArr.push(i - 1)
                            }
                            for (let i = 0; i < height; i++) {
                                for (let j = 0; j < indexArr.length; j++) {
                                    const k = indexArr[j]
                                    res[key].push(resArr[key][i * width + k])
                                }
                            }
                        }


                        resArr = res
                    }

                    // const settingValue = getSettingValue()


                    // 上下翻转数据
                    if (!dataDirection.current.up) {
                        const res = {}


                        for (let i = 0; i < keyArr.length; i++) {
                            const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]
                            res[key] = []

                            //  res[key] = []
                            // const length = lengthObj[key]

                            const { width, height } = systemPointConfig[keyArr[i]]

                            // const length = lengthObj[key]
                            const indexArr = []
                            for (let i = height; i > 0; i--) {
                                indexArr.push(i - 1)
                            }
                            for (let i = 0; i < height; i++) {
                                for (let j = 0; j < width; j++) {
                                    const k = indexArr[i]
                                    res[key].push(resArr[key][k * width + j])
                                }
                            }
                        }
                        console.log(res)
                        // for (let i = 0; i < indexArr.length; i++) {
                        //     for (let j = 0; j < length; j++) {
                        //         const k = indexArr[i]
                        //         res.push(resArr[k * length + j])
                        //     }
                        // }
                        resArr = res
                    }
                    disPlayDataRef.current = resArr



                    useEquipStore.getState().setDisplayStatus(resArr);
                } else {
                    useEquipStore.getState().setStatus(new Array(4096).fill(0))
                    useEquipStore.getState().setDisplayStatus(new Array(4096).fill(0))
                }

                if (jsonObj.index != null) {
                    setPlayBack(true)
                    const history = useEquipStore.getState().history
                    const obj = { ...history, index: jsonObj.index, }
                    useEquipStore.getState().setHistoryStatus(obj);
                }

                if (jsonObj.timestamp) {
                    const history = useEquipStore.getState().history
                    const obj = { ...history, timestamp: jsonObj.timestamp, }
                    useEquipStore.getState().setHistoryStatus(obj);
                }
                // console.log(new Date().getTime() - date)
            }

            if (jsonObj.playEnd != null) { }


            if (jsonObj.algorData) {
                
                algorDataRef.current = jsonObj.algorData


                if (['OFF_SEAT', 'RESETTING'].includes(jsonObj.algorData.seat_state)) {
                    onSitRef.current.onSitState = 'outSeat'
                } else {
                    onSitRef.current.onSitState = 'onSeat'
                }

                
            }

            if (jsonObj.algorFeed) {
                algorFeed.current = jsonObj.algorFeed
                controlsMode.current = 'algor'
            }

            if ('airbagDisplayAvailable' in jsonObj) {
                airbagFeedbackOnline.current = Boolean(jsonObj.airbagDisplayAvailable)
            } else if ('feedbackOnline' in jsonObj) {
                airbagFeedbackOnline.current = Boolean(jsonObj.feedbackOnline)
            }

            if (jsonObj.handle) {
                handle.current = jsonObj.handle
                controlsMode.current = 'handle'
            }

        };
        ws.onerror = (e) => {
            // an error occurred
        };
        ws.onclose = (e) => {
            // connection closed
            if (carAdaptiveWsRef.current === ws) carAdaptiveWsRef.current = null
        };

        return () => {
            if (carAdaptiveWsRef.current === ws) carAdaptiveWsRef.current = null
            ws.close()
        }
    }, [navigate, reconnectCarAdaptiveDevice, selectCarAdaptiveSensor])

    useEffect(() => {
        Scheduler.start()
    }, [])

    useEffect(() => {
        reconnectCarAdaptiveDevice('页面启动')
    }, [reconnectCarAdaptiveDevice])

    useEffect(() => {
        let wasHidden = document.visibilityState === 'hidden'

        /** WebView 或浏览器从隐藏状态恢复时重新连接真实串口。 */
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                wasHidden = true
                return
            }
            if (!wasHidden) return

            wasHidden = false
            reconnectCarAdaptiveDevice('页面重新显示')
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [reconnectCarAdaptiveDevice])

    const [sitData, setSitData] = useState([])

    const [playBack, setPlayBack] = useState(false)

    const [equipStatus, setStatus] = useState({ back: 'offline', sit: 'offline', data: new Array(4096).fill(0) })
    const setValueData = localStorage.getItem('setValueData') ? JSON.parse(localStorage.getItem('setValueData')) : { gauss: 1, color: 200, filter: 1, height: 1, coherent: 1 }
    const [settingValue, setSettingValue] = useState(setValueData)
    const [selectArr, setSelectArr] = useState([])
    const [wsLocalData, setWsLocalData] = useState(new Array(4096).fill(0))
    const wsLocalDataRef = useRef({ data: new Array(4096).fill(0), flag: false })
    const dataDirection = useRef({
        left: true,
        up: true
    })

    const changeDataDirection = (dir) => {
        const { left, up } = dataDirection.current
        if (dir == 'left') {
            dataDirection.current.left = !left
        } else {
            dataDirection.current.up = !up
        }
    }

    const changeWsLocalData = () => {
        const data = getsetDisplayStatus()
        console.log(sitDataRef.current, 'sitDataRef.current')
        wsLocalDataRef.current.data = sitDataRef.current
        wsLocalDataRef.current.flag = !wsLocalDataRef.current.flag
    }

    const [display, setDisplay] = useState('point3D')
    const [col, setDisCol] = useState(false)
    // const display = useEquipStore(s => s.display, shallow); 

    const threeRef = useRef()
    const setting = useRef()
    // const [systemType, setSystemType] = useState('bed')
    // const [systemTypeArr, setSystemTypeArr] = useState([])

    // const systemType = useEquipStore.getState().systemType

    const systemType = useEquipStore(s => s.systemType, shallow);
    // const systemType = 'car'
    useLayoutEffect(() => {
        const { setSystemType, setSystemTypeArr } = useEquipStore.getState()
        axios.get('http://localhost:19245/getSystem', {}).then((res) => {


            console.log(res)
            const result = (res.data.data)
            const type = result.value
            const typeArr = result.typeArr
            const optimalObj = result.optimalObj
            const maxObj = result.maxObj
            setSystemType(type)

            useEquipStore.getState().setSettingValue(optimalObj[type])
            useEquipStore.getState().setSettingValueMax(maxObj[type])
            useEquipStore.getState().setSettingValueOptimal(optimalObj[type])

            if (typeArr) {
                try {
                    const selectArr = typeArr.map((a) => {
                        return {
                            label: t(a),
                            value: a
                        }
                    })
                    setSystemTypeArr(selectArr)
                } catch (e) {

                }

            }
            // setSystemTypeArr()
        })
    }, [])


    function changeViewProp(value) {
        console.log(value, setting)
        // setting.current?.changeViewProp(value)
        setShowProp(value)
    }

    const handleChangeViewProp = useCallback((value) => {
        console.log(value, setting)
        // setting.current?.changeViewProp(value)
        setShowProp(value)
    }, [])


    const threeComponentObj = {
        bigHand: <Canvas ref={threeRef} sitnum1={64} sitnum2={64} />,
        bed: <Bed sitData={disPlayDataRef} changeViewProp={handleChangeViewProp} type={'bed'} ref={threeRef} sitnum1={32} sitnum2={32} />,
        hand: <Canvas changeViewProp={handleChangeViewProp} ref={threeRef} sitnum1={32} sitnum2={32} positionInfo={[-40, 0, -60]} />,
        foot: <Canvas ref={threeRef} sitnum1={32} sitnum2={32} positionInfo={[-40, 0, -60]} />,
        // endi: <Car changeViewProp={handleChangeViewProp} type={'bed'} ref={threeRef} sitnum1={32} sitnum2={32} />,
        car: <Endi
            sitData={disPlayDataRef}
            changeViewProp={handleChangeViewProp}
            ref={threeRef}
            backConfig={{ sitnum1: 32, sitnum2: 32, sitInterp: 4, sitInterp1: 2, sitOrder: 3 }}
            sitConfig={{ sitnum1: 32, sitnum2: 32, sitInterp: 2, sitInterp1: 2, sitOrder: 3 }}
        />,
        // endi: <Endi1 sitData={disPlayDataRef} changeViewProp={handleChangeViewProp} ref={threeRef}
        //     backConfig={{ sitnum1: 64, sitnum2: 50, sitInterp: 2, sitInterp1: 2, sitOrder: 3 }}
        //     sitConfig={{ sitnum1: 45, sitnum2: 45, sitInterp: 2, sitInterp1: 2, sitOrder: 3 }}
        // />

        endi: <Endi1 sitData={disPlayDataRef} changeViewProp={handleChangeViewProp} ref={threeRef}
            backConfig={{ sitnum1: 64, sitnum2: 50, sitInterp: 2, sitInterp1: 2, sitOrder: 3 }}
            sitConfig={{ sitnum1: 46, sitnum2: 46, sitInterp: 2, sitInterp1: 2, sitOrder: 3 }}
        />
    }

    const numComponentObj = {
        bigHand: <NumThree size={64} sitData={disPlayDataRef} />,
        bed: <NumThree size={32} sitData={disPlayDataRef} />,
        hand: <NumThree size={32} sitData={disPlayDataRef} />,
        foot: <NumThree size={32} sitData={disPlayDataRef} />,
        car: <NumThree size={32} sitData={disPlayDataRef} />,
        endi: <NumThree size={64} sitData={disPlayDataRef} />,
    }

    const num3DComponentObj = {
        bigHand: <Num3D sitData={disPlayDataRef} />,
        bed: <Num3D sitData={disPlayDataRef} />,
        hand: <Num3D sitData={disPlayDataRef} />,
        foot: <Num3D sitData={disPlayDataRef} />,
        car: <Num3D sitData={disPlayDataRef} />,
    }

    const [showProp, setShowProp] = useState(100)

    const [displayType, setDisplayType] = useState('back2D')

    const [onRuler, setOnRuler] = useState(false)

    const [titleDisplay, setTitleDisplay] = useState(false)
    const [sceneAdjustOpen, setSceneAdjustOpen] = useState(false)
    const [algorithmConfigOpen, setAlgorithmConfigOpen] = useState(false)
    const [airbagAdjustOpen, setAirbagAdjustOpen] = useState(false)
    const [airbagLayout, setAirbagLayout] = useState(readStoredAirbagLayout)

    /** 更新并持久化区域调节中的左右对称气囊位置。 */
    const changeAirbagLayout = useCallback((nextLayout) => {
        setAirbagLayout(nextLayout)
        storeAirbagLayout(nextLayout)
    }, [])

    return (

        <div className='system'>
            <pageContext.Provider value={{
                equipStatus,
                settingValue,
                setSettingValue,
                selectArr,
                setSelectArr,
                brushInstance,
                changeWsLocalData,
                wsLocalData,
                changeDataDirection,
                setDisplay,
                display,
                newRuler,
                setDisCol,
                col,
                titleDisplay, setTitleDisplay,
                sceneAdjustOpen, setSceneAdjustOpen,
                algorithmConfigOpen, setAlgorithmConfigOpen,
                airbagAdjustOpen, setAirbagAdjustOpen,
                carAdaptiveSensorId,
                carAdaptiveSensorSwitching,
                carAdaptiveRemoteController,
                requestCarAdaptiveReturnHome,
                selectCarAdaptiveSensor: selectCarAdaptiveSensorFromUi,
                systemType,
                setDisplayType,
                displayType,
                onRuler, setOnRuler
            }} >
                <TitleVisibilityHotspot
                    visible={showTitle}
                    onToggle={toggleTitle}
                />
                {showTitle ? <Title /> : null}
                <AirAside 
                
                algorDataRef={algorDataRef}
                algorFeed={algorFeed}
                airbagFeedbackOnline={airbagFeedbackOnline}
                handle={handle}
                controlsMode={controlsMode}
                airbagLayout={airbagLayout}
                />
                <CarAir
                    sitData={disPlayDataRef}
                    sensorId={carAdaptiveSensorId}
                    changeViewProp={handleChangeViewProp}
                    ref={threeRef}
                    backConfig={{ sitnum1: 32, sitnum2: 32, sitInterp: 4, sitInterp1: 2, sitOrder: 3 }}
                    sitConfig={{ sitnum1: 32, sitnum2: 32, sitInterp: 2, sitInterp1: 2, sitOrder: 3 }}
                />
                <SceneAdjustPanel
                    sceneRef={threeRef}
                    open={sceneAdjustOpen}
                    onOpenChange={setSceneAdjustOpen}
                    showTrigger={false}
                />
                <AlgorithmConfigDrawer
                    open={algorithmConfigOpen}
                    onOpenChange={setAlgorithmConfigOpen}
                    showTrigger={false}
                />
                <AirbagAdjustPanel
                    layout={airbagLayout}
                    onLayoutChange={changeAirbagLayout}
                    open={airbagAdjustOpen}
                    onOpenChange={setAirbagAdjustOpen}
                    showTrigger={false}
                />
                {/* <ViewSetting showProp={showProp} setShowProp={setShowProp} three={threeRef} /> */}
                {col ? <ColAndHistory playBack={playBack} sensorId={carAdaptiveSensorId} /> : ''}
                {/* <Canvas /> 
                {/* <Num /> */}
                {/* <Aside /> */}
                {/* <ChartsAside sitData={disPlayDataRef} chartData={chartRef} /> */}
                {/* <CanvasShow /> */}


                {/* {display == 'num' ?

                    // numComponentObj[systemType]
                    <NumThres sitData={disPlayDataRef} displayType={displayType} />
                    : display == 'point3D' ? threeComponentObj[systemType] : num3DComponentObj[systemType]} */}



            </pageContext.Provider>
        </div>
    )
}



export default withTranslation('translation')(Test)
