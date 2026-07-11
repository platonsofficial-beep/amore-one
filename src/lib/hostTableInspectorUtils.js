import { formatTime24 } from './timeFormatUtils'
import { isMobileHostSplitViewport } from './mobileHostReservationUtils'

export function shouldUseHostTableInspectorDrawer() {
  if (typeof window === 'undefined') return false

  const isPhone = window.matchMedia?.('(max-width: 720px)')?.matches ?? window.innerWidth <= 720
  if (isPhone) return false

  const isPortrait = window.matchMedia?.('(orientation: portrait)')?.matches
    ?? window.innerHeight > window.innerWidth

  if (isPortrait && window.innerWidth < 1024) return false

  return isMobileHostSplitViewport() || window.innerWidth >= 1024
}

export function buildHostTableInspectorContextStrip(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : []
  const occupiedRow = safeRows.find((row) => row?.reservation && !row?.hasConflict)

  if (occupiedRow?.reservation) {
    const guestName = `${occupiedRow.reservation.guestName ?? 'Guest'}`.trim() || 'Guest'
    const timeLabel = occupiedRow.reservation.time
      ? formatTime24(occupiedRow.reservation.time)
      : ''

    return {
      kind: 'occupied',
      contextLine: timeLabel ? `🟢 Occupied · Since ${timeLabel}` : '🟢 Occupied',
      guestLine: guestName,
    }
  }

  const hasAvailable = safeRows.some((row) => row?.isAvailable && !row?.hasConflict)
  if (!hasAvailable) return null

  return {
    kind: 'available',
    contextLine: 'Available now',
    guestLine: '',
  }
}

/** @deprecated use buildHostTableInspectorContextStrip */
export function buildHostTableInspectorSummary(rows = []) {
  const strip = buildHostTableInspectorContextStrip(rows)
  if (!strip) return null

  if (strip.kind === 'occupied') {
    return {
      kind: 'occupied',
      primary: 'Occupied',
      secondary: strip.guestLine,
      detail: strip.contextLine.replace('🟢 Occupied · ', '').replace('🟢 Occupied', '').trim(),
    }
  }

  return {
    kind: 'available',
    primary: strip.contextLine,
    secondary: '',
    detail: '',
  }
}

export function resolveInspectorPrimaryRowId(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : []

  const activeOccupied = safeRows.find((row) => (
    row?.reservation
    && !row?.hasConflict
    && ['seated', 'arrived'].includes(row.state)
  ))
  if (activeOccupied) return activeOccupied.seating?.id ?? null

  const upcomingReserved = safeRows.find((row) => (
    row?.reservation
    && !row?.hasConflict
    && row.state === 'reserved'
  ))
  if (upcomingReserved) return upcomingReserved.seating?.id ?? null

  return null
}

export function sortInspectorRowsForPresentation(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : []

  const rank = (row) => {
    if (row?.hasConflict) return 0
    if (row?.reservation && !row?.hasConflict) {
      if (['seated', 'arrived'].includes(row.state)) return 1
      if (row.state === 'reserved') return 2
      if (row.state === 'completed') return 4
      return 3
    }
    if (row?.isAvailable) return 3
    return 5
  }

  return safeRows
    .map((row, index) => ({ row, index, rank: rank(row) }))
    .sort((left, right) => (
      left.rank - right.rank
      || left.index - right.index
    ))
    .map((entry) => entry.row)
}

export function shouldCompactHostFloorSelectionCard({
  inspectorOpen = false,
  selectedReservation = null,
  inspectorRows = [],
} = {}) {
  if (!inspectorOpen || !selectedReservation) return false

  return inspectorRows.some((row) => (
    row?.reservation
    && !row?.hasConflict
    && String(row.reservation.id) === String(selectedReservation.id)
  ))
}

export function formatInspectorExtraChairLabel(extraChairs = 0) {
  const count = Math.max(0, Number(extraChairs) || 0)
  if (count <= 0) return ''
  return `+${count} extra chair${count === 1 ? '' : 's'}`
}

export function groupInspectorRowsForRender(rows = [], useDrawerHierarchy = false) {
  const safeRows = Array.isArray(rows) ? rows : []
  if (!useDrawerHierarchy) {
    return safeRows.map((row) => ({ type: 'card', row }))
  }

  const groups = []
  let availableBatch = []

  const flushAvailable = () => {
    if (!availableBatch.length) return
    groups.push({ type: 'available-timeline', rows: [...availableBatch] })
    availableBatch = []
  }

  safeRows.forEach((row) => {
    if (row?.isAvailable && !row?.hasConflict) {
      availableBatch.push(row)
      return
    }
    flushAvailable()
    groups.push({ type: 'card', row })
  })
  flushAvailable()

  return groups
}
