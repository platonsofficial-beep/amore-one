export function isHostAssignmentModeActive({
  selectedReservation = null,
  floorPlanMode = 'view',
} = {}) {
  return Boolean(selectedReservation) && floorPlanMode === 'view'
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
