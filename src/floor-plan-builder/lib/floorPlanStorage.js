const LEGACY_STORAGE_KEY = 'amore-floor-plan-layout-v1'
/** @deprecated Migrated into PUBLISHED_STORAGE_KEY on read */
const DRAFT_STORAGE_KEY = 'amore-floor-plan-draft-v1'
export const PUBLISHED_STORAGE_KEY = 'amore-floor-plan-published-v1'
export const PUBLISHED_LAYOUT_EVENT = 'amore-floor-plan-published'

function parseStoredLayout(raw) {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (!Array.isArray(parsed.floors) || !Array.isArray(parsed.objects)) return null

    return {
      version: parsed.version ?? 1,
      floors: parsed.floors,
      activeFloorId: parsed.activeFloorId ?? parsed.floors[0]?.id ?? null,
      objects: parsed.objects,
      publishedAt: parsed.publishedAt ?? null,
    }
  } catch {
    return null
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

function writeStorageLayout(payload) {
  if (typeof window === 'undefined') return null

  try {
    window.localStorage.setItem(PUBLISHED_STORAGE_KEY, JSON.stringify(payload))
    window.localStorage.removeItem(DRAFT_STORAGE_KEY)
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
    window.dispatchEvent(new CustomEvent(PUBLISHED_LAYOUT_EVENT, { detail: payload }))
    return payload
  } catch {
    return null
  }
}

function migrateLegacyLayout() {
  const legacy = readStorageKey(LEGACY_STORAGE_KEY)
  if (!legacy) return null

  const payload = {
    ...legacy,
    publishedAt: legacy.publishedAt ?? new Date().toISOString(),
  }
  writeStorageLayout(payload)
  return payload
}

function migrateDraftLayout() {
  const draft = readStorageKey(DRAFT_STORAGE_KEY)
  if (!draft) return null

  const payload = {
    ...draft,
    publishedAt: draft.publishedAt ?? new Date().toISOString(),
  }
  writeStorageLayout(payload)
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

/** Single source of truth read path for saved floor layout. */
export function loadFloorPlanLayout() {
  if (typeof window === 'undefined') return null

  return readStorageKey(PUBLISHED_STORAGE_KEY)
    ?? migrateDraftLayout()
    ?? migrateLegacyLayout()
}

export function saveFloorPlanLayout({ floors, activeFloorId, objects }) {
  // TODO: Persist floor.workspace width/height to the database when backend layout storage exists.
  // Canvas size is already saved in localStorage via each floor's workspace object.
  const payload = {
    version: 1,
    floors: JSON.parse(JSON.stringify(floors)),
    activeFloorId,
    objects: JSON.parse(JSON.stringify(objects)),
    publishedAt: new Date().toISOString(),
  }

  return writeStorageLayout(payload)
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
