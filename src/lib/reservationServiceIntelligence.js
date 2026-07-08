import { parseTimeToMinutes } from './shiftHoursUtils'
import {
  getHostListGroupId,
  getHostStatusGroupId,
  getReservationDisplayStatus,
  isReservationInHouse,
  isReservationInHouseStatus,
  isReservationLate,
  isTerminalReservationStatus,
  isUpcomingReservationStatus,
  normalizeReservationStatus,
} from './reservationHostStatus'

export const WAITING_TOO_LONG_MINUTES = 15
export const TABLE_OCCUPIED_TOO_LONG_MINUTES = 120

export const HOST_ALERT_TYPES = {
  LATE: 'late',
  WAITING_LONG: 'waiting-long',
  OCCUPIED_LONG: 'occupied-long',
  UNASSIGNED: 'unassigned',
  CAPACITY: 'capacity',
}

const EXCLUDED_COVER_STATUS_IDS = new Set(['Cancelled', 'Not Shown', 'Rejected'])

function reservationBelongsToDay(reservation, todayKey) {
  return `${reservation?.date ?? ''}`.slice(0, 10) === todayKey
}

export function getReservationUpdatedAtMs(reservation) {
  const raw = reservation?.updatedAt ?? reservation?.updated_at
  if (!raw) return null

  const parsed = new Date(raw).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

export function getMinutesSinceTimestamp(isoTimestamp, referenceDate = new Date()) {
  const ms = new Date(isoTimestamp).getTime()
  if (Number.isNaN(ms)) return null

  return Math.max(0, Math.floor((referenceDate.getTime() - ms) / 60000))
}

export function getReservationWaitingMinutes(reservation, nowMinutes, todayKey) {
  const status = normalizeReservationStatus(reservation?.status)
  if (status !== 'Waiting') return null
  if (!reservationBelongsToDay(reservation, todayKey)) return null

  const arrivalMinutes = parseTimeToMinutes(reservation?.time)
  if (arrivalMinutes === null) return null

  return Math.max(0, nowMinutes - arrivalMinutes)
}

export function getReservationOccupiedMinutes(reservation, referenceDate = new Date()) {
  if (!isReservationInHouseStatus(reservation?.status)) return null

  const updatedAtMs = getReservationUpdatedAtMs(reservation)
  if (updatedAtMs === null) return null

  return getMinutesSinceTimestamp(updatedAtMs, referenceDate)
}

export function getHostReservationAlertReasons(
  reservation,
  nowMinutes,
  todayKey,
  referenceDate = new Date(),
  options = {},
) {
  const {
    includeUnassigned = true,
    includeCapacity = true,
  } = options
  const reasons = []
  const status = normalizeReservationStatus(reservation?.status)

  if (isTerminalReservationStatus(status)) return reasons

  if (isReservationLate(reservation, nowMinutes, todayKey)) {
    const arrivalMinutes = parseTimeToMinutes(reservation?.time)
    const delay = arrivalMinutes === null ? null : Math.max(0, nowMinutes - arrivalMinutes)
    reasons.push({
      type: HOST_ALERT_TYPES.LATE,
      tone: 'late',
      delayMinutes: delay,
    })
  }

  const waitingMinutes = getReservationWaitingMinutes(reservation, nowMinutes, todayKey)
  if (waitingMinutes !== null && waitingMinutes >= WAITING_TOO_LONG_MINUTES) {
    reasons.push({
      type: HOST_ALERT_TYPES.WAITING_LONG,
      tone: 'waiting',
      delayMinutes: waitingMinutes,
    })
  }

  const occupiedMinutes = getReservationOccupiedMinutes(reservation, referenceDate)
  if (occupiedMinutes !== null && occupiedMinutes >= TABLE_OCCUPIED_TOO_LONG_MINUTES) {
    reasons.push({
      type: HOST_ALERT_TYPES.OCCUPIED_LONG,
      tone: 'occupied',
      delayMinutes: occupiedMinutes,
    })
  }

  if (includeUnassigned && options.isUnassigned?.(reservation)) {
    reasons.push({
      type: HOST_ALERT_TYPES.UNASSIGNED,
      tone: 'unassigned',
    })
  }

  if (includeCapacity && options.hasCapacityWarning?.(reservation)) {
    reasons.push({
      type: HOST_ALERT_TYPES.CAPACITY,
      tone: 'capacity',
    })
  }

  return reasons
}

export function formatHostAlertLabel(reason, guestName = 'Guest') {
  switch (reason.type) {
    case HOST_ALERT_TYPES.LATE:
      return reason.delayMinutes !== null
        ? `${guestName} is ${reason.delayMinutes} min late`
        : `${guestName} is late`
    case HOST_ALERT_TYPES.WAITING_LONG:
      return `${guestName} waiting ${reason.delayMinutes} min`
    case HOST_ALERT_TYPES.OCCUPIED_LONG:
      return `${guestName} seated ${reason.delayMinutes} min`
    case HOST_ALERT_TYPES.UNASSIGNED:
      return `${guestName} needs a table`
    case HOST_ALERT_TYPES.CAPACITY:
      return `${guestName} over table capacity`
    default:
      return `${guestName} needs attention`
  }
}

export function buildHostReservationAlerts(
  reservations = [],
  nowMinutes,
  todayKey,
  referenceDate = new Date(),
  options = {},
) {
  const alerts = []

  reservations.forEach((reservation) => {
    const reasons = getHostReservationAlertReasons(
      reservation,
      nowMinutes,
      todayKey,
      referenceDate,
      options,
    )

    reasons.forEach((reason, index) => {
      const guestName = `${reservation?.guestName ?? ''}`.trim() || 'Guest'
      alerts.push({
        id: `alert-${reason.type}-${reservation.id}-${index}`,
        type: reason.type,
        tone: reason.tone,
        reservation,
        reservationId: reservation.id,
        label: formatHostAlertLabel(reason, guestName),
        delayMinutes: reason.delayMinutes ?? null,
        severity: reason.type === HOST_ALERT_TYPES.LATE ? 0 : 1,
      })
    })
  })

  return alerts.sort((left, right) => {
    const severityDiff = left.severity - right.severity
    if (severityDiff !== 0) return severityDiff

    const leftDelay = left.delayMinutes ?? 0
    const rightDelay = right.delayMinutes ?? 0
    return rightDelay - leftDelay
  })
}

export function buildDailyServiceSnapshot(
  reservations = [],
  nowMinutes,
  todayKey,
  referenceDate = new Date(),
) {
  let totalCovers = 0
  let upcomingArrivals = 0
  let upcomingCovers = 0
  let seatedGuests = 0
  let seatedTables = 0
  let waitingGuests = 0
  let waitingCount = 0
  let lateCount = 0
  let lateGuests = 0
  let completedTables = 0
  let completedCovers = 0
  let activeReservations = 0
  let unassignedTables = 0
  let walkIns = 0
  const occupiedTables = new Set()

  reservations.forEach((reservation) => {
    if (!reservationBelongsToDay(reservation, todayKey)) return

    const status = normalizeReservationStatus(reservation?.status)
    const guests = Number(reservation?.guests) || 0
    const arrivalMinutes = parseTimeToMinutes(reservation?.time)
    const groupId = getHostListGroupId(reservation)

    if (!EXCLUDED_COVER_STATUS_IDS.has(status)) {
      totalCovers += guests
    }

    if (!isTerminalReservationStatus(status)) {
      activeReservations += 1
    }

    if (status === 'Walk In') {
      walkIns += 1
    }

    if (isReservationInHouse(reservation)) {
      seatedGuests += guests
      seatedTables += 1
      const table = `${reservation.tableNumber ?? ''}`.trim()
      if (table) occupiedTables.add(table)
    }

    if (
      isUpcomingReservationStatus(status)
      && arrivalMinutes !== null
      && arrivalMinutes >= nowMinutes
    ) {
      upcomingArrivals += 1
      upcomingCovers += guests
    }

    if (status === 'Waiting') {
      waitingCount += 1
      waitingGuests += guests
    }

    if (isReservationLate(reservation, nowMinutes, todayKey)) {
      lateCount += 1
      lateGuests += guests
    }

    if (status === 'Checked Out') {
      completedTables += 1
      completedCovers += guests
    }

    if (
      groupId === 'upcoming'
      && !`${reservation.tableNumber ?? ''}`.trim()
      && !isTerminalReservationStatus(status)
    ) {
      unassignedTables += 1
    }
  })

  const waitingLateCount = waitingCount + lateCount
  const waitingLateGuests = waitingGuests + lateGuests

  let overallStatus = 'On track'
  let overallTone = 'calm'

  if (lateCount >= 3 || waitingLateCount >= 4) {
    overallStatus = 'Under pressure'
    overallTone = 'alert'
  } else if (waitingLateCount >= 1) {
    overallStatus = 'Attention needed'
    overallTone = 'watch'
  } else if (upcomingArrivals >= 4 || seatedTables >= 8) {
    overallStatus = 'Busy service'
    overallTone = 'active'
  } else if (activeReservations === 0) {
    overallStatus = 'Quiet service'
    overallTone = 'calm'
  }

  return {
    totalCovers,
    upcomingArrivals,
    upcomingCovers,
    seatedGuests,
    seatedTables,
    waitingGuests,
    waitingCount,
    lateCount,
    lateGuests,
    waitingLateCount,
    waitingLateGuests,
    completedTables,
    completedCovers,
    activeReservations,
    unassignedTables,
    walkIns,
    tableOccupancy: occupiedTables.size > 0 ? occupiedTables.size : null,
    overallStatus,
    overallTone,
    referenceDate,
  }
}

export function getServiceOrderRank(reservation, nowMinutes, todayKey) {
  const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, todayKey)
  const status = normalizeReservationStatus(reservation?.status)
  const dateKey = `${reservation.date ?? ''}`.slice(0, 10)
  const groupId = getHostStatusGroupId(status)

  if (displayStatus === 'Late Booking') return 0
  if (status === 'Waiting') return 1
  if (groupId === 'in-house') return 2
  if (groupId === 'upcoming') return dateKey > todayKey ? 3.5 : 3
  if (groupId === 'completed') return 5
  if (groupId === 'problems') return 6
  return 4
}

export function getHostListEmptyState({
  filter = 'All',
  searchTerm = '',
  snapshot = null,
  isViewingToday = true,
} = {}) {
  const trimmedSearch = `${searchTerm ?? ''}`.trim()

  if (trimmedSearch) {
    return {
      title: 'No matching reservations',
      copy: 'Try another guest name, phone number, or table.',
    }
  }

  if (filter === 'Problems') {
    return {
      title: 'No problems right now',
      copy: 'Cancelled, no-show, and rejected reservations will appear here.',
    }
  }

  if (filter === 'Completed') {
    return {
      title: 'No completed tables yet',
      copy: isViewingToday
        ? 'Checked-out reservations will show here as service progresses.'
        : 'No completed reservations for this date.',
    }
  }

  if (filter === 'In House') {
    return {
      title: 'No guests seated',
      copy: isViewingToday
        ? 'Seat an arrival from Upcoming when guests are ready.'
        : 'No in-house reservations for this date.',
    }
  }

  if (filter === 'Upcoming') {
    if (snapshot?.upcomingArrivals === 0 && isViewingToday) {
      return {
        title: 'No upcoming arrivals',
        copy: snapshot?.completedTables > 0
          ? 'Service is winding down. Add a walk-in if more guests arrive.'
          : 'The board is clear for now. Add a reservation or walk-in when guests arrive.',
      }
    }

    return {
      title: 'No upcoming reservations',
      copy: 'Future arrivals for this date will appear here.',
    }
  }

  if (snapshot?.activeReservations === 0) {
    return {
      title: isViewingToday ? 'Quiet service right now' : 'No reservations this day',
      copy: isViewingToday
        ? 'No active reservations on the board. Tap + Reservation when guests arrive.'
        : 'Switch dates or add a reservation to plan service.',
    }
  }

  if (snapshot?.seatedTables > 0 && snapshot?.upcomingArrivals === 0 && isViewingToday) {
    return {
      title: 'No more arrivals scheduled',
      copy: `${snapshot.seatedTables} table${snapshot.seatedTables === 1 ? '' : 's'} in service. Watch seated guests for turnover.`,
    }
  }

  return {
    title: 'No reservations in this view',
    copy: 'Adjust filters or add a reservation to continue.',
  }
}

export function getTimelineEmptyState({
  snapshot = null,
  isViewingToday = true,
} = {}) {
  if (snapshot?.activeReservations === 0) {
    return {
      title: isViewingToday ? 'Quiet service period' : 'No service scheduled',
      copy: isViewingToday
        ? 'No arrivals on the timeline. The floor is open for walk-ins.'
        : 'No reservations on this date.',
      className: 'reservations-empty-state-upcoming',
    }
  }

  if (snapshot?.upcomingArrivals === 0 && snapshot?.seatedTables > 0) {
    return {
      title: 'Arrival board clear',
      copy: `${snapshot.seatedGuests} guest${snapshot.seatedGuests === 1 ? '' : 's'} currently seated.`,
      className: 'reservations-empty-state-upcoming',
    }
  }

  return {
    title: 'No upcoming reservations',
    copy: 'Your arrival board is clear for the selected filters.',
    className: '',
  }
}
