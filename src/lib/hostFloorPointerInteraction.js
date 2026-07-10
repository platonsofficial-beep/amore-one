export const HOST_FLOOR_TAP_MOVE_THRESHOLD_PX = 10

export function getHostFloorPointerDistance(start, end) {
  if (!start || !end) return 0
  const dx = (end.clientX ?? 0) - (start.clientX ?? 0)
  const dy = (end.clientY ?? 0) - (start.clientY ?? 0)
  return Math.hypot(dx, dy)
}

export function isHostFloorTapGesture(start, end, threshold = HOST_FLOOR_TAP_MOVE_THRESHOLD_PX) {
  if (!start || !end) return false
  if (start.pointerId != null && end.pointerId != null && start.pointerId !== end.pointerId) {
    return false
  }
  return getHostFloorPointerDistance(start, end) <= threshold
}

export function shouldStartHostFloorPan(distance, threshold = HOST_FLOOR_TAP_MOVE_THRESHOLD_PX) {
  return distance > threshold
}

export function isInteractiveHostFloorTarget(target) {
  if (!target?.closest) return false
  return Boolean(
    target.closest('.floor-table-node')
    || target.closest('.floor-seating-selector, .floor-seating-selector-chip')
    || target.closest('.floor-plan-toolbar')
    || target.closest('button, select, input, textarea, a, label'),
  )
}
