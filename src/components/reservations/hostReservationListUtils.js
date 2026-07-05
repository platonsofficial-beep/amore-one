import {
  computeSeatingAssignmentTotals,
  enrichReservationWithSeatingAssignment,
} from '../../lib/seatingAssignment'
import {
  getReservationDateKey,
} from '../../lib/floorAssignmentMapping'
import { normalizeReservationDateKey } from '../../lib/timeFormatUtils'
import {
  getHostListGroupId,
  isReservationLate,
} from '../../lib/reservationHostStatus'

export {
  HOST_LIST_GROUP_DEFS,
  getHostListGroupId,
  groupHostListReservations,
} from '../../lib/reservationHostStatus'

export function getSelectedDateReservations(reservations = [], dateKey = '') {
  const normalizedDateKey = normalizeReservationDateKey(dateKey)
  if (!normalizedDateKey) return []

  return reservations.filter(
    (reservation) => getReservationDateKey(reservation) === normalizedDateKey,
  )
}

function reservationHasCapacityWarning(reservation) {
  const guests = Number(
    reservation.guests ?? reservation.party_size ?? reservation.guest_count,
  ) || 0
  const assignment = reservation.seatingAssignment
  if (!assignment?.assignedUnits?.length) return false
  return computeSeatingAssignmentTotals(assignment, guests).isOverCapacity
}

function reservationNeedsHostAttention(reservation, nowMinutes, todayKey) {
  const hasNotes = Boolean(`${reservation.notes ?? ''}`.trim())
  const missingPhone = !`${reservation.phone ?? ''}`.trim()
  const isUnassigned = isReservationUnassignedForCounter(reservation)

  return isUnassigned
    || reservationHasCapacityWarning(reservation)
    || isReservationLate(reservation, nowMinutes, todayKey)
    || hasNotes
    || missingPhone
}

function normalizeCounterStatusKey(status) {
  return `${status ?? ''}`.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function isReservationSeatedForCounter(reservation) {
  const statusKey = normalizeCounterStatusKey(reservation?.status)
  if (statusKey === 'seated' || statusKey === 'checked_in' || statusKey === 'in_house') {
    return true
  }

  return getHostListGroupId(reservation) === 'in-house'
}

export function isReservationUnassignedForCounter(reservation) {
  const enriched = enrichReservationWithSeatingAssignment(reservation)
  return (enriched.seatingAssignment?.assignedUnits ?? []).length === 0
}

export function buildHostManagerSummary(visibleReservations = [], nowMinutes, todayKey) {
  let totalGuests = 0
  let seated = 0
  let unassigned = 0
  let needsAttention = 0

  visibleReservations.forEach((entry) => {
    const reservation = enrichReservationWithSeatingAssignment(entry)
    totalGuests += Number(
      reservation.guests ?? reservation.party_size ?? reservation.guest_count,
    ) || 0

    if (isReservationSeatedForCounter(reservation)) {
      seated += 1
    }

    if (isReservationUnassignedForCounter(reservation)) {
      unassigned += 1
    }

    if (reservationNeedsHostAttention(reservation, nowMinutes, todayKey)) {
      needsAttention += 1
    }
  })

  return {
    totalReservations: visibleReservations.length,
    totalGuests,
    seated,
    unassigned,
    needsAttention,
  }
}

export function getHostListCustomerTypeMeta(reservation, getGuestCustomerType) {
  const notes = `${reservation?.notes ?? ''}`.toLowerCase()
  const customerType = getGuestCustomerType(reservation)

  if (notes.includes('walk-in') || notes.includes('walk in') || notes.includes('walkin')) {
    return { label: 'WALK-IN', className: 'type-walkin' }
  }

  if (customerType === 'VVIP') {
    return { label: 'VVIP', className: 'type-vvip' }
  }

  if (customerType === 'VIP') {
    return { label: 'VIP', className: 'type-vip' }
  }

  return { label: 'REG', className: 'type-regular' }
}
