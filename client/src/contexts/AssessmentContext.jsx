import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'jqtools.assessmentUser'
const AssessmentContext = createContext(null)

const defaultUser = {
  name: '',
  gender: '',
  age: '',
  weight: ''
}

function readStoredUser() {
  if (typeof window === 'undefined') return defaultUser
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultUser
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return defaultUser
    return { ...defaultUser, ...parsed }
  } catch {}
  return defaultUser
}

export function AssessmentProvider({ children }) {
  const [user, setUser] = useState(readStoredUser)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    } catch {}
  }, [user])

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== STORAGE_KEY) return
      setUser(readStoredUser())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const value = useMemo(() => ({ user, setUser }), [user])

  return (
    <AssessmentContext.Provider value={value}>
      {children}
    </AssessmentContext.Provider>
  )
}

export function useAssessment() {
  const ctx = useContext(AssessmentContext)
  if (!ctx) {
    throw new Error('useAssessment must be used within AssessmentProvider')
  }
  return ctx
}
