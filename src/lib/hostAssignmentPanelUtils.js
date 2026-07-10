export function isHostAssignmentModeActive({
  selectedReservation = null,
  floorPlanMode = 'view',
} = {}) {
  return Boolean(selectedReservation) && floorPlanMode === 'view'
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
