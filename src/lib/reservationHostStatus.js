export const HOST_RESERVATION_STATUSES = [
  {
    id: 'Pending',
    label: 'Pending',
    icon: '◷',
    tone: 'pending',
    groupId: 'upcoming',
  },
  {
    id: 'Waiting',
    label: 'Waiting',
    icon: '◴',
    tone: 'waiting',
    groupId: 'upcoming',
  },
  {
    id: 'Not Confirmed',
    label: 'Not Confirmed',
    icon: '🕐',
    tone: 'not-confirmed',
    groupId: 'upcoming',
  },
  {
    id: 'Confirmed',
    label: 'Confirmed',
    icon: '✓',
    tone: 'confirmed',
    groupId: 'upcoming',
  },
  {
    id: 'Late Booking',
    label: 'Late Booking',
    icon: '☾',
    tone: 'late-booking',
    groupId: 'upcoming',
  },
  {
    id: 'Checked In (Partial)',
    label: 'Checked In (Partial)',
    icon: '✓',
    tone: 'checked-in-partial',
    groupId: 'in-house',
  },
  {
    id: 'Checked In',
    label: 'Checked In',
    icon: '🍽',
    tone: 'checked-in',
    groupId: 'in-house',
  },
  {
    id: 'Walk In',
    label: 'Walk In',
    icon: '→',
    tone: 'walk-in',
    groupId: 'in-house',
  },
  {
    id: 'Checked Out',
    label: 'Checked Out',
    icon: '↪',
    tone: 'checked-out',
    groupId: 'completed',
  },
  {
    id: 'Cancelled',
    label: 'Cancelled',
    icon: '⊗',
    tone: 'cancelled',
    groupId: 'problems',
  },
  {
    id: 'Not Shown',
    label: 'Not Shown',
    icon: '◌',
    tone: 'not-shown',
    groupId: 'problems',
  },
  {
    id: 'Rejected',
    label: 'Rejected',
    icon: '✕',
    tone: 'rejected',
    groupId: 'problems',
  },
]

export const HOST_LIST_GROUP_DEFS = [
  {
    id: 'upcoming',
    label: 'Upcoming',
    tone: 'booked',
    icon: '◆',
  },
  {
    id: 'in-house',
    label: 'In House',
    tone: 'in-house',
    icon: '●',
  },
  {
    id: 'completed',
    label: 'Completed',
    tone: 'completed',
    icon: '✓',
  },
  {
    id: 'problems',
    label: 'Problems',
    tone: 'cancelled',
    icon: '×',
  },
]

const LEGACY_STATUS_ALIASES = {
  Booked: 'Pending',
  Arrived: 'Waiting',
  Seated: 'Checked In',
  Dining: 'Checked In',
  Completed: 'Checked Out',
  'No Show': 'Not Shown',
}

const STATUS_BY_ID = Object.fromEntries(
  HOST_RESERVATION_STATUSES.map((entry) => [entry.id, entry]),
)

const UPCOMING_STATUS_IDS = new Set(
  HOST_RESERVATION_STATUSES.filter((entry) => entry.groupId === 'upcoming').map((entry) => entry.id),
)

const IN_HOUSE_STATUS_IDS = new Set(
  HOST_RESERVATION_STATUSES.filter((entry) => entry.groupId === 'in-house').map((entry) => entry.id),
)

const TERMINAL_STATUS_IDS = new Set(['Checked Out', 'Cancelled', 'Not Shown', 'Rejected'])

const FLOOR_OCCUPYING_STATUS_IDS = new Set([
  'Pending',
  'Waiting',
  'Not Confirmed',
  'Confirmed',
  'Late Booking',
  'Checked In (Partial)',
  'Checked In',
  'Walk In',
])

export function normalizeReservationStatus(status) {
  const raw = `${status || 'Pending'}`.trim()
  if (STATUS_BY_ID[raw]) return raw
  if (LEGACY_STATUS_ALIASES[raw]) return LEGACY_STATUS_ALIASES[raw]
  return 'Pending'
}

export function getHostStatusMeta(status) {
  const normalized = normalizeReservationStatus(status)
  return STATUS_BY_ID[normalized] ?? STATUS_BY_ID.Pending
}

export function getHostStatusGroupId(status) {
  return getHostStatusMeta(status).groupId
}

export function getHostListGroupId(reservation) {
  return getHostStatusGroupId(reservation?.status)
}

export function groupHostListReservations(reservations) {
  const buckets = Object.fromEntries(
    HOST_LIST_GROUP_DEFS.map((group) => [group.id, []]),
  )

  reservations.forEach((reservation) => {
    const groupId = getHostListGroupId(reservation)
    buckets[groupId]?.push(reservation)
  })

  return HOST_LIST_GROUP_DEFS
    .map((group) => ({
      ...group,
      reservations: buckets[group.id] ?? [],
    }))
    .filter((group) => group.reservations.length > 0)
}

export function reservationOccupiesFloorTables(status) {
  return FLOOR_OCCUPYING_STATUS_IDS.has(normalizeReservationStatus(status))
}

export function isTerminalReservationStatus(status) {
  return TERMINAL_STATUS_IDS.has(normalizeReservationStatus(status))
}

export function isReservationInHouseStatus(status) {
  return IN_HOUSE_STATUS_IDS.has(normalizeReservationStatus(status))
}

export function isUpcomingReservationStatus(status) {
  return UPCOMING_STATUS_IDS.has(normalizeReservationStatus(status))
}

export function getReservationDisplayStatusTone(status) {
  return getHostStatusMeta(status).tone
}

export function getHostListStatusLabel(status) {
  return getHostStatusMeta(status).label
}

export function isReservationLateByTime(reservation, nowMinutes, todayKey) {
  if (`${reservation?.date ?? ''}`.slice(0, 10) !== todayKey) return false

  const status = normalizeReservationStatus(reservation?.status)
  if (!UPCOMING_STATUS_IDS.has(status) || status === 'Late Booking') return false
  if (TERMINAL_STATUS_IDS.has(status) || IN_HOUSE_STATUS_IDS.has(status)) return false

  const minutes = parseTimeToMinutes(reservation?.time)
  return minutes !== null && minutes < nowMinutes
}

function parseTimeToMinutes(value) {
  const raw = `${value ?? ''}`.trim()
  if (!raw) return null

  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null

  return hours * 60 + minutes
}

export function getReservationDisplayStatus(reservation, nowMinutes, todayKey) {
  const status = normalizeReservationStatus(reservation?.status)
  if (status === 'Late Booking') return 'Late Booking'
  if (isReservationLateByTime(reservation, nowMinutes, todayKey)) return 'Late Booking'
  return status
}

export function isReservationLate(reservation, nowMinutes, todayKey) {
  const status = normalizeReservationStatus(reservation?.status)
  if (status === 'Late Booking') return true
  return isReservationLateByTime(reservation, nowMinutes, todayKey)
}

export function isReservationInHouse(reservation) {
  return isReservationInHouseStatus(reservation?.status)
}

export function isReservationWaiting(reservation, todayKey, nowMinutes) {
  const dateKey = `${reservation?.date ?? ''}`.slice(0, 10)
  if (dateKey !== todayKey) return false

  const status = normalizeReservationStatus(reservation?.status)
  if (status === 'Waiting') return true
  if (status === 'Confirmed') {
    const minutes = parseTimeToMinutes(reservation?.time)
    return minutes !== null && minutes <= nowMinutes
  }
  return false
}

export function getHostReservationVisualIndicator(reservation, nowMinutes, todayKey, options = {}) {
  if (options.needsCleaning) return 'cleaning'
  if (!reservation) return 'empty'

  const status = normalizeReservationStatus(reservation.status)
  if (status === 'Checked Out') return 'finished'
  if (!reservationOccupiesFloorTables(status)) return 'empty'

  if (['Checked In', 'Walk In', 'Checked In (Partial)'].includes(status)) return 'seated'
  if (status === 'Late Booking' || isReservationLateByTime(reservation, nowMinutes, todayKey)) return 'late'

  return 'confirmed'
}

export function getFloorTableVisualStatus(reservation, nowMinutes, todayKey, options = {}) {
  if (options.needsCleaning) return 'cleaning'
  if (!reservation) return 'available'

  const status = normalizeReservationStatus(reservation.status)
  if (!reservationOccupiesFloorTables(status)) return 'available'

  if (status === 'Checked In') return 'checked-in'
  if (status === 'Walk In') return 'checked-in'
  if (status === 'Checked In (Partial)') return 'checked-in-partial'
  if (status === 'Confirmed') return 'confirmed'
  if (status === 'Waiting') return 'arrived'
  if (status === 'Late Booking' || isReservationLateByTime(reservation, nowMinutes, todayKey)) {
    return 'arrived'
  }

  return 'booked'
}

export function getFloorTableStatusPriority(reservation) {
  const status = normalizeReservationStatus(reservation?.status)
  if (status === 'Checked In') return 6
  if (status === 'Walk In') return 6
  if (status === 'Checked In (Partial)') return 5
  if (status === 'Waiting') return 4
  if (status === 'Confirmed') return 3
  if (status === 'Late Booking') return 3
  return 2
}

export function getFloorAssignmentPriority(reservation) {
  return getFloorTableStatusPriority(reservation)
}
