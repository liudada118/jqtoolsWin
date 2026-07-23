import React, { forwardRef, useContext, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import './index.scss'
import { Dropdown, Input, Popover } from 'antd'
import { pageContext } from '../../page/test/Test';
import { withTranslation } from 'react-i18next';
import { getSysType, useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';
import { isMoreMatrix } from '../../assets/util/util';

let xvalue = localStorage.getItem('bedz') ? Number(localStorage.getItem('bedz')) : 0


// export default function ViewSetting(props) {

// }

const DropRight = () => {
    const list = ['靠背', '座椅']
    return
}

const ViewSetting = (props) => {
    const { t, i18n } = props;
    const pageInfo = useContext(pageContext);
    console.log('ViewSetting')
    const { setDisplay, display, setDisplayType, setOnRuler } = pageInfo
    // const display = useEquipStore(s => s.display, shallow);
    // const setDisplay = useEquipStore.getState().setDisplay

    useEffect(() => {
        props.three?.current?.changePointRotation(xvalue)
    }, [])

    const threeViewChange = () => {
     
        xvalue++;
        if (xvalue > 2) {
            xvalue = 0
        }
        props.three?.current?.changePointRotation(xvalue)

    }

    const { showProp, setShowProp } = props



    const subShow = () => {
        if (display == 'point3D') {


            if (showProp > 10) {
                setShowProp(showProp - 10)
                props.three?.current?.changeCamera(showProp - 10)
            }
        }

    }

    const addShow = () => {
        if (display == 'point3D') {
            setShowProp(showProp + 10)
            props.three?.current?.changeCamera(showProp + 10)
        }
    }



    const changeView = () => {

    }

    const [carType, setCarType] = useState('all')
    const carArr = ['all', 'back', 'sit']
    const car2DArr = ['back2D', 'sit2D']
    const car3DArr = ['back3D', 'sit3D']

    const changeCarViewContent = <div style={{ color: '#E6EBF0' }}>
        {
            carArr.map((type, index) => {
                return <div className='cursor' onClick={() => {
                    setCarType(type)
                    if (display != 'point3D') {
                        setDisplay('point3D')
                    }

                    props.three.current?.actionSit(type)
                    useEquipStore.getState().setDisplayType(type);
                     changeAllFun()
                }} style={{ padding: '5px 15px', borderRadius: 3, backgroundColor: carType == type ? '#0072EF' : 'unset' }}>{t(type)}</div>

            })
        }
    </div>

    const changeCar2DViewContent = <div style={{ color: '#E6EBF0' }}>
        {
            car2DArr.map((type, index) => {
                return <div className='cursor' onClick={() => {
                    setCarType(type)
                    if (display != 'num') {
                        setDisplay('num')
                    }


                    // props.three.current?.actionSit(type)
                    useEquipStore.getState().setDisplayType(type);
                    setDisplayType(type)
                    changeAllFun()
                }} style={{ padding: '5px 15px', borderRadius: 3, backgroundColor: carType == type ? '#0072EF' : 'unset' }}>{t(type)}</div>

            })
        }
    </div>

    const changeCar3DNumViewContent = <div style={{ color: '#E6EBF0' }}>
        {
            car3DArr.map((type, index) => {
                return <div className='cursor' onClick={() => {
                    setCarType(type)
                    if (display != 'num3D') {
                        setDisplay('num3D')
                    }
                    props.three.current?.actionSit(type)
                    useEquipStore.getState().setDisplayType(type);
                     changeAllFun()
                }} style={{ padding: '5px 15px', borderRadius: 3, backgroundColor: carType == type ? '#0072EF' : 'unset' }}>{t(type)}</div>

            })
        }
    </div>



    const changeMoreViewContent = <div style={{ color: '#E6EBF0' }}>
        <Popover trigger='click' color='#32373E' placement="right" content={changeCarViewContent}>
            <div className='cursor' onClick={() => {
                setShowProp(100)
                setDisplay('point3D')
                setCarType('all')
                changeAllFun()
            }} style={{ padding: '5px 15px', borderRadius: 3, backgroundColor: display == 'point3D' ? '#0072EF' : 'unset' }}>{t('point3D')}</div></Popover>

        {/* <Popover trigger='click' color='#32373E' placement="right" content={changeCar3DNumViewContent}>
            <div className='cursor' onClick={() => {
                setShowProp(100)
                setDisplay('num3D')
                useEquipStore.getState().setDisplayType('back3D')
                changeAllFun()
                setCarType('back3D')
            }} style={{ padding: '5px 15px', borderRadius: 3, backgroundColor: display == 'num3D' ? '#0072EF' : 'unset' }}>{t('num3D')}</div>
        </Popover> */}
        <Popover trigger='click' color='#32373E' placement="right" content={changeCar2DViewContent}>
            <div className='cursor' onClick={() => {
                setShowProp(100)
                setDisplay('num')
                useEquipStore.getState().setDisplayType('back2D')
                setCarType('back2D')
                changeAllFun()
            }} style={{ padding: '5px 15px', borderRadius: 3, backgroundColor: display == 'num' ? '#0072EF' : 'unset' }}>{t('num2D')}</div>
        </Popover>
    </div>



    const changeViewContent = <div style={{ color: '#E6EBF0' }}>

        <div className='cursor' onClick={() => {
            setShowProp(100)
            setDisplay('point3D')
            changeAllFun()

        }} style={{ padding: '5px 15px', borderRadius: 3, backgroundColor: display == 'point3D' ? '#0072EF' : 'unset' }}>{t('point3D')}</div>


        {/* <div className='cursor' onClick={() => {
            setShowProp(100)
            setDisplay('num3D')
            changeAllFun()
        }} style={{ padding: '5px 15px', borderRadius: 3, backgroundColor: display == 'num3D' ? '#0072EF' : 'unset' }}>{t('num3D')}</div> */}


        <div className='cursor' onClick={() => {
            setShowProp(100)
            setDisplay('num')
            changeAllFun()
        }} style={{ padding: '5px 15px', borderRadius: 3, backgroundColor: display == 'num' ? '#0072EF' : 'unset' }}>{t('num2D')}</div>

    </div>







    // const sysType = getSysType()

    const systemType = useEquipStore(s => s.systemType, shallow);
    const displayType = useEquipStore(s => s.displayType, shallow);

    const reset3D = () => {
        props.three.current?.reset3D()
    }

    const items = [
        {
            key: '1',
            label: '3D模型',

        },
        {
            key: '2',
            label: '3D数字',

        },
        {
            key: '3',
            label: '2D数字',
        },
    ];

    const carItems = [
        {
            key: '1',
            label: '3D模型',
            children: [
                {
                    key: '1-1',
                    label: '整体',
                },
                {
                    key: '1-2',
                    label: '靠背',
                }, {
                    key: '1-3',
                    label: '座椅',
                },
            ],
        },
        {
            key: '2',
            label: '3D数字',
            children: [
                {
                    key: '2-1',
                    label: '靠背',
                }, {
                    key: '2-2',
                    label: '座椅',
                },
            ],
        },
        {
            key: '3',
            label: '2D数字',
            children: [
                {
                    key: '3-1',
                    label: '靠背',
                }, {
                    key: '3-2',
                    label: '座椅',
                },
            ],
        },]

    const changeAllFun = () => {
        setOnRuler(false)
    }

    return (
        <>
            <div className='viewSetContent'>
                <div className="secondContent viewContent1">
                    <Popover color='#32373E' className='set-popover' placement="top" content={<div style={{ color: '#E6EBF0' }} >{t('reset3D')}</div>} >
                        <div className='viewAdjust' style={{ display: 'flex', flexDirection: 'column' }}>
                            <i onClick={reset3D} className='iconfont cursor fs20' >&#xe644;</i>
                            {t('resetView')}
                        </div>
                    </Popover>
                </div>

                <div className="firstContent viewContent">
                    <div className="threeViewSizeAdjust">



                        {/* {display == 'point3D' ? isMoreMatrix(systemType) && !['sit', 'back'].includes(displayType) ?
                            <div  >
                                <i style={{ color: '#606A76' }} className='iconfont cursor fs14'>&#xe632;</i>
                               
                            </div>
                            :
                            <div  >
                                <i className='iconfont cursor fs14' onClick={subShow}>&#xe632;</i>
                               
                            </div> :
                            <div  >
                                <i style={{ color: '#606A76' }} className='iconfont cursor fs14'>&#xe632;</i>
                               
                            </div>
                        } */}

                        <i className='iconfont reduce cursor' onClick={subShow}>&#xe632;</i>
                        {/* <Input value={`${showProp}%`} /> */}
                        <div style={{ padding: '0 0.75rem' }}>{showProp} %</div>


                        {/* {display == 'point3D' ? isMoreMatrix(systemType) && !['sit', 'back'].includes(displayType) ?
                            <div  style={{ marginRight: '1.375rem' }} >
                                <i style={{ color: '#606A76' }} className='iconfont cursor fs14'>&#xe631;</i>
                               
                            </div>
                            :
                            <div  style={{ marginRight: '1.375rem' }} >
                                <i className='iconfont cursor fs14' onClick={addShow}>&#xe631;</i>
                               
                            </div> :
                            <div  style={{ marginRight: '1.375rem' }} >
                                <i style={{ color: '#606A76' }} className='iconfont cursor fs14'>&#xe631;</i>
                               
                            </div>
                        } */}

                        <i className='iconfont add cursor' style={{ marginRight: '1.375rem' }} onClick={addShow}>&#xe631;</i>
                    </div>
                    <Popover color='#32373E' className='set-popover' placement="top" content={<div style={{ color: '#E6EBF0' }} >{t('viewSwitch3D')}</div>} >
                        {display == 'point3D' ? isMoreMatrix(systemType) && !['sit', 'back'].includes(displayType) ?
                            <div className='viewAdjust cursor' style={{ display: 'flex', flexDirection: 'column' }}>
                                <i style={{ color: '#606A76' }} className='iconfont  fs20'>&#xe606;</i>
                                <span>{t('angleAdj')}</span>
                            </div>
                            :
                            <div className='viewAdjust cursor' onClick={threeViewChange} style={{ display: 'flex', flexDirection: 'column' }}>
                                <i className='iconfont  fs20'>&#xe606;</i>
                                <span>{t('angleAdj')}</span>
                            </div> :
                            <div className='viewAdjust cursor' style={{ display: 'flex', flexDirection: 'column' }}>
                                <i style={{ color: '#606A76' }} className='iconfont  fs20'>&#xe606;</i>
                                <span>{t('angleAdj')}</span>
                            </div>
                        }
                    </Popover>

                    {isMoreMatrix(systemType) ? <Popover trigger='click' color='#32373E' className='set-popover' placement="top" content={changeMoreViewContent} >
                        <div className='viewAdjust cursor' style={{ display: 'flex', flexDirection: 'column' }}>
                            <i className='iconfont  fs20' >&#xe645;</i>
                            <span>{t('viewAdj')}</span>
                        </div>
                    </Popover> : <Popover trigger='click' color='#32373E' className='set-popover' placement="top" content={changeViewContent} >
                        <div className='viewAdjust cursor' style={{ display: 'flex', flexDirection: 'column' }}>
                            <i className='iconfont  fs20' >&#xe645;</i>
                            <span>{t('viewAdj')}</span>
                        </div>
                    </Popover>}


                    {/* {isMoreMatrix(systemType) ? <Dropdown 
                    // overlayStyle={{backgroundColor : '#32373e' , color : '#fff'}}
                     menu={{ items: carItems }}>
                        <i className='iconfont cursor fs14' >&#xe607;</i>
                    </Dropdown>

                        : <Dropdown menu={{ items }}>
                            <i className='iconfont cursor fs14' >&#xe607;</i>
                        </Dropdown>} */}

                    {/* {isMoreMatrix(systemType) ? <Popover color='#32373E' className='set-popover' placement="top" content={changeCarViewContent} >
                        <i className='iconfont cursor fs14' >&#xe643;</i>
                    </Popover> : ''} */}
                </div>



            </div>
        </>
    )
}

// export default 

export default withTranslation('translation')(ViewSetting)