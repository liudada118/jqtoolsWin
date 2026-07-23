import React from 'react'
import { msToHMS } from '../../assets/util/date';
import { useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';

export default function ColTime(props) {

    const { startTime } = props
    const equipStamp = useEquipStore(s => s.equipStamp, shallow);
  
    return (
        <>
            {startTime == 0 ? '00:00:00': msToHMS(equipStamp - startTime)}
        </>
    )
}
