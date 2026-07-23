import { Space, Table, Tag } from 'antd';
import axios from 'axios'
import React, { useEffect, useState } from 'react'
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { serverAddress } from '../../../util/constant';

dayjs.extend(customParseFormat);
const dateFormat = 'YYYY-MM-DD';

const columns = [
    {
        title: 'mac地址',
        dataIndex: 'uniqueId',
        key: 'uniqueId',
    },
    {
        title: '备注',
        dataIndex: 'remarkInfo',
        key: 'remarkInfo',
    },
    {
        title: '截至时间',
        dataIndex: 'dateInfo',
        key: 'dateInfo',
    },
    {
        title: '设备类型',
        dataIndex: 'typeInfo',
        key: 'typeInfo',
    },
    //   {
    //     title: 'Tags',
    //     key: 'tags',
    //     dataIndex: 'tags',
    //     render: (_, { tags }) => (
    //       <>
    //         {tags.map(tag => {
    //           let color = tag.length > 5 ? 'geekblue' : 'green';
    //           if (tag === 'loser') {
    //             color = 'volcano';
    //           }
    //           return (
    //             <Tag color={color} key={tag}>
    //               {tag.toUpperCase()}
    //             </Tag>
    //           );
    //         })}
    //       </>
    //     ),
    //   },
    //   {
    //     title: 'Action',
    //     key: 'action',
    //     render: (_, record) => (
    //       <Space size="middle">
    //         <a>Invite {record.name}</a>
    //         <a>Delete</a>
    //       </Space>
    //     ),
    //   },
];
// const data = [
//   {
//     key: '1',
//     name: 'John Brown',
//     age: 32,
//     address: 'New York No. 1 Lake Park',
//     tags: ['nice', 'developer'],
//   },
//   {
//     key: '2',
//     name: 'Jim Green',
//     age: 42,
//     address: 'London No. 1 Lake Park',
//     tags: ['loser'],
//   },
//   {
//     key: '3',
//     name: 'Joe Black',
//     age: 32,
//     address: 'Sydney No. 1 Lake Park',
//     tags: ['cool', 'teacher'],
//   },
// ];



export default function EquipList() {

    const [data, setData] = useState([])
    useEffect(() => {
        axios.post(`${serverAddress}/device-manage/device/get`, {}).then((res) => {
            console.log(res.data.data)
            const data = res.data.data.map((a) => {
                let obj = { ...a }

                obj.dateInfo = dayjs(obj.expireTime).format(dateFormat)
                console.log(obj)
                return obj
            })
            console.log(data)
            setData(data)
        })
    }, [])
    return (
        <div>
            <Table columns={columns} dataSource={data} />
        </div>
    )
}
