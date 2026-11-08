export function reservationScopesMatch(left, right) {
  if (!left || !right) return false
  return `${left.workspaceId ?? ''}` === `${right.workspaceId ?? ''}`
    && `${left.dateKey ?? ''}` === `${right.dateKey ?? ''}`
}

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

export function resolveScopedReservationRead({
  previous = [],
  previousScope = null,
  next = [],
  failed = false,
  requestScope = null,
  currentScope = null,
  requestId = 0,
  currentRequestId = 0,
} = {}) {
  const requestIsCurrent = requestId === currentRequestId
    && reservationScopesMatch(requestScope, currentScope)
  const previousStillVisible = reservationScopesMatch(previousScope, currentScope)

  if (!requestIsCurrent) {
    return {
      list: previousStillVisible ? previous : [],
      apply: !previousStillVisible,
      certainty: previousStillVisible && previous.length ? 'stale' : 'unknown',
      scope: previousStillVisible ? previousScope : null,
    }
  }

  if (failed) {
    if (!previousStillVisible) {
      return { list: [], apply: true, certainty: 'unknown', scope: null }
    }
    return {
      list: previous,
      apply: false,
      certainty: previous.length ? 'stale' : 'unknown',
      scope: previousScope,
    }
  }

  return {
    list: next,
    apply: true,
    certainty: 'current',
    scope: currentScope,
  }
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

export function resolveWorkspaceLoadGate({ hasWorkspace = false } = {}) {
  return hasWorkspace ? 'load' : 'error'
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
