# 肌少症/老年人评估及监测系统

基于 React 18.1.0 + ECharts 5.6.0 + Three.js 0.177.0 的老年人肌少症评估系统 UI。

## 技术栈

- **React** ^18.1.0 - 前端框架
- **ECharts** ^5.6.0 - 数据可视化图表
- **Three.js** ^0.177.0 - 3D 模型渲染
- **Tailwind CSS** ^3.4.0 - CSS 框架
- **React Router** ^6.22.0 - 路由管理
- **Vite** ^5.4.0 - 构建工具
- **Lucide React** - 图标库

## 项目结构

```
sarcopenia-react-app/
├── src/
│   ├── components/
│   │   ├── ui/              # UI 基础组件
│   │   │   ├── Button.jsx
│   │   │   ├── Card.jsx
│   │   │   ├── Dialog.jsx
│   │   │   ├── Input.jsx
│   │   │   ├── Select.jsx
│   │   │   └── Toast.jsx
│   │   ├── charts/          # ECharts 图表组件
│   │   │   └── PressureChart.jsx
│   │   └── three/           # Three.js 3D 模型组件
│   │       ├── HandModel.jsx
│   │       ├── HumanModel.jsx
│   │       └── FootModel.jsx
│   ├── pages/
│   │   ├── assessment/      # 评估页面
│   │   │   ├── GripAssessment.jsx      # 握力评估
│   │   │   ├── SitStandAssessment.jsx  # 起坐能力评估
│   │   │   ├── StandingAssessment.jsx  # 静态站立评估
│   │   │   └── GaitAssessment.jsx      # 行走步态评估
│   │   ├── Login.jsx                   # 登录页
│   │   ├── Dashboard.jsx               # 仪表盘
│   │   ├── AssessmentHistory.jsx       # 历史记录
│   │   └── NotFound.jsx                # 404页面
│   ├── contexts/
│   │   └── ThemeContext.jsx  # 主题上下文
│   ├── lib/
│   │   └── utils.js          # 工具函数
│   ├── App.jsx               # 主应用组件
│   ├── main.jsx              # 入口文件
│   └── index.css             # 全局样式
├── public/
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

## 功能特性

### 1. 握力评估 (GripAssessment)
- 3D 手部模型展示（Three.js）
- 实时压力数据采集
- 压力曲线图表（ECharts）
- 正态分布分析图
- 静态/动态报告切换

### 2. 起坐能力评估 (SitStandAssessment)
- 3D 人体模型动画
- 起坐动作分析
- 实时数据监测

### 3. 静态站立评估 (StandingAssessment)
- 3D 足部模型
- 压力分布可视化
- 平衡稳定性分析

### 4. 行走步态评估 (GaitAssessment)
- 3D 行走动画
- 步态周期分析
- 步速/步频监测

## 安装与运行

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
npm run dev
```

### 生产构建
```bash
npm run build
```

### 预览构建
```bash
npm run preview
```

## 页面路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | Login | 登录页面 |
| `/dashboard` | Dashboard | 主仪表盘 |
| `/assessment/grip` | GripAssessment | 握力评估 |
| `/assessment/sit-stand` | SitStandAssessment | 起坐能力评估 |
| `/assessment/standing` | StandingAssessment | 静态站立评估 |
| `/assessment/gait` | GaitAssessment | 行走步态评估 |
| `/history` | AssessmentHistory | 历史记录 |

## 组件说明

### ECharts 图表组件
- `PressureChart` - 压力曲线图
- `NormalDistributionChart` - 正态分布图

### Three.js 3D 组件
- `HandModel` - 手部模型（握力评估）
- `HumanModel` - 人体模型（起坐/步态评估）
- `FootModel` - 足部模型（站立评估）

## 注意事项

1. 项目使用 JSX 格式（非 TypeScript）
2. 使用 Tailwind CSS 进行样式管理
3. 3D 模型使用 Three.js 原生 API 构建
4. 图表使用 ECharts 配置式 API

## 开发者

powered by 矩侨工业
