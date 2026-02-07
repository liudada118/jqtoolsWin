import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Play, X, ArrowLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PressureChart, NormalDistributionChart } from '@/components/charts/PressureChart'
import { FootSinkScene } from 'shroomcomlibrary/heatmap/foot-sink'
import { useOrgName } from '@/lib/useOrgName'
import { useAssessment } from '@/contexts/AssessmentContext'
import { useSensorSocket } from '@/contexts/SensorSocketContext'
import { Scheduler } from '@/scheduler/scheduler'

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

const EMPTY_4096 = new Array(4096).fill(0)

const GAIT_PROGRESS_KEY = 'jqtools.gaitProgress'

const stitchFootRows = (f1, f2, f3, f4) => {
  const out = new Array(64 * 256)
  let idx = 0
  const blocks = [f1, f2, f3, f4]
  for (let r = 0; r < 64; r++) {
    const rowBase = r * 64
    for (let b = 0; b < 4; b++) {
      const block = blocks[b]
      for (let c = 0; c < 64; c++) {
        out[idx++] = block[rowBase + c] ?? 0
      }
    }
  }
  return out
}


export default function GaitAssessment() {
  const navigate = useNavigate()
  const orgName = useOrgName()
  const { user } = useAssessment()
  const { lastJson } = useSensorSocket()
  const displayName = user.name || '—'
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode')
  
  const [status, setStatus] = useState(mode === 'report' ? 'completed' : 'idle')
  const [reportMode, setReportMode] = useState('static')
  const [timer, setTimer] = useState(0)
  const [pressureData, setPressureData] = useState([])
  const recordTickRef = useRef(0)
  const latestFootRef = useRef({ foot1: null, foot2: null, foot3: null, foot4: null })
  const latestFootSeqRef = useRef(0)
  const lastFootUiSeqRef = useRef(0)
  const [realtimeData, setRealtimeData] = useState(null)

  useEffect(() => {
    if (mode === 'report') return
    try {
      const raw = localStorage.getItem(GAIT_PROGRESS_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
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
      localStorage.setItem(GAIT_PROGRESS_KEY, JSON.stringify({ status: safeStatus, reportMode }))
    } catch {}
  }, [mode, status, reportMode])

  useEffect(() => {
    if (!lastJson || !lastJson.sitData) return
    const foot1 = lastJson.sitData?.foot1?.arr
    const foot2 = lastJson.sitData?.foot2?.arr
    const foot3 = lastJson.sitData?.foot3?.arr
    const foot4 = lastJson.sitData?.foot4?.arr
    if (foot1 || foot2 || foot3 || foot4) {
      latestFootRef.current = {
        foot1: Array.isArray(foot1) ? foot1 : null,
        foot2: Array.isArray(foot2) ? foot2 : null,
        foot3: Array.isArray(foot3) ? foot3 : null,
        foot4: Array.isArray(foot4) ? foot4 : null
      }
      latestFootSeqRef.current += 1
    }
  }, [lastJson])

  useEffect(() => {
    const unsubscribe = Scheduler.onUI(() => {
      const seq = latestFootSeqRef.current
      if (!seq || seq == lastFootUiSeqRef.current) return
      lastFootUiSeqRef.current = seq
      const { foot1, foot2, foot3, foot4 } = latestFootRef.current
      const f1 = Array.isArray(foot1) && foot1.length === 4096 ? foot1 : EMPTY_4096
      const f2 = Array.isArray(foot2) && foot2.length === 4096 ? foot2 : EMPTY_4096
      const f3 = Array.isArray(foot3) && foot3.length === 4096 ? foot3 : EMPTY_4096
      const f4 = Array.isArray(foot4) && foot4.length === 4096 ? foot4 : EMPTY_4096
      setRealtimeData(stitchFootRows(f1, f2, f3, f4))
    })
    return () => unsubscribe?.()
  }, [])

  useEffect(() => {
    const unsubscribe = Scheduler.onRender(() => {
      if (status !== 'recording') return
      const now = performance.now()
      if (!recordTickRef.current) {
        recordTickRef.current = now
        return
      }
      const delta = now - recordTickRef.current
      if (delta < 100) return
      const steps = Math.floor(delta / 100)
      recordTickRef.current += steps * 100
      setTimer(prev => prev + steps)
      setPressureData(prev => {
        const next = [...prev]
        for (let i = 0; i < steps; i++) {
          next.push({ time: next.length, value: Math.random() * 20 + 180 })
        }
        return next
      })
    })
    return () => unsubscribe?.()
  }, [status])


  const startRecording = () => {
    setStatus('recording')
    setTimer(0)
    setPressureData([])
    recordTickRef.current = 0
  }

  const stopRecording = () => {
    setStatus('processing')
    
    setTimeout(() => {
      setStatus('completed')
      setReportMode('static')
    }, 2000)
  }

  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 10)
    return `00:00:0${seconds}`
  }

  const handleClose = () => {
    if (status === 'completed') {
      localStorage.setItem('currentModuleId', '4')
      if (mode !== 'report') {
        localStorage.setItem('assessmentCompleted', 'true')
      }
    }
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen w-full bg-[#BCC6D0] flex flex-col relative overflow-hidden">
      {/* Header */}
      <header className="w-full px-8 py-6 flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-700 tracking-tight">
            肌少症/老年人评估及监测系统
          </h1>
          <span className="text-2xl text-gray-500">—</span>
          <h2 className="text-2xl font-bold text-gray-600">4.行走步态评估</h2>
        </div>
        
        <div className="flex items-center gap-6">
          {status === 'completed' && (
            <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-lg shadow-sm flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-sm text-gray-600">{displayName}的行走步态评估报告已保存至</span>
              <button onClick={() => navigate('/history')} className="text-blue-600 hover:underline text-sm font-medium">历史记录</button>
            </div>
          )}
          
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

      {/* Main Content */}
      <main className="flex-1 flex w-full h-full relative">
        <button 
          onClick={handleClose}
          className="absolute top-4 right-8 z-50 text-gray-500 hover:text-gray-700 bg-white/50 hover:bg-white/80 p-2 rounded-full transition-all"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex-1 flex flex-col items-center justify-center relative">
          <div className="absolute inset-0 z-0 opacity-20" 
            style={{
              backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
              backgroundSize: '40px 40px'
            }}
          />
          
          {status === 'completed' && (
            <div className="absolute top-8 z-20 flex items-center gap-2 bg-white/80 backdrop-blur px-4 py-2 rounded-full shadow-sm">
              <span className="text-gray-700 font-medium">
                {displayName}的行走步态评估{reportMode === 'static' ? '静态报告' : '动态报告'}
              </span>
              <button 
                onClick={() => setReportMode(prev => prev === 'static' ? 'dynamic' : 'static')}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium text-sm ml-2"
              >
                <ArrowLeftRight className="w-4 h-4" />
                切换至{reportMode === 'static' ? '动态报告' : '静态报告'}
              </button>
            </div>
          )}

          <div className="relative z-10 h-[60vh] w-full flex items-center justify-center">
            {status === 'completed' && reportMode === 'static' ? (
              <div className="bg-white p-8 rounded-xl shadow-xl max-w-2xl w-full h-full overflow-y-auto">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                  <h3 className="text-xl font-bold text-gray-800">行走步态评估静态报告</h3>
                  <span className="text-sm text-gray-500">2026-02-05</span>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <span className="text-sm text-gray-500 block mb-1">步速</span>
                      <span className="text-2xl font-bold text-blue-600">1.2 m/s</span>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <span className="text-sm text-gray-500 block mb-1">步频</span>
                      <span className="text-2xl font-bold text-blue-600">110 steps/min</span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <span className="text-sm text-gray-500 block mb-1">步长一致性</span>
                      <span className="text-2xl font-bold text-green-600">High</span>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <span className="text-sm text-gray-500 block mb-1">双支撑相占比</span>
                      <span className="text-2xl font-bold text-blue-500">22%</span>
                    </div>
                  </div>
                </div>
                <div className="mt-6">
                  <h4 className="font-medium text-gray-700 mb-2">评估结论</h4>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    受测者步态周期规律，左右步长对称性良好。行走速度处于同龄人正常范围，未见明显跛行或拖步现象。下肢运动协调性正常。
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="w-full h-full">
                  <FootSinkScene
                    showHeatmap
                    enableClipping={false}
                    clipLevel={0.35}
                    depthScale={0.35}
                    smoothness={0.6}
                    realtimeData={realtimeData}
                  />
                </div>
                
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

          <div className="absolute bottom-12 z-20 flex flex-col items-center gap-2">
            {status === 'idle' && (
              <>
                <button 
                  onClick={startRecording}
                  className="w-20 h-20 rounded-full border-4 border-white bg-transparent flex items-center justify-center hover:scale-105 transition-transform group"
                >
                  <div className="w-14 h-14 rounded-full bg-white group-hover:bg-gray-100 transition-colors" />
                </button>
                <span className="text-gray-600 font-medium">开始采集</span>
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
                  <span>结束采集</span>
                  <span>{formatTime(timer)}</span>
                </div>
              </>
            )}

            {status === 'completed' && reportMode === 'dynamic' && (
              <div className="flex gap-4">
                <div className="bg-white/90 backdrop-blur rounded-lg shadow-lg p-1 flex items-center gap-2 pr-4">
                  <button className="w-8 h-8 flex items-center justify-center">
                    <Play className="w-4 h-4 text-gray-600 fill-gray-600" />
                  </button>
                  <div className="h-1 w-32 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full w-1/3 bg-gray-400"></div>
                  </div>
                  <span className="text-xs text-gray-500 font-mono">00:00:04</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-96 h-full p-6 flex flex-col gap-6 z-10 bg-white/30 backdrop-blur-sm border-l border-white/20">
          <Card className="bg-white/80 border-none shadow-lg rounded-xl overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-500">压力总和曲线</h3>
            </div>
            <div className="h-32 w-full p-4">
              <PressureChart data={status === 'recording' ? pressureData.slice(-20) : generateMockData(20)} />
            </div>
            <div className="p-4 bg-gray-50/50 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">平均压力</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                  <span className="text-sm font-medium text-gray-700">202.00 mmgh</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">最大压力</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                  <span className="text-sm font-medium text-gray-700">202.00 mmgh</span>
                </div>
              </div>
            </div>
          </Card>

          <Card className="bg-white/80 border-none shadow-lg rounded-xl overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-500">压力正态分布图</h3>
            </div>
            <div className="h-32 w-full p-4">
              <NormalDistributionChart data={normalDistributionData} />
            </div>
            <div className="p-4 bg-gray-50/50 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">均值</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                  <span className="text-sm font-medium text-gray-700">202.00</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">方差</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                  <span className="text-sm font-medium text-gray-700">202.00</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </main>

      <div className="absolute bottom-8 left-8 text-xs text-gray-500 font-medium z-10">
        powered by 矩侨工业
      </div>
    </div>
  )
}
