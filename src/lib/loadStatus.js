import { useCallback, useState } from 'react'

/**
 * First-load status per data source: 'loading' until the first fetch answers,
 * then 'ready' or 'error'. A background refresh of ready data stays 'ready'
 * (values are kept), a retry after an error shows 'loading' again.
 */
export function nextLoadStatus(previous, event) {
  if (event === 'start') return previous === 'ready' ? 'ready' : 'loading'
  if (event === 'success') return 'ready'
  if (event === 'failure') return 'error'
  return previous ?? 'loading'
}

/** Any error → 'error'; anything not ready (incl. never started) → 'loading'. */
export function combineLoadStatus(...statuses) {
  const list = statuses.flat()
  if (list.some((status) => status === 'error')) return 'error'
  if (list.some((status) => status !== 'ready')) return 'loading'
  return 'ready'
}

/** Maps the stock live snapshot status ('idle' | 'loading' | 'ready' | 'error'). */
export function stockLiveLoadStatus(status) {
  if (status === 'ready' || status === 'error') return status
  return 'loading'
}

export function useLoadStatuses() {
  const [statuses, setStatuses] = useState({})
  const markLoad = useCallback((key, event) => {
    setStatuses((current) => {
      const next = nextLoadStatus(current[key], event)
      return current[key] === next ? current : { ...current, [key]: next }
    })
  }, [])
  return [statuses, markLoad]
}

const CARD_AREAS = { schedule: 'schedule', 'on-shift': 'schedule', team: 'schedule', reservations: 'reservations', tasks: 'tasks', stock: 'stock' }

/** Data area a Today status card depends on (On shift/Team → schedule, …). */
export function loadAreaForCard(cardId) {
  return CARD_AREAS[`${cardId ?? ''}`] ?? ''
}

/** Status of one area; areas the caller did not pass count as ready (legacy callers). */
export function areaStatus(dataStatus, area) {
  if (!dataStatus || !area) return 'ready'
  return dataStatus[area] ?? 'ready'
}
