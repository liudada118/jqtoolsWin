import React, { useState } from 'react'
import './index.scss'
import axios from 'axios'
import { message } from 'antd'

export default function Col(props) {
    const { colName, HZ, setStartTime ,col, setCol} = props
   

    const colButtonClick = () => {


        if (!col) {
            const fileName = colName ? colName : new Date().getTime()
            const hz = HZ ? HZ : 30
            axios({
                method: 'post',
                url: 'http://localhost:19245/startCol',
                data: {
                    fileName: fileName,
                    HZ: hz
                }
            }).then((res) => {
         
                if (res.data.message == 'error') {
                    message.error(res.data.data)
                } else {
                    message.success('开始采集')
                    setCol(!col)
                    setStartTime(new Date().getTime())
                }

            }).catch((err) => {
                message.error('采集失败')
            })

        } else {
            axios({
                method: 'get',
                url: 'http://localhost:19245/endCol',
            }).then((res) => {
                if (res.data.message == 'error') {
                    message.error(res.data.data)
                } else {
                    message.success('采集成功')
                    setCol(!col)
                }
            })
            setStartTime(0)
            setCol(!col)
        }
    }

    return (
        <div className='colContent' onClick={colButtonClick}>
            <div className={`${col ? "colIngIcon" : 'colInitIcon'} colIcon`}></div>
        </div>
    )
}
