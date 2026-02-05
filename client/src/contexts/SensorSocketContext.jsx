import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'

const SensorSocketContext = createContext(null)

const DEFAULT_WS_URL = 'ws://localhost:19999'

export function SensorSocketProvider({ children }) {
  const [status, setStatus] = useState('disconnected')
  const [lastMessage, setLastMessage] = useState(null)
  const [lastJson, setLastJson] = useState(null)
  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const reconnectDelayRef = useRef(1000)

  useEffect(() => {
    const url = import.meta.env.VITE_WS_URL || DEFAULT_WS_URL

    const connect = () => {
      if (wsRef.current) return
      setStatus('connecting')

      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setStatus('connected')
        reconnectDelayRef.current = 1000
      }

      ws.onmessage = (event) => {
        const data = event.data
        setLastMessage(data)
        if (typeof data === 'string') {
          try {
            setLastJson(JSON.parse(data))
          } catch {
            setLastJson(null)
          }
        } else {
          setLastJson(null)
        }
      }

      ws.onerror = () => {
        setStatus('error')
      }

      ws.onclose = () => {
        setStatus('disconnected')
        wsRef.current = null

        const delay = reconnectDelayRef.current
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 10000)
        if (!reconnectTimerRef.current) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null
            connect()
          }, delay)
        }
      }
    }

    connect()

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [])

  const send = (payload) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false
    wsRef.current.send(payload)
    return true
  }

  const value = useMemo(
    () => ({ status, lastMessage, lastJson, send }),
    [status, lastMessage, lastJson]
  )

  return (
    <SensorSocketContext.Provider value={value}>
      {children}
    </SensorSocketContext.Provider>
  )
}

export function useSensorSocket() {
  const ctx = useContext(SensorSocketContext)
  if (!ctx) {
    throw new Error('useSensorSocket must be used within SensorSocketProvider')
  }
  return ctx
}
