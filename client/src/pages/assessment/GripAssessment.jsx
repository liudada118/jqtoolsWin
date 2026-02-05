import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Play, X, ArrowLeftRight, Check, Pause } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PressureChart, NormalDistributionChart } from '@/components/charts/PressureChart'
import { HandModel } from '@/components/three/HandModel'
import { useOrgName } from '@/lib/useOrgName'
import { useAssessment } from '@/contexts/AssessmentContext'

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

  const steps = [
    { id: 'left', label: '左手' },
    { id: 'right', label: '右手' },
    { id: 'complete', label: '完成' }
  ]

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
