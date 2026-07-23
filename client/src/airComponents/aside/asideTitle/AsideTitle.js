import React from 'react'
import './index.scss'

export default function AsideTitle({icon , title}) {
  return (
    <div className='asideTitle'>
      {icon}
      {title}
    </div>
  )
}
