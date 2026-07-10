export const HOST_FLOOR_TAP_MOVE_THRESHOLD_PX = 10

export const HOST_FLOOR_POINTER_MODE = {
  IDLE: 'idle',
  TABLE_PENDING: 'table-pending',
  PAN_PENDING: 'pan-pending',
  PANNING: 'panning',
}

export function createIdleHostFloorPointerState() {
  return { mode: HOST_FLOOR_POINTER_MODE.IDLE }
}

export function getHostFloorPointerDistance(start, end) {
  if (!start || !end) return 0
  const startX = start.clientX ?? start.startX ?? 0
  const startY = start.clientY ?? start.startY ?? 0
  const dx = (end.clientX ?? 0) - startX
  const dy = (end.clientY ?? 0) - startY
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

export function resolveHostFloorTableTarget(target) {
  const node = target?.closest?.('.floor-table-node')
  if (!node) return null

  const tableId = `${node.dataset?.floorTableId ?? node.dataset?.tableId ?? ''}`.trim()
  if (!tableId) return null

  return { node, tableId }
}

export function isInteractiveHostFloorTarget(target) {
  if (!target?.closest) return false
  return Boolean(
    target.closest('.floor-seating-selector, .floor-seating-selector-chip')
    || target.closest('.floor-plan-toolbar')
    || target.closest('button, select, input, textarea, a, label'),
  )
}

export function beginHostFloorPointerInteraction(event, target, { originX = 0, originY = 0 } = {}) {
  const tableTarget = resolveHostFloorTableTarget(target)
  if (tableTarget) {
    return {
      mode: HOST_FLOOR_POINTER_MODE.TABLE_PENDING,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      tableId: tableTarget.tableId,
    }
  }

  if (isInteractiveHostFloorTarget(target)) {
    return createIdleHostFloorPointerState()
  }

  return {
    mode: HOST_FLOOR_POINTER_MODE.PAN_PENDING,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX,
    originY,
  }
}

export function advanceHostFloorPointerInteraction(state, event) {
  if (!state || state.mode === HOST_FLOOR_POINTER_MODE.IDLE) return state
  if (state.pointerId !== event.pointerId) return state

  const distance = getHostFloorPointerDistance(
    { clientX: state.startX, clientY: state.startY },
    event,
  )

  if (state.mode === HOST_FLOOR_POINTER_MODE.TABLE_PENDING) {
    if (shouldStartHostFloorPan(distance)) {
      return createIdleHostFloorPointerState()
    }
    return state
  }

  if (state.mode === HOST_FLOOR_POINTER_MODE.PAN_PENDING) {
    if (!shouldStartHostFloorPan(distance)) return state
    return { ...state, mode: HOST_FLOOR_POINTER_MODE.PANNING }
  }

  return state
}

export function getHostFloorPanOffset(state, event) {
  if (!state || state.mode !== HOST_FLOOR_POINTER_MODE.PANNING) return null
  return {
    x: state.originX + (event.clientX - state.startX),
    y: state.originY + (event.clientY - state.startY),
  }
}

export function completeHostFloorPointerInteraction(state, event) {
  if (!state || state.mode === HOST_FLOOR_POINTER_MODE.IDLE) {
    return { nextState: createIdleHostFloorPointerState(), tableTap: null }
  }

  if (state.pointerId !== event.pointerId) {
    return { nextState: createIdleHostFloorPointerState(), tableTap: null }
  }

  if (state.mode === HOST_FLOOR_POINTER_MODE.TABLE_PENDING) {
    return {
      nextState: createIdleHostFloorPointerState(),
      tableTap: isHostFloorTapGesture(state, event) ? { tableId: state.tableId } : null,
    }
  }

  return { nextState: createIdleHostFloorPointerState(), tableTap: null }
}

export function shouldCaptureHostFloorPointer(state) {
  return state?.mode === HOST_FLOOR_POINTER_MODE.PAN_PENDING
    || state?.mode === HOST_FLOOR_POINTER_MODE.PANNING
}

export function resolveHostFloorTableState(tableStates, tableId) {
  if (!tableId || !Array.isArray(tableStates)) return null
  return tableStates.find((entry) => String(entry.table.id) === String(tableId)) ?? null
}
