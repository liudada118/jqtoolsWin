import logo from './logo.svg';
import './App.css';
import { HashRouter, Route, Routes } from 'react-router-dom';
import Test from './page/test/Test';
import './locale/index'; // 在这里导入
import i18next from "i18next";
import Equip from './page/equip/Equip';
import Data from './page/data/Data';
import RawSerialPage from './page/rawSerial/RawSerialPage';
import RemoteControlPage from './page/remoteControl/RemoteControlPage';
// import Addequip from './page/addEquip/Addequip';

i18next.init({
  resources: {
    en: {
      translation: {
        connect: 'Connect',
        back: 'Back',
        sit: 'Seat',
        freq: 'Freq',
        history: 'History',
        local: 'Local',
        import: 'Import',
        filename: 'Filename',
        flip: 'Flip',
        flipV: 'FlipV',
        flipH: 'FlipH',
        zeroPre: 'Zero',
        select: 'Select',
        ruler: 'Ruler',
        upload: 'Upload',
        adjust: 'Adjust',
        blur: 'GaussianBlur',
        colorAdj: 'ColorAdj',
        denoise: 'Denoise',
        heightAdj: 'HeightAdj',
        continuity: 'Continuity',
        frame: 'Frame',
        collectSettings: 'CollectSettings',
        compare: 'Compare',
        emphSet: 'EmphasisSettings',

        // ——今天新增/长文字扩写——
        hand: 'PressureMap',
        bed: 'MattressPres.',
        bedEquip: 'BedSensor',
        handEquip: 'Sensor',
        untitled: 'Untitled',
        point3D: '3D Model',
        num2D: 'Num2D',
        viewSwitch3D: 'ViewSwitch3D',
        renameStorage: 'RenameStorage',
        storageName: 'StorageName',
        cancel: 'Cancel',
        ok: 'OK',
        rename: 'rename',
        download: 'download',
        delete: 'delete',
        car: 'Ergo Chair',
        // ——这几个写长一点——
        algoUniform: 'Algorithm for Uniform Color Distribution',
        algoRedBlue: 'Algorithm for Red-to-Blue Gradient Coloring',
        filterNoise: 'Noise Filtering Below Threshold Value',
        pointHeight: 'Point Height Representation in 3D Space',
        sensitivity: 'Sensor Response Sensitivity Value',
        all: 'overall',
        restore: 'Restore Default',
        back2D: 'back',
        sit2D: 'sit',
        back3D: 'back',
        sit3D: 'sit',
        num3D: 'num3D',
        resetView: 'ResetView',
        sizeAdj: 'SizeAdjustment',
        viewAdj: 'ViewAdjustment',
        angleAdj: 'AngleAdjustment',
        pressAver: 'pressAver',
        pressMax: 'pressMax',
        pressMin : 'pressMax',
        pressTotal: 'pressTotal',
        areaTotal: 'areaTotal',
        pointTotal: 'pointTotal',
        pressureCurve: 'Pressure Curve',
        areaCurve: 'Area Curve',
        speed: 'Speed',
        dataCollect: 'Data Collect'
      },
    },
    zh: {
      translation: {
        connect: '一键连接',
        back: '靠背',
        sit: '坐垫',
        freq: '采集频率',
        history: '历史数据',
        local: '本地数据',
        import: '导入数据',
        filename: '数据名称',
        flip: '画布翻转',
        flipV: '上下翻转',
        flipH: '左右翻转',
        zeroPre: '预压力置零',
        select: '框选工具',
        ruler: '量尺工具',
        upload: '图片上传',
        adjust: '可视化调节',
        blur: '图像润滑',
        colorAdj: '颜色调节',
        denoise: '噪点消除',
        heightAdj: '高度调节',
        continuity: '响应速度',
        frame: '帧',
        collectSettings: '采集参数设置',
        compare: '对比',
        emphSet: '强调设置',
        bedEquip: '床垫',

        download: '下载',
        delete: '删除',
        // ——今天新增/长文字扩写——
        rename: '修改名称',

        car: '人体工学椅',
        hand: '坐垫',
        bed: '床垫',

        untitled: '未命名',
        point3D: '3D模型',
        num2D: '2D数字',
        viewSwitch3D: '3D点图切换视角',
        renameStorage: '修改存储名称',
        storageName: '存储名称',
        handEquip: '坐垫',
        // ——这几个写长一点——
        algoUniform: '点图颜色分布均匀的算法值',
        algoRedBlue: '点图颜色由红到蓝的一个算法值',
        filterNoise: '过滤掉一些小于设置数的噪点',
        pointHeight: '点图在3D空间的高度',
        sensitivity: '点图在传感反应的灵敏度',
        cancel: '取消',
        ok: '确认',
        all: '整体',
        reset3D: '重置3D视图',
        restore: '恢复默认值',
        back2D: '靠背',
        sit2D: '坐垫',
        back3D: '靠背',
        sit3D: '坐垫',
        num3D: '3D数字',
        resetView: '重置视角',
        sizeAdj: '大小调节',
        viewAdj: '视图调节',
        angleAdj: '视角调节',
        pressAver: '平均压强',
        pressMax: '最大压强',
        pressTotal: '压强总和',
        pressMin : '最小压强',
        areaTotal: '面积',
        pointTotal: '点数',
        pressureCurve: '压强总和曲线',
        areaCurve: '面积曲线',
        speed: '倍速',
        dataCollect: '数据采集'
      },
    },
  },
  lng: localStorage.getItem('language') ? localStorage.getItem('language') : 'zh',
});

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route
          path="/raw-serial"
          element={<RawSerialPage />}
        />
        <Route
          path="/remote-control"
          element={<RemoteControlPage />}
        />

        <Route
          path="/data"
          exact
          element={
            <Data i18n={i18next} />
          }
        />

        <Route
          path="/addMac"
          exact
          element={
            <Equip i18n={i18next} />
          }
        />



        <Route
          exact
          path="/"
          element={
            <Test i18n={i18next} />
          }
        />
      </Routes>
    </HashRouter>
  );
}

export default App;
