import React, { memo, useEffect, useRef, useState } from 'react'
import Col from '../col/Col'
import './index.scss'
import Drawer from '../Drawer/Drawer'
import { Button, Checkbox, Input, message, Modal, Slider, Tabs } from 'antd'
import selected from '../../assets/image/select.png'
import history from '../../assets/image/history.png'
import axios from 'axios'
import DataPlay from './DataPlay'
import ColControl from './ColControl copy'
import { withTranslation } from 'react-i18next'
import { useDebounce } from '../../hooks/useDebounce'
import { useEquipStore } from '../../store/equipStore'

const arr = new Array(9).fill(0)

const ColAndHistory = memo((props) => {
    const [messageApi, contextHolder] = message.useMessage();
    const { t, i18n } = props;
    const [showHistory, setShowHistory] = useState(false)
    const [historyDrawer, sethistoryDrawer] = useState(false)

    const [colHistoryArr, setColHistoryArr] = useState()
    const [displayHistoryArr, setDisplayHistoryArr] = useState()
    const arr = localStorage.getItem('csvArr') ? JSON.parse(localStorage.getItem('csvArr')) : []
    const [localArr, setLocalArr] = useState(arr)

    const onChange = () => {

    }

    const title = [t('local')
        // , t('import')
    ]
    const [Onindex, setIndex] = useState(0)

    const [operateStatus, setOperateStatus] = useState('')
    const [selectArr, setSelectArr] = useState([])

    const [colName, setColName] = useState('')
    const [HZ, setHZ] = useState('')

    const [changeColInfo, setChangeColInfo] = useState(false)



    const [uploadFileShow, setUploadFileShow] = useState(false)

    const handleUpload = () => {
        setUploadFileShow(false)
        const res = [...localArr]
        res.push(fileName)
        setLocalArr(res)
        localStorage.setItem('csvArr', JSON.stringify(res))
    }

    const handleUploadCancel = () => {
        setUploadFileShow(false)
    }

    const getColHistory = () => {
        sethistoryDrawer(!historyDrawer)
        axios({
            method: 'get',
            url: 'http://localhost:19245/getColHistory',
        }).then((res) => {
            console.log(res.data.data)
            const arr = res.data.data.map((a) => a.date)
            setColHistoryArr(arr)
            setDisplayHistoryArr(arr)
            console.log('历史执行')
            useEquipStore.getState().setStatus(new Array(4096).fill(0))
            useEquipStore.getState().setDisplayStatus(new Array(4096).fill(0))
        })
    }

    const download = () => {
        console.log(operateStatus, selectArr)
        axios({
            method: 'post',
            url: 'http://localhost:19245/downlaod',
            data: {
                fileArr: selectArr,
            }
        }).then((res) => {
            console.log(res)
            if (res.data.message == 'error') {
                message.info(res.data.data)
            } else {
                message.success('下载成功')
            }


        }).catch((err) => {
            message.error('下载失败')

        })
    }

    const deleteData = () => {

        if (!selectArr.length) {
            message.info('请先选择数据')
            return
        }
        if (Onindex == 0) {
            axios({
                method: 'post',
                url: 'http://localhost:19245/delete',
                data: {
                    fileArr: selectArr,
                }
            }).then((res) => {
                // console.log(res)
                let resArr = [...colHistoryArr]
                resArr = resArr.filter((a) => !selectArr.includes(a))
                setColHistoryArr(resArr)
                setDisplayHistoryArr(resArr)
                message.success('删除成功')
                setSelectArr([])
            }).catch((err) => {
                message.error('删除失败')

            })
        } else {
            let res = [...localArr]
            res = res.filter((a) => !selectArr.includes(a))
            setLocalArr(res)
            localStorage.setItem('csvArr', JSON.stringify(res))
            // res
        }

    }


    const [fileName, setFileName] = useState('')

    const fileChange = (e) => {
        const file = e.target.files[0];
        const filePath = window.electronAPI?.getPath?.(file); // 可选链防报错
        console.log('文件路径:', filePath);
        setFileName(filePath)
    }


    const [dataLength, setDataLength] = useState(10)
    const [currentName, setCurrentName] = useState()

    const close = () => {
        axios({
            method: 'post',
            url: 'http://localhost:19245/cancalDbPlay',
        }).then((res) => {

        })

        setCurrentName('')
        setOperateStatus('')
        //  const history = useEquipStore.getState().history
        useEquipStore.getState().setHistoryStatus({
            index: 0,
            timestamp: '',
        })
    }

    const [clientXY, setClientXY] = useState({ x: 0, y: 0 })

    const [rightClickFlag, setRightClickFlag] = useState(false)

    const [searchInfo, setSearchInfo] = useState('')
    const debouncedValue = useDebounce(searchInfo, 300)

    useEffect(() => {
        // const user = 
        // console.log(debouncedValue)
        if (Onindex == 0 && colHistoryArr) {
            if (debouncedValue != '') {
                let resArr = [...colHistoryArr].filter((a) => a.includes(debouncedValue))
                setDisplayHistoryArr(resArr)
            } else {
                setDisplayHistoryArr(colHistoryArr)
            }

        } else {

        }
    }, [debouncedValue])

    const [selectedDbName, setSelectedDbName] = useState('')
    const [changedDbName, setChangeDbName] = useState('')

    const handleOk = () => {
        setChangeColInfo(false);
        axios({
            method: 'post',
            url: 'http://localhost:19245/changeDbName',
            data: {
                newDate: changedDbName,
                oldDate: selectedDbName
            }
        }).then((res) => {

        })
        const resArr = [...colHistoryArr]
        const index = resArr.indexOf(selectedDbName)
        // console.log(first)
        resArr[index] = changedDbName
        // console.log(resArr)
        setColHistoryArr(resArr)
        setDisplayHistoryArr(resArr)
        setChangeColInfo(false)
        setSelectedDbName('')
        setChangeDbName('')
    }

    const handleCancel = () => {
        setChangeColInfo(false);
        setSelectedDbName('')
        setChangeDbName('')
    }

    const playbackRef = useRef()

    // useEffect(() => {
    //     console.log(playbackRef, 'reffff')
    //     if (playbackRef.current) {
    //         const width = playbackRef.current?.getBoundingClientRect().width
    //         if (width) {
    //             console.log(width, 'wwwww')
    //             playbackRef.current.style.height = `${width}px`
    //         }
    //     }

    // }, [playbackRef.current])

    return (
        <>
            {/* <Modal
                title="采集参数设置"
                closable={{ 'aria-label': 'Custom Close Button' }}
                open={changeColInfo}
                onOk={handleOk}
                onCancel={handleCancel}
            >
                <div className='colChangeItem'>
                    数据名称 <Input value={colName} onChange={(e) => { setColName(e.target.value) }} />
                </div>

                <div className='colChangeItem'>
                    采集频率 <Input value={HZ} onChange={(e) => { setHZ(e.target.value) }} /> 帧/秒
                </div>
            </Modal> */}

            <Modal
                title={t('renameStorage')}
                closable={{ 'aria-label': 'Custom Close Button' }}
                open={changeColInfo}
                onOk={handleOk}
                onCancel={handleCancel}
                cancelText={t('cancel')}
                okText={t('ok')}
            >
                <div className='colChangeItem'>
                    {t('storageName')}: <Input value={changedDbName} onChange={(e) => { setChangeDbName(e.target.value) }} />
                </div>

            </Modal>

            {rightClickFlag ? <div className='rightClickModal' onClick={() => {
                setRightClickFlag(false)
            }}>
                <div className="rightClickMenu" style={{ left: clientXY.x, top: clientXY.y }} onClick={(e) => {
                    e.stopPropagation()
                    setChangeColInfo(true)
                    console.log('rename')
                }}>
                    {t('rename')}
                </div>
            </div> : ''}

            <Modal
                title="上传文件"
                closable={{ 'aria-label': 'Custom Close Button' }}
                open={uploadFileShow}
                onOk={handleUpload}
                onCancel={handleUploadCancel}
            >
                <input type="file" onChange={(e) => { fileChange(e) }} id="file" />
            </Modal>

            <Drawer zindex={2} title={t('history')} show={historyDrawer} setShow={sethistoryDrawer} close={close} >
                <div className="playbackContent">
                    <div className="navTitle">
                        <div className='navTitleChange'>
                            {title.map((a, index) => {
                                return (
                                    <div onClick={() => {
                                        setIndex(index)
                                    }} className={`${Onindex == index ? 'onNavItem' : 'offNavItem'} navTitleItem cursor`}>{a}</div>
                                )
                            })}
                        </div>
                        <div className="navOperate">
                            {
                                operateStatus == 'search' ?
                                    <Input onChange={(e) => { setSearchInfo(e.target.value) }} style={{ width: '6rem' }} /> :
                                    operateStatus == 'delete' ? <div className='modalConfirmButton cursor' onClick={deleteData}>{t('delete')}</div> :
                                        operateStatus == 'download' ? <div className='modalConfirmButton cursor' onClick={download}>{t('download')}</div> : ''
                            }
                            <i className='iconfont cursor' onClick={() => {
                                if (operateStatus != 'search') {
                                    setOperateStatus('search')
                                } else {
                                    setOperateStatus('')
                                }

                            }}>&#xe61f;</i>
                            <i className='iconfont cursor' onClick={() => {
                                if (operateStatus != 'delete') {
                                    setOperateStatus('delete')
                                } else {
                                    setOperateStatus('')
                                }

                            }}>&#xe60f;</i>
                            <i className='iconfont cursor' onClick={() => {
                                if (operateStatus != 'download') {
                                    setOperateStatus('download')
                                } else {
                                    setOperateStatus('')
                                }

                            }}>&#xe60a;</i>
                        </div>
                    </div>

                    <div className="playbackItemContent">
                        <div className="playbackItems">
                            {
                                Onindex == 0 && displayHistoryArr ? displayHistoryArr.map((a, index) => {
                                    return (
                                        <div className="playbackItem cursor"

                                            onClick={() => {
                                                if (['delete', 'download'].includes(operateStatus)) {
                                                    let arr = [...selectArr]
                                                    if (arr.includes(a)) {
                                                        arr = arr.filter((b) => b != a)
                                                    } else {
                                                        arr.push(a)
                                                    }
                                                    setSelectArr(arr)
                                                } else {
                                                    axios({
                                                        method: 'post',
                                                        url: 'http://localhost:19245/getDbHistory',
                                                        data: {
                                                            time: a,
                                                        }
                                                    }).then((res) => {
                                                        console.log(res)
                                                        setCurrentName(a)
                                                        if (res.status == 200) {
                                                            const { length } = res.data.data
                                                            setDataLength(length)
                                                            useEquipStore.getState().setStatus(new Array(4096).fill(0))
                                                            useEquipStore.getState().setDisplayStatus(new Array(4096).fill(0))
                                                        }
                                                    })
                                                }

                                            }}
                                            onContextMenu={(e) => {
                                                e.preventDefault(); // 阻止默认的浏览器右键菜单
                                                console.log("右键点击了：", e.clientX, e.clientY, a);
                                                setClientXY({ x: e.clientX, y: e.clientY })
                                                setRightClickFlag(true)
                                                setChangeDbName(a)
                                                setSelectedDbName(a)
                                            }}

                                        >
                                            <div className='playbackItemCard' ref={playbackRef} style={{position : 'relative' ,background : `center / cover no-repeat url(${history})`}}>
                                                
                                                <div style={{position : 'absolute', backgroundColor : 'rgba(41,45,50 , 0.8)' , width : '100%' , height : '100%' , top : 0 ,left : 0}}>

                                                </div>
                                                <i className='iconfont fs18' style={{color : '#fff' , zIndex : 2}}>&#xe634;</i>
                                                {['delete', 'download'].includes(operateStatus) ? <div className="cardSelect">
                                                    <img style={{ transform: selectArr.includes(a) ? 'scale(1.1)' : 'scale(0)' }} src={selected} alt="" />
                                                </div> : ''}
                                                {/* <img style={{width : '100%'}} src={history} alt="" /> */}
                                            </div>
                                            <div className='playbackItemInfo'>
                                                {a}
                                            </div>
                                        </div>
                                    )
                                }) : Onindex == 1 && localArr ? localArr.map((a, index) => {
                                    return (
                                        <div className="playbackItem cursor" onClick={() => {
                                            if (['delete', 'download'].includes(operateStatus)) {
                                                let arr = [...selectArr]
                                                if (arr.includes(a)) {
                                                    arr = arr.filter((b) => b != a)
                                                } else {
                                                    arr.push(a)
                                                }
                                                setSelectArr(arr)
                                            } else {
                                                axios({
                                                    method: 'post',
                                                    url: 'http://localhost:19245/getCsvData',
                                                    data: {
                                                        fileName: a,
                                                    }
                                                }).then((res) => {
                                                    setCurrentName(a)
                                                    console.log(res)
                                                })
                                            }

                                        }}>
                                            <div className='playbackItemCard' ref={playbackRef} style={{position : 'relative' ,background : `center / cover no-repeat url(${history})`}}>
                                                 
                                                <div style={{position : 'absolute', backgroundColor : 'rgba(41,45,50 , 0.8)' , width : '100%' , height : '100%' , top : 0 ,left : 0}}>

                                                </div>
                                                 <i className='iconfont fs18' style={{color : '#fff' , zIndex : 2}}>&#xe634;</i>
                                                {/* <img style={{width : '100%'}} src={history} alt="" /> */}
                                                {['delete', 'download'].includes(operateStatus) ? <div className="cardSelect">
                                                    {/* <div style={{background : `no-repeat center/100% url(${selected})` , width : '100%' , height : '100%'}} src={selected} alt="" /> */}
                                                    <img style={{ transform: selectArr.includes(a) ? 'scale(1.1)' : 'scale(0)' }} src={selected} alt="" />
                                                </div> : ''}
                                            </div>
                                            <div className='playbackItemInfo'>
                                                {a}
                                            </div>
                                        </div>
                                    )
                                }) : ''
                            }
                        </div>
                    </div>

                    {/* <div className="playbackFunction">
                        <div className='playbackButton cursor'>对比</div>
                        <div className='playbackButton cursor' onClick={() => {
                            console.log('click setUploadFileShow')
                            setUploadFileShow(true)
                        }}>csv导入</div>
                    </div> */}
                </div>
            </Drawer>

            <div className='colAndHContent'>
                <div className='colAndHistory'>
                    {
                        !historyDrawer ?
                            <ColControl getColHistory={getColHistory} />
                            : <DataPlay dataLength={dataLength} name={currentName} />
                    }
                </div>
            </div>
        </>
    )
})

export default withTranslation('translation')(ColAndHistory)