import { Dropdown, Slider, Select, message, Popover } from 'antd'
import axios from 'axios'
import React, { useEffect, useState } from 'react'
import { useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow';
import { withTranslation } from 'react-i18next';
import dayjs from 'dayjs';
// import Select from '../select/Select';

const multArr = ["0.5", "1.0", "2.0", "4.0", "8.0"]


// const playOptions = [
//     {
//         value: 0.25,
//         label: "0.25X",
//     },
//     {
//         value: 0.5,
//         label: "0.5X",
//     },
//     {
//         value: 1,
//         label: "1.0X",
//     },
//     {
//         value: 1.5,
//         label: "1.5X",
//     },
//     {
//         value: 2,
//         label: "2.0X",
//     },
// ]
const playOptions = multArr.map((a, index) => {
    return {
        value: a,
        label: `${a}X`
    }
})



function DataPlay(props) {
    const { t, i18n } = props;
    const { dataLength, name } = props
    const [dataPlay, setDataPlay] = useState(true)
    // const data = useEquipStore.getState().history
    // console.log(data)

    useEffect(() => {

        const unsub = useEquipStore.subscribe(
            s => s.history,                                  // 选择器
            (status, prev) => {
                console.log(status, prev, 'useEquipStore')
            },   // 监听函数
            { fireImmediately: true }                       // 可选：立刻触发一次
            // 也可加 { equalityFn: shallow } 做浅比较
        );
        return unsub;

    }, []);

    // useEffect(() => {})


    const history = useEquipStore(s => s.history, shallow);
    // setIndex(history.index)
    // console.log(history)

    // console.log(dataLength - 1, history.index)
    // setDataPlay(true)

    useEffect(() => {
     
        if (dataLength - 1 == history.index) {
            setDataPlay(true)
        }
    },[history.index])

    const [index, setIndex] = useState(0)

    const [defaultProp, setDefaultProp] = useState('1.0')

    const changeViewContent = <div>{
        multArr.map((a) => {
            return <div className='cursor' style={{ color: defaultProp == a ? '#0072EF' : '#E6EBF0', fontWeight: 500, padding: '4px  2px' }} onClick={() => {
                setDefaultProp(a)
                axios({
                    method: 'post',
                    url: 'http://localhost:19245/changeDbplaySpeed',
                    data: {
                        speed: Number(a),
                    }
                })
            }}>{`${a}X`}</div>
        })
    }</div>



    return (
        <>
            <div className="colDate">{name}</div>
            <div className="playContent">
                <Slider defaultValue={0} value={history?.index} onChange={(e) => {
                    // setIndex(e)

                    axios({
                        method: 'post',
                        url: 'http://localhost:19245/getDbHistoryIndex',
                        data: {
                            index: e,
                        }

                    }).then((res) => {
                        if (res.data.message == 'error') {
                            message.error(res.data.data)
                        } else {
                            const history = useEquipStore.getState().history
                            const obj = { ...history, index: e, }
                            useEquipStore.getState().setHistoryStatus(obj);
                        }
                    })
                }} max={dataLength - 1} />
                <div className='playControl'>
                    <div className="playLeftContent">
                        <div className="playOrStop">
                            {dataPlay ? <i className='iconfont cursor' onClick={() => {
                                axios({
                                    method: 'post',
                                    url: 'http://localhost:19245/getDbHistoryPlay',

                                }).then((res) => {
                                    console.log(res)

                                    if (res.data.message == 'error') {
                                        message.error(res.data.data)
                                        return
                                    }
                                    setDataPlay(false)
                                })
                            }}>&#xe634;</i> :
                                <i className='iconfont cursor' onClick={() => {
                                    axios({
                                        method: 'post',
                                        url: 'http://localhost:19245/getDbHistoryStop',

                                    }).then((res) => {
                                        console.log(res)
                                        setDataPlay(true)
                                    })
                                }}>&#xe635;</i>
                            }
                        </div>

                        <div className="playStamp">{history.timestamp ? dayjs(history.timestamp).format('YYYY-MM-DD HH:mm:ss') : ''}</div>
                    </div>

                    <div className="playRightContent">
                        <div className='playSpeed cursor'>
                            {/* <Select defaultValue="1.0X"
                                style={{
                                    width: 80,
                                }}
                                onChange={(e) => {
                                    axios({
                                        method: 'post',
                                        url: 'http://localhost:19245/changeDbplaySpeed',
                                        data: {
                                            speed: e,
                                        }
                                    })
                                }}
                                placement={"topLeft"}
                                options={playOptions}
                            /> */}
                            <Popover color='#202327' className='set-popover' placement="top" content={changeViewContent} >
                                <>{defaultProp == '1.0' ? t('speed') : `${defaultProp}X`}</>
                            </Popover>
                        </div>

                        <div className="playHistoryData cursor">{t('history')}</div>
                    </div>
                </div>
            </div>

        </>
    )
}

export default withTranslation('translation')(DataPlay);

