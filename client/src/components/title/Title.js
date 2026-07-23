import React, { memo, useContext, useState } from 'react'
import './index.scss'
import EquipStatus from '../EquipStatus/EquipStatus'
import Select from '../select/Select'
import IconAndText from '../iconAndText/IconAndText'
import SecondTitle from './SecondTitle'
import logo from '../../assets/image/airLogo.png'
import axios from 'axios'
import { withTranslation } from "react-i18next";
import { pageContext } from '../../page/test/Test'
import { systemConfig } from '../../util/constant'
import { useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { Button } from 'antd'
import { useWindowSize } from '../../hooks/useWindowsize'


const Title = memo((props) => {
  const { t, i18n } = props;
  const connent = () => {
    axios.get('http://localhost:19245/connPort', {}).then((res) => {
      console.log(res)
    })
    axios.get('http://localhost:19245/sendMac', {}).then((res) => {
      console.log(res)
    })
  }

  const pageInfo = useContext(pageContext);

  // const {systemTypeArr , systemType ,setSystemType} = pageInfo

  const systemType = useEquipStore(s => s.systemType, shallow);
  const systemTypeArr = useEquipStore(s => s.systemTypeArr, shallow);



  const changeSystemType = (e) => {
    // useEquipStore.getState().setSystemType(e)
    // useEquipStore.getState().setStatus(new Array(4096).fill(0))
    // useEquipStore.getState().setDisplayStatus(new Array(4096).fill(0))
    axios({
      method: 'post',
      url: 'http://localhost:19245/changeSystemType',
      data: {
        system: e,
      }
    }).then((res) => {
      console.log(res)
      const optimalObj = res.data.data.optimalObj
      const maxObj = res.data.data.maxObj
      useEquipStore.getState().setSystemType(e)
      useEquipStore.getState().setStatus(new Array(4096).fill(0))
      useEquipStore.getState().setDisplayStatus(new Array(4096).fill(0))
      useEquipStore.getState().setDisplayType('all')
      useEquipStore.getState().setSettingValue(optimalObj)
      useEquipStore.getState().setSettingValueMax(maxObj)
      useEquipStore.getState().setSettingValueOptimal(optimalObj)
    }).catch((err) => {
    })
  }

  const [language, setLanguage] = useState('中文')

  const equipStatus = useEquipStore(s => s.equipStatus, shallow);

  const { size } = useWindowSize()

  return (

    <div className='titleContent pf'>
      <div className={`firstTitle`}>
        <div className="titleLeft">
          {/* logo 居中 */}
          {/* <div className={`logo fs24  ${size == 'max' ? 'maxLogo' : ''}`}> */}

          <div className={`logo fs24`}>
            <img src={logo} onClick={() => {pageInfo.setTitleDisplay(!pageInfo.titleDisplay)}} style={{ height: '1.2rem' }} alt="" />
          </div>
          {/* <Select options={systemTypeArr}
            defaultValue={t(systemType)}
            onChange={changeSystemType}
          /> */}
          <EquipStatus fileName={systemType} />
          <div className={`${!Object.keys(equipStatus).length || Object.values(equipStatus).includes('offline') ? 'connectPort' : 'unclickButton'} cursor connectButton`} style={{ marginRight: '2.1rem' }} onClick={() => { connent() }}>
            {t('connect')}
          </div>

          {/* <Button className={`${!Object.keys(equipStatus).length || Object.values(equipStatus).includes('offline') ? 'connectPort' : 'unclickButton'} cursor`} style={{ marginRight: '3.1rem' }} onClick={() => { connent() }}>{t('connect')}</Button> */}

        </div>

        <div className="titleRight">
          {/* <div className="systemSelect cursor">
          中文
        </div> */}
          {/* <Select defaultValue='中文' options={[
            {
              label: '中文',
              value: 'zh'
            },
            {
              label: 'EN',
              value: 'en'
            },
          ]}

            icon={<i className='iconfont' style={{ marginRight: '0.625rem', fontSize: '0.875rem', color: '#E6EBF0' }}>&#xe642;</i>}
            onChange={(value) => {
              i18n.changeLanguage(value)
            }}

          /> */}
          {/* <div className="loginOut">
            <div className="loginOutText">
              退出
            </div>
            <div className="loginOutImg">

            </div>
          </div> */}
        </div>
      </div>

     {pageInfo.titleDisplay ?  <SecondTitle /> : ''}
    </div>

  )
})

export default withTranslation('translation')(Title)