const STORAGE_KEY = 'one.host.publishBreadcrumbs'
const MAX_ENTRIES = 30

let memoryEntries = []

function readEntries() {
  if (typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {
      // Fall through to memory store.
    }
  }

  return [...memoryEntries]
}

function writeEntries(entries) {
  const trimmed = entries.slice(-MAX_ENTRIES)
  memoryEntries = trimmed

  if (typeof sessionStorage === 'undefined') return

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Ignore quota errors in production diagnostics.
  }
}

export function recordPublishBreadcrumb(stage, detail = {}) {
  const entry = {
    stage,
    at: new Date().toISOString(),
    ...detail,
  }

  const next = [...readEntries(), entry].slice(-MAX_ENTRIES)
  writeEntries(next)
  return entry
}

export function getPublishBreadcrumbs() {
  return readEntries()
}

export function clearPublishBreadcrumbs() {
  memoryEntries = []
  writeEntries([])
}

export function logPublishBreadcrumbsOnError(error, context = {}) {
  const breadcrumbs = getPublishBreadcrumbs()
  console.error('[publishFloorPlanDiagnostics] publish flow error:', error, {
    ...context,
    breadcrumbs,
  })
  recordPublishBreadcrumb('error', {
    message: `${error?.message ?? error ?? ''}`.slice(0, 240),
  })
}
