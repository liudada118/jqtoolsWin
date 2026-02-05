import React, { createContext, useContext, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = {
    success: (message) => addToast(message, 'success'),
    error: (message) => addToast(message, 'error'),
    info: (message) => addToast(message, 'info'),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2">
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              'flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg min-w-[300px] animate-in slide-in-from-top-2',
              t.type === 'success' && 'bg-white border border-green-100 text-gray-700',
              t.type === 'error' && 'bg-white border border-red-100 text-gray-700',
              t.type === 'info' && 'bg-white border border-blue-100 text-gray-700'
            )}
          >
            {t.type === 'success' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
            {t.type === 'error' && <AlertCircle className="h-5 w-5 text-red-500" />}
            {t.type === 'info' && <Info className="h-5 w-5 text-blue-500" />}
            <span className="flex-1 text-sm">{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

export default ToastProvider
