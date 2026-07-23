import React, { useState } from 'react';
import { AppstoreOutlined, MailOutlined, SettingOutlined } from '@ant-design/icons';
import { Menu } from 'antd';
import Addequip from './addEquip/Addequip';
import EquipList from './equipList/EquipList';
import SystemSetting from './systemSetting/SystemSetting';
import Python from './py/Python';
const items = [
    {
        key: 'grp',
        label: '设备管理',
        type: 'group',
        children: [
            { key: '0', label: '设备添加' },
            { key: '1', label: '设备列表' },
            { key: '2', label: '配置系统' },
            { key: '3', label: '设置算法' },
        ],
    },
];

const componentArr = {
    0 : <Addequip />,
    1 :  <EquipList />,
    2 : <SystemSetting />,
    3 : <Python />
}
const App = () => {

    const [key, setKey] = useState('3')
    const onClick = e => {
        console.log('click ', e.key);
        setKey(e.key)
    };
    return (
        <div style={{ padding: 10, display: 'flex' }}>
            <Menu
                onClick={onClick}
                style={{ width: 256 }}
                defaultSelectedKeys={[key]}
                defaultOpenKeys={[key]}
                mode="inline"
                items={items}
            />
            <div style={{ marginLeft: 10 }}>{
                // key == '1' ? <Addequip /> : <EquipList />
                componentArr[key]
            }</div>
        </div>
    );
};
export default App;