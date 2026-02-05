import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'jqtools.assessmentUser'
const AssessmentContext = createContext(null)

const defaultUser = {
  name: '',
  gender: '',
  age: '',
  weight: ''
}

export function AssessmentProvider({ children }) {
  const [user, setUser] = useState(defaultUser)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setUser({ ...defaultUser, ...parsed })
      }
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    } catch {}
  }, [user])

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
