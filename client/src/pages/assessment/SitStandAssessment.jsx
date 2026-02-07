import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Play, X, ArrowLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PressureChart, NormalDistributionChart } from '@/components/charts/PressureChart'
import { SitAndFootScene } from 'shroomcomlibrary/heatmap/sit-and-foot'
import { useOrgName } from '@/lib/useOrgName'
import { useAssessment } from '@/contexts/AssessmentContext'
import { Scheduler } from '@/scheduler/scheduler'
import { useSensorSocket } from '@/contexts/SensorSocketContext'

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

const SIT_STAND_PROGRESS_KEY = 'jqtools.sitStandProgress'
const ASSESSMENT_START_KEY = 'jqtools.assessmentStartAt'
const SET_ACTIVE_MODE_URL = 'http://localhost:19245/setActiveMode'
const COLLECT_API_BASE = 'http://localhost:19245'


const reshapeTo32 = (arr) => {
  if (!Array.isArray(arr) || arr.length !== 1024) return arr
  const out = []
  for (let r = 0; r < 32; r++) {
    out.push(arr.slice(r * 32, r * 32 + 32))
  }
  return out
}

const reshapeTo64 = (arr) => {
  if (!Array.isArray(arr) || arr.length !== 4096) return arr
  const out = []
  for (let r = 0; r < 64; r++) {
    out.push(arr.slice(r * 64, r * 64 + 64))
  }
  return out
}

const rotateMatrix90CW = (matrix) => {
  if (!Array.isArray(matrix) || !matrix.length || !Array.isArray(matrix[0])) return matrix
  const rows = matrix.length
  const cols = matrix[0].length
  const out = Array.from({ length: cols }, () => new Array(rows))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out[c][rows - 1 - r] = matrix[r][c]
    }
  }
  return out
}

const rotateFlat90CW = (arr, size) => {
  if (!Array.isArray(arr) || arr.length !== size * size) return arr
  const out = new Array(arr.length)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      out[c * size + (size - 1 - r)] = arr[r * size + c]
    }
  }
  return out
}

export default function SitStandAssessment() {
  const navigate = useNavigate()
  const orgName = useOrgName()
  const { user } = useAssessment()
  const { lastJson } = useSensorSocket()
  const displayName = user.name || '—'
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode')

  useEffect(() => {
    if (mode === 'report') return
    let assessmentId = null
    try {
      assessmentId = localStorage.getItem(ASSESSMENT_START_KEY)
    } catch {}
    fetch(SET_ACTIVE_MODE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 3, assessmentId })
    }).catch(() => {})
  }, [mode])
  
  const [status, setStatus] = useState(mode === 'report' ? 'completed' : 'idle')
  const [reportMode, setReportMode] = useState('static')
  const [timer, setTimer] = useState(0)
  const [pressureData, setPressureData] = useState([])
  const recordTickRef = useRef(0)
  const latestSeatRef = useRef(null)
  const latestSeatSeqRef = useRef(0)
  const lastUiSeqRef = useRef(0)
  const [seatRealtimeData, setSeatRealtimeData] = useState(null)
  const [seatData2d, setSeatData2d] = useState(null)
  const latestFootRef = useRef(null)
  const latestFootSeqRef = useRef(0)
  const lastFootUiSeqRef = useRef(0)
  const [footpadData, setFootpadData] = useState(null)
  const [footpadData2d, setFootpadData2d] = useState(null)

  useEffect(() => {
    if (mode === 'report') return
    try {
      const raw = localStorage.getItem(SIT_STAND_PROGRESS_KEY)
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
      localStorage.setItem(SIT_STAND_PROGRESS_KEY, JSON.stringify({ status: safeStatus, reportMode }))
    } catch {}
  }, [mode, status, reportMode])

  useEffect(() => {
    if (!lastJson || !lastJson.sitData) return
    const seatArr = lastJson.sitData?.sit?.arr
    if (Array.isArray(seatArr) && seatArr.length) {
      latestSeatRef.current = seatArr
      latestSeatSeqRef.current += 1
    }

    const footArr = lastJson.sitData?.foot1?.arr
    if (Array.isArray(footArr) && footArr.length) {
      latestFootRef.current = footArr
      latestFootSeqRef.current += 1
    }
  }, [lastJson])

  useEffect(() => {
    const unsubscribe = Scheduler.onUI(() => {
      const seq = latestSeatSeqRef.current
      if (seq && seq != lastUiSeqRef.current) {
        lastUiSeqRef.current = seq
        const seatFlat = latestSeatRef.current
        setSeatRealtimeData(rotateFlat90CW(seatFlat, 32))
        setSeatData2d(rotateMatrix90CW(reshapeTo32(seatFlat)))
      }

      const footSeq = latestFootSeqRef.current
      if (footSeq && footSeq != lastFootUiSeqRef.current) {
        lastFootUiSeqRef.current = footSeq
        const footFlat = latestFootRef.current
        setFootpadData(rotateFlat90CW(footFlat, 64))
        setFootpadData2d(rotateMatrix90CW(reshapeTo64(footFlat)))
      }
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


  // Start recording
  const startRecording = () => {
    const now = new Date()
    const date = now.toISOString().slice(0, 10)
    const collectName = displayName || ''
    let assessmentId = null
    try {
      assessmentId = localStorage.getItem(ASSESSMENT_START_KEY)
    } catch {}
    fetch(`${COLLECT_API_BASE}/startCol`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: collectName,
        name: collectName,
        collectName,
        date,
        colName: date,
        select: {},
        assessmentId
      })
    }).catch(() => {})
    setStatus('recording')
    setTimer(0)
    setPressureData([])
    recordTickRef.current = 0
  }

  // Stop recording
  const stopRecording = () => {
    fetch(`${COLLECT_API_BASE}/endCol`).catch(() => {})
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
      localStorage.setItem('currentModuleId', '2')
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
          <h2 className="text-2xl font-bold text-gray-600">2.起坐能力评估</h2>
        </div>
        
        <div className="flex items-center gap-6">
          {status === 'completed' && (
            <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-lg shadow-sm flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-sm text-gray-600">{displayName}的起坐能力评估报告已保存至</span>
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
                {displayName}的起坐能力评估{reportMode === 'static' ? '静态报告' : '动态报告'}
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
                  <h3 className="text-xl font-bold text-gray-800">起坐能力评估静态报告</h3>
                  <span className="text-sm text-gray-500">2026-02-05</span>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <span className="text-sm text-gray-500 block mb-1">起立时间</span>
                      <span className="text-2xl font-bold text-blue-600">1.2 s</span>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <span className="text-sm text-gray-500 block mb-1">坐下时间</span>
                      <span className="text-2xl font-bold text-blue-600">1.5 s</span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <span className="text-sm text-gray-500 block mb-1">最大压力峰值</span>
                      <span className="text-2xl font-bold text-green-600">450 N</span>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <span className="text-sm text-gray-500 block mb-1">平衡稳定性</span>
                      <span className="text-2xl font-bold text-blue-500">Good</span>
                    </div>
                  </div>
                </div>
                <div className="mt-6">
                  <h4 className="font-medium text-gray-700 mb-2">评估结论</h4>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    受测者起坐动作流畅，下肢爆发力良好。起立过程中重心转移平稳，无明显晃动。建议保持当前下肢力量训练强度。
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="w-full h-full">
                  <SitAndFootScene
                    showHeatmap
                    enableClipping={false}
                    clipLevel={0.5}
                    depthScale={0}
                    smoothness={0.5}
                    realtimeData={seatRealtimeData}
                    seatData={seatData2d}
                    footpadData={footpadData2d || footpadData}
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
