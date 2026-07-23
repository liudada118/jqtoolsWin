import React, { useContext, useEffect, useRef, useState } from 'react'
import Drawer from '../Drawer/Drawer'
import { pageContext } from '../../page/test/Test';
import SelectChart from './selectChart/SelectChart';
import './index.scss'
import { getStatus, useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';
import axios from 'axios';
import { python } from '../../assets/util/pythonDataFormat';

export default function Aside() {

  const [rect, setRect] = useState([]);

  const pageInfo = useContext(pageContext);

  useEffect(() => {


    const cb = (range) => {
   
      // setRect(range);

      setRect((prev) => {
        // 基于上一次状态更新

        return [...range];
      });
    }
   
    pageInfo.brushInstance.subscribe(cb);

    return () => {
      pageInfo.brushInstance.unsubscribe(cb);
    };
  }, [pageInfo.brushInstance])

  const [show, setShow] = useState(true)

  const cop = useEquipStore(s => s.cop, shallow);

  // const matrixDataRef = useRef([])
  // const [cop, setCop] = useState({})
  // const ndata1 = useEquipStore(s => s.status, shallow);
  // if (matrixDataRef.current.length < 40) {
  //   matrixDataRef.current.push(ndata1)
  // } else {
  //   matrixDataRef.current.shift()
  //   matrixDataRef.current.push(ndata1)
  //   axios({
  //     method: 'post',
  //     url: 'http://localhost:19245/getCop',
  //     data: {
  //       MatrixList: matrixDataRef.current,
  //     }
  //   }).then((res) => {
  //     console.log(res)
  //     setCop(res.data.data)
  //   })
  // }
  // useEffect(() => {
  //   let ndata1 = getStatus()
  //   console.log(ndata1)


  // }, [])

  // console.log(cop)
  return (

    <Drawer show={show} asideClose setShow={setShow} title={'数据'}>
      {
        Object.keys(cop).length ? Object.keys(cop).map((a) => {
          return <div style={{ color: '#fff' }}>
            <h1>{a}</h1>
            {cop[a] ? Object.keys(cop[a]).map((b) => {
              return <div>{python[b]} : {cop[a][b]}</div>
            }) : ''}
          </div>
        }) : ''
      }

      <div className="selectContents">
        {
          rect.map((a, index) => {
            return (
              // <div></div>
              <SelectChart index={index} key={index} select={a}></SelectChart>
            )
          })
        }
      </div>
    </Drawer>

  )
}
