import { useEffect, useRef, useState } from 'react'
import {
  logPublishBreadcrumbsOnError,
  recordPublishBreadcrumb,
} from './publishFloorPlanDiagnostics'
import { takeHostReturnAfterPublishIntent } from './hostReturnAfterPublishBoot'

export function useHostReturnAfterPublishBoot({
  enabled = false,
  workspaceId = '',
  hasDisplayableLayout = false,
  isLoading = false,
  loadError = null,
  setActiveFloorAreaId,
  setFloorPlanMode,
}) {
  const [phase, setPhase] = useState(() => (enabled ? 'pending' : 'idle'))
  const didApplyIntentRef = useRef(false)

  useEffect(() => {
    if (!enabled || didApplyIntentRef.current) return
    didApplyIntentRef.current = true

    const intent = takeHostReturnAfterPublishIntent(workspaceId)
    if (!intent) {
      setPhase('idle')
      return
    }

    recordPublishBreadcrumb('boot-intent-found', {
      workspaceId: intent.workspaceId,
      activeFloorAreaId: intent.activeFloorAreaId,
    })

    setFloorPlanMode('view')
    setActiveFloorAreaId(intent.activeFloorAreaId)
    setPhase('restoring')
  }, [enabled, workspaceId, setActiveFloorAreaId, setFloorPlanMode])

  useEffect(() => {
    if (phase !== 'restoring') return

    if (hasDisplayableLayout) {
      recordPublishBreadcrumb('boot-layout-hydrated')
      recordPublishBreadcrumb('boot-intent-cleared')
      setPhase('ready')
      return
    }

    if (isLoading) return

    const message = loadError || 'Published layout not available after boot.'
    recordPublishBreadcrumb('boot-layout-error', { message })
    logPublishBreadcrumbsOnError(new Error(message), { phase: 'boot-restore' })
    setPhase('error')
  }, [phase, hasDisplayableLayout, isLoading, loadError])

  return {
    isBootRestoring: phase === 'restoring' && !hasDisplayableLayout && !loadError,
    bootRestoreFailed: phase === 'error',
  }
}
