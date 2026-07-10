import { builderLayoutToHostLayout } from './builderToHostLayout'

export function isValidPublishedBuilderLayout(layout) {
  return Boolean(
    layout
    && Array.isArray(layout.floors)
    && layout.floors.length > 0
    && Array.isArray(layout.objects),
  )
}

export function resolveActiveFloorAreaId(layout, preferredId = null) {
  const zones = layout?.zones ?? []
  if (!zones.length) return null

  const normalizedPreferred = `${preferredId ?? ''}`.trim()
  if (normalizedPreferred && zones.some((zone) => zone.id === normalizedPreferred)) {
    return normalizedPreferred
  }

  return zones[0].id
}

export function resolveActiveFloorAreaIdFromBuilderLayout(builderLayout, preferredId = null) {
  const hostLayout = builderLayoutToHostLayout(builderLayout)
  const fromBuilder = builderLayout?.activeFloorId ?? null
  return resolveActiveFloorAreaId(hostLayout, preferredId ?? fromBuilder)
}

export function buildPublishTransitionResult(savedLayout) {
  if (!isValidPublishedBuilderLayout(savedLayout)) {
    return {
      ok: false,
      savedLayout: null,
      hostLayout: null,
      activeFloorAreaId: null,
    }
  }

  const hostLayout = builderLayoutToHostLayout(savedLayout)

  return {
    ok: Boolean(hostLayout?.tables?.length || hostLayout?.zones?.length),
    savedLayout,
    hostLayout,
    activeFloorAreaId: resolveActiveFloorAreaIdFromBuilderLayout(savedLayout),
  }
}
