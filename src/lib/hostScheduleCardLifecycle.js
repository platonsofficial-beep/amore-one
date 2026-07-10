export function createHostScheduleCardLifecycleState() {
  return {
    openedAt: null,
    openedTableId: null,
    openedTableLabel: null,
    lastDismissSource: 'none',
    lastDismissAt: null,
  }
}

export function recordScheduleCardOpen(state, { tableId, tableLabel } = {}) {
  if (tableId == null) return state

  return {
    ...state,
    openedAt: Date.now(),
    openedTableId: String(tableId),
    openedTableLabel: tableLabel || String(tableId),
    lastDismissSource: 'none',
  }
}

export function recordScheduleCardDismiss(state, source = 'unknown') {
  return {
    ...state,
    openedAt: null,
    openedTableId: null,
    openedTableLabel: null,
    lastDismissSource: source,
    lastDismissAt: Date.now(),
  }
}

export function getScheduleCardOpenDurationMs(state, now = Date.now()) {
  if (!state?.openedAt) return null
  return Math.max(0, now - state.openedAt)
}

export function shouldIgnoreCanvasDismissForScheduleCard({
  suppressTableClick = false,
  hasScheduleCardTable = false,
} = {}) {
  if (suppressTableClick) return true
  return hasScheduleCardTable
}

export function resolveScheduleCardTableById(tableId, {
  layoutTables = [],
  visibleTableStates = [],
} = {}) {
  if (tableId == null) return null

  const normalizedId = String(tableId)
  const fromLayout = layoutTables.find((table) => String(table.id) === normalizedId)
  if (fromLayout) return fromLayout

  const fromVisible = visibleTableStates.find((entry) => String(entry.table.id) === normalizedId)?.table
  return fromVisible ?? null
}

export function shouldCloseScheduleCardForFloorContextChange({
  previous = null,
  next = null,
} = {}) {
  if (!previous || !next) return false

  const areaChanged = previous.areaId != null && previous.areaId !== next.areaId
  const layoutChanged = previous.layoutId != null && (
    previous.layoutId !== next.layoutId
    || previous.publishedAt !== next.publishedAt
  )

  return areaChanged || layoutChanged
}

export function buildHostFloorContextSnapshot({
  areaId = null,
  layoutId = null,
  publishedAt = null,
} = {}) {
  return { areaId, layoutId, publishedAt }
}
