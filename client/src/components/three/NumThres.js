import React, { useContext, useEffect, useState } from 'react'
import { isMoreMatrix } from '../../assets/util/util';
import NumThree from '../../components/three/NumThreeColor copy 3'
import NumThree2 from '../../components/three/NumThreeColor copy 4'
import { useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';
import { pageContext } from '../../page/test/Test';

export default function NumThres(props) {
    const pageInfo = useContext(pageContext);
    const { sitData } = props
    // const { displayType } = pageInfo
    const systemType = useEquipStore(s => s.systemType, shallow);
    const displayType = useEquipStore(s => s.displayType, shallow);
    console.log(displayType.includes('sit'))
    // const [data, setData] = useState(displayType)
    // useEffect(() => {
    //     let height
    //     if (window.innerHeight < 750) {
    //         height = window.innerHeight * 0.5
    //     } else {
    //         height = window.innerHeight * 0.65
    //     }
    //     const canvasRuler = document.querySelector('.canvasRuler')
    //     canvasRuler.style.width = `${height}px`
    //     canvasRuler.style.height = `${height}px`
    //     canvasRuler.width = `${height}`
    //     canvasRuler.height = `${height}`
    //     // canvasRuler.style.position = 'absolute'
    // }, [])
    return (
        <>{isMoreMatrix(systemType) ?
            displayType.includes('back') ? <NumThree2 width={50} height={64} sitData={sitData} /> :
                <NumThree width={46} height={46} sitData={sitData} /> :
            <NumThree width={32} height={32} sitData={sitData} />}

            {/* <div style={{width : '100vw' , height : '100vh' , 
                position : 'fixed' , zIndex : 1 , 
                display : 'flex' , alignItems :'center' , justifyContent : 'center',
                top : 0 , left : 0
                }}>
                <canvas className='canvasRuler'></canvas>
            </div> */}
        </>
    )
}
