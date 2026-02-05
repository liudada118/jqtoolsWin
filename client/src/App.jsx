import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AssessmentProvider } from '@/contexts/AssessmentContext'
import { SensorSocketProvider } from '@/contexts/SensorSocketContext'
import { ToastProvider } from '@/components/ui/Toast'

// Pages
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import AssessmentHistory from '@/pages/AssessmentHistory'
import NotFound from '@/pages/NotFound'

// Assessment Pages
import GripAssessment from '@/pages/assessment/GripAssessment'
import SitStandAssessment from '@/pages/assessment/SitStandAssessment'
import StandingAssessment from '@/pages/assessment/StandingAssessment'
import GaitAssessment from '@/pages/assessment/GaitAssessment'


function App() {
  const [cacheState, setCacheState] = useState({ loading: true, hasCache: false })

  const getLocalHasCache = () => {
    try {
      const key = localStorage.getItem('jqtools.key')
      const org = localStorage.getItem('jqtools.orgName')
      return !!(key && org)
    } catch {
      return false
    }
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const resp = await fetch('http://localhost:19245/serialCache')
        const result = await resp.json().catch(() => ({}))
        const hasCache = !!(result && result.data && result.data.hasCache)
        if (!cancelled) {
          const localHasCache = getLocalHasCache()
          setCacheState({ loading: false, hasCache: hasCache || localHasCache })
        }
      } catch (err) {
        if (!cancelled) {
          const localHasCache = getLocalHasCache()
          setCacheState(prev => ({ loading: false, hasCache: prev.hasCache || localHasCache }))
        }
      }
    }
    load()
    const handleUpdate = (event) => {
      if (event && event.detail && event.detail.hasCache === true) {
        setCacheState({ loading: false, hasCache: true })
      }
      load()
    }
    window.addEventListener('serial-cache-updated', handleUpdate)
    return () => {
      cancelled = true
      window.removeEventListener('serial-cache-updated', handleUpdate)
    }
  }, [])

  const LoginRoute = () => {
    if (cacheState.loading) return null
    if (cacheState.hasCache) return <Navigate to="/dashboard" replace />
    return <Login />
  }

  const ProtectedRoute = ({ children }) => {
    if (cacheState.loading) return null
    if (!cacheState.hasCache) return <Navigate to="/" replace />
    return children
  }

  return (
    <ThemeProvider defaultTheme="light">
      <AssessmentProvider>
        <SensorSocketProvider>
          <ToastProvider>
            <Routes>
              <Route path="/" element={<LoginRoute />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/assessment/grip" element={<ProtectedRoute><GripAssessment /></ProtectedRoute>} />
              <Route path="/assessment/sit-stand" element={<ProtectedRoute><SitStandAssessment /></ProtectedRoute>} />
              <Route path="/assessment/standing" element={<ProtectedRoute><StandingAssessment /></ProtectedRoute>} />
              <Route path="/assessment/gait" element={<ProtectedRoute><GaitAssessment /></ProtectedRoute>} />
              <Route path="/history" element={<ProtectedRoute><AssessmentHistory /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ToastProvider>
        </SensorSocketProvider>
      </AssessmentProvider>
    </ThemeProvider>
  )
}

export default App
