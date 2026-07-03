const STORAGE_KEY = 'amore-floor-plan-layout-v1'

export function createDefaultBuilderState() {
  return {
    version: 1,
    floors: null,
    activeFloorId: null,
    objects: [],
  }
}

export function loadFloorPlanLayout() {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (!Array.isArray(parsed.floors) || !Array.isArray(parsed.objects)) return null

    return {
      version: parsed.version ?? 1,
      floors: parsed.floors,
      activeFloorId: parsed.activeFloorId ?? parsed.floors[0]?.id ?? null,
      objects: parsed.objects,
    }
  } catch {
    return null
  }
}

export function saveFloorPlanLayout({ floors, activeFloorId, objects }) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      floors,
      activeFloorId,
      objects,
    }))
  } catch {
    // Ignore quota / privacy errors.
  }
}
