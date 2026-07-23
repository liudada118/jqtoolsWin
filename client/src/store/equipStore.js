import { create } from 'zustand';
import { shallow } from 'zustand/shallow';
import { maxObj } from '../assets/util/constant';

const setValueData = localStorage.getItem('setValueData') ? JSON.parse(localStorage.getItem('setValueData')) : { gauss: 1, color: 200, filter: 1, height: 1, coherent: 1 }
const setMaxData = maxObj['bed']
export const useEquipStore = create(set => ({
    status: {},
    equipStamp: 0,
    displayStatus: {},
    history: {},
    cop: {},
    systemType: 'endi',
    systemTypeArr: [],
    display: false,
    equipStatus: {},
    displayType: 'all',
    display : 'point3D',



    settingValue: setValueData,
    settingValueMax : setMaxData,
    settingValueOptimal : setValueData,

    setDisplay: (s) => set({ display: s }),
    setDisplayType: (s) => set({ displayType: s }),
    setSettingValue: (s) => set({ settingValue: s }),
    setSettingValueMax: (s) => set({ settingValueMax: s }),
    setSettingValueOptimal: (s) => set({ settingValueOptimal: s }),


    setEquipStatus: (s) => set({ equipStatus: s }),
    setDisplay: (s) => set({ display: s }),
    setSystemType: (s) => set({ systemType: s }),
    setSystemTypeArr: (s) => set({ systemTypeArr: s }),
    setStatus: (s) => set({ status: s }),
    setEquipStamp: (s) => set({ equipStamp: s }),
    setHistoryStatus: (history) => set({ history: history }),
    setDisplayStatus: (s) => set({ displayStatus: s }),
    setEquipCop: (s) => set({ cop: s }),
}));

export const getStatus = () => useEquipStore.getState().status;
export const getsetDisplayStatus = () => useEquipStore.getState().displayStatus;
export const getSysType = () => useEquipStore.getState().systemType;
export const getSettingValue = () => useEquipStore.getState().settingValue;
export const getDisplayType = () => useEquipStore.getState().displayType;
export const getSettingValueOptimal = () => useEquipStore.getState().settingValueOptimal;