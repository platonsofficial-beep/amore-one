import { getConflictingUnitIds } from './reservationTableOptions'
import {
  getHostListGroupId,
  isReservationInHouse,
  isReservationLate,
  isReservationWaiting,
  isTerminalReservationStatus,
  normalizeReservationStatus,
} from './reservationHostStatus'
import { parseReservationTimeToMinutes } from './timeFormatUtils'

function reservationBelongsToDay(reservation, todayKey) {
  return `${reservation?.date ?? ''}`.slice(0, 10) === `${todayKey ?? ''}`.slice(0, 10)
}

function isReservationArrived(reservation) {
  return normalizeReservationStatus(reservation?.status) === 'Waiting'
}

function isReservationUpcomingArrival(reservation, nowMinutes, todayKey) {
  const groupId = getHostListGroupId(reservation)
  if (groupId !== 'upcoming' || isReservationArrived(reservation)) return false

  const arrivalMinutes = parseReservationTimeToMinutes(reservation?.time)
  if (arrivalMinutes === null) return true
  return arrivalMinutes >= nowMinutes
}

export function buildHostServiceDashboard({
  reservations = [],
  nowMinutes = 0,
  todayKey = '',
  layout = null,
  seatings = [],
  selectedSeating = null,
  seatingsById = new Map(),
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
    const groupId = getHostListGroupId(reservation)

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

    if (isReservationUpcomingArrival(reservation, nowMinutes, todayKey)) {
      upcomingCount += 1
    }

    if (groupId === 'completed') {
      completedCount += 1
    }

    if (groupId === 'problems' || isReservationLate(reservation, nowMinutes, todayKey)) {
      problemsCount += 1
    } else if (isReservationWaiting(reservation, todayKey, nowMinutes)) {
      const waitingMinutes = parseReservationTimeToMinutes(reservation?.time)
      if (waitingMinutes !== null && nowMinutes - waitingMinutes >= 15) {
        problemsCount += 1
      }
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
        const status = normalizeReservationStatus(reservation?.status)
        if (['Cancelled', 'Not Shown', 'Rejected'].includes(status)) return total
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

export function hostListFilterMatch(reservation, filter, nowMinutes, todayKey) {
  const groupId = getHostListGroupId(reservation)

  switch (filter) {
    case 'All':
      return true
    case 'Upcoming':
      return isReservationUpcomingArrival(reservation, nowMinutes, todayKey)
    case 'Arrived':
      return isReservationArrived(reservation)
    case 'Seated':
      return isReservationInHouse(reservation)
    case 'In House':
      return groupId === 'in-house' || isReservationInHouse(reservation)
    case 'Completed':
      return groupId === 'completed'
    case 'Problems':
      return groupId === 'problems'
        || isReservationLate(reservation, nowMinutes, todayKey)
    default:
      return true
  }
}

export function countHostListFilterMatches(reservations, filter, nowMinutes, todayKey) {
  return reservations.filter((reservation) => (
    hostListFilterMatch(reservation, filter, nowMinutes, todayKey)
  )).length
}
