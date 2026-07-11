import { reservationHasAssignedTables } from './floorAssignmentMapping'
import { isTerminalReservationStatus } from './reservationHostStatus'
import { resolveReservationSeatingId } from './reservationSeatings'

export function isReservationEligibleForHostTableAssignment(reservation) {
  if (!reservation) return false
  if (isTerminalReservationStatus(reservation?.status)) return false
  return !reservationHasAssignedTables(reservation)
}

export function isHostCompactAssignmentSelection({
  isCompact = false,
  selectedReservation = null,
} = {}) {
  if (!isCompact || !selectedReservation) return false
  return isReservationEligibleForHostTableAssignment(selectedReservation)
}

export function isHostAssignmentModeActive({
  selectedReservation = null,
  floorPlanMode = 'view',
  isCompact = false,
} = {}) {
  if (!selectedReservation || floorPlanMode !== 'view') return false
  if (isCompact) {
    return isHostCompactAssignmentSelection({ isCompact, selectedReservation })
  }
  return true
}

export function shouldShowHostSeatingDrawer() {
  return false
}

export function resolveHostAssignmentSeatingId({
  reservation = null,
  seatings = [],
  selectedSeatingId = null,
} = {}) {
  if (selectedSeatingId) return selectedSeatingId
  return resolveReservationSeatingId(reservation, seatings)
}

/** Approximate height budget for standard iPad landscape assignment content (px). */
export const HOST_ASSIGNMENT_STANDARD_LANDSCAPE_HEIGHT_BUDGET = 340

export function getHostAssignmentScrollPolicy({ needsScroll = false, isPortrait = false } = {}) {
  if (isPortrait || needsScroll) {
    return 'overflow'
  }

  return 'content-fit'
}

export function shouldHostAssignmentEnableScroll({
  bodyScrollHeight = 0,
  availableBodyHeight = Number.POSITIVE_INFINITY,
  isPortrait = false,
} = {}) {
  if (isPortrait) return true
  return bodyScrollHeight > availableBodyHeight + 1
}

export function getHostSeatingAssignmentAdvisory({ hasSelection = false, totals = null } = {}) {
  if (!hasSelection) {
    return { tone: 'neutral', message: 'No tables selected.' }
  }

  if (totals?.isOverCapacity) {
    return { tone: 'warning', message: 'Selected capacity is below party size.' }
  }

  return { tone: 'success', message: 'Capacity fits this party.' }
}
