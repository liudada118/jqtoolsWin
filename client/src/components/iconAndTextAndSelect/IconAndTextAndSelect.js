import React, { useContext, useState } from 'react'
import IconAndText from '../iconAndText/IconAndText'
import './index.scss'
import { pageContext } from '../../page/test/Test'

export default function IconAndTextAndSelect(props) {
    const { show, text, options, icon } = props
    const [selectShow, setSelectShow] = useState(false)

    const pageInfo = useContext(pageContext);
    const { changeDataDirection } = pageInfo
    return (
        <div className='iconAndSelect'
            onMouseOver={() => {
                setSelectShow(true)
            }}
            onMouseOut={() => {
                setSelectShow(false)
            }}
        >
            <IconAndText show={show} text={text} icon={icon} />
            <div className="dropDown" style={{ opacity: selectShow ? 1 : 0 }}>
                {options.map((a, index) => {
                    return (
                        <div className='dropItem fs14 cursor' onClick={() => {
                            // setValue(a.label)
                            // setShow(false)
                            if (a.value == 'up') {
                                changeDataDirection('up')
                            } else {
                                changeDataDirection('left')
                            }

                        }}>
                            {a.label}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
