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

export function readFloorTableIdFromNode(node) {
  if (!node) return ''
  return `${node.dataset?.floorTableId ?? node.dataset?.tableId ?? ''}`.trim()
}

export function readFloorTableLabelFromNode(node) {
  if (!node) return ''
  const label = `${node.dataset?.floorTableLabel ?? ''}`.trim()
  if (label) return label
  const number = node.querySelector?.('.floor-table-number')
  return `${number?.textContent ?? ''}`.trim()
}

export function resolveHostFloorTableTarget(target) {
  const node = target?.closest?.('.floor-table-node')
  if (!node) return null

  const tableId = readFloorTableIdFromNode(node)
  if (!tableId) return null

  return { node, tableId, tableLabel: readFloorTableLabelFromNode(node) }
}

export function findHostFloorTableInComposedPath(event) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  for (const entry of path) {
    if (!(entry instanceof Element)) continue

    if (entry.classList?.contains('floor-table-node')) {
      const tableId = readFloorTableIdFromNode(entry)
      if (tableId) {
        return { node: entry, tableId, tableLabel: readFloorTableLabelFromNode(entry) }
      }
    }

    const nested = entry.closest?.('.floor-table-node')
    if (nested) {
      const tableId = readFloorTableIdFromNode(nested)
      if (tableId) {
        return { node: nested, tableId, tableLabel: readFloorTableLabelFromNode(nested) }
      }
    }
  }

  return null
}

export function findHostFloorTableAtPoint(clientX, clientY, root = typeof document !== 'undefined' ? document : null) {
  if (!root?.elementsFromPoint) return null
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null

  const stack = root.elementsFromPoint(clientX, clientY)
  for (const entry of stack) {
    if (!(entry instanceof Element)) continue
    if (!entry.classList?.contains('floor-table-node')) continue

    const tableId = readFloorTableIdFromNode(entry)
    if (tableId) {
      return { node: entry, tableId, tableLabel: readFloorTableLabelFromNode(entry) }
    }
  }

  for (const entry of stack) {
    if (!(entry instanceof Element)) continue
    const nested = entry.closest?.('.floor-table-node')
    if (!nested) continue

    const tableId = readFloorTableIdFromNode(nested)
    if (tableId) {
      return { node: nested, tableId, tableLabel: readFloorTableLabelFromNode(nested) }
    }
  }

  return null
}

export function findHostFloorTableFromEvent(event) {
  return findHostFloorTableInComposedPath(event)
    ?? findHostFloorTableAtPoint(event.clientX, event.clientY)
    ?? resolveHostFloorTableTarget(event.target)
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

export function isInteractiveHostFloorTarget(target) {
  if (!target?.closest) return false
  return Boolean(
    target.closest('.floor-seating-selector, .floor-seating-selector-chip')
    || target.closest('.floor-plan-toolbar')
    || target.closest('button, select, input, textarea, a, label'),
  )
}

export function beginHostFloorPointerInteraction(
  event,
  { originX = 0, originY = 0, interactionLocked = false } = {},
) {
  const tableTarget = findHostFloorTableFromEvent(event)
  if (tableTarget) {
    return {
      mode: HOST_FLOOR_POINTER_MODE.TABLE_PENDING,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      tableId: tableTarget.tableId,
      tableLabel: tableTarget.tableLabel,
    }
  }

  if (isInteractiveHostFloorTarget(event.target)) {
    return createIdleHostFloorPointerState()
  }

  if (interactionLocked) {
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
    return { nextState: createIdleHostFloorPointerState(), tableTap: null, distance: 0, isTap: false }
  }

  if (state.pointerId !== event.pointerId) {
    return { nextState: createIdleHostFloorPointerState(), tableTap: null, distance: 0, isTap: false }
  }

  const distance = getHostFloorPointerDistance(state, event)
  const isTap = isHostFloorTapGesture(state, event)

  if (state.mode === HOST_FLOOR_POINTER_MODE.TABLE_PENDING) {
    return {
      nextState: createIdleHostFloorPointerState(),
      tableTap: isTap ? { tableId: state.tableId } : null,
      distance,
      isTap,
    }
  }

  return { nextState: createIdleHostFloorPointerState(), tableTap: null, distance, isTap: false }
}

export function shouldCaptureHostFloorPointer(state) {
  return state?.mode === HOST_FLOOR_POINTER_MODE.PAN_PENDING
    || state?.mode === HOST_FLOOR_POINTER_MODE.PANNING
}

export function resolveHostFloorTableState(tableStates, tableId) {
  if (!tableId || !Array.isArray(tableStates)) return null
  return tableStates.find((entry) => String(entry.table.id) === String(tableId)) ?? null
}

export function toHostFloorPointerLikeEvent(nativeEvent, touch) {
  return {
    pointerId: touch?.identifier ?? nativeEvent.pointerId ?? 0,
    clientX: touch?.clientX ?? nativeEvent.clientX ?? 0,
    clientY: touch?.clientY ?? nativeEvent.clientY ?? 0,
    target: nativeEvent.target,
    composedPath: () => (
      typeof nativeEvent.composedPath === 'function' ? nativeEvent.composedPath() : []
    ),
    stopPropagation: () => nativeEvent.stopPropagation?.(),
    preventDefault: () => nativeEvent.preventDefault?.(),
  }
}
