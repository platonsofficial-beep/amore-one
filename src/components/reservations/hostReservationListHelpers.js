import { reservationHasAssignedTables } from '../../lib/floorAssignmentMapping'
import {
  computeSeatingAssignmentTotals,
  enrichReservationWithSeatingAssignment,
} from '../../lib/seatingAssignment'
import {
  getHostListStatusLabel,
  getReservationDisplayStatus,
  getReservationDisplayStatusTone,
  isReservationInHouse,
  isReservationLate,
  isReservationWaiting,
  isTerminalReservationStatus,
  normalizeReservationStatus,
} from '../../lib/reservationHostStatus'
import { getHostReservationAlertReasons } from '../../lib/reservationServiceIntelligence'
import { parseCustomerTypeFromNotes } from '../../lib/reservationCustomerType'
import { formatHostReservationListTime } from '../../lib/timeFormatUtils'

export function formatReservationGuestName(name) {
  const trimmed = `${name || 'Guest'}`.trim()
  if (!trimmed) return 'Guest'

  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function reservationHasCapacityWarning(reservation) {
  const guests = Number(
    reservation.guests ?? reservation.party_size ?? reservation.guest_count,
  ) || 0
  const assignment = enrichReservationWithSeatingAssignment(reservation).seatingAssignment
  if (!assignment?.assignedUnits?.length) return false
  return computeSeatingAssignmentTotals(assignment, guests).isOverCapacity
}

export function getHostReservationWarnings(reservation, nowMinutes, todayKey) {
  const warnings = []

  getHostReservationAlertReasons(reservation, nowMinutes, todayKey, new Date(), {
    includeUnassigned: false,
    includeCapacity: false,
  }).forEach((reason) => {
    if (reason.type === 'late') warnings.push('late')
    if (reason.type === 'waiting-long') warnings.push('waiting')
    if (reason.type === 'occupied-long') warnings.push('occupied')
  })

  if (
    !reservationHasAssignedTables(reservation)
    && !isTerminalReservationStatus(reservation?.status)
  ) {
    warnings.push('unassigned')
  }

  if (reservationHasCapacityWarning(reservation)) {
    warnings.push('capacity')
  }

  return warnings
}

function getGuestCustomerType(reservation) {
  const fromField = `${reservation?.customerType ?? ''}`.trim()
  if (fromField === 'VIP' || fromField === 'VVIP' || fromField === 'House Guest') {
    return fromField
  }
  return parseCustomerTypeFromNotes(reservation?.notes ?? '')
}

export const HOST_LIST_HELPERS = {
  formatReservationGuestName,
  formatHostReservationListTime,
  getReservationDisplayStatus,
  getReservationDisplayStatusTone,
  getHostListStatusLabel,
  getHostReservationWarnings,
  getGuestCustomerType,
  normalizeReservationStatus,
  isReservationWaiting,
  isReservationInHouse,
  isReservationLate,
}

export function formatHostListMetaLine(guestCount, tableLabel) {
  const count = Number(guestCount) || 0
  const table = `${tableLabel ?? ''}`.trim()
  if (!table || table === '—') return `${count} • Unassigned`
  return `${count} • ${table}`
}
