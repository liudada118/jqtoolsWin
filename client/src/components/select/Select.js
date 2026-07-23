import React, { useState } from 'react'
import './index.scss'
const dataMap = [
  {
    label: '汽车',
    value: 'car'
  },
  {
    label: '床垫',
    value: 'bed'
  },
]
export default function Select(props) {

  const { options, defaultValue, onChange,icon } = props

  const [show, setShow] = useState(false)
  const [value, setValue] = useState(defaultValue)


  return (
    <>
      <div
        onMouseOver={() => {
          setShow(true)
        }}
        onMouseOut={() => {
          setShow(false)
        }}
        className="systemSelect cursor fs16" style={{ minWidth: "5.5rem" }}>
        {icon ? icon : ''} {value || defaultValue} <div style={{ transform: 'rotate(-90deg)',marginLeft : '1rem' }}> {options.length ? <i className='iconfont' style={{color : '#0072EF'}}>&#xe621;</i> : ''}</div>
       {options.length ? <div className="dropDown" style={{ opacity: show ? 1 : 0 , visibility : show ? 'unset' : 'hidden' }}>
          <div className='dropDownAni' style={{ left: show ? 0 : '-100%' }}></div>
          {options.map((a, index) => {
            return (
              <div className='dropItem' onClick={() => {
                setValue(a.label)
                setShow(false)
                onChange(a.value)
              }}>
                {a.label}
              </div>
            )
          })}
        </div> : ''}
      </div>
    </>
  )
}
