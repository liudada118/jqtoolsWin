import React, { useEffect, useState } from 'react'
import './index.scss'
import AsideTitle from './asideTitle/AsideTitle'
import seatImg from '../../assets/image/seat.png'
// import outSeat from '../../assets/image/icon/outSeat.png'
import seatSvg from '../../assets/image/seatIcon.png'
import onselect from '../../assets/image/onselect.png'


import unmassage from '../../assets/image/unmassage.png'
import onmassage from '../../assets/image/onmassage.png'

import unadmit from '../../assets/image/unadmit.png'
import onadmit from '../../assets/image/onadmit.png'
import unadmitText from '../../assets/image/unadmitText.png'
import onadmitText from '../../assets/image/onadmitText.png'

import unchild from '../../assets/image/unchild.png'
import onchild from '../../assets/image/onchild.png'
import unchildText from '../../assets/image/unchildText.png'
import onchildText from '../../assets/image/onchildText.png'

import unoutseat from '../../assets/image/unoutseat.png'
import onoutseat from '../../assets/image/onoutseat.png'
import unoutseatText from '../../assets/image/unoutseatText.png'
import onoutseatText from '../../assets/image/onoutseatText.png'

import unthing from '../../assets/image/unthing.png'
import onthing from '../../assets/image/onthing.png'
import unthingText from '../../assets/image/unthingText.png'
import onthingText from '../../assets/image/onthingText.png'

import unonseat from '../../assets/image/unonseat.png'
import ononseat from '../../assets/image/ononseat.png'
import unonseatText from '../../assets/image/unonseatText.png'
import ononseatText from '../../assets/image/ononseatText.png'

import { Scheduler } from '../../scheduler/scheduler'
import { createDefaultAirbagLayout } from '../airbagAdjust/airbagLayout'
import {
    AIRBAG_DISPLAY_MODES,
    DEFAULT_AIRBAG_DISPLAY_MODE,
    areAirAsideDisplayDataEqual,
    createAirAsideDisplayData,
    retainAirAsideOccupantState,
} from './airAsideDisplayData'

const FALLBACK_AIRBAG_LAYOUT = createDefaultAirbagLayout()
const SAFETY_ITEMS = [
    { onIcon: onchild, unIcon: unchild, onText: onchildText, unText: unchildText, name: '儿童' },
    { onIcon: onadmit, unIcon: unadmit, onText: onadmitText, unText: unadmitText, name: '成人' },
    { onIcon: onthing, unIcon: unthing, onText: onthingText, unText: unthingText, name: '物品' },
]
const SEAT_STATUS_ITEMS = [
    { onIcon: ononseat, unIcon: unonseat, onText: ononseatText, unText: unonseatText, name: '在座' },
    { onIcon: onoutseat, unIcon: unoutseat, onText: onoutseatText, unText: unoutseatText, name: '离座' },
]

/**
 * 同时保留选中和未选中图片，避免 WebView2 在高负载时切换 src 出现短暂空白。
 */
function StatusAsset({ active, activeSource, inactiveSource }) {
    return (
        <span className="statusAsset" aria-hidden="true">
            <img
                className={active ? '' : 'isVisible'}
                src={inactiveSource}
                alt=""
                loading="eager"
                decoding="sync"
                draggable="false"
            />
            <img
                className={active ? 'isVisible' : ''}
                src={activeSource}
                alt=""
                loading="eager"
                decoding="sync"
                draggable="false"
            />
        </span>
    )
}

export default function AirAside(props) {
    const airArr = props.airbagLayout || FALLBACK_AIRBAG_LAYOUT

    const [data, setData] = useState({})
    const airbagDisplayMode = props.airbagDisplayMode || DEFAULT_AIRBAG_DISPLAY_MODE
    useEffect(() => {
        return Scheduler.onUI(() => setData((currentData) => {
            const chartData = props.algorDataRef.current
            const algorFeed = props.algorFeed.current
            const handle = props.handle.current
            const controlsMode = props.controlsMode.current

            const nextData = createAirAsideDisplayData({
                chartData,
                algorFeed,
                handle,
                controlsMode,
                feedbackOnline: props.airbagFeedbackOnline?.current,
            })
            const stableData = retainAirAsideOccupantState(currentData, nextData)
            return areAirAsideDisplayDataEqual(currentData, stableData)
                ? currentData
                : stableData
        }))
    }, [])

    const pyObj = {
        '大人': '成人',
        '小孩': '儿童',
        '静物': '物品',

        "OFF_SEAT": '离座',
        "CUSHION_ONLY": '在座',
        "ADAPTIVE_LOCKED": '在座',
        "RESETTING": '离座',
        "未启用": '',
    }

    function body_typeFn(value) {
        if (pyObj[value]) {
            return pyObj[value]
        } else {
            return value
        }
    }

    const isAlgorithmDisplay = airbagDisplayMode === AIRBAG_DISPLAY_MODES.ALGORITHM
    const displayedAirbagCommand = isAlgorithmDisplay ? data.control_command : data.controlFeed
    const displayedAirbagDataAvailable = isAlgorithmDisplay
        ? data.algorithmCommandAvailable
        : data.feedbackOnline
    const unavailableMessage = isAlgorithmDisplay
        ? '等待算法控制指令'
        : '未收到气囊状态回传'

    return (
        <div className='airAsideContent pf'>



            {/* AirAside */}
            <div className="asideContent">
                <div className="leftContent">
                    <div className="safetyContent asideItem">
                        {/* <div className="asideTitle"></div> */}
                        <AsideTitle icon={<i className='iconfont'>&#xe671;</i>} title={'安全分级'} />
                        <div className='safetyItemsContent asideIconContent'>
                            {
                                SAFETY_ITEMS.map((a) => {
                                    const active = body_typeFn(data.body_type) === a.name
                                    return (
                                        <div key={a.name} className='safetyItem' style={{ color: active ? '#B1B5ED' : '#484A5D' }}>
                                            <div style={{ marginBottom: '0.75rem' }} className={`${active ? 'onSelectIcon' : 'unSelectIcon'} selectIcon`}>
                                                <StatusAsset active={active} activeSource={a.onIcon} inactiveSource={a.unIcon} />
                                            </div>
                                            <div className='asideselectContent' >
                                                <img style={{ width: '100%', opacity: active ? 1 : 0 }} src={onselect} alt="" />
                                            </div>
                                            <div className='selectName'>
                                                <StatusAsset active={active} activeSource={a.onText} inactiveSource={a.unText} />
                                            </div>

                                        </div>
                                    )
                                })
                            }
                        </div>
                    </div>
                    <div style={{ height: '20px' }}></div>
                    <div className="seatStatusContent asideItem">
                        <AsideTitle icon={<img className='iconfont' src={seatSvg} style={{ height: '1.25rem' }} alt="" />} title={'座椅状态'} />
                        <div className='asideIconContent'>
                            {
                                SEAT_STATUS_ITEMS.map((a) => {
                                    const active = body_typeFn(data.seat_state) === a.name
                                    return (
                                        <div key={a.name} className='safetyItem' style={{ color: active ? '#B1B5ED' : '#484A5D' }}>
                                            <div style={{ marginBottom: '0.75rem' }} className={`${active ? 'onSelectIcon' : 'unSelectIcon'} selectIcon`}>
                                                <StatusAsset active={active} activeSource={a.onIcon} inactiveSource={a.unIcon} />
                                            </div>
                                            <div className='asideselectContent' >
                                                <img style={{ width: '100%', opacity: active ? 1 : 0 }} src={onselect} alt="" />
                                            </div>
                                            <div className='selectName'>
                                                <StatusAsset active={active} activeSource={a.onText} inactiveSource={a.unText} />
                                            </div>
                                        </div>
                                    )
                                })
                            }
                        </div>
                    </div>
                </div>

                <div className="rightContent">
                    {/* <div className="safetyContent asideItem"> */}
                    {/* <div className="asideTitle"></div> */}
                    <div className='asideItem' style={{
                        background: `src(${seatImg})no-repeat center center`
                    }}>

                        <div className='airbagAsideHeader'>
                            <AsideTitle icon={<i className='iconfont'>&#xe66a;</i>} title={'区域调节'} />
                        </div>
                        {!displayedAirbagDataAvailable && (
                            <div className='airbagFeedbackNotice'>
                                <i className='iconfont'>&#xe6a6;</i>
                                <span>{unavailableMessage}</span>
                            </div>
                        )}
                        <div className='imgContent'>
                            <div className={`airbagSeatCanvas${!displayedAirbagDataAvailable ? ' isFeedbackOffline' : ''}`}>
                                <img src={seatImg} alt="" />
                                {
                                    airArr.map((a, index) => {

                                        const command = displayedAirbagCommand
                                        const gear = Number(command?.[index]) || 0
                                        const airbagAttributes = {
                                            'data-airbag-id': index + 1,
                                            'data-airbag-gear': gear,
                                            title: `${index + 1} 号气囊：${isAlgorithmDisplay ? '算法指令' : '当前状态'} ${gear} 档`,
                                        }
                                        if (a.type === 'circle') {
                                            return <div {...airbagAttributes} key={`airbag-${index}`} className={`circleAir ${gear === 3 ? 'onCircleAir' : ''}`} style={{ position: 'absolute', width: `${a.width}%`, top: `${a.top}%`, left: `${a.left}%`, }}>
                                                {/* <div className='circleAirItem'></div> */}
                                                <img src={gear === 3 ? onmassage : unmassage} alt="" />
                                            </div>

                                        } else {

                                            if (index === 6) {
                                                return <div {...airbagAttributes} key={`airbag-${index}`} className={`leftRectAir ${gear === 3 ? 'onRectAir' : ''}`} style={{ position: 'absolute', width: `${a.width}%`, height: `${a.height}%`, top: `${a.top}%`, left: `${a.left}%`, }}>
                                                    <div className='leftTopRectAir leftRectAirItem'></div>
                                                    <div className='leftBottomRectAir leftRectAirItem'></div>
                                                </div>
                                            } else if (index === 7) {
                                                return <div {...airbagAttributes} key={`airbag-${index}`} className={`rightRectAir ${gear === 3 ? 'onRectAir' : ''}`} style={{ position: 'absolute', width: `${a.width}%`, height: `${a.height}%`, top: `${a.top}%`, left: `${a.left}%`, }}>
                                                    <div className='rightTopRectAir rightRectAirItem'></div>
                                                    <div className='rightBottomRectAir rightRectAirItem'></div>
                                                </div>
                                            } else {
                                                return <div {...airbagAttributes} key={`airbag-${index}`} className={`rectAir ${gear === 3 ? 'onRectAir' : ''}`} style={{ position: 'absolute', width: `${a.width}%`, height: `${a.height}%`, top: `${a.top}%`, left: `${a.left}%`, }}></div>

                                            }
                                        }
                                    })
                                }
                            </div>
                        </div>


                    </div>
                    {/* </div> */}
                </div>
            </div>
        </div>
    )
}
