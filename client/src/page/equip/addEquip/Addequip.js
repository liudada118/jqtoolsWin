import { Button, Checkbox, DatePicker, Input, message } from 'antd'
import axios from 'axios'
import React, { useEffect, useState } from 'react'

import customParseFormat from 'dayjs/plugin/customParseFormat';
import './index.scss'

import dayjs from 'dayjs';
import { serverAddress } from '../../../util/constant';


dayjs.extend(customParseFormat);
const dateFormat = 'YYYY-MM-DD';
const CheckboxGroup = Checkbox.Group;


export default function Addequip() {
    const connent = () => {
        axios.get('http://localhost:19245/connPort', {}).then((res) => {
            console.log(res)
        })
    }

    const [macInfo, setMacInfo] = useState({})

    const [macStorage, setMacStorage] = useState({})

    useEffect(() => {





        const ws = new WebSocket(" ws://127.0.0.1:19999");
        ws.onopen = () => {
            // connection opened
            console.info("connect success");

        };
        ws.onmessage = (e) => {

            const jsonObj = JSON.parse(e.data)
            // console.log(jsonObj)

            if (jsonObj.macInfo) {
                setMacInfo(jsonObj.macInfo)
                console.log(jsonObj.macInfo)
                // axios.get('http://localhost:19245/sendMac', {}).then((res) => {
                //     console.log(res)
                // })

                const macInfo = jsonObj.macInfo


                const obj3 = { ...macStorage }
                const obj = { ...dateObj }
                const obj1 = { ...remark }
                const obj2 = { ...checkedList }
                const obj4 = { ...macStorage }
                Object.keys(macInfo).forEach((key) => {
                    const mac = macInfo[key].uniqueId

                    axios.get(`${serverAddress}/device-manage/device/getDetail/${mac}`, {}).then((res) => {
                        console.log(res)
                        {

                            obj3[key] = false
                            setMacStorage(obj3);
                        }
                        if (!res.data.data) return
                        const { remarkInfo,
                            typeInfo,
                            expireTime } = res.data.data

                        obj[key] = expireTime

                        console.log(dayjs((expireTime)).format(dateFormat))
                        setDate(obj);


                        obj1[key] = remarkInfo
                        setremark(obj1);
                        console.log(res.data.data)

                        obj2[key] = JSON.parse(typeInfo)
                        setCheckedList(obj2);
                        console.log(obj1, obj, obj2)
                        {

                            obj4[key] = true
                            setMacStorage(obj4);
                        }
                    })

                })
            }

        };
        ws.onerror = (e) => {
            // an error occurred
        };
        ws.onclose = (e) => {
            // connection closed
        };
    }, [])


    // const connentEquip = () => {
    //     connent()
    //     // axios.get('http://localhost:19245/getMac', {}).then((res) => {
    //     //     console.log(res)
    //     // })
    // }

    const readMac = () => {
        axios.get('http://localhost:19245/sendMac', {}).then((res) => {
            console.log(res)
        })
    }

    const onDateChange = (date, dateString, key) => {
        console.log(new Date(dateString).getTime());

        const dateStamp = new Date(dateString).getTime()
        const obj = { ...dateObj }
        obj[key] = dateStamp
        setDate(obj);
    };

    const onchange = (e, key) => {
        console.log(e.target.value)
        const value = e.target.value
        const obj = { ...remark }
        obj[key] = value
        setremark(obj);
    }

    const [checkedList, setCheckedList] = useState({});
    const [remark, setremark] = useState({})
    const [dateObj, setDate] = useState({})

    const onTypeChange = (list, key) => {
        // const 
        const obj = { ...checkedList }
        obj[key] = list
        setCheckedList(obj);
    }

    const plainOptions = ['hand', 'bed', 'car-back', 'car-sit' ,'endi-back', 'endi-sit' ,'carAir' ]

    const bindEquip = (key) => {
        const remarkInfo = remark[key]
        const typeInfo = checkedList[key]
        const dateInfo = dateObj[key]
        const mac = macInfo[key].uniqueId
        const version = macInfo[key].version
        console.log(remarkInfo, typeInfo, dateInfo)

        axios({
            method: 'post',
            url: `${serverAddress}/device-manage/device/add`,
            data: {
                uniqueId: mac,
                version,
                remarkInfo,
                typeInfo: JSON.stringify(typeInfo),
                expireTime: dateInfo,
                updatedTime: new Date().getTime(),
                // createdTime : new Date().getTime(),
            }
        }).then((res) => {
            console.log(res)
            if (res.data.code == 0) {
                message.success('添加成功')
            } else {
                message.error('添加失败')
            }
        })
    }

    const changeEquip = (key) => {
        const remarkInfo = remark[key]
        const typeInfo = checkedList[key]
        const dateInfo = dateObj[key]
        const mac = macInfo[key].uniqueId
        const version = macInfo[key].version
        console.log(remarkInfo, typeInfo, dateInfo)

        axios({
            method: 'post',
            url: `${serverAddress}/device-manage/device/edit`,
            data: {
                uniqueId: mac,
                version,
                remarkInfo,
                typeInfo: JSON.stringify(typeInfo),
                expireTime: dateInfo,
                updatedTime: new Date().getTime(),
                // createdTime : new Date().getTime(),
            }
        }).then((res) => {
            console.log(res)
            if (res.data.code == 0) {
                message.success('修改成功')
            } else {
                message.error('修改失败')
            }
        })
    }
    return (
        <div>
            <Button onClick={connent}>一键连接</Button>
            <Button onClick={readMac}>读取mac地址</Button>
            <div>
                {
                    // Object.keys(dateObj).length && 
                    
                    Object.keys(macInfo).length ? Object.keys(macInfo).map((key) => {
                        console.log(dateObj[key], dayjs((dateObj[key])).format(dateFormat),dayjs(dayjs((dateObj[key])).format(dateFormat), dateFormat))
                        return <div>
                            <div style={{ display: 'flex' }}>
                                <div className='title'>端口:</div>  {key}</div> {
                                Object.keys(macInfo[key]).map((mac) => {
                                    return <div style={{ display: 'flex' }}> <div className='title'>{mac} :</div>  {macInfo[key][mac]}

                                    </div>
                                })
                            }
                            <div style={{ display: 'flex' }}> <div className='title'>设备备注:</div>  <Input style={{ flex: 1 }} placeholder='备注' value={remark[key]} onChange={(e) => onchange(e, key)} /></div>
                            { <div style={{ display: 'flex' }}> <div className='title'>使用截至日期:</div>    <DatePicker  defaultValue={dayjs(dayjs((dateObj[key])).format(dateFormat), dateFormat)} onChange={(date, dateString) => onDateChange(date, dateString, key)} /></div>}
                            <div style={{ display: 'flex' }}> <div className='title'>设备型号:</div>    <CheckboxGroup options={plainOptions} value={checkedList[key]} onChange={(list) => onTypeChange(list, key)} /></div>
                            {macStorage[key] ? <div style={{ display: 'flex' }}>  <Button onClick={() => changeEquip(key)}>修改设备</Button></div> : <div style={{ display: 'flex' }}>  <Button onClick={() => bindEquip(key)}>绑定设备</Button></div>}
                        </div>
                    }) : ''
                }
            </div>
        </div>
    )
}

