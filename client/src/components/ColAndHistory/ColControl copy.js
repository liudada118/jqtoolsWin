import { Button, Input, Modal } from 'antd'
import React, { useState } from 'react'
import Col from '../col/Col'
import { shallow } from 'zustand/shallow'
import { useEquipStore } from '../../store/equipStore'
import { msToHMS } from '../../assets/util/date'
import ColTime from './ColTime'
import { withTranslation } from 'react-i18next'

function ColControl(props) {
    const { t, i18n } = props;
    const { getColHistory } = props
    const [colName, setColName] = useState('')
    const [HZ, setHZ] = useState('')

    const [modalName, setModalName] = useState('')
    const [modalHZ, setModalHZ] = useState('')

    const [changeColInfo, setChangeColInfo] = useState(false)
    const [startTime, setStartTime] = useState(0)

    const handleOk = () => {
        setChangeColInfo(false);
    }

    const handleCancel = () => {
        setChangeColInfo(false);
    }

    const [col, setCol] = useState(false)

    return (
        <div style={{display : 'flex' , alignItems : 'center' , flexDirection : ' column' , position : 'relative' , padding : '0.625rem 0' , minWidth : '17.5rem' , background : 'rgba(23,25,28 , 0.5)',borderRadius: 10}}>
            {/* <Modal
                title={t('collectSettings')}
                closable={{ 'aria-label': 'Custom Close Button' }}
                open={changeColInfo}
                onOk={handleOk}
                onCancel={handleCancel}
            >
                <div className='colChangeItem'>
                    <div style={{ width: '5rem' }}> {t('filename')}</div> <Input value={colName} onChange={(e) => { setColName(e.target.value) }} />
                </div>

                <div className='colChangeItem'>
                    <div style={{ width: '5rem' }}>{t('freq')}</div>   <Input value={HZ} onChange={(e) => { setHZ(e.target.value) }} /> <div style={{ width: '3rem' }}>{t('frame')}/s</div>
                </div>
            </Modal> */}

            <div className="colInfo fs14">
                <div style={{ marginRight: 10 }}>{t('filename')}: {colName ? colName : t('untitled')}</div>
                {/* <div style={{ marginRight: 10 }}> {t('freq')} : {HZ ? HZ : '13'}{t('frame')}/s</div> */}

                <div className='changeColInfo'>
                    {
                        changeColInfo ? <> <div className='changeColInfoModal'>
                            <div className="changeColInfoModalTitle">
                                <div className="titleInfo fs18">{t('collectSettings')}</div>
                                <i className='iconfont cursor' onClick={() => { setChangeColInfo(false) }}>&#xe625;</i>
                            </div>
                            <div>
                                <div className='colChangeItem fs14' style={{ marginBottom: '18px' }}>
                                    <div style={{ width: '5rem' }}> {t('filename')}</div> <Input value={modalName} onChange={(e) => { setModalName(e.target.value) }} />
                                </div>

                                {/* <div className='colChangeItem fs14'>
                                    <div style={{ width: '5rem' }}>{t('freq')}</div>   <Input value={modalHZ} onChange={(e) => { setModalHZ(e.target.value) }} /> <div style={{ width: '3rem', textAlign: 'right' }}>{t('frame')}/s</div>
                                </div> */}
                            </div>
                            <div className="changeColInfoModalButton">
                                <div className='modalCancalButton cursor fs14' onClick={() => { setChangeColInfo(false) }}>{t('cancel')}</div>
                                <div className='modalConfirmButton cursor fs14' onClick={() => {
                                    setChangeColInfo(false)
                                    setHZ(modalHZ)
                                    setColName(modalName)
                                }}>{t('ok')}</div>
                            </div>

                        </div>  <div className="changeColInfoModalTriang"></div> </> : ''
                    }
                    <i onClick={() => {
                        setChangeColInfo(!changeColInfo)
                        setModalHZ(HZ)
                        setModalName(colName)
                    }} className='iconfont cursor' 
                    // style={{ color: changeColInfo ? '#0072EF' : '#B4C0CA' }}
                    style={{ color:'#0072EF'}}
                    >&#xe623;</i></div>
            </div>
            <div className='colButton'>
                <Col startTime={startTime} setStartTime={setStartTime} colName={colName} HZ={HZ} col={col} setCol={setCol} />
            </div>
            <div className='colTimeAndHistory'>
                <div className='colTime fs16'>
                    {!col ? t('dataCollect') : startTime == 0 ? '00:00:00' : <ColTime startTime={startTime}  />}
                </div>
                <div className='historyButton cursor fs14' style={{right : '0.75rem' , color : '#0072EF'}} onClick={() => {
                    getColHistory()
                }}>
                    <i className='iconfont' style={{color : '#0072EF'}}>&#xe624;</i>{t('history')}
                </div>

            </div>
        </div>
    )
}

export default withTranslation('translation')(ColControl); 
