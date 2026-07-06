const LEGACY_STORAGE_KEY = 'amore-floor-plan-layout-v1'
/** @deprecated Migrated into PUBLISHED_STORAGE_KEY on read */
const DRAFT_STORAGE_KEY = 'amore-floor-plan-draft-v1'
export const PUBLISHED_STORAGE_KEY = 'amore-floor-plan-published-v1'
export const PUBLISHED_LAYOUT_EVENT = 'amore-floor-plan-published'

const FLOOR_PLAN_STORAGE_KEYS = [
  PUBLISHED_STORAGE_KEY,
  DRAFT_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
]

export function getFloorPlanStorageKey(workspaceId = '') {
  const normalizedId = `${workspaceId ?? ''}`.trim()
  return normalizedId
    ? `${PUBLISHED_STORAGE_KEY}--${normalizedId}`
    : PUBLISHED_STORAGE_KEY
}

export function isFloorPlanStorageKey(key = '') {
  const normalizedKey = `${key ?? ''}`.trim()
  if (!normalizedKey) return false

  return FLOOR_PLAN_STORAGE_KEYS.includes(normalizedKey)
    || normalizedKey.startsWith(`${PUBLISHED_STORAGE_KEY}--`)
}

function parseStoredLayout(raw) {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    return normalizeBuilderLayoutPayload(parsed)
  } catch {
    return null
  }
}

export function normalizeBuilderLayoutPayload(value) {
  if (!value || typeof value !== 'object') return null
  if (!Array.isArray(value.floors) || !Array.isArray(value.objects)) return null

  return {
    version: value.version ?? 1,
    floors: value.floors,
    activeFloorId: value.activeFloorId ?? value.floors[0]?.id ?? null,
    objects: value.objects,
    publishedAt: value.publishedAt ?? null,
  }
}

function readStorageKey(key) {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(key)
    return raw ? parseStoredLayout(raw) : null
  } catch {
    return null
  }
}

function writeStorageLayout(payload, workspaceId = '') {
  if (typeof window === 'undefined') return null

  try {
    window.localStorage.setItem(getFloorPlanStorageKey(workspaceId), JSON.stringify(payload))
    window.localStorage.removeItem(DRAFT_STORAGE_KEY)
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
    window.dispatchEvent(new CustomEvent(PUBLISHED_LAYOUT_EVENT, { detail: payload }))
    return payload
  } catch {
    return null
  }
}

function migrateLegacyLayout(workspaceId = '') {
  const legacy = readStorageKey(LEGACY_STORAGE_KEY)
  if (!legacy) return null

  const payload = {
    ...legacy,
    publishedAt: legacy.publishedAt ?? new Date().toISOString(),
  }
  writeStorageLayout(payload, workspaceId)
  return payload
}

function migrateDraftLayout(workspaceId = '') {
  const draft = readStorageKey(DRAFT_STORAGE_KEY)
  if (!draft) return null

  const payload = {
    ...draft,
    publishedAt: draft.publishedAt ?? new Date().toISOString(),
  }
  writeStorageLayout(payload, workspaceId)
  return payload
}

export function cloneBuilderLayout(layout) {
  if (!layout) return null
  return JSON.parse(JSON.stringify(layout))
}

export function createDefaultBuilderState() {
  return {
    version: 1,
    floors: null,
    activeFloorId: null,
    objects: [],
  }
}

/** Dev/local fallback read path for saved floor layout. */
export function loadLocalFloorPlanLayout(workspaceId = '') {
  if (typeof window === 'undefined') return null

  const scopedKey = getFloorPlanStorageKey(workspaceId)

  return readStorageKey(scopedKey)
    ?? (scopedKey !== PUBLISHED_STORAGE_KEY ? readStorageKey(PUBLISHED_STORAGE_KEY) : null)
    ?? migrateDraftLayout(workspaceId)
    ?? migrateLegacyLayout(workspaceId)
}

/** @deprecated Use loadLocalFloorPlanLayout or floorPlanService.loadPublishedFloorPlan */
export function loadFloorPlanLayout(workspaceId = '') {
  return loadLocalFloorPlanLayout(workspaceId)
}

export function saveLocalFloorPlanLayout({ floors, activeFloorId, objects }, workspaceId = '') {
  const payload = {
    version: 1,
    floors: JSON.parse(JSON.stringify(floors)),
    activeFloorId,
    objects: JSON.parse(JSON.stringify(objects)),
    publishedAt: new Date().toISOString(),
  }

  return writeStorageLayout(payload, workspaceId)
}

/** @deprecated Use saveLocalFloorPlanLayout or floorPlanService.savePublishedFloorPlan */
export function saveFloorPlanLayout(layoutPayload, workspaceId = '') {
  return saveLocalFloorPlanLayout(layoutPayload, workspaceId)
}

export function inspectFloorPlanStorage(workspaceId = '') {
  if (typeof window === 'undefined') {
    return {
      hasPublishedLayout: false,
      storageKeys: [],
      tableCount: 0,
    }
  }

  const scopedKey = getFloorPlanStorageKey(workspaceId)
  const candidateKeys = [
    scopedKey,
    ...(scopedKey !== PUBLISHED_STORAGE_KEY ? [PUBLISHED_STORAGE_KEY] : []),
    DRAFT_STORAGE_KEY,
    LEGACY_STORAGE_KEY,
  ]

  const storageKeys = candidateKeys.filter((key) => Boolean(window.localStorage.getItem(key)))
  const resolvedLayout = loadLocalFloorPlanLayout(workspaceId)
  const tableCount = (resolvedLayout?.objects ?? []).filter((object) => object?.type === 'table').length

  return {
    hasPublishedLayout: Boolean(resolvedLayout?.floors?.length && tableCount > 0),
    storageKeys,
    tableCount,
    publishedAt: resolvedLayout?.publishedAt ?? null,
    activeFloorId: resolvedLayout?.activeFloorId ?? null,
    floorCount: resolvedLayout?.floors?.length ?? 0,
  }
}

/** @deprecated Use loadFloorPlanLayout */
export function loadPublishedFloorPlanLayout() {
  return loadFloorPlanLayout()
}

/** @deprecated Use loadFloorPlanLayout */
export function loadDraftFloorPlanLayout() {
  return loadFloorPlanLayout()
}

/** @deprecated Use loadFloorPlanLayout */
export function loadActiveFloorPlanLayout() {
  return loadFloorPlanLayout()
}

/** @deprecated Use saveFloorPlanLayout */
export function publishFloorPlanLayout(payload) {
  return saveFloorPlanLayout(payload)
}

/** @deprecated Use saveFloorPlanLayout */
export function saveDraftFloorPlanLayout(payload) {
  return saveFloorPlanLayout(payload)
}
