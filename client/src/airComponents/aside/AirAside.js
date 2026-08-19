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
import { createAirAsideDisplayData } from './airAsideDisplayData'

const FALLBACK_AIRBAG_LAYOUT = createDefaultAirbagLayout()

export default function AirAside(props) {

    const feedbackAirIndex = [1, 2, 3, 4, 5, 6, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]

    const airArr = props.airbagLayout || FALLBACK_AIRBAG_LAYOUT

    const safetyArr = [
        {
            onIcon: onchild,
            unIcon: unchild,
            onText: onchildText,
            unText: unchildText,
            name: '儿童'
        },

        {
            onIcon: onadmit,
            unIcon: unadmit,
            onText: onadmitText,
            unText: unadmitText,
            name: '成人'
        },

        {
            onIcon: onthing,
            unIcon: unthing,
            onText: onthingText,
            unText: unthingText,
            name: '物品'
        },

    ]

    const seatStatusArr = [
        {
            onIcon: ononseat,
            unIcon: unonseat,
            onText: ononseatText,
            unText: unonseatText,
            name: '在座'
        },

        {
            onIcon: onoutseat,
            unIcon: unoutseat,
            onText: onoutseatText,
            unText: unoutseatText,
            name: '离座'
        },

    ]

    const [data, setData] = useState({})
    useEffect(() => {
        return Scheduler.onUI(() => setData(() => {
            const chartData = props.algorDataRef.current
            const algorFeed = props.algorFeed.current
            const handle = props.handle.current
            const controlsMode = props.controlsMode.current

            return createAirAsideDisplayData({
                chartData,
                algorFeed,
                handle,
                controlsMode,
                feedbackOnline: props.airbagFeedbackOnline?.current,
            })
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
                                safetyArr.map((a, index) => {
                                    return (
                                        <div className='safetyItem' style={{ color: body_typeFn(data.body_type) == a.name ? '#B1B5ED' : '#484A5D' }}>
                                            <div style={{ marginBottom: '0.75rem' }} className={`${body_typeFn(data.body_type) == a.name ? 'onSelectIcon' : 'unSelectIcon'} selectIcon`}>
                                                <img src={body_typeFn(data.body_type) == a.name ? a.onIcon : a.unIcon} alt="" />
                                            </div>
                                            <div className='asideselectContent' >
                                                <img style={{ width: '100%', opacity: body_typeFn(data.body_type) == a.name ? 1 : 0 }} src={onselect} alt="" />
                                            </div>
                                            <div className='selectName'>
                                                {/* {a.name} */}
                                                <img src={body_typeFn(data.body_type) == a.name ? a.onText : a.unText} alt="" />
                                            </div>

                                        </div>
                                    )
                                })
                            }
                        </div>
                    </div>
                    <div style={{ height: '20px' }}></div>
                    <div className="seatStatusContent asideItem">
                        <AsideTitle icon={<img className='iconfont' src={seatSvg} st style={{ height: '1.25rem' }} />} title={'座椅状态'} />
                        <div className='asideIconContent'>
                            {
                                seatStatusArr.map((a, index) => {
                                    return (
                                        <div className='safetyItem' style={{ color: body_typeFn(data.seat_state) == a.name ? '#B1B5ED' : '#484A5D' }}>
                                            <div style={{ marginBottom: '0.75rem' }} className={`${body_typeFn(data.seat_state) == a.name ? 'onSelectIcon' : 'unSelectIcon'} selectIcon`}>
                                                {/* {a.icon} */}
                                                <img src={body_typeFn(data.seat_state) == a.name ? a.onIcon : a.unIcon} alt="" />
                                            </div>
                                            <div className='asideselectContent' >
                                                <img style={{ width: '100%', opacity: body_typeFn(data.seat_state) == a.name ? 1 : 0 }} src={onselect} alt="" />
                                            </div>
                                            <div className='selectName'>
                                                {/* {a.name} */}
                                                <img src={body_typeFn(data.seat_state) == a.name ? a.onText : a.unText} alt="" />
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

                        <div style={{ position: 'absolute' }}>
                            <AsideTitle icon={<i className='iconfont'>&#xe66a;</i>} title={'区域调节'} />
                        </div>
                        {!data.feedbackOnline && (
                            <div className='airbagFeedbackNotice'>
                                <i className='iconfont'>&#xe6a6;</i>
                                <span>未收到气囊状态回传</span>
                            </div>
                        )}
                        <div className='imgContent'>
                            <div className={`airbagSeatCanvas${!data.feedbackOnline ? ' isFeedbackOffline' : ''}`}>
                                <img src={seatImg} alt="" />
                                {
                                    airArr.map((a, index) => {

                                        const command = data.controlFeed //: data.control_command
                                        if (a.type == 'circle') {
                                            return <div key={`airbag-${index}`} className={`circleAir ${command && command[index] == 3 ? 'onCircleAir' : ''}`} style={{ position: 'absolute', width: `${a.width}%`, top: `${a.top}%`, left: `${a.left}%`, }}>
                                                {/* <div className='circleAirItem'></div> */}
                                                <img src={command && command[index] == 3 ? onmassage : unmassage} alt="" />
                                            </div>

                                        } else {

                                            if (index == 6) {
                                                return <div key={`airbag-${index}`} className={`leftRectAir ${command && command[index] == 3 ? 'onRectAir' : ''}`} style={{ position: 'absolute', width: `${a.width}%`, height: `${a.height}%`, top: `${a.top}%`, left: `${a.left}%`, }}>
                                                    <div className='leftTopRectAir leftRectAirItem'></div>
                                                    <div className='leftBottomRectAir leftRectAirItem'></div>
                                                </div>
                                            } else if (index == 7) {
                                                return <div key={`airbag-${index}`} className={`rightRectAir ${command && command[index] == 3 ? 'onRectAir' : ''}`} style={{ position: 'absolute', width: `${a.width}%`, height: `${a.height}%`, top: `${a.top}%`, left: `${a.left}%`, }}>
                                                    <div className='rightTopRectAir rightRectAirItem'></div>
                                                    <div className='rightBottomRectAir rightRectAirItem'></div>
                                                </div>
                                            } else {
                                                return <div key={`airbag-${index}`} className={` ${'rectAir'} ${command && command[index] == 3 ? 'onRectAir' : ''}`} style={{ position: 'absolute', width: `${a.width}%`, height: `${a.height}%`, top: `${a.top}%`, left: `${a.left}%`, }}></div>

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
