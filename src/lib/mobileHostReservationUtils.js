import { getHostListGroupId } from './reservationHostStatus'
import { normalizeReservationTimeValue } from './timeFormatUtils'

export const MOBILE_HOST_TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'in-house', label: 'Arrived/In house' },
  { id: 'completed', label: 'Completed' },
  { id: 'problems', label: 'Problems' },
]

function getReservationSearchHaystack(reservation) {
  return [
    reservation?.guestName,
    reservation?.phone,
    reservation?.tableNumber,
    reservation?.area,
    reservation?.notes,
  ].join(' ').toLowerCase()
}

function getReservationSortMinutes(reservation) {
  const normalized = normalizeReservationTimeValue(
    reservation?.time ?? reservation?.reservation_time,
  )
  if (!normalized) return Number.MAX_SAFE_INTEGER

  const [hours, minutes] = normalized.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return Number.MAX_SAFE_INTEGER
  }

  return hours * 60 + minutes
}

export function sortMobileHostReservations(reservations = []) {
  return [...(reservations ?? [])].sort((left, right) => {
    const timeDiff = getReservationSortMinutes(left) - getReservationSortMinutes(right)
    if (timeDiff !== 0) return timeDiff
    return `${left?.guestName ?? ''}`.localeCompare(`${right?.guestName ?? ''}`)
  })
}

export function filterMobileHostReservations(
  reservations = [],
  { tabId = 'upcoming', searchTerm = '' } = {},
) {
  const normalizedSearch = `${searchTerm ?? ''}`.trim().toLowerCase()

  return sortMobileHostReservations(
    (reservations ?? []).filter((reservation) => {
      if (getHostListGroupId(reservation) !== tabId) return false
      if (!normalizedSearch) return true
      return getReservationSearchHaystack(reservation).includes(normalizedSearch)
    }),
  )
}

export function countMobileHostReservationsByTab(reservations = []) {
  const counts = Object.fromEntries(
    MOBILE_HOST_TABS.map((tab) => [tab.id, 0]),
  )

  ;(reservations ?? []).forEach((reservation) => {
    const groupId = getHostListGroupId(reservation)
    if (counts[groupId] !== undefined) {
      counts[groupId] += 1
    }
  })

  return counts
}

export const HOST_STATION_DESKTOP_MIN_WIDTH = 721

export function isHostStationDesktopViewport() {
  if (typeof window === 'undefined') return false
  return window.innerWidth >= HOST_STATION_DESKTOP_MIN_WIDTH
}

export function isMobileHostLandscapeViewport() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(orientation: landscape)')?.matches
    ?? window.innerWidth > window.innerHeight
}

export function isMobileHostTabletViewport() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(min-width: 700px)')?.matches
    ?? window.innerWidth >= 700
}

export function isHostTabletPanelViewport() {
  return isMobileHostTabletViewport()
}

export function isMobileHostSplitViewport() {
  if (typeof window === 'undefined') return false
  if (isHostStationDesktopViewport()) return true
  if (isMobileHostLandscapeViewport()) return true
  return isMobileHostTabletViewport() && window.innerWidth > window.innerHeight
}

export function shouldShowHostStationPortraitFallback() {
  if (typeof window === 'undefined') return false
  if (isHostStationDesktopViewport()) return false
  const width = window.innerWidth || 0
  const height = window.innerHeight || 0
  return width < 700 && height > width
}

export function resolveHostReservationFormVariant({ isSplitLayout = false } = {}) {
  if (isSplitLayout) return 'inline'
  if (isHostTabletPanelViewport()) return 'panel'
  return 'sheet'
}
