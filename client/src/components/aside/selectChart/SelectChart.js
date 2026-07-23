import React, { useContext, useEffect, useRef, useState } from 'react'
import './index.scss'
import { pageContext } from '../../../page/test/Test';
import { calMatrixArea } from '../../../assets/util/selectMatrix';
import { getStatus, useEquipStore } from '../../../store/equipStore';

export default function SelectChart(props) {
    const { index, select } = props
    const pageInfo = useContext(pageContext);

    const deleteSelect = () => {
        pageInfo.brushInstance.deleteSelect(index)
    }

    const canvas = document.querySelector('.canvasThree')
    const canvasInfo = canvas.getBoundingClientRect()

    const canvasObj = {
        canvasX1: canvasInfo.left, canvasX2: canvasInfo.right,
        canvasY1: canvasInfo.top, canvasY2: canvasInfo.bottom
    }

    const selectObj = {
        selectX1: select.x1, selectX2: select.x2,
        selectY1: select.y1, selectY2: select.y2
    }

    

    const matrix = calMatrixArea(canvasObj, selectObj)




    const pageRef = useRef(pageInfo)

    const [press, setPress] = useState(0)
    const [area, setArea] = useState(0)

    let data  = useEquipStore(s => s.status); 

    useEffect(() => {
        pageRef.current = pageInfo

        // let data = pageRef.current.equipStatus.data
        // let data = getStatus()
    
        // if()
        const { wsLocalData } = pageRef.current
        if (wsLocalData) {
            data = data.map((a, index) => {
                if (a - wsLocalData[index] < 0) {
                    return 0
                } else {
                    return a - wsLocalData[index]
                }
            })
        }
        const selectArr = []
        for (let i = matrix.yStart; i < matrix.yEnd; i++) {
            for (let j = matrix.xStart; j < matrix.xEnd; j++) {
                selectArr.push(data[i * 64 + j])
            }
        }
        const area = selectArr.filter((a) => a > 0).length
        const press = selectArr.reduce((a, b) => a + b, 0)
        setArea(area)
        setPress(press)

    }, [data])


    return (
        <div className='selectContent'>
            <div className="colorContent" style={{ backgroundColor: select.bgc }}></div>
            <div className="selectTitle">
                <div className="selectInfo">框选{index + 1}  <i className='iconfont selectEdit' >&#xe623;</i></div>
                <i className='iconfont selectClose' onClick={deleteSelect}>&#xe625;</i>
            </div>
            <div className="selectDatas">
                <div className="selectData">
                    <div className="selectDataTitle">传感面积</div>
                    <div className="selectDataValue">{area}</div>
                </div>
                <div className="selectData">
                    <div className="selectDataTitle">传感压力</div>
                    <div className="selectDataValue">{press}</div>
                </div>
            </div>
        </div>
    )
}
