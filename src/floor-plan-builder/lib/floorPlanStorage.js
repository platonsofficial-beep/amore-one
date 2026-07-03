const LEGACY_STORAGE_KEY = 'amore-floor-plan-layout-v1'
export const DRAFT_STORAGE_KEY = 'amore-floor-plan-draft-v1'
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

function migrateLegacyLayout() {
  if (typeof window === 'undefined') return null

  try {
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!legacyRaw) return null

    const parsed = parseStoredLayout(legacyRaw)
    if (!parsed) return null

    window.localStorage.setItem(DRAFT_STORAGE_KEY, legacyRaw)
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
    return parsed
  } catch {
    return null
  }
}

export function createDefaultBuilderState() {
  return {
    version: 1,
    floors: null,
    activeFloorId: null,
    objects: [],
  }
}

export function loadDraftFloorPlanLayout() {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY)
    if (raw) return parseStoredLayout(raw)

    return migrateLegacyLayout()
  } catch {
    return null
  }
}

export function saveDraftFloorPlanLayout({ floors, activeFloorId, objects }) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      version: 1,
      floors,
      activeFloorId,
      objects,
    }))
  } catch {
    // Ignore quota / privacy errors.
  }
}

export function loadPublishedFloorPlanLayout() {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(PUBLISHED_STORAGE_KEY)
    return parseStoredLayout(raw)
  } catch {
    return null
  }
}

export function publishFloorPlanLayout({ floors, activeFloorId, objects }) {
  if (typeof window === 'undefined') return

  try {
    const payload = {
      version: 1,
      floors,
      activeFloorId,
      objects,
      publishedAt: new Date().toISOString(),
    }

    window.localStorage.setItem(PUBLISHED_STORAGE_KEY, JSON.stringify(payload))
    window.dispatchEvent(new CustomEvent(PUBLISHED_LAYOUT_EVENT))
  } catch {
    // Ignore quota / privacy errors.
  }
}

/** @deprecated Use loadDraftFloorPlanLayout */
export function loadFloorPlanLayout() {
  return loadDraftFloorPlanLayout()
}

/** @deprecated Use saveDraftFloorPlanLayout */
export function saveFloorPlanLayout(payload) {
  saveDraftFloorPlanLayout(payload)
}
