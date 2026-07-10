export function isHostFloorDebugEnabled() {
  if (typeof window === 'undefined') return false
  if (import.meta.env?.DEV) return true
  return window.__ONE_HOST_FLOOR_DEBUG__ === true
}

export function createEmptyHostFloorDebugTrace() {
  return {
    down: false,
    targetElement: '—',
    tableNodeFound: '—',
    tableId: '—',
    up: false,
    distance: '—',
    isTap: false,
    resolved: false,
    callbackFired: false,
    dayViewState: 'closed',
    lastEvent: '—',
    mode: '—',
  }
}

let trace = createEmptyHostFloorDebugTrace()
const listeners = new Set()

export function getHostFloorDebugTrace() {
  return trace
}

export function patchHostFloorDebugTrace(patch = {}) {
  if (!isHostFloorDebugEnabled()) return
  trace = { ...trace, ...patch }
  listeners.forEach((listener) => listener(trace))
}

export function resetHostFloorDebugTrace() {
  trace = createEmptyHostFloorDebugTrace()
  listeners.forEach((listener) => listener(trace))
}

export function subscribeHostFloorDebugTrace(listener) {
  if (!isHostFloorDebugEnabled()) return () => {}
  listeners.add(listener)
  listener(trace)
  return () => listeners.delete(listener)
}

export function describeHostFloorDebugTarget(target) {
  if (!target) return '—'
  if (typeof target === 'string') return target

  const element = target
  if (!(element instanceof Element)) return `${target}`

  const className = `${element.className ?? ''}`.trim().split(/\s+/).filter(Boolean)[0]
  const id = element.id ? `#${element.id}` : ''
  const datasetId = element.dataset?.floorTableId ?? element.dataset?.tableId
  const data = datasetId ? `[${datasetId}]` : ''
  return `${element.tagName.toLowerCase()}${id}${className ? `.${className}` : ''}${data}`
}
