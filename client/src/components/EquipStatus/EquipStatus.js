import React, { useContext } from 'react'
import './index.scss'
import { pageContext } from '../../page/test/Test';
import { withTranslation } from 'react-i18next';
import { useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';

function EquipStatus(props) {

    const { t, i18n } = props;
    const { fileName } = props


    const portMap = {
        'car': [{ label: t('back'), value: 'back' }, { label: t('sit'), value: 'sit' }],
        'bed': [{ label: t('bedEquip'), value: 'bed' },],
        'hand': [{ label: t('handEquip'), value: 'hand' },]
    }


    // const pageInfo = useContext(pageContext);
    const equipStatus = useEquipStore(s => s.equipStatus, shallow);



    return (
        <div className='equipsStatusContent'>
            {/* {
                fileName ? portMap[fileName].map((a, index) => {
                    return (
                        <div className='equipStatusContent'>
                            <div className='equipName'>{a.label}</div> <div className={equipStatus == 'offline' ? 'equipOfflineStatus' : 'equipOnlineStatus'}></div>
                        </div>
                    )
                })
                    : ''} */}
            
            {/* {
              Object.values(equipStatus).every((a) => a != undefined) &&  Object.keys(equipStatus).map((a, index) => {
                    return (
                        <div className='equipStatusContent'>
                            <div className='equipName'>{
                               a == 'carAir' ? '': a.includes('car') ||a.includes('endi')   ? t(a.split('-')[1]) : a == 'hand' ? t('handEquip') : a == 'bed' ? t('bedEquip') : ''
                            }</div> <div className={equipStatus[a] == 'online' ? 'equipOnlineStatus' :  'equipOfflineStatus'}></div>
                        </div>
                    )
                })
            } */}

            <div className='equipStatusContent'><div className='equipName'>自适应座椅</div> <div className={equipStatus['carAir'] == 'online' ? 'equipOnlineStatus' : 'equipOfflineStatus'}></div>
            </div>
        </div>
    )
}

export default withTranslation('translation')(EquipStatus);
