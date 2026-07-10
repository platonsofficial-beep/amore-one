import { recordPublishBreadcrumb } from './publishFloorPlanDiagnostics'

export const HOST_RETURN_AFTER_PUBLISH_KEY = 'one.host.returnAfterPublish'
export const HOST_RETURN_AFTER_PUBLISH_EXPIRY_MS = 60_000

function readRawIntent() {
  if (typeof sessionStorage === 'undefined') return null

  try {
    const raw = sessionStorage.getItem(HOST_RETURN_AFTER_PUBLISH_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function clearRawIntent() {
  if (typeof sessionStorage === 'undefined') return

  try {
    sessionStorage.removeItem(HOST_RETURN_AFTER_PUBLISH_KEY)
  } catch {
    // Ignore storage failures.
  }
}

export function normalizeWorkspaceId(workspaceId) {
  return `${workspaceId ?? ''}`.trim()
}

export function isValidHostReturnAfterPublishIntent(intent, currentWorkspaceId, now = Date.now()) {
  if (!intent || typeof intent !== 'object') return false

  const workspaceId = normalizeWorkspaceId(intent.workspaceId)
  const activeFloorAreaId = `${intent.activeFloorAreaId ?? ''}`.trim()
  const timestamp = Number(intent.timestamp)

  if (!workspaceId || !activeFloorAreaId) return false
  if (workspaceId !== normalizeWorkspaceId(currentWorkspaceId)) return false
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false
  if (now - timestamp > HOST_RETURN_AFTER_PUBLISH_EXPIRY_MS) return false

  return true
}

export function saveHostReturnAfterPublishIntent({
  workspaceId,
  activeFloorAreaId,
  timestamp = Date.now(),
} = {}) {
  const intent = {
    workspaceId: normalizeWorkspaceId(workspaceId),
    activeFloorAreaId: `${activeFloorAreaId ?? ''}`.trim(),
    timestamp,
  }

  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(HOST_RETURN_AFTER_PUBLISH_KEY, JSON.stringify(intent))
    } catch {
      // Ignore quota errors.
    }
  }

  return intent
}

export function peekHostReturnAfterPublishIntent(currentWorkspaceId, now = Date.now()) {
  const intent = readRawIntent()
  if (!isValidHostReturnAfterPublishIntent(intent, currentWorkspaceId, now)) {
    return null
  }
  return intent
}

export function takeHostReturnAfterPublishIntent(currentWorkspaceId, now = Date.now()) {
  const intent = readRawIntent()
  clearRawIntent()

  if (!isValidHostReturnAfterPublishIntent(intent, currentWorkspaceId, now)) {
    return null
  }

  return intent
}

export function triggerHostReturnAfterPublishReload({ workspaceId, activeFloorAreaId } = {}) {
  saveHostReturnAfterPublishIntent({ workspaceId, activeFloorAreaId })
  recordPublishBreadcrumb('return-to-host-reload', {
    workspaceId: normalizeWorkspaceId(workspaceId),
    activeFloorAreaId: `${activeFloorAreaId ?? ''}`.trim(),
  })

  if (typeof window !== 'undefined') {
    window.location.reload()
  }
}
