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

export function buildHostTableInspectorSummary(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : []
  const occupiedRow = safeRows.find((row) => row?.reservation && !row?.hasConflict)

  if (occupiedRow?.reservation) {
    const guestName = `${occupiedRow.reservation.guestName ?? 'Guest'}`.trim() || 'Guest'
    const timeLabel = occupiedRow.reservation.time
      ? formatTime24(occupiedRow.reservation.time)
      : ''

    return {
      kind: 'occupied',
      primary: 'Occupied',
      secondary: guestName,
      detail: timeLabel ? `Since ${timeLabel}` : '',
      seatingName: occupiedRow.seating?.name ?? '',
    }
  }

  const availableRows = safeRows.filter((row) => row?.isAvailable && !row?.hasConflict)
  const nextRow = availableRows[0] ?? null

  return {
    kind: 'available',
    primary: 'Available now',
    secondary: nextRow?.seating?.name ?? '',
    detail: nextRow?.timeWindowLabel ?? '',
    seatingName: nextRow?.seating?.name ?? '',
  }
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
