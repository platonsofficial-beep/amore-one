import { getConflictingUnitIds } from './reservationTableOptions'
import {
  HOST_ALERT_TYPES,
  getHostReservationAlertReasons,
  getReservationUpdatedAtMs,
  getReservationWaitingMinutes,
  WAITING_TOO_LONG_MINUTES,
} from './reservationServiceIntelligence'
import {
  getHostListGroupId,
  isReservationInHouse,
  isReservationLate,
  isReservationWaiting,
  isTerminalReservationStatus,
  isUpcomingReservationStatus,
  normalizeReservationStatus,
} from './reservationHostStatus'
import { parseReservationTimeToMinutes } from './timeFormatUtils'

export const HOST_LIST_OPERATIONAL_FILTERS = [
  'Upcoming',
  'Arrived',
  'Completed',
  'Problems',
]

function reservationBelongsToDay(reservation, todayKey) {
  return `${reservation?.date ?? ''}`.slice(0, 10) === `${todayKey ?? ''}`.slice(0, 10)
}

function getReservationStableId(reservation) {
  return String(reservation?.id ?? reservation?.orderId ?? '')
}

function compareReservationStableId(left, right) {
  return getReservationStableId(left).localeCompare(getReservationStableId(right))
}

export function isReservationArrivedForHostFilter(reservation) {
  const status = normalizeReservationStatus(reservation?.status)
  if (status === 'Waiting') return true
  return isReservationInHouse(reservation)
}

export function isReservationUpcomingForHostFilter(reservation, nowMinutes, todayKey) {
  const groupId = getHostListGroupId(reservation)
  if (groupId === 'completed' || groupId === 'problems') return false
  if (isReservationArrivedForHostFilter(reservation)) return false

  const status = normalizeReservationStatus(reservation?.status)
  return isUpcomingReservationStatus(status) || status === 'Late Booking'
}

export function isReservationCompletedForHostFilter(reservation) {
  return getHostListGroupId(reservation) === 'completed'
}

export function getHostReservationProblemReasons(
  reservation,
  nowMinutes,
  todayKey,
  problemOptions = {},
) {
  const groupId = getHostListGroupId(reservation)
  if (groupId === 'problems') {
    const status = normalizeReservationStatus(reservation?.status)
    return [{
      type: status === 'Not Shown' ? HOST_ALERT_TYPES.LATE : status,
      tone: 'problem',
      severity: status === 'Not Shown' ? 0 : status === 'Cancelled' ? 1 : 2,
    }]
  }

  return getHostReservationAlertReasons(
    reservation,
    nowMinutes,
    todayKey,
    new Date(),
    problemOptions,
  )
}

export function isReservationProblemForHostFilter(
  reservation,
  nowMinutes,
  todayKey,
  problemOptions = {},
) {
  return getHostReservationProblemReasons(
    reservation,
    nowMinutes,
    todayKey,
    problemOptions,
  ).length > 0
}

export function buildHostServiceDashboard({
  reservations = [],
  nowMinutes = 0,
  todayKey = '',
  layout = null,
  seatings = [],
  selectedSeating = null,
  seatingsById = new Map(),
  problemOptions = {},
} = {}) {
  let expectedGuests = 0
  let arrivedGuests = 0
  let seatedGuests = 0
  let totalReservations = 0
  let upcomingCount = 0
  let arrivedCount = 0
  let seatedCount = 0
  let completedCount = 0
  let problemsCount = 0
  const occupiedTableIds = new Set()

  reservations.forEach((reservation) => {
    if (!reservationBelongsToDay(reservation, todayKey)) return

    const status = normalizeReservationStatus(reservation?.status)
    const guests = Math.max(0, Number(reservation?.guests) || 0)

    if (!isTerminalReservationStatus(status) || status === 'Checked Out') {
      totalReservations += 1
    }

    if (!['Cancelled', 'Not Shown', 'Rejected'].includes(status)) {
      expectedGuests += guests
    }

    if (isReservationArrived(reservation)) {
      arrivedGuests += guests
      arrivedCount += 1
    }

    if (isReservationInHouse(reservation)) {
      seatedGuests += guests
      seatedCount += 1
      const tableNumber = `${reservation.tableNumber ?? ''}`.trim()
      if (tableNumber) occupiedTableIds.add(tableNumber)
    }

    if (isReservationUpcomingForHostFilter(reservation, nowMinutes, todayKey)) {
      upcomingCount += 1
    }

    if (isReservationCompletedForHostFilter(reservation)) {
      completedCount += 1
    }

    if (isReservationProblemForHostFilter(reservation, nowMinutes, todayKey, problemOptions)) {
      problemsCount += 1
    }
  })

  const remainingGuests = Math.max(0, expectedGuests - arrivedGuests - seatedGuests)
  const tables = layout?.tables ?? []
  const totalTables = tables.length
  let reservedTables = 0

  if (selectedSeating) {
    const conflicts = getConflictingUnitIds(reservations, todayKey, selectedSeating.startTime, {
      seatingId: selectedSeating.id,
      durationMinutes: selectedSeating.durationMinutes,
      seatingsById,
      layout,
    })
    reservedTables = conflicts.size
  }

  const occupiedTables = occupiedTableIds.size
  const availableTables = Math.max(0, totalTables - reservedTables - occupiedTables)

  const peakSeating = seatings
    .filter((seating) => seating?.isActive !== false)
    .map((seating) => {
      const covers = reservations.reduce((total, reservation) => {
        if (!reservationBelongsToDay(reservation, todayKey)) return total
        const seatingId = reservation.seatingId ?? reservation.seating_id
        if (`${seatingId}` !== `${seating.id}`) return total
        const reservationStatus = normalizeReservationStatus(reservation?.status)
        if (['Cancelled', 'Not Shown', 'Rejected'].includes(reservationStatus)) return total
        return total + Math.max(0, Number(reservation?.guests) || 0)
      }, 0)

      return {
        id: seating.id,
        name: seating.name,
        startTime: seating.startTime,
        covers,
      }
    })
    .sort((left, right) => right.covers - left.covers || left.startTime.localeCompare(right.startTime))[0] ?? null

  return {
    expectedGuests,
    arrivedGuests,
    remainingGuests,
    seatedGuests,
    totalReservations,
    upcomingCount,
    arrivedCount,
    seatedCount,
    completedCount,
    problemsCount,
    totalTables,
    availableTables,
    reservedTables,
    occupiedTables,
    peakSeating,
  }
}

export function hostListFilterMatch(
  reservation,
  filter,
  nowMinutes,
  todayKey,
  problemOptions = {},
) {
  switch (filter) {
    case 'All':
      return true
    case 'Upcoming':
      return isReservationUpcomingForHostFilter(reservation, nowMinutes, todayKey)
    case 'Arrived':
      return isReservationArrivedForHostFilter(reservation)
    case 'Seated':
    case 'In House':
      return isReservationInHouse(reservation)
    case 'Completed':
      return isReservationCompletedForHostFilter(reservation)
    case 'Problems':
      return isReservationProblemForHostFilter(
        reservation,
        nowMinutes,
        todayKey,
        problemOptions,
      )
    default:
      return true
  }
}

export function countHostListFilterMatches(
  reservations,
  filter,
  nowMinutes,
  todayKey,
  problemOptions = {},
) {
  return reservations.filter((reservation) => (
    hostListFilterMatch(reservation, filter, nowMinutes, todayKey, problemOptions)
  )).length
}

function getProblemSeverityRank(reservation, nowMinutes, todayKey, problemOptions = {}) {
  const groupId = getHostListGroupId(reservation)
  if (groupId === 'problems') {
    const status = normalizeReservationStatus(reservation?.status)
    if (status === 'Not Shown') return 0
    if (status === 'Cancelled') return 1
    return 2
  }

  const status = normalizeReservationStatus(reservation?.status)
  if (status === 'Waiting') {
    const waitingMinutes = getReservationWaitingMinutes(reservation, nowMinutes, todayKey)
    if (waitingMinutes !== null && waitingMinutes >= WAITING_TOO_LONG_MINUTES) return 4
    return 8
  }

  if (isReservationLate(reservation, nowMinutes, todayKey)) return 3

  const waitingMinutes = getReservationWaitingMinutes(reservation, nowMinutes, todayKey)
  if (waitingMinutes !== null && waitingMinutes >= WAITING_TOO_LONG_MINUTES) return 4

  const reasons = getHostReservationProblemReasons(
    reservation,
    nowMinutes,
    todayKey,
    problemOptions,
  )

  if (reasons.some((reason) => reason.type === HOST_ALERT_TYPES.UNASSIGNED)) return 5
  if (reasons.some((reason) => reason.type === HOST_ALERT_TYPES.CAPACITY)) return 6
  if (reasons.some((reason) => reason.type === HOST_ALERT_TYPES.OCCUPIED_LONG)) return 7
  return 8
}

function getProblemDelayMinutes(reservation, nowMinutes, todayKey) {
  const waitingMinutes = getReservationWaitingMinutes(reservation, nowMinutes, todayKey)
  if (waitingMinutes !== null) return waitingMinutes

  const arrivalMinutes = parseReservationTimeToMinutes(reservation?.time)
  if (arrivalMinutes === null) return 0
  return Math.max(0, nowMinutes - arrivalMinutes)
}

export function sortHostListFilterReservations(
  reservations,
  filter,
  nowMinutes,
  todayKey,
  problemOptions = {},
) {
  const items = [...reservations]

  if (filter === 'Upcoming') {
    return items.sort((left, right) => {
      const leftLate = isReservationLate(left, nowMinutes, todayKey) ? 0 : 1
      const rightLate = isReservationLate(right, nowMinutes, todayKey) ? 0 : 1
      if (leftLate !== rightLate) return leftLate - rightLate

      const timeDiff = (parseReservationTimeToMinutes(left?.time) ?? Number.MAX_SAFE_INTEGER)
        - (parseReservationTimeToMinutes(right?.time) ?? Number.MAX_SAFE_INTEGER)
      if (timeDiff !== 0) return timeDiff

      return compareReservationStableId(left, right)
    })
  }

  if (filter === 'Arrived') {
    return items.sort((left, right) => {
      const rank = (reservation) => {
        const waitingMinutes = getReservationWaitingMinutes(reservation, nowMinutes, todayKey)
        if (waitingMinutes !== null && waitingMinutes >= WAITING_TOO_LONG_MINUTES) return 0
        if (normalizeReservationStatus(reservation?.status) === 'Waiting') return 1
        if (isReservationInHouse(reservation)) return 2
        return 3
      }

      const rankDiff = rank(left) - rank(right)
      if (rankDiff !== 0) return rankDiff

      const leftWaiting = getReservationWaitingMinutes(left, nowMinutes, todayKey) ?? 0
      const rightWaiting = getReservationWaitingMinutes(right, nowMinutes, todayKey) ?? 0
      if (leftWaiting !== rightWaiting) return rightWaiting - leftWaiting

      const timeDiff = (parseReservationTimeToMinutes(left?.time) ?? 0)
        - (parseReservationTimeToMinutes(right?.time) ?? 0)
      if (timeDiff !== 0) return timeDiff

      return compareReservationStableId(left, right)
    })
  }

  if (filter === 'Completed') {
    return items.sort((left, right) => {
      const leftUpdated = getReservationUpdatedAtMs(left)
      const rightUpdated = getReservationUpdatedAtMs(right)
      if (leftUpdated !== null && rightUpdated !== null && leftUpdated !== rightUpdated) {
        return rightUpdated - leftUpdated
      }

      const timeDiff = (parseReservationTimeToMinutes(right?.time) ?? 0)
        - (parseReservationTimeToMinutes(left?.time) ?? 0)
      if (timeDiff !== 0) return timeDiff

      return compareReservationStableId(left, right)
    })
  }

  if (filter === 'Problems') {
    return items.sort((left, right) => {
      const severityDiff = getProblemSeverityRank(left, nowMinutes, todayKey, problemOptions)
        - getProblemSeverityRank(right, nowMinutes, todayKey, problemOptions)
      if (severityDiff !== 0) return severityDiff

      const delayDiff = getProblemDelayMinutes(right, nowMinutes, todayKey)
        - getProblemDelayMinutes(left, nowMinutes, todayKey)
      if (delayDiff !== 0) return delayDiff

      const timeDiff = (parseReservationTimeToMinutes(left?.time) ?? 0)
        - (parseReservationTimeToMinutes(right?.time) ?? 0)
      if (timeDiff !== 0) return timeDiff

      return compareReservationStableId(left, right)
    })
  }

  return items
}

export function filterHostListReservations(
  reservations,
  filter,
  nowMinutes,
  todayKey,
  problemOptions = {},
) {
  return reservations.filter((reservation) => (
    hostListFilterMatch(reservation, filter, nowMinutes, todayKey, problemOptions)
  ))
}

export function buildHostFilterCounts(
  reservations,
  nowMinutes,
  todayKey,
  problemOptions = {},
) {
  return HOST_LIST_OPERATIONAL_FILTERS.reduce((counts, filter) => ({
    ...counts,
    [filter]: countHostListFilterMatches(
      reservations,
      filter,
      nowMinutes,
      todayKey,
      problemOptions,
    ),
  }), {})
}

// Backward-compatible aliases used in dashboard metrics.
function isReservationArrived(reservation) {
  return normalizeReservationStatus(reservation?.status) === 'Waiting'
}

function isReservationUpcomingArrival(reservation, nowMinutes, todayKey) {
  return isReservationUpcomingForHostFilter(reservation, nowMinutes, todayKey)
}

export {
  isReservationArrived,
  isReservationUpcomingArrival,
}
