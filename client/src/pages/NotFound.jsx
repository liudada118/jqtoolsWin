import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#F0F2F5]">
      <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
      <p className="text-xl text-gray-500 mb-8">页面未找到</p>
      <Button onClick={() => navigate('/')}>
        返回首页
      </Button>
    </div>
  )
}
