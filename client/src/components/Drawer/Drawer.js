import React, { useState } from 'react'
import './index.scss'

export default function Drawer(props) {
    const { show, title, setShow, children, asideClose, zindex, close, direction = 'right' } = props

    return (
        <div className='drawerContent' style={{

            right: direction == 'left' ? 'unset' : show ? 0 : 'calc(-18% - 5px)',
            left: direction == 'right' ? 'unset' : show ? 0 : 'calc(-18% - 5px)',


            zIndex: zindex ? zindex * 100 : 100
        }}>
            {asideClose ? <div className='asideClose' style={{
                right: direction == 'left' ? 'unset' : '100%',
                left: direction == 'right' ? 'unset' : '100%',
            }} onClick={() => { setShow(!show) }}>
                <i className='iconfont' style={{ fontSize: '0.875rem' }}>&#xe621;</i>
            </div> : ''}
            <div className="drawerTitle">
                <div className="titleInfo">{title}</div>
                <div className="closeDrawer cursor" onClick={() => {
                    if (close) {
                        close()
                    }
                    setShow(false)
                }}>
                    <i className='iconfont'>&#xe625;</i>
                </div>
            </div>

            <div className="drawerInside">
                {children}
            </div>
        </div>
    )
}
