import React from 'react'
import img from '../../assets/image/img.png'
import './index.scss'

export default function IconAndText(props) {
  const { text, show, icon, onClick, disable, onClickStatus } = props
  return (
    <>{disable ? <div className='disable iconContent cursor'>
      {/* <img src={img} alt="" /> */}
      {icon}
      <div className='fs14 iconInfo' style={{ opacity: show ? 1 : 0 }}>{text}</div>
    </div> : <div className={`${onClickStatus ? 'onclickContent' : 'unclickContent'} iconContent cursor`} onClick={onClick}>
      {/* <img src={img} alt="" /> */}
      {icon}
      <div className='fs14 iconInfo' style={{ opacity: show ? 1 : 0 ,  }}>{text}</div>
    </div>}</>
  )
}
