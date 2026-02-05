import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent } from '@/components/ui/Card'
import { useToast } from '@/components/ui/Toast'

export default function Login() {
  const navigate = useNavigate()
  const toast = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    key: '',
    orgName: ''
  })

  const handleLogin = async (e) => {
    e.preventDefault()

    const trimmedKey = formData.key.trim()
    const trimmedOrgName = formData.orgName.trim()

    if (!trimmedKey || !trimmedOrgName) {
      toast.error('请输入密钥和机构名称')
      return
    }

    setIsLoading(true)

    try {
      const resp = await fetch('http://localhost:19245/serialCache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: trimmedKey, orgName: trimmedOrgName })
      })
      const result = await resp.json().catch(() => ({}))
      if (!resp.ok || result.code !== 0) {
        throw new Error(result.message || '保存失败')
      }

      try {
        localStorage.setItem('jqtools.key', trimmedKey)
        localStorage.setItem('jqtools.orgName', trimmedOrgName)
      } catch (err) {
        console.warn('[login] failed to persist local data:', err)
      }

      window.dispatchEvent(new CustomEvent('serial-cache-updated', { detail: { hasCache: true, orgName: trimmedOrgName } }))
      toast.success('登录成功')
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.message || '登录失败')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#F0F2F5] relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-200/20 blur-3xl" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-blue-300/20 blur-3xl" />
      </div>

      <div className="z-10 flex flex-col items-center w-full max-w-md px-4">
        <h1 className="text-3xl md:text-4xl font-bold text-[#4A5568] mb-12 text-center tracking-tight">
          欢迎来到肌少症/老年人评估及监测系统
        </h1>

        <Card className="w-full bg-white/50 backdrop-blur-sm border-white/60 shadow-xl rounded-2xl overflow-hidden">
          <CardContent className="p-8 pt-10">
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-4">
                <div className="relative">
                  <Input 
                    placeholder="请输入密钥" 
                    className="h-12 bg-white/80 border-transparent focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all text-base px-4 rounded-lg shadow-sm"
                    value={formData.key}
                    onChange={(e) => setFormData({...formData, key: e.target.value})}
                  />
                </div>
                <div className="relative">
                  <Input 
                    placeholder="请输入机构名称" 
                    className="h-12 bg-white/80 border-transparent focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all text-base px-4 rounded-lg shadow-sm"
                    value={formData.orgName}
                    onChange={(e) => setFormData({...formData, orgName: e.target.value})}
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 text-base font-medium bg-[#A0AEC0] hover:bg-[#718096] text-white shadow-md transition-all duration-300 rounded-lg mt-2"
                disabled={isLoading}
              >
                {isLoading ? '登录中...' : '进入系统'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="absolute bottom-8 left-8 text-xs text-gray-400 font-medium">
        powered by 矩侨工业
      </div>
    </div>
  )
}
