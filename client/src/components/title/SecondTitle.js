import React, { useContext, useEffect, useState } from 'react'
import IconAndText from '../iconAndText/IconAndText'
import IconAndTextAndSelect from '../iconAndTextAndSelect/IconAndTextAndSelect'
import Drawer from '../Drawer/Drawer'
import { Col, ConfigProvider, InputNumber, message, Popover, Row, Slider } from 'antd'
import { pageContext } from '../../page/test/Test'
import { SelectionHelper } from '../selectBox/SelectBox'
import { withTranslation } from 'react-i18next'
import { getDisplayType, getSettingValue, getSettingValueOptimal, getSysType, useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { isMoreMatrix } from '../../assets/util/util'
import { pointConfig } from '../../util/constant'
import { AimOutlined, DatabaseOutlined, SettingOutlined, SlidersOutlined } from '@ant-design/icons'

// const selectHelper = new SelectionHelper(document.body, 'selectBox');

function SecondTitle(props) {
    const { t, i18n } = props;

    const pageInfo = useContext(pageContext);
    const { display, onRuler, setOnRuler } = pageInfo
    const [show, setShow] = useState(true)
    const [setshow, setSetshow] = useState(false)
    // const { settingValue, setSettingValue, selectHelper } = pageInfo
    // const settingValue = getSettingValue()
    const settingValue = useEquipStore(s => s.settingValue, shallow);
    const settingValueMax = useEquipStore(s => s.settingValueMax, shallow);
    const systemType = useEquipStore(s => s.systemType, shallow);

    const setSettingValue = useEquipStore.getState().setSettingValue


    // const onChange = (newValue, a) => {
    //     console.log(newValue, settingValue)
    //     let obj = { ...settingValue }
    //     obj[a.type] = newValue / 100 * a.max
    //     localStorage.setItem('setValueData', JSON.stringify(obj))

    //     setSettingValue(obj);
    // };

    const onChange = (newValue, a) => {

        let obj = { ...settingValue }
        obj[a.type] = newValue

        setSettingValue(obj);
    };

    // const settingValue = useEquipStore(s => s.settingValue, shallow);


    const setType = [
        {
            title: t('blur'),
            type: 'gauss',
            max: settingValueMax.gauss,
            min: 0.1,
            step: 0.1,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('algoUniform')}</div>
        },
        {
            title: t('colorAdj'),
            type: 'color',
            max: settingValueMax.color,
            min: 1,
            step: 1,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('algoRedBlue')}</div>
        },
        {
            title: t('denoise'),
            type: 'filter',
            max: settingValueMax.filter,
            min: 1,
            step: 1,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('filterNoise')}</div>
        },
        {
            title: t('heightAdj'),
            type: 'height',
            max: settingValueMax.height,
            min: 0.1,
            step: 0.1,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('pointHeight')}</div>
        },

        {
            title: t('continuity'),
            type: 'coherent',
            max: settingValueMax.coherent,
            min: 10,
            step: 10,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('sensitivity')}</div>
        },

        {
            title: t('靠背初始值'),
            type: 'backInit',
            max: 5000,
            min: 100,
            step: 50,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('pointHeight')}</div>
        },
        {
            title: t('座椅初始值'),
            type: 'sitInit',
            max: 5000,
            min: 100,
            step: 50,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('sensitivity')}</div>
        },

        {
            title: t('x'),
            type: 'xx',
            max: 10,
            min: 0, 
            step: 0.01,
            // max: 10000,
            // min: -10000, 
            // step: 100,

            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('filterNoise')}</div>
        },
        {
            title: t('y'),
            type: 'yy',
            max: 10,
            min: 0,
            step: 0.01,
            //    max: 10000,
            // min: -10000, 
            // step: 100,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('pointHeight')}</div>
        },
        {
            title: t('z'),
            type: 'zz',
            max: 10,
            min: 0,
            step: 0.01,
            //    max: 10000,
            // min: -10000, 
            // step: 100,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('sensitivity')}</div>
        },

        ,

        {
            title: t('rx'),
            type: 'rxx',
            max: 10,
            min: -10,
            step: 0.01,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('filterNoise')}</div>
        },
        {
            title: t('ry'),
            type: 'ryy',
            max: 10,
            min: -10,
            step: 0.01,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('pointHeight')}</div>
        },
        {
            title: t('rz'),
            type: 'rzz',
            max: 10,
            min: -10,
            step: 0.01,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('sensitivity')}</div>
        },


    ]


    const [onSelect, setOnSelect] = useState(false)
    // const [onRuler, setOnRuler] = useState(false)


    const selectClick = () => {
        setOnSelect(!onSelect)
        // if (!onSelect) {
        //     selectHelper.isShiftPressed = true
        // }else{
        //     selectHelper.isShiftPressed = false
        // }
        pageInfo?.brushInstance.startBrush();
    }
    const system = useEquipStore(s => s.systemType, shallow);
    const rulerClick = () => {
        // const system =  getSysType()
        const displayType = getDisplayType()
        // const system = 

        if (display == 'num') {

            if (isMoreMatrix(system)) {
                const key = displayType.includes('sit') ? 'sit' : 'back'
                const pointLength = pointConfig[system][key].pointLength
                const widthDistance = pointConfig[system][key].pointWidthDistance
                const heightDistance = pointConfig[system][key].pointHeightDistance
                console.log(pointConfig[system][key])
                pageInfo?.newRuler.startRuler({ num: pointLength, widthDistance, heightDistance });
            }

            setOnRuler(!onRuler)

            if (onRuler) {
                pageInfo?.newRuler.stopRuler()
            }
        } else {
            message.info('请在2D模式下使用')
        }
        // pageInfo?.newRuler.startRuler();
    }

    useEffect(() => {


    }, [])
    // const brush = useContext(BrushContext);

    const [onZero, setOnZero] = useState(false)

    const wsDataZero = () => {
        setOnZero(!onZero)
        pageInfo.changeWsLocalData()
    }

    /** 打开可视化参数并关闭可能遮挡的其他调节面板。 */
    const toggleVisualAdjustment = () => {
        pageInfo.setSceneAdjustOpen(false)
        pageInfo.setAlgorithmConfigOpen(false)
        pageInfo.setAirbagAdjustOpen(false)
        setSetshow(!setshow)
    }

    /** 打开视图调节并关闭其他调节面板。 */
    const toggleSceneAdjustment = () => {
        setSetshow(false)
        pageInfo.setAlgorithmConfigOpen(false)
        pageInfo.setAirbagAdjustOpen(false)
        pageInfo.setSceneAdjustOpen(!pageInfo.sceneAdjustOpen)
    }

    /** 打开算法参数并关闭其他调节面板。 */
    const toggleAlgorithmConfig = () => {
        setSetshow(false)
        pageInfo.setSceneAdjustOpen(false)
        pageInfo.setAirbagAdjustOpen(false)
        pageInfo.setAlgorithmConfigOpen(!pageInfo.algorithmConfigOpen)
    }

    /** 打开气囊位置调节并关闭其他调节面板。 */
    const toggleAirbagAdjustment = () => {
        setSetshow(false)
        pageInfo.setSceneAdjustOpen(false)
        pageInfo.setAlgorithmConfigOpen(false)
        pageInfo.setAirbagAdjustOpen(!pageInfo.airbagAdjustOpen)
    }

    /** 打开或关闭采集面板，并收起调节面板。 */
    const toggleCollection = () => {
        setSetshow(false)
        pageInfo.setSceneAdjustOpen(false)
        pageInfo.setAlgorithmConfigOpen(false)
        pageInfo.setAirbagAdjustOpen(false)
        pageInfo.setDisCol(!pageInfo.col)
    }



    return (

        <>
            <Drawer zindex={3} show={setshow} title={t('adjust')} setShow={setSetshow}>
                <div className="setContent">
                    {/* <div className="setItem">
                        <Row align='middle'>
                            <Col span={4} >高斯模糊</Col>
                            <Col span={12}>
                                <Slider
                                    min={1}
                                    max={20}
                                    onChange={(value) => {
                                        onChange(value, 'gauss')
                                    }}
                                    value={typeof settingValue.gauss === 'number' ? settingValue.gauss : 0}
                                />
                            </Col>
                            <Col span={4}>
                                <InputNumber
                                    min={1}
                                    max={20}
                                    style={{ margin: '0 16px' }}
                                    value={typeof settingValue.gauss === 'number' ? settingValue.gauss : 0}
                                    onChange={(value) => {
                                        onChange(value, 'gauss')
                                    }}
                                />
                            </Col>
                        </Row>
                    </div> */}
                    {
                        setType.map((a, index) => {
                            return (
                                <div className="setItem">
                                    <Popover color='#32373E' className='set-popover' placement="bottomLeft" content={a.content} >
                                        <div>{a.title}</div>
                                    </Popover>

                                    <Slider
                                        min={a.min}
                                        max={a.max}
                                        step={a.step}
                                        onChange={(value) => {
                                            onChange(value, a)
                                        }}
                                        className='setItemSlide'
                                        value={settingValue[a.type]}
                                    />

                                    <ConfigProvider
                                        theme={{
                                            components: {
                                                InputNumber: {
                                                    token: {
                                                        // Seed Token，影响范围大
                                                        hoverBg: '#000'
                                                    },
                                                }
                                            }

                                        }}>

                                        <InputNumber
                                            min={a.min}
                                            max={100}
                                            style={{ margin: '0 16px' }}
                                            className='setItemInput'
                                            // value={typeof settingValue[a.type] === 'number' ? Math.round(settingValue[a.type] * 100 / a.max) : 0}
                                            value={settingValue[a.type]}
                                            onChange={(value) => {
                                                onChange(value, a)
                                            }}

                                        />
                                    </ConfigProvider>

                                </div>
                            )
                        })
                    }

                    <div style={{ display: 'flex', justifyContent: 'end' }}>
                        <div onClick={() => {
                            const optimalObj = getSettingValueOptimal()
                            useEquipStore.getState().setSettingValue(optimalObj)
                        }} className='connectPort cursor'>{t('restore')}</div>
                    </div>
                </div>
            </Drawer>
            <div className="secondTitle">
                <div className="secondTitleContent"
                // style={{ height: show ? `calc(27px + 2.5rem)` : 'calc(27px + 0.6rem)' }}
                // onMouseOver={() => {
                //     setShow(true)
                // }}
                // onMouseOut={() => {
                //     setShow(false)
                // }}
                >
                    {/* <IconAndText text='画布翻转' /> */}
                    {/* <IconAndTextAndSelect text={t('flip')} show={show} options={[{
                        label: t('flipV'), value: 'up'
                    }, {
                        label: t('flipH'), value: 'left'
                    },
                    ]}
                        icon={<div className='iconContentBox'><i className='iconfont fs18'>&#xe60c;</i></div>}
                    /> */}
                    <IconAndText text={t('zeroPre')} onClickStatus={onZero} show={show} onClick={wsDataZero} icon={<div className='iconContentBox'><i style={{ color: onZero ? '#fff' : '#D1D9E1' }} className='iconfont fs18'>&#xe604;</i></div>} />
                    {/* <IconAndText disable text={t('select')} onClick={() => { selectClick() }} show={show} icon={<div className='iconContentBox'> <i style={{ color: onSelect ? 'blue' : '#D1D9E1' }} className='iconfont fs18'>&#xe60e;</i> </div>} /> */}
                    {/* <IconAndText onClickStatus={onRuler} onClick={() => { rulerClick() }} text={t('ruler')} show={show} icon={<div className='iconContentBox'> <i style={{ color: onRuler ? '#fff' : '#D1D9E1' }} className='iconfont fs16'>&#xe610;</i></div>} /> */}
                    <IconAndText onClickStatus={setshow} onClick={toggleVisualAdjustment} text={t('adjust')} show={show} icon={<div className='iconContentBox'><i className='iconfont fs16'>&#xe60d;</i></div>} />
                    <IconAndText onClickStatus={pageInfo.sceneAdjustOpen} onClick={toggleSceneAdjustment} text="视图调节" show={show} icon={<div className='iconContentBox'><SettingOutlined /></div>} />
                    <IconAndText onClickStatus={pageInfo.airbagAdjustOpen} onClick={toggleAirbagAdjustment} text="气囊位置" show={show} icon={<div className='iconContentBox'><AimOutlined /></div>} />
                    <IconAndText onClickStatus={pageInfo.algorithmConfigOpen} onClick={toggleAlgorithmConfig} text="算法调节" show={show} icon={<div className='iconContentBox'><SlidersOutlined /></div>} />
                    {/* <IconAndText text={t('upload')} show={show} icon={<div className='iconContentBox'><i className='iconfont fs18'>&#xe609;</i></div>} /> */}
                    <IconAndText onClickStatus={pageInfo.col} text={t('采集')} show={show} onClick={toggleCollection} icon={<div className='iconContentBox'><DatabaseOutlined /></div>} />
                </div>
            </div>
        </>
    )
}

export default withTranslation('translation')(SecondTitle)
