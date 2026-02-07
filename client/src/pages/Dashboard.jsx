import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Select, SelectItem } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { Hand, User, Footprints, Activity, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrgName } from '@/lib/useOrgName'
import { useAssessment } from '@/contexts/AssessmentContext'

// Assessment modules configuration
const initialModules = [
  {
    id: 1,
    title: '握力评估',
    icon: Hand,
    path: '/assessment/grip',
    status: 'active',
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-500',
    iconColor: 'text-white'
  },
  {
    id: 2,
    title: '起坐能力评估',
    icon: User,
    path: '/assessment/sit-stand',
    status: 'locked',
    color: 'text-gray-400',
    bgColor: 'bg-gray-100',
    borderColor: 'border-transparent',
    iconColor: 'text-gray-300'
  },
  {
    id: 3,
    title: '静态站立评估',
    icon: Footprints,
    path: '/assessment/standing',
    status: 'locked',
    color: 'text-gray-400',
    bgColor: 'bg-gray-100',
    borderColor: 'border-transparent',
    iconColor: 'text-gray-300'
  },
  {
    id: 4,
    title: '行走步态评估',
    icon: Activity,
    path: '/assessment/gait',
    status: 'locked',
    color: 'text-gray-400',
    bgColor: 'bg-gray-100',
    borderColor: 'border-transparent',
    iconColor: 'text-gray-300'
  }
]

// SVG Icons for each module
const ModuleIcon = ({ moduleId, isLocked }) => {
  const colorClass = isLocked ? 'text-gray-300' : 'text-white drop-shadow-md'
  
  switch (moduleId) {
    case 1:
      return (
        <svg width="120" height="160" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={colorClass}>
          <path d="M12 2C12.5523 2 13 2.44772 13 3V11H14V4C14 3.44772 14.4477 3 15 3C15.5523 3 16 3.44772 16 4V11H17V5C17 4.44772 17.4477 4 18 4C18.5523 4 19 4.44772 19 5V13C19 16.866 15.866 20 12 20C8.13401 20 5 16.866 5 13V6C5 5.44772 5.44772 5 6 5C6.55228 5 7 5.44772 7 6V11H8V3C8 2.44772 8.44772 2 9 2C9.55228 2 10 2.44772 10 3V11H11V3C11 2.44772 11.4477 2 12 2Z" fill="currentColor" />
        </svg>
      )
    case 2:
      return (
        <svg width="120" height="160" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={colorClass}>
          <path d="M19 16V19H17V16H15V13H12V19H10V10H15C16.1046 10 17 10.8954 17 12V13H19V12C19 9.79086 17.2091 8 15 8H10V5H12V3H8V8H6V19H8V13H10V16H8V19H6" fill="currentColor"/>
          <circle cx="10" cy="5" r="2" fill="currentColor"/>
        </svg>
      )
    case 3:
      return (
        <div className="flex gap-4">
          <svg width="60" height="120" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={colorClass}>
            <path d="M10 20C10 21.1046 9.10457 22 8 22C6.89543 22 6 21.1046 6 20V10C6 8.89543 6.89543 8 8 8C9.10457 8 10 8.89543 10 10V20Z" fill="currentColor"/>
            <circle cx="6" cy="5" r="1.5" fill="currentColor"/>
            <circle cx="8" cy="4" r="1.5" fill="currentColor"/>
            <circle cx="10" cy="5" r="1.5" fill="currentColor"/>
          </svg>
          <svg width="60" height="120" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn(colorClass, 'transform scale-x-[-1]')}>
            <path d="M10 20C10 21.1046 9.10457 22 8 22C6.89543 22 6 21.1046 6 20V10C6 8.89543 6.89543 8 8 8C9.10457 8 10 8.89543 10 10V20Z" fill="currentColor"/>
            <circle cx="6" cy="5" r="1.5" fill="currentColor"/>
            <circle cx="8" cy="4" r="1.5" fill="currentColor"/>
            <circle cx="10" cy="5" r="1.5" fill="currentColor"/>
          </svg>
        </div>
      )
    case 4:
      return (
        <div className="flex gap-4 relative">
          <svg width="60" height="120" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn(colorClass, 'absolute -top-10 -left-4')}>
            <path d="M10 20C10 21.1046 9.10457 22 8 22C6.89543 22 6 21.1046 6 20V10C6 8.89543 6.89543 8 8 8C9.10457 8 10 8.89543 10 10V20Z" fill="currentColor"/>
          </svg>
          <svg width="60" height="120" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn(colorClass, 'absolute top-4 left-4 transform scale-x-[-1]')}>
            <path d="M10 20C10 21.1046 9.10457 22 8 22C6.89543 22 6 21.1046 6 20V10C6 8.89543 6.89543 8 8 8C9.10457 8 10 8.89543 10 10V20Z" fill="currentColor"/>
          </svg>
        </div>
      )
    default:
      return null
  }
}

const ASSESSMENT_START_KEY = 'jqtools.assessmentStartAt'

export default function Dashboard() {
  const navigate = useNavigate()
  const toast = useToast()
  const orgName = useOrgName()
  const { user, setUser } = useAssessment()
  const displayName = user.name || '—'
  const [modules, setModules] = useState(initialModules)
  const [showUserDialog, setShowUserDialog] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [userInfo, setUserInfo] = useState({
    name: '',
    gender: '',
    age: '',
    weight: ''
  })
  const allCompleted = modules.length > 0 && modules.every((m) => m.status === 'completed')

  // Check if returning from assessment
  useEffect(() => {
    const assessmentCompleted = localStorage.getItem('assessmentCompleted')
    const currentModuleId = localStorage.getItem('currentModuleId')
    const completedId = currentModuleId ? parseInt(currentModuleId) : null

    if (completedId) {
      setModules(prev => prev.map(m => {
        if (m.id === completedId) return { ...m, status: 'completed' }
        if (m.id === completedId + 1) return { ...m, status: 'active' }
        if (m.id < completedId) return { ...m, status: 'completed' }
        return m
      }))
    }

    if (assessmentCompleted === 'true' && completedId) {
      const moduleName = initialModules.find(m => m.id === completedId)?.title || '??'
      toast.success(`${displayName}?${moduleName}??????????`)
      localStorage.removeItem('assessmentCompleted')
    }
  }, [])

  const handleStartAssessment = (moduleId) => {
    if (moduleId === 1 && modules[0].status !== 'completed') {
      setShowUserDialog(true)
    } else {
      const module = modules.find(m => m.id === moduleId)
      if (module && module.status !== 'locked') {
        try {
          localStorage.setItem(ASSESSMENT_START_KEY, String(Date.now()))
        } catch {}
        navigate(module.path)
      }
    }
  }

  const handleCreateUser = () => {
    if (!userInfo.name || !userInfo.gender || !userInfo.age || !userInfo.weight) {
      toast.error('请填写完整信息')
      return
    }
    
    setUser(prev => ({ ...prev, ...userInfo }))
    setShowUserDialog(false)
    try {
      localStorage.setItem(ASSESSMENT_START_KEY, String(Date.now()))
    } catch {}
    navigate('/assessment/grip')
  }

  const handleConnectPort = async () => {
    if (isConnecting) return
    setIsConnecting(true)
    try {
      const resp = await fetch('http://localhost:19245/connPort')
      const result = await resp.json().catch(() => ({}))
      if (!resp.ok || result.code !== 0) {
        throw new Error(result.message || '连接失败')
      }
      toast.success('连接成功')
    } catch (err) {
      toast.error(err.message || '连接失败')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleRestartAll = () => {
    localStorage.removeItem('currentModuleId')
    localStorage.removeItem('assessmentCompleted')
    localStorage.removeItem('jqtools.gripProgress')
    localStorage.removeItem('jqtools.sitStandProgress')
    localStorage.removeItem('jqtools.standingProgress')
    localStorage.removeItem('jqtools.gaitProgress')
    setModules(initialModules)
    setShowUserDialog(true)
  }

  return (
    <div className="min-h-screen w-full bg-[#F0F2F5] flex flex-col">
      {/* Header */}
      <header className="w-full px-8 py-6 flex justify-between items-center bg-transparent">
        <div>
          <h1 className="text-2xl font-bold text-gray-700 tracking-tight">
            肌少症/老年人评估及监测系统
          </h1>
          <p className="text-xs text-gray-500 mt-1 tracking-wide uppercase">
            Sarcopenia Assessment and Monitoring System for Older Adults
          </p>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-right">
            <span className="text-gray-800 font-medium block">{orgName || '—'}</span>
          </div>
          <button
            onClick={handleConnectPort}
            disabled={isConnecting}
            className="text-blue-500 hover:text-blue-600 font-medium text-sm border-b border-blue-500 hover:border-blue-600 transition-colors pb-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? '连接中...' : '一键连接'}
          </button>
          <button 
            onClick={() => navigate('/history')}
            className="text-blue-500 hover:text-blue-600 font-medium text-sm border-b border-blue-500 hover:border-blue-600 transition-colors pb-0.5"
          >
            历史记录
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-8 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-7xl">
          {modules.map((module) => (
            <div key={module.id} className="flex flex-col gap-4">
              <Card 
                className={cn(
                  'aspect-[3/4] flex flex-col items-center justify-center relative overflow-hidden transition-all duration-300 border-2',
                  module.status === 'active' || module.status === 'completed'
                    ? 'bg-[#D1D9E6] border-blue-500 shadow-lg scale-[1.02]' 
                    : 'bg-[#E2E8F0] border-transparent opacity-80'
                )}
              >
                {module.status === 'completed' && (
                  <div className="absolute top-4 left-4 z-10">
                    <div className="w-8 h-8 rounded-full bg-green-400 flex items-center justify-center shadow-sm">
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                  </div>
                )}
                
                <div className="absolute top-6 left-6 text-xl font-bold text-gray-700 pl-8">
                  {module.id}.{module.title}
                </div>
                
                <div className="flex-1 flex items-center justify-center w-full">
                  <ModuleIcon moduleId={module.id} isLocked={module.status === 'locked'} />
                </div>
              </Card>
              
              {module.status === 'completed' ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`${module.path}?mode=report`)}
                    className="flex-1 py-3 rounded-lg text-base font-medium bg-white border border-blue-500 text-blue-500 hover:bg-blue-50 transition-all shadow-sm"
                  >
                    查看报告
                  </button>
                  <button
                    onClick={() => navigate(module.path)}
                    className="flex-1 py-3 rounded-lg text-base font-medium bg-white border border-blue-500 text-blue-500 hover:bg-blue-50 transition-all shadow-sm"
                  >
                    重新评估
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleStartAssessment(module.id)}
                  disabled={module.status === 'locked'}
                  className={cn(
                    'w-full py-4 rounded-lg text-lg font-medium transition-all duration-300 shadow-sm',
                    module.status === 'active'
                      ? 'bg-[#007AFF] hover:bg-blue-600 text-white shadow-blue-200'
                      : 'bg-[#E2E8F0] text-gray-400 cursor-not-allowed'
                  )}
                >
                  开始评估
                </button>
              )}
            </div>
          ))}
        </div>
      </main>

      <div className="absolute bottom-8 left-8 text-xs text-gray-400 font-medium">
        powered by 矩侨工业
      </div>
      {allCompleted && (
        <button
          onClick={handleRestartAll}
          className="absolute bottom-8 right-8 rounded-full bg-blue-600 text-white px-6 py-3 text-sm font-medium shadow-lg hover:bg-blue-700 transition-colors"
        >
          开启新的评估
        </button>
      )}

      {/* User Info Dialog */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader className="mb-6">
            <DialogTitle>创建评估对象</DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-6 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-500">姓名</label>
                <Input 
                  placeholder="请填写姓名" 
                  className="h-11 bg-gray-50 border-gray-200 focus:bg-white"
                  value={userInfo.name}
                  onChange={(e) => setUserInfo({...userInfo, name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-500">性别</label>
                <Select 
                  placeholder="请选择性别"
                  value={userInfo.gender}
                  onValueChange={(v) => setUserInfo({...userInfo, gender: v})}
                >
                  <SelectItem value="male">男</SelectItem>
                  <SelectItem value="female">女</SelectItem>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-500">年龄</label>
              <Select 
                placeholder="请选择年龄"
                value={userInfo.age}
                onValueChange={(v) => setUserInfo({...userInfo, age: v})}
              >
                {Array.from({length: 50}, (_, i) => i + 50).map(age => (
                  <SelectItem key={age} value={age.toString()}>{age} 岁</SelectItem>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-500">体重</label>
              <Select 
                placeholder="请选择体重"
                value={userInfo.weight}
                onValueChange={(v) => setUserInfo({...userInfo, weight: v})}
              >
                {Array.from({length: 60}, (_, i) => i + 40).map(weight => (
                  <SelectItem key={weight} value={weight.toString()}>{weight} kg</SelectItem>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-6">
            <Button 
              onClick={handleCreateUser}
              className="w-full h-12 text-base bg-[#A0AEC0] hover:bg-[#718096] text-white shadow-md transition-all"
            >
              开始评估
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setShowUserDialog(false)}
              className="w-full h-12 text-base border-blue-200 text-blue-500 hover:bg-blue-50 hover:text-blue-600"
            >
              取消
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
