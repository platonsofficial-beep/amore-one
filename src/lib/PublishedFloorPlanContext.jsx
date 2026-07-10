import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  PUBLISHED_LAYOUT_EVENT,
  cloneBuilderLayout,
  isFloorPlanStorageKey,
  loadLocalDraftFloorPlanLayout,
  loadLocalFloorPlanLayout,
  saveLocalDraftFloorPlanLayout,
  saveLocalFloorPlanLayout,
} from '../floor-plan-builder/lib/floorPlanStorage'
import {
  loadFloorPlanWorkspace,
  publishFloorPlan,
  saveDraftFloorPlan,
  setActiveBuilderLayoutCache,
  setActivePublishedLayoutCache,
} from '../services/floorPlanService'
import { builderLayoutToHostLayout } from './builderToHostLayout'
import {
  buildPublishTransitionResult,
  isValidPublishedBuilderLayout,
} from './publishFloorPlanTransition'

const PublishedFloorPlanContext = createContext({
  builderLayout: null,
  publishedBuilderLayout: null,
  layout: null,
  hasLayout: false,
  hasUnpublishedDraft: false,
  publishedAt: null,
  isLoading: false,
  loadError: null,
  saveError: null,
  publishNotice: null,
  isRefreshingPublishedLayout: false,
  saveDraftLayout: async () => null,
  publishLayout: async () => null,
  saveLayout: async () => null,
  reload: () => {},
})

export function PublishedFloorPlanProvider({ children, workspaceId = '' }) {
  const [publishedBuilderLayout, setPublishedBuilderLayout] = useState(null)
  const [draftBuilderLayout, setDraftBuilderLayout] = useState(null)
  const [publishedAt, setPublishedAt] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [publishNotice, setPublishNotice] = useState(null)
  const [isRefreshingPublishedLayout, setIsRefreshingPublishedLayout] = useState(false)
  const skipNextPublishedEventRef = useRef(false)
  const stableHostLayoutRef = useRef(null)

  const applyWorkspaceLayouts = useCallback(({ publishedLayout, draftLayout, publishedAt: nextPublishedAt }) => {
    const normalizedPublished = publishedLayout ? cloneBuilderLayout(publishedLayout) : null
    const normalizedDraft = draftLayout ? cloneBuilderLayout(draftLayout) : normalizedPublished

    setPublishedBuilderLayout(normalizedPublished)
    setDraftBuilderLayout(normalizedDraft)
    setPublishedAt(nextPublishedAt ?? normalizedPublished?.publishedAt ?? null)
    setActivePublishedLayoutCache(normalizedPublished)
    setActiveBuilderLayoutCache(normalizedDraft)
  }, [])

  const applyPublishedLayoutResult = useCallback((savedLayout, { notice } = {}) => {
    const transition = buildPublishTransitionResult(savedLayout)
    if (!transition.ok) {
      return transition
    }

    applyWorkspaceLayouts({
      publishedLayout: transition.savedLayout,
      draftLayout: transition.savedLayout,
      publishedAt: transition.savedLayout.publishedAt ?? new Date().toISOString(),
    })
    setLoadError(null)
    setSaveError(null)
    if (notice) {
      setPublishNotice(notice)
    }

    return transition
  }, [applyWorkspaceLayouts])

  const readStoredLayouts = useCallback(async () => {
    const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

    if (!normalizedWorkspaceId) {
      const publishedLayout = loadLocalFloorPlanLayout('')
      const draftLayout = loadLocalDraftFloorPlanLayout('') ?? publishedLayout
      return {
        publishedLayout,
        draftLayout,
        publishedAt: publishedLayout?.publishedAt ?? null,
        error: null,
      }
    }

    const result = await loadFloorPlanWorkspace(normalizedWorkspaceId)
    return {
      publishedLayout: result.publishedLayout,
      draftLayout: result.draftLayout,
      publishedAt: result.publishedAt,
      error: result.error,
    }
  }, [workspaceId])

  const reload = useCallback(async (nextBuilderLayout) => {
    if (isValidPublishedBuilderLayout(nextBuilderLayout)) {
      applyPublishedLayoutResult(nextBuilderLayout)
      return buildPublishTransitionResult(nextBuilderLayout)
    }

    setIsRefreshingPublishedLayout(true)
    try {
      const result = await readStoredLayouts()
      applyWorkspaceLayouts(result)
      setLoadError(result.error)
      return buildPublishTransitionResult(result.publishedLayout)
    } finally {
      setIsRefreshingPublishedLayout(false)
    }
  }, [applyPublishedLayoutResult, applyWorkspaceLayouts, readStoredLayouts])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setIsLoading(true)
      setLoadError(null)

      try {
        const result = await readStoredLayouts()
        if (cancelled) return
        applyWorkspaceLayouts(result)
        setLoadError(result.error)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [applyWorkspaceLayouts, readStoredLayouts])

  const saveDraftLayout = useCallback(async ({ floors, activeFloorId, objects }) => {
    const payload = {
      version: 1,
      floors,
      activeFloorId,
      objects,
      publishedAt: null,
    }

    setSaveError(null)
    const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

    try {
      const saved = normalizedWorkspaceId
        ? await saveDraftFloorPlan(normalizedWorkspaceId, payload)
        : saveLocalDraftFloorPlanLayout(payload, normalizedWorkspaceId)

      if (saved) {
        setDraftBuilderLayout(cloneBuilderLayout(saved))
        setActiveBuilderLayoutCache(saved)
      }

      return saved
    } catch (error) {
      const message = error?.message || 'Unable to save floor plan draft right now.'
      setSaveError(message)

      const localSaved = saveLocalDraftFloorPlanLayout(payload, normalizedWorkspaceId)
      if (localSaved) {
        setDraftBuilderLayout(cloneBuilderLayout(localSaved))
        setActiveBuilderLayoutCache(localSaved)
      }

      return localSaved
    }
  }, [workspaceId])

  const publishLayout = useCallback(async ({ floors, activeFloorId, objects }) => {
    const payload = {
      version: 1,
      floors,
      activeFloorId,
      objects,
    }

    setSaveError(null)
    setPublishNotice(null)
    const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

    const finalizePublish = (saved, { usedFallback = false } = {}) => {
      const transition = applyPublishedLayoutResult(saved, {
        notice: usedFallback
          ? 'Layout saved locally. Cloud publish is unavailable right now.'
          : 'Layout published successfully.',
      })

      if (!transition.ok) {
        throw new Error('Published layout is missing floor areas. Stay in the editor and try again.')
      }

      skipNextPublishedEventRef.current = true
      return transition
    }

    try {
      const saved = normalizedWorkspaceId
        ? await publishFloorPlan(normalizedWorkspaceId, payload)
        : saveLocalFloorPlanLayout(payload, normalizedWorkspaceId)

      return finalizePublish(saved)
    } catch (error) {
      const message = error?.message || 'Unable to publish floor plan right now.'
      setSaveError(message)

      const localSaved = saveLocalFloorPlanLayout({
        ...payload,
        publishedAt: new Date().toISOString(),
      }, normalizedWorkspaceId)

      if (localSaved) {
        return finalizePublish(localSaved, { usedFallback: true })
      }

      throw new Error(message)
    }
  }, [applyPublishedLayoutResult, workspaceId])

  useEffect(() => {
    const handlePublished = (event) => {
      if (skipNextPublishedEventRef.current) {
        skipNextPublishedEventRef.current = false
        return
      }

      reload(event.detail ?? null)
    }

    const handleStorage = (event) => {
      if (!isFloorPlanStorageKey(event.key)) return
      reload(null)
    }

    window.addEventListener(PUBLISHED_LAYOUT_EVENT, handlePublished)
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener(PUBLISHED_LAYOUT_EVENT, handlePublished)
      window.removeEventListener('storage', handleStorage)
    }
  }, [reload])

  const layout = useMemo(() => {
    const nextLayout = builderLayoutToHostLayout(publishedBuilderLayout)
    if (nextLayout?.tables?.length || nextLayout?.zones?.length) {
      stableHostLayoutRef.current = nextLayout
      return nextLayout
    }

    return stableHostLayoutRef.current
  }, [publishedBuilderLayout])

  const hasDisplayableLayout = Boolean(layout?.tables?.length || layout?.zones?.length)

  const hasUnpublishedDraft = useMemo(() => {
    if (!draftBuilderLayout) return false
    if (!publishedBuilderLayout) return true
    return JSON.stringify(draftBuilderLayout) !== JSON.stringify(publishedBuilderLayout)
  }, [draftBuilderLayout, publishedBuilderLayout])

  const value = useMemo(() => ({
    builderLayout: draftBuilderLayout,
    publishedBuilderLayout,
    layout,
    hasLayout: hasDisplayableLayout,
    hasDisplayableLayout,
    hasUnpublishedDraft,
    publishedAt,
    isLoading,
    isRefreshingPublishedLayout,
    loadError,
    saveError,
    publishNotice,
    clearPublishNotice: () => setPublishNotice(null),
    saveDraftLayout,
    publishLayout,
    saveLayout: publishLayout,
    reload,
  }), [
    draftBuilderLayout,
    hasUnpublishedDraft,
    isLoading,
    isRefreshingPublishedLayout,
    layout,
    loadError,
    publishLayout,
    publishNotice,
    publishedAt,
    publishedBuilderLayout,
    reload,
    saveDraftLayout,
    saveError,
    hasDisplayableLayout,
  ])

  return (
    <PublishedFloorPlanContext.Provider value={value}>
      {children}
    </PublishedFloorPlanContext.Provider>
  )
}

export function usePublishedFloorPlan() {
  return useContext(PublishedFloorPlanContext)
}
