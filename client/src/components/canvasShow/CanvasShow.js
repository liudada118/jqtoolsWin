import React from 'react'
import NumThree from '../three/NumThreeColor copy';
import { useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';

export default function CanvasShow(props) {

    const systemType = useEquipStore(s => s.systemType, shallow);
    const display = useEquipStore(s => s.display, shallow);

    // const threeComponentObj = {
    //     sit: <Canvas ref={threeRef} sitnum1={64} sitnum2={64} />,
    //     bed: <Bed ref={threeRef} sitnum1={32} sitnum2={32} />
    // }
    return (
        <>
            {/* {display ? <NumThree /> : threeComponentObj[systemType]} */}
            </>

    )
}
