import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Calendar, Search, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrgName } from '@/lib/useOrgName'
import { useAssessment } from '@/contexts/AssessmentContext'

// Mock data for history
const historyData = [
  { id: 1, name: '郭锡诺', date: '2022/08/02', grip: true, sitStand: true, standing: true, gait: true },
  { id: 2, name: '王岩', date: '2022/08/02', grip: true, sitStand: true, standing: true, gait: true },
  { id: 3, name: '刘达', date: '2022/08/02', grip: true, sitStand: true, standing: true, gait: true },
  { id: 4, name: '李江涛', date: '2022/08/02', grip: true, sitStand: true, standing: true, gait: true },
  { id: 5, name: '王一琴', date: '2022/08/02', grip: true, sitStand: true, standing: true, gait: true },
  { id: 6, name: '张伟', date: '2022/08/01', grip: true, sitStand: true, standing: true, gait: true },
  { id: 7, name: '李娜', date: '2022/08/01', grip: true, sitStand: true, standing: true, gait: true },
  { id: 8, name: '赵强', date: '2022/08/01', grip: true, sitStand: true, standing: true, gait: true },
  { id: 9, name: '孙丽', date: '2022/08/01', grip: true, sitStand: true, standing: true, gait: true },
  { id: 10, name: '周明', date: '2022/08/01', grip: true, sitStand: true, standing: true, gait: true },
]

export default function AssessmentHistory() {
  const navigate = useNavigate()
  const orgName = useOrgName()
  const { user } = useAssessment()
  const displayName = user.name || '—'
  const [searchTerm, setSearchTerm] = useState('')
  const [date, setDate] = useState('2022/08/02')
  const [currentPage, setCurrentPage] = useState(1)
  const resolvedHistoryData = historyData.map(item =>
    item.name === '郭锡诺' ? { ...item, name: displayName } : item
  )

  return (
    <div className="min-h-screen w-full bg-[#F0F2F5] flex flex-col">
      {/* Header */}
      <header className="w-full px-8 py-6 flex justify-between items-center bg-white shadow-sm z-10">
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
            <span className="text-gray-800 font-medium block">{displayName}</span>
            <span className="text-gray-600 text-sm">{orgName || '—'}</span>
          </div>
          <button 
            onClick={() => navigate('/dashboard')}
            className="text-blue-500 hover:text-blue-600 font-medium text-sm border-b border-blue-500 hover:border-blue-600 transition-colors pb-0.5"
          >
            返回首页
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-8 flex flex-col items-center">
        <Card className="w-full max-w-7xl bg-white shadow-sm rounded-xl overflow-hidden flex-1 flex flex-col">
          {/* Toolbar */}
          <div className="p-6 flex justify-between items-center border-b border-gray-100">
            <h2 className="text-2xl font-bold text-gray-700">历史记录</h2>
            
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <Calendar className="h-4 w-4 text-blue-500" />
                </div>
                <Input 
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="pl-10 w-40 border-blue-200 text-gray-600 focus:ring-blue-100 focus:border-blue-400"
                />
              </div>
              
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <Input 
                  placeholder="请输入内容" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64 bg-gray-50 border-gray-200 focus:bg-white transition-colors"
                />
              </div>
              
              <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-8 py-4 bg-gray-50/50 text-sm font-medium text-gray-500 border-b border-gray-100">
            <div className="col-span-1 text-center">序号</div>
            <div className="col-span-1 text-center">姓名</div>
            <div className="col-span-2 text-center">握力评估报告</div>
            <div className="col-span-2 text-center">起坐能力评估报告</div>
            <div className="col-span-2 text-center">静态站立评估报告</div>
            <div className="col-span-2 text-center">行走步态评估报告</div>
            <div className="col-span-2 text-center">操作</div>
          </div>

          {/* Table Body */}
          <div className="flex-1 overflow-auto">
            {resolvedHistoryData.map((item, index) => (
              <div 
                key={item.id} 
                className="grid grid-cols-12 gap-4 px-8 py-6 text-sm text-gray-600 border-b border-gray-50 hover:bg-blue-50/30 transition-colors items-center"
              >
                <div className="col-span-1 text-center text-gray-400">{item.id}</div>
                <div className="col-span-1 text-center font-medium text-gray-700">{item.name}</div>
                
                <div className="col-span-2 flex flex-col items-center gap-1">
                  <span className="text-gray-500">握力评估报告.pdf</span>
                  <button className="text-blue-500 hover:text-blue-600 text-xs font-medium border-b border-blue-500 hover:border-blue-600 pb-0.5 w-fit">查看报告</button>
                </div>
                
                <div className="col-span-2 flex flex-col items-center gap-1">
                  <span className="text-gray-500">起坐能力评估报告.pdf</span>
                  <button className="text-blue-500 hover:text-blue-600 text-xs font-medium border-b border-blue-500 hover:border-blue-600 pb-0.5 w-fit">查看报告</button>
                </div>
                
                <div className="col-span-2 flex flex-col items-center gap-1">
                  <span className="text-gray-500">静态站立评估报告.pdf</span>
                  <button className="text-blue-500 hover:text-blue-600 text-xs font-medium border-b border-blue-500 hover:border-blue-600 pb-0.5 w-fit">查看报告</button>
                </div>
                
                <div className="col-span-2 flex flex-col items-center gap-1">
                  <span className="text-gray-500">行走步态评估报告.pdf</span>
                  <button className="text-blue-500 hover:text-blue-600 text-xs font-medium border-b border-blue-500 hover:border-blue-600 pb-0.5 w-fit">查看报告</button>
                </div>

                <div className="col-span-2 flex justify-center gap-4">
                  <button className="text-gray-400 hover:text-blue-500 transition-colors">
                    <Search className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-gray-100 flex justify-between items-center bg-white">
            <div className="text-xs text-gray-500">共 101 项数据</div>
            
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 mr-4">
                <span className="text-xs text-gray-500 border rounded px-2 py-1">10 条/页</span>
              </div>
              
              <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400">
                <ChevronLeft className="h-4 w-4" />
              </button>
              
              {[1, 2, 3, 4, 5].map(page => (
                <button 
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={cn(
                    'w-8 h-8 flex items-center justify-center rounded text-xs',
                    currentPage === page 
                      ? 'bg-blue-500 text-white font-medium shadow-sm shadow-blue-200' 
                      : 'hover:bg-gray-100 text-gray-600'
                  )}
                >
                  {page}
                </button>
              ))}
              <span className="text-gray-400 text-xs">...</span>
              <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 text-xs">11</button>
              
              <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </Card>
      </main>

      <div className="absolute bottom-8 left-8 text-xs text-gray-400 font-medium">
        powered by 矩侨工业
      </div>
    </div>
  )
}
