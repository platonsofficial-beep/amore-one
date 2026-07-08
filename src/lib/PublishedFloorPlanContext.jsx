import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
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

  const applyWorkspaceLayouts = useCallback(({ publishedLayout, draftLayout, publishedAt: nextPublishedAt }) => {
    const normalizedPublished = publishedLayout ? cloneBuilderLayout(publishedLayout) : null
    const normalizedDraft = draftLayout ? cloneBuilderLayout(draftLayout) : normalizedPublished

    setPublishedBuilderLayout(normalizedPublished)
    setDraftBuilderLayout(normalizedDraft)
    setPublishedAt(nextPublishedAt ?? normalizedPublished?.publishedAt ?? null)
    setActivePublishedLayoutCache(normalizedPublished)
    setActiveBuilderLayoutCache(normalizedDraft)
  }, [])

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
    if (nextBuilderLayout?.floors?.length) {
      applyWorkspaceLayouts({
        publishedLayout: nextBuilderLayout,
        draftLayout: nextBuilderLayout,
        publishedAt: nextBuilderLayout.publishedAt ?? new Date().toISOString(),
      })
      setLoadError(null)
      return
    }

    setIsLoading(true)
    try {
      const result = await readStoredLayouts()
      applyWorkspaceLayouts(result)
      setLoadError(result.error)
    } finally {
      setIsLoading(false)
    }
  }, [applyWorkspaceLayouts, readStoredLayouts])

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
    const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

    try {
      const saved = normalizedWorkspaceId
        ? await publishFloorPlan(normalizedWorkspaceId, payload)
        : saveLocalFloorPlanLayout(payload, normalizedWorkspaceId)

      if (saved) {
        const cloned = cloneBuilderLayout(saved)
        setPublishedBuilderLayout(cloned)
        setDraftBuilderLayout(cloned)
        setPublishedAt(saved.publishedAt ?? new Date().toISOString())
        setActivePublishedLayoutCache(cloned)
        setActiveBuilderLayoutCache(cloned)
        window.dispatchEvent(new CustomEvent(PUBLISHED_LAYOUT_EVENT, { detail: saved }))
      }

      return saved
    } catch (error) {
      const message = error?.message || 'Unable to publish floor plan right now.'
      setSaveError(message)

      const localSaved = saveLocalFloorPlanLayout({
        ...payload,
        publishedAt: new Date().toISOString(),
      }, normalizedWorkspaceId)

      if (localSaved) {
        const cloned = cloneBuilderLayout(localSaved)
        setPublishedBuilderLayout(cloned)
        setDraftBuilderLayout(cloned)
        setPublishedAt(localSaved.publishedAt ?? null)
        setActivePublishedLayoutCache(cloned)
        setActiveBuilderLayoutCache(cloned)
        window.dispatchEvent(new CustomEvent(PUBLISHED_LAYOUT_EVENT, { detail: localSaved }))
      }

      return localSaved
    }
  }, [workspaceId])

  useEffect(() => {
    const handlePublished = (event) => {
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

  const layout = useMemo(
    () => builderLayoutToHostLayout(publishedBuilderLayout),
    [publishedBuilderLayout],
  )

  const hasUnpublishedDraft = useMemo(() => {
    if (!draftBuilderLayout) return false
    if (!publishedBuilderLayout) return true
    return JSON.stringify(draftBuilderLayout) !== JSON.stringify(publishedBuilderLayout)
  }, [draftBuilderLayout, publishedBuilderLayout])

  const value = useMemo(() => ({
    builderLayout: draftBuilderLayout,
    publishedBuilderLayout,
    layout,
    hasLayout: Boolean(layout?.tables?.length),
    hasUnpublishedDraft,
    publishedAt,
    isLoading,
    loadError,
    saveError,
    saveDraftLayout,
    publishLayout,
    saveLayout: publishLayout,
    reload,
  }), [
    draftBuilderLayout,
    hasUnpublishedDraft,
    isLoading,
    layout,
    loadError,
    publishLayout,
    publishedAt,
    publishedBuilderLayout,
    reload,
    saveDraftLayout,
    saveError,
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
