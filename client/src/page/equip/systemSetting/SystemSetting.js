import React, { useState } from 'react'
import { Checkbox, Flex, Radio, Divider, Input, Button } from 'antd';
import './index.scss'
import axios from 'axios';
const options = [
    { label: '床垫', value: 'bed' },
    { label: '汽车座椅', value: 'car' },
    { label: 'endi', value: 'endi' },
    { label: 'carAir', value: 'carAir' },
];

const plainOptions = ['bed', 'car', 'endi' , 'carAir'];
const defaultCheckedList = ['bed', 'car', 'endi', 'carAir'];
const titleObj = {
    bed: '床垫',
    car: '人体工学椅',
    endi: '汽车座椅',
    carAir : '自适应座椅'
}

const setArr = [
    { title: '图像润滑', value: 'gauss' },
    { title: '颜色调节', value: 'color' },
    { title: '噪点消除', value: 'filter' },
    { title: '高度调节', value: 'height' },
    { title: '响应速度', value: 'coherent' }
]

const CheckboxGroup = Checkbox.Group;
export default function SystemSetting() {

    const [checkedList, setCheckedList] = useState(defaultCheckedList);
    const checkAll = plainOptions.length === checkedList.length;
    const indeterminate = checkedList.length > 0 && checkedList.length < plainOptions.length;
    const onChange = list => {
        setCheckedList(list);
    };
    const onCheckAllChange = e => {
        setCheckedList(e.target.checked ? plainOptions : []);
    };


    // const 
    const [inputValue, setINputValue] = useState({
        optimalObj: {
            bed: { gauss: 2.6, color: 355, filter: 6, height: 2.02, coherent: 1 },
            car: { gauss: 2, color: 495, filter: 0, height: 3.36, coherent: 1 },
            endi: { gauss: 2, color: 495, filter: 0, height: 3.36, coherent: 1 },
            carAir: { gauss: 2, color: 495, filter: 0, height: 3.36, coherent: 1 }
        },
        maxObj: {
            bed: { gauss: 4, color: 2000, filter: 20, height: 8, coherent: 10 },
            car: { gauss: 4, color: 2000, filter: 20, height: 8, coherent: 10 },
            endi: { gauss: 4, color: 2000, filter: 20, height: 8, coherent: 10 },
            carAir: { gauss: 4, color: 2000, filter: 20, height: 8, coherent: 10 },
        }
    })

    const [sysValue, setSysValue] = useState('bed')
    const [config, setConfig] = useState('')

    return (
        <div className='sysSetting'>
            <Flex gap="middle" className='mb10px'>
                <div className='systitle'>默认系统 :</div> <Radio.Group onChange={(e) => {
                    console.log(e.target.value)
                    setSysValue(e.target.value)
                }} block options={options} defaultValue={sysValue} />
            </Flex>
            <Flex gap="middle">
                <div className='systitle'>默认系统下拉 :</div>

                <div>
                    <Checkbox indeterminate={indeterminate} onChange={onCheckAllChange} checked={checkAll}>
                        Check all
                    </Checkbox>
                    <Divider />
                    <CheckboxGroup options={plainOptions} value={checkedList} onChange={onChange} />
                </div>
            </Flex>


            <div className='systitle'>系统调节最大最佳值</div>
            {/* <div className='systitle'>1.床垫最佳值</div>
            <Flex gap="middle">
                <div>图像润滑 <Input /></div>
                <div>颜色调节 <Input /></div>
                <div>噪点消除 <Input /></div>
                <div>高度调节 <Input /></div>
                <div>响应速度 <Input /></div>
            </Flex>
            <div className='systitle'>2.床垫最大值</div>
            <Flex gap="middle">
                <div>图像润滑 <Input /></div>
                <div>颜色调节 <Input /></div>
                <div>噪点消除 <Input /></div>
                <div>高度调节 <Input /></div>
                <div>响应速度 <Input /></div>
            </Flex>
            <div className='systitle'>3.汽车最佳值</div>
            <Flex gap="middle">
                <div>图像润滑 <Input /></div>
                <div>颜色调节 <Input /></div>
                <div>噪点消除 <Input /></div>
                <div>高度调节 <Input /></div>
                <div>响应速度 <Input /></div>
            </Flex>
            <div className='systitle'>4.汽车最大值</div>
            <Flex gap="middle">
                <div>图像润滑 <Input /></div>
                <div>颜色调节 <Input /></div>
                <div>噪点消除 <Input /></div>
                <div>高度调节 <Input /></div>
                <div>响应速度 <Input /></div>
            </Flex> */}

            {
                plainOptions.map((a, index) => {
                    return <>
                        <div className='systitle'>{index * 2 + 1} , {titleObj[a]}最佳值</div>
                        <Flex gap="middle">

                            {
                                setArr.map((b) => {
                                    return <div>{b.title} <Input value={inputValue.optimalObj[a][b.value]} onChange={(e) => {
                                        const obj = JSON.parse(JSON.stringify(inputValue))
                                        obj.optimalObj[a][b.value] = (e.target.value)
                                        setINputValue(obj)
                                    }} /></div>
                                })
                            }
                        </Flex>
                        <div className='systitle'>{index * 2 + 1} , {titleObj[a]}最大值</div>
                        <Flex gap="middle">
                            {
                                setArr.map((b) => {
                                    return <div>{b.title} <Input value={inputValue.maxObj[a][b.value]} onChange={(e) => {
                                        const obj = JSON.parse(JSON.stringify(inputValue))
                                        obj.maxObj[a][b.value] = (e.target.value)
                                        setINputValue(obj)
                                        console.log(obj, e.target.value)
                                    }} /></div>
                                })
                            }
                        </Flex>
                    </>
                })
            }

            <Button
                onClick={() => {
                    const newObj = {
                        value: sysValue,
                        typeArr: checkedList,
                        ...inputValue

                    }

                    // let optimalObj = newObj.optimalObj

                    for (const objName of ["optimalObj", "maxObj"]) {
                        for (const type in newObj[objName]) {
                            for (const key in newObj[objName][type]) {
                                newObj[objName][type][key] = Number(newObj[objName][type][key]);
                            }
                        }
                    }

                    console.log((newObj))

                    axios({
                        method: 'post',
                        url: 'http://localhost:19245/getSysconfig',
                        data: {
                            config: newObj,
                        }
                    }).then((res) => {
                        console.log(res)
                        // if (res.data.message == 'error') {
                        //     message.error(res.data.data)
                        // } else {
                        //     message.success('下载成功')
                        // }
                        setConfig(res.data.data)

                    }).catch((err) => {
                        // message.error('下载失败')

                    })
                }}
            >生成配置</Button>

            <div className='systitle'>配置文件</div>
            <div>{config}</div>
        </div>
    )
}
