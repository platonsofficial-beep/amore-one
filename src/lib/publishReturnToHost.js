import { buildPublishTransitionResult, resolveActiveFloorAreaId } from './publishFloorPlanTransition'
import { recordPublishBreadcrumb } from './publishFloorPlanDiagnostics'

export function validatePublishReturnToHostReadiness({
  transition = null,
  hasDisplayableLayout = false,
  layout = null,
  activeFloorAreaId = null,
} = {}) {
  const normalizedTransition = transition?.ok
    ? transition
    : buildPublishTransitionResult(transition?.savedLayout ?? transition)

  if (!normalizedTransition?.ok) {
    return {
      ok: false,
      reason: 'missing-published-layout',
      message: 'Preparing published layout…',
    }
  }

  const hostLayout = normalizedTransition.hostLayout ?? layout
  const zones = hostLayout?.zones ?? []
  if (!zones.length) {
    return {
      ok: false,
      reason: 'missing-zones',
      message: 'Preparing published layout…',
    }
  }

  const resolvedActiveFloorAreaId = resolveActiveFloorAreaId(
    hostLayout,
    activeFloorAreaId ?? normalizedTransition.activeFloorAreaId,
  )

  if (!resolvedActiveFloorAreaId) {
    return {
      ok: false,
      reason: 'missing-active-area',
      message: 'Preparing published layout…',
    }
  }

  const hasRenderableLayout = Boolean(
    hasDisplayableLayout
    || hostLayout?.tables?.length
    || zones.length,
  )

  if (!hasRenderableLayout) {
    return {
      ok: false,
      reason: 'host-layout-not-ready',
      message: 'Preparing published layout…',
    }
  }

  return {
    ok: true,
    activeFloorAreaId: resolvedActiveFloorAreaId,
    transition: normalizedTransition,
    hostLayout,
  }
}

export async function prepareReturnToHost({
  transition,
  hasDisplayableLayout,
  layout,
  activeFloorAreaId,
  reload,
} = {}) {
  recordPublishBreadcrumb('return-to-host-clicked')

  let readiness = validatePublishReturnToHostReadiness({
    transition,
    hasDisplayableLayout,
    layout,
    activeFloorAreaId,
  })

  if (!readiness.ok && typeof reload === 'function') {
    const reloaded = await reload(transition?.savedLayout ?? null)
    readiness = validatePublishReturnToHostReadiness({
      transition: reloaded,
      hasDisplayableLayout: Boolean(reloaded?.hostLayout?.zones?.length || reloaded?.hostLayout?.tables?.length),
      layout: reloaded?.hostLayout ?? layout,
      activeFloorAreaId,
    })
  }

  if (!readiness.ok) {
    return readiness
  }

  recordPublishBreadcrumb('active-area-resolved', {
    activeFloorAreaId: readiness.activeFloorAreaId,
  })

  return readiness
}
