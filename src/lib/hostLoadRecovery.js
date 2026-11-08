export function resolveListAfterRefresh({
  previous = [],
  next = [],
  failed = false,
  stale = false,
} = {}) {
  if (stale || failed) {
    return { list: previous, apply: false }
  }

  return { list: next, apply: true }
}

export function resolvePublishedLayoutApply({
  hasPrevious: _hasPrevious = false,
  hasIncoming = false,
  error = null,
  stale = false,
} = {}) {
  if (stale) return 'ignore'
  if (error && !hasIncoming) return 'keep-error'
  if (!hasIncoming) return 'clear'
  return 'apply'
}

export function resolveFloorPlanEmptyPresentation({
  hasDisplayableLayout = false,
  isLoading = false,
  isRefreshing = false,
  loadError = null,
} = {}) {
  if (hasDisplayableLayout) return 'floor'
  if (isLoading || isRefreshing) return 'loading'
  if (loadError) return 'error'
  return 'empty'
}

export function seatingHoursPanelKind({
  activeCount = 0,
  isLoading = false,
  loadFailed = false,
} = {}) {
  if (activeCount > 0) return 'list'
  if (isLoading) return 'loading'
  if (loadFailed) return 'error'
  return 'empty'
}
