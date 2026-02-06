import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Play, X, ArrowLeftRight, Check, Pause } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PressureChart, NormalDistributionChart } from '@/components/charts/PressureChart'
import { HandModel } from '@/components/three/HandModel'
import { useOrgName } from '@/lib/useOrgName'
import { useAssessment } from '@/contexts/AssessmentContext'
import { useSensorSocket } from '@/contexts/SensorSocketContext'
import { HeatmapCanvas } from '@/pages/assessment/heatmap'

// Generate mock data
const generateMockData = (points) => {
  return Array.from({ length: points }, (_, i) => ({
    time: i,
    value: Math.sin(i * 0.1) * 10 + 50 + Math.random() * 5
  }))
}

const normalDistributionData = Array.from({ length: 100 }, (_, i) => {
  const x = (i - 50) / 10
  return {
    x,
    y: (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x)
  }
})

const GRIP_PROGRESS_KEY = 'jqtools.gripProgress'

const handLArr = [
  1, 2, 3, 6, 7, 8, 11, 12, 13, 16, 17, 18, 21, 22, 23, 26, 27, 28,
  31, 32, 33, 36, 37, 38, 41, 42, 43, 46, 47, 48, 51, 52, 53, 56, 57,
  58, 61, 62, 63, 66, 67, 68, 71, 72, 73, 76, 77, 78, 81, 82, 83,
  86, 87, 88, 91, 92, 93, 96, 97, 98, 101, 102, 103, 106, 107, 108,
  111, 112, 113, 116, 117, 118, 121, 122, 123, 126, 127, 128, 131,
  132, 133, 136, 137, 138, 141, 142, 143, 146, 147, 148
]

function handL(arr) {
  let adcArr = handLArr.slice().map((a) => a - 1)

  const finger1 = adcArr.splice(0, 12)
  const finger2 = adcArr.splice(0, 12)
  const finger3 = adcArr.splice(0, 12)
  const finger4 = adcArr.splice(0, 12)
  const finger5 = adcArr.splice(0, 12)
  const fingerArr = [finger1, finger2, finger3, finger4, finger5]

  const res = new Array(147).fill(0)
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 5; k++) {
      for (let j = 0; j < 3; j++) {
        res[i * 15 + k * 3 + j] = arr[fingerArr[k][i * 3 + j]]
      }
    }
  }

  const fingerMiddleHand = adcArr.splice(0, 5)
  for (let i = 0; i < 5; i++) {
    res[15 * 4 + 1 + i * 3] = arr[fingerMiddleHand[i]]
  }

  const handArr = adcArr.splice(0, 72)
  for (let i = 0; i < handArr.length; i++) {
    res[15 * 5 + i] = arr[handArr[i]]
  }

  const res1 = []
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 15; j++) {
      res1.push(res[i * 15 + 14 - j])
    }
  }
  for (let i = 75 + 12 - 1; i >= 75; i--) {
    res1.push(res[i])
  }
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 15; j++) {
      res1.push(res[75 + 12 + i * 15 + 14 - j])
    }
  }

  // return new Array(147).fill(100)
  return res1
}

function handSkinChange(res) {
  const handPointArr = [[6, 2], [6, 3], [6, 4], [3, 8], [3, 9], [3, 10], [3, 14], [3, 15], [3, 16], [3, 20], [3, 21], [3, 22], [10, 26], [10, 27], [10, 28], [7, 2], [7, 3], [7, 4], [4, 8], [4, 9], [4, 10], [4, 14], [4, 15], [4, 16], [4, 20], [4, 21], [4, 22], [11, 26], [11, 27], [11, 28], [8, 2], [8, 3], [8, 4], [5, 8], [5, 9], [5, 10], [5, 14], [5, 15], [5, 16], [5, 20], [5, 21], [5, 22], [12, 26], [12, 27], [12, 28], [9, 2], [9, 3], [9, 4], [6, 8], [6, 9], [6, 10], [6, 14], [6, 15], [6, 16], [6, 20], [6, 21], [6, 22], [13, 26], [13, 27], [13, 28], [13, 2], [13, 3], [13, 4], [13, 8], [13, 9], [13, 10], [13, 14], [13, 15], [13, 16], [13, 20], [13, 21], [13, 22], [17, 25], [17, 26], [17, 27], [17, 6], [17, 7], [17, 8], [17, 9], [17, 10], [17, 11], [17, 12], [17, 13], [17, 14], [17, 15], [17, 16], [17, 17], [19, 6], [19, 7], [19, 8], [19, 9], [19, 10], [19, 11], [19, 12], [19, 13], [19, 14], [19, 15], [19, 16], [19, 17], [19, 18], [19, 19], [19, 20], [21, 6], [21, 7], [21, 8], [21, 9], [21, 10], [21, 11], [21, 12], [21, 13], [21, 14], [21, 15], [21, 16], [21, 17], [21, 18], [21, 19], [21, 20], [23, 6], [23, 7], [23, 8], [23, 9], [23, 10], [23, 11], [23, 12], [23, 13], [23, 14], [23, 15], [23, 16], [23, 17], [23, 18], [23, 19], [23, 20], [25, 6], [25, 7], [25, 8], [25, 9], [25, 10], [25, 11], [25, 12], [25, 13], [25, 14], [25, 15], [25, 16], [25, 17], [25, 18], [25, 19], [25, 20]]
  for (let i = 4 * 15; i < 5 * 15; i++) {
    res[i] = res[i] / 3
  }

  const res1 = []
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 15; j++) {
      res1.push(res[i * 15 + 14 - j])
    }
  }
  for (let i = 75 + 12 - 1; i >= 75; i--) {
    res1.push(res[i])
  }
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 15; j++) {
      res1.push(res[75 + 12 + i * 15 + 14 - j])
    }
  }

  const newZeroArr = new Array(1024).fill(0)
  handPointArr.forEach((a, index) => {
    newZeroArr[(31 - a[0]) * 32 + a[1]] = res1[index]
    if (index >= 75) {
      newZeroArr[(31 - (a[0] + 1)) * 32 + a[1]] = res1[index]
    }
  })
  return newZeroArr
}


// 步骤状态组件
function StepIndicator({ currentStep, steps }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          <div className="flex flex-col items-center">
            <div 
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all",
                currentStep > index 
                  ? "bg-blue-500 text-white" 
                  : currentStep === index 
                    ? "bg-blue-500 text-white ring-2 ring-blue-200" 
                    : "bg-gray-200 text-gray-500"
              )}
            >
              {currentStep > index ? (
                <Check className="w-3 h-3" />
              ) : (
                index + 1
              )}
            </div>
            <span className={cn(
              "text-xs mt-1",
              currentStep >= index ? "text-blue-600" : "text-gray-400"
            )}>
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div className={cn(
              "w-8 h-0.5 -mt-4",
              currentStep > index ? "bg-blue-500" : "bg-gray-200"
            )} />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

export default function GripAssessment() {
  const navigate = useNavigate()
  const orgName = useOrgName()
  const { user } = useAssessment()
  const { lastJson } = useSensorSocket()
  const displayName = user.name || '—'
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode')
  
  // 步骤定义: 0=左手待采集, 1=左手采集中, 2=右手待采集, 3=右手采集中, 4=处理中, 5=完成
  const [currentStep, setCurrentStep] = useState(mode === 'report' ? 2 : 0) // 0: 左手, 1: 右手, 2: 完成
  const [status, setStatus] = useState(mode === 'report' ? 'completed' : 'idle')
  const [currentHand, setCurrentHand] = useState('left') // 'left' or 'right'
  const [reportMode, setReportMode] = useState('static')
  const [timer, setTimer] = useState(0)
  const [leftHandData, setLeftHandData] = useState([])
  const [rightHandData, setRightHandData] = useState([])
  const [currentPressure, setCurrentPressure] = useState(0)
  const [showCompleteDialog, setShowCompleteDialog] = useState(false)
  const [showLeftCompleteToast, setShowLeftCompleteToast] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const timerRef = useRef(null)
  const videoRef = useRef(null)
  const lastWsTsRef = useRef(0)
  const bodyCanvasRef = useRef(null)
  const [heatmapCanvas, setHeatmapCanvas] = useState(null)
  const [heatmapVersion, setHeatmapVersion] = useState(0)

  const steps = [
    { id: 'left', label: '左手' },
    { id: 'right', label: '右手' },
    { id: 'complete', label: '完成' }
  ]

  useEffect(() => {
    if (!bodyCanvasRef.current) {
      bodyCanvasRef.current = new HeatmapCanvas(30, 30, 1, 1, 'hand', {
        min: 0,
        max: 500,
        size: 40
      })
      setHeatmapCanvas(bodyCanvasRef.current.canvas)
    }
  }, [])

  useEffect(() => {
    if (mode === 'report') return
    try {
      const raw = localStorage.getItem(GRIP_PROGRESS_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (typeof saved.currentStep === 'number') setCurrentStep(saved.currentStep)
      if (saved.currentHand === 'left' || saved.currentHand === 'right') setCurrentHand(saved.currentHand)
      if (saved.status) {
        const nextStatus = saved.status === 'recording' ? 'idle' : saved.status
        setStatus(nextStatus)
      }
      if (saved.reportMode === 'static' || saved.reportMode === 'dynamic') setReportMode(saved.reportMode)
    } catch {}
  }, [mode])

  useEffect(() => {
    if (mode === 'report') return
    try {
      const safeStatus = status === 'recording' ? 'idle' : status
      const payload = {
        currentStep,
        currentHand,
        status: safeStatus,
        reportMode
      }
      localStorage.setItem(GRIP_PROGRESS_KEY, JSON.stringify(payload))
    } catch {}
  }, [mode, currentStep, currentHand, status, reportMode])

  useEffect(() => {
    if (lastJson) {
      // console.log('[ws] GripAssessment message:', lastJson)
    }
  }, [lastJson])

  useEffect(() => {
    if (mode === 'report') return
    const now = Date.now()
    if (now - lastWsTsRef.current < 50) return

    const sitData = lastJson && lastJson.sitData
    if (!sitData) return

    const hl = sitData.HL && Array.isArray(sitData.HL.arr) ? sitData.HL.arr : null
    const hr = sitData.HR && Array.isArray(sitData.HR.arr) ? sitData.HR.arr : null

    const upscale16To32 = (arr) => {
      if (!arr || arr.length !== 256) return arr
      const out = new Array(1024)
      for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 16; j++) {
          const v = arr[i * 16 + j]
          const r = i * 2
          const c = j * 2
          const base = r * 32 + c
          out[base] = v
          out[base + 1] = v
          out[base + 32] = v
          out[base + 33] = v
        }
      }
      return out
    }

    const toPressure = (arr) => {
      if (!arr || arr.length === 0) return 0
      let sum = 0
      for (let i = 0; i < arr.length; i++) sum += Number(arr[i]) || 0
      return Math.round(sum / arr.length)
    }

    if (status === 'recording') {
      if (hl) {
        const value = toPressure(hl)
        setLeftHandData(prev => {
          const next = [...prev, { time: prev.length, value }]
          return next.length > 200 ? next.slice(-200) : next
        })
        if (currentHand === 'left') setCurrentPressure(value)
      }

      if (hr) {
        const value = toPressure(hr)
        setRightHandData(prev => {
          const next = [...prev, { time: prev.length, value }]
          return next.length > 200 ? next.slice(-200) : next
        })
        if (currentHand === 'right') setCurrentPressure(value)
      }
    }

    if (bodyCanvasRef.current) {
      if (currentHand === 'left' && hl && hl.length === 256) {
        // const arr = new Array(256).fill(100)
        const mapped = handSkinChange(handL(hl))
        bodyCanvasRef.current.changeHeatmap(mapped, 1, 1, 0)
        setHeatmapVersion(v => v + 1)
      } else if (currentHand === 'right' && hr) {
        const arr1024 = upscale16To32(hr)
        bodyCanvasRef.current.changeHeatmap(arr1024, 1, 1, 0)
        setHeatmapVersion(v => v + 1)
      }
    }

    lastWsTsRef.current = now
  }, [mode, status, lastJson, currentHand])

  // Start recording
  const startRecording = () => {
    setStatus('recording')
    setTimer(0)
    
    timerRef.current = setInterval(() => {
      setTimer(prev => prev + 1)
      const newPressure = Math.random() * 20 + 180
      setCurrentPressure(newPressure)
      
      if (currentHand === 'left') {
        setLeftHandData(prev => [
          ...prev, 
          { time: prev.length, value: newPressure }
        ])
      } else {
        setRightHandData(prev => [
          ...prev, 
          { time: prev.length, value: newPressure }
        ])
      }
    }, 100)
  }

  // Stop recording
  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    
    if (currentHand === 'left') {
      // 左手采集完成，切换到右手
      setShowLeftCompleteToast(true)
      setTimeout(() => setShowLeftCompleteToast(false), 3000)
      setCurrentStep(1)
      setCurrentHand('right')
      setStatus('idle')
      setTimer(0)
    } else {
      // 右手采集完成，开始处理
      setStatus('processing')
      setCurrentStep(2)
      
      // Simulate processing
      setTimeout(() => {
        setShowCompleteDialog(true)
      }, 2000)
    }
  }

  // 查看报告
  const viewReport = () => {
    setShowCompleteDialog(false)
    setStatus('completed')
    setReportMode('static')
  }

  // Format time
  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 10)
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
    const seconds = String(totalSeconds % 60).padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
  }

  const handleClose = () => {
    if (status === 'completed') {
      localStorage.setItem('currentModuleId', '1')
      if (mode !== 'report') {
        localStorage.setItem('assessmentCompleted', 'true')
      }
    }
    navigate('/dashboard')
  }

  // 切换报告模式
  const toggleReportMode = () => {
    const newMode = reportMode === 'static' ? 'dynamic' : 'static'
    setReportMode(newMode)
    if (newMode === 'static' && videoRef.current) {
      videoRef.current.pause()
      setVideoPlaying(false)
    }
  }

  // 视频播放控制
  const toggleVideo = () => {
    if (videoRef.current) {
      if (videoPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setVideoPlaying(!videoPlaying)
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  // 获取当前手的数据
  const currentData = currentHand === 'left' ? leftHandData : rightHandData

  return (
    <div className="min-h-screen w-full bg-[#BCC6D0] flex flex-col relative overflow-hidden">
      {/* Header */}
      <header className="w-full px-8 py-6 flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-700 tracking-tight">
            肌少症/老年人评估及监测系统
          </h1>
          <span className="text-2xl text-gray-500">——</span>
          <h2 className="text-2xl font-bold text-gray-600">1.握力评估</h2>
        </div>
        
        <div className="flex items-center gap-6">
          {/* 步骤指示器 */}
          <StepIndicator currentStep={currentStep} steps={steps} />
          
          <div className="text-right flex items-center gap-4">
            <span className="text-gray-700 font-medium">{displayName}</span>
            <span className="text-gray-600">{orgName || '—'}</span>
          </div>
          <button 
            onClick={() => navigate('/history')}
            className="text-blue-600 hover:text-blue-700 font-medium text-sm border-b border-blue-600 hover:border-blue-700 transition-colors pb-0.5"
          >
            历史记录
          </button>
        </div>
      </header>

      {/* 左手采集完成提示 */}
      {showLeftCompleteToast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
            <Check className="w-3 h-3 text-white" />
          </div>
          <span className="text-gray-700">左手采集完成</span>
        </div>
      )}

      {/* 报告生成完成对话框 */}
      {showCompleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl p-8 shadow-2xl flex flex-col items-center gap-4 min-w-[300px]">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-800">报告已生成</h3>
            <button 
              onClick={viewReport}
              className="text-blue-600 hover:text-blue-700 font-medium underline"
            >
              查看报告
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex w-full h-full relative">
        {/* Close Button */}
        <button 
          onClick={handleClose}
          className="absolute top-4 right-8 z-50 text-gray-500 hover:text-gray-700 bg-white/50 hover:bg-white/80 p-2 rounded-full transition-all"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Left Panel - Left Hand Data */}
        <div className="w-80 h-full p-4 flex flex-col gap-4 z-10">
          {/* Left Hand Pressure Curve Card */}
          <Card className="bg-white/80 border-none shadow-lg rounded-xl overflow-hidden">
            <div className="p-3 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-500">压力总和曲线</h3>
            </div>
            <div className="h-24 w-full p-3">
              <PressureChart data={leftHandData.length > 0 ? leftHandData : generateMockData(50)} />
            </div>
            <div className="p-3 bg-gray-50/50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">平均压力</span>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                  <span className="text-xs font-medium text-gray-700">202.00 mmgh</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">最大压力</span>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                  <span className="text-xs font-medium text-gray-700">202.00 mmgh</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">压力总和</span>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                  <span className="text-xs font-medium text-gray-700">202.00 mmgh</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Left Hand Normal Distribution Card */}
          <Card className="bg-white/80 border-none shadow-lg rounded-xl overflow-hidden">
            <div className="p-3 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-500">压力正态分布图</h3>
            </div>
            <div className="h-24 w-full p-3">
              <NormalDistributionChart data={normalDistributionData} />
            </div>
            <div className="p-3 bg-gray-50/50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">均值</span>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                  <span className="text-xs font-medium text-gray-700">202.00</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">方差</span>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                  <span className="text-xs font-medium text-gray-700">202.00</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">偏度</span>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                  <span className="text-xs font-medium text-gray-700">202.00</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">峰度</span>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                  <span className="text-xs font-medium text-gray-700">202.00</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* 3D Hand Model Area */}
        <div className="flex-1 flex flex-col items-center justify-center relative">
          {/* Grid Background */}
          <div className="absolute inset-0 z-0 opacity-20" 
            style={{
              backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
              backgroundSize: '40px 40px'
            }}
          />
          
          {/* Report Mode Switcher */}
          {status === 'completed' && (
            <div className="absolute top-8 z-20 flex items-center gap-2 bg-white/80 backdrop-blur px-4 py-2 rounded-full shadow-sm">
              <span className="text-gray-700 font-medium">
                {displayName}的握力评估{reportMode === 'static' ? '静态报告' : '动态报告'}
              </span>
              <button 
                onClick={toggleReportMode}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium text-sm ml-2"
              >
                <ArrowLeftRight className="w-4 h-4" />
                切换至{reportMode === 'static' ? '动态报告' : '静态报告'}
              </button>
            </div>
          )}

          {/* Main View Area */}
          <div className="relative z-10 h-[60vh] w-full flex items-center justify-center">
            {status === 'completed' && reportMode === 'static' ? (
              /* 静态报告 - PDF 显示 */
              <div className="w-full h-full max-w-4xl mx-auto p-4">
                <iframe 
                  src="/assets/static_report.pdf"
                  className="w-full h-full rounded-xl shadow-xl bg-white"
                  title="静态报告"
                />
              </div>
            ) : status === 'completed' && reportMode === 'dynamic' ? (
              /* 动态报告 - 视频显示 */
              <div className="w-full h-full max-w-4xl mx-auto p-4 flex flex-col items-center justify-center">
                <video 
                  ref={videoRef}
                  src="/assets/dynamic_report.mp4"
                  className="w-full h-full max-h-[50vh] rounded-xl shadow-xl bg-black object-contain"
                  controls
                  onPlay={() => setVideoPlaying(true)}
                  onPause={() => setVideoPlaying(false)}
                />
              </div>
            ) : (
              <>
                <HandModel 
                  isRecording={status === 'recording'} 
                  pressureValue={currentPressure}
                  isLeftHand={currentHand === 'left'}
                  heatmapCanvas={heatmapCanvas}
                  heatmapVersion={heatmapVersion}
                />
                
                {/* Processing Overlay */}
                {status === 'processing' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/10 backdrop-blur-[2px]">
                    <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden mb-4">
                      <div className="h-full bg-blue-500 animate-progress" style={{ width: '100%' }}></div>
                    </div>
                    <p className="text-white font-medium text-lg drop-shadow-md">正在汇总采集数据并生成报告，请稍候...</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Control Button */}
          <div className="absolute bottom-12 z-20 flex flex-col items-center gap-2">
            {status === 'idle' && (
              <>
                <button 
                  onClick={startRecording}
                  className="w-20 h-20 rounded-full border-4 border-white bg-transparent flex items-center justify-center hover:scale-105 transition-transform group"
                >
                  <div className="w-14 h-14 rounded-full bg-white group-hover:bg-gray-100 transition-colors" />
                </button>
                <span className="text-gray-600 font-medium">
                  开始采集{currentHand === 'left' ? '左手' : '右手'}
                </span>
              </>
            )}

            {status === 'recording' && (
              <>
                <button 
                  onClick={stopRecording}
                  className="w-20 h-20 rounded-full border-4 border-blue-500 bg-blue-500/20 flex items-center justify-center hover:scale-105 transition-transform"
                >
                  <div className="w-8 h-8 rounded-sm bg-blue-600" />
                </button>
                <div className="flex items-center gap-2 bg-white/80 px-3 py-1 rounded-full text-sm font-mono">
                  <span>结束采集{currentHand === 'left' ? '左手' : '右手'}</span>
                  <span>{formatTime(timer)}</span>
                </div>
              </>
            )}

            {status === 'completed' && reportMode === 'dynamic' && (
              <div className="flex gap-4">
                <button 
                  onClick={toggleVideo}
                  className="bg-white/90 backdrop-blur rounded-lg shadow-lg p-3 flex items-center gap-2 hover:bg-white transition-colors"
                >
                  {videoPlaying ? (
                    <Pause className="w-5 h-5 text-gray-600" />
                  ) : (
                    <Play className="w-5 h-5 text-gray-600 fill-gray-600" />
                  )}
                  <span className="text-sm text-gray-600">{videoPlaying ? '暂停' : '播放'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Right Hand Data */}
        <div className="w-80 h-full p-4 flex flex-col gap-4 z-10">
          {/* Right Hand Pressure Curve Card */}
          <Card className="bg-white/80 border-none shadow-lg rounded-xl overflow-hidden">
            <div className="p-3 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-500">压力总和曲线</h3>
            </div>
            <div className="h-24 w-full p-3">
              <PressureChart data={rightHandData.length > 0 ? rightHandData : generateMockData(50)} />
            </div>
            <div className="p-3 bg-gray-50/50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">平均压力</span>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                  <span className="text-xs font-medium text-gray-700">202.00 mmgh</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">最大压力</span>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                  <span className="text-xs font-medium text-gray-700">202.00 mmgh</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">压力总和</span>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                  <span className="text-xs font-medium text-gray-700">202.00 mmgh</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Right Hand Normal Distribution Card */}
          <Card className="bg-white/80 border-none shadow-lg rounded-xl overflow-hidden">
            <div className="p-3 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-500">压力正态分布图</h3>
            </div>
            <div className="h-24 w-full p-3">
              <NormalDistributionChart data={normalDistributionData} />
            </div>
            <div className="p-3 bg-gray-50/50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">均值</span>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                  <span className="text-xs font-medium text-gray-700">202.00</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">方差</span>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                  <span className="text-xs font-medium text-gray-700">202.00</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">偏度</span>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                  <span className="text-xs font-medium text-gray-700">202.00</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">峰度</span>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                  <span className="text-xs font-medium text-gray-700">202.00</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </main>

      <div className="absolute bottom-8 left-8 text-xs text-gray-500 font-medium z-10">
        powered by 矩侨工业
      </div>

      {/* CSS for progress animation */}
      <style>{`
        @keyframes progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        .animate-progress {
          animation: progress 2s ease-out forwards;
        }
      `}</style>
    </div>
  )
}
