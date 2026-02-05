import { useEffect, useState } from 'react'

const CACHE_URL = 'http://localhost:19245/serialCache'

export function useOrgName() {
  const [orgName, setOrgName] = useState(() => {
    try {
      return localStorage.getItem('jqtools.orgName') || ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const resp = await fetch(CACHE_URL)
        const result = await resp.json().catch(() => ({}))
        const next = (result && result.data && result.data.orgName) || ''
        if (!cancelled) {
          if (next) {
            setOrgName(next)
            try {
              localStorage.setItem('jqtools.orgName', next)
            } catch {}
          }
        }
      } catch {}
    }

    const handleUpdate = (event) => {
      if (event && event.detail && event.detail.orgName) {
        setOrgName(event.detail.orgName)
        return
      }
      load()
    }

    load()
    window.addEventListener('serial-cache-updated', handleUpdate)
    return () => {
      cancelled = true
      window.removeEventListener('serial-cache-updated', handleUpdate)
    }
  }, [])

  return orgName
}
