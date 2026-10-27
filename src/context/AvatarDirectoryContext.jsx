import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { resolveAvatarPhoto } from '../lib/avatarDirectory'
import { fetchWorkspaceAvatarRecords, resolveAvatarUrls } from '../services/avatarService'

const EMPTY_DIRECTORY = Object.freeze({
  lookup() {
    return null
  },
  setOptimistic() {},
  refresh: async () => {},
})

export const AvatarDirectoryContext = createContext(EMPTY_DIRECTORY)

const REFRESH_INTERVAL_MS = 50 * 60 * 1000

export function AvatarDirectoryProvider({ children }) {
  const { membership, user } = useAuth()
  const workspaceId = `${membership?.workspaceId ?? ''}`.trim()
  const [records, setRecords] = useState([])
  const [urls, setUrls] = useState({})
  const [optimistic, setOptimisticState] = useState({})

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setRecords([])
      setUrls({})
      return
    }
    try {
      const nextRecords = await fetchWorkspaceAvatarRecords(workspaceId)
      setRecords(nextRecords)
      const signed = await resolveAvatarUrls(nextRecords.map((row) => row.avatarPath))
      setUrls(Object.fromEntries(signed))
    } catch (error) {
      console.warn('[avatars] could not load profile photos', error)
    }
  }, [workspaceId])

  useEffect(() => {
    let cancelled = false
    refresh().catch(() => {})
    const timer = window.setInterval(() => {
      if (!cancelled) refresh().catch(() => {})
    }, REFRESH_INTERVAL_MS)
    const refreshIfVisible = () => {
      if (document.visibilityState === 'hidden') return
      refresh().catch(() => {})
    }
    window.addEventListener('focus', refreshIfVisible)
    document.addEventListener('visibilitychange', refreshIfVisible)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshIfVisible)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
  }, [refresh])

  const setOptimistic = useCallback((authUserId, patch) => {
    const id = `${authUserId ?? ''}`.trim()
    if (!id) return
    setOptimisticState((current) => {
      if (!patch) {
        if (!current[id]) return current
        const next = { ...current }
        delete next[id]
        return next
      }
      return { ...current, [id]: patch }
    })
  }, [])

  const mergedRecords = useMemo(() => {
    const authUserId = `${user?.id ?? membership?.authUserId ?? ''}`.trim()
    const avatarPath = `${membership?.avatarPath ?? ''}`.trim()
    if (!authUserId || !avatarPath) return records
    if (records.some((row) => row.authUserId === authUserId && row.avatarPath === avatarPath)) {
      return records
    }
    return [
      ...records,
      {
        memberId: `${membership?.id ?? ''}`.trim(),
        employeeId: `${membership?.employeeId ?? ''}`.trim(),
        authUserId,
        avatarPath,
        avatarUpdatedAt: membership?.avatarUpdatedAt ?? null,
      },
    ]
  }, [membership, records, user])

  const value = useMemo(() => ({
    lookup(query) {
      return resolveAvatarPhoto({
        records: mergedRecords,
        urls,
        optimistic,
        ...query,
      })
    },
    setOptimistic,
    refresh,
  }), [mergedRecords, optimistic, refresh, setOptimistic, urls])

  return (
    <AvatarDirectoryContext.Provider value={value}>
      {children}
    </AvatarDirectoryContext.Provider>
  )
}

export function useAvatarDirectory() {
  return useContext(AvatarDirectoryContext)
}
