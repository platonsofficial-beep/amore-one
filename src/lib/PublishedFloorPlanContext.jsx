import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  PUBLISHED_LAYOUT_EVENT,
  cloneBuilderLayout,
  isFloorPlanStorageKey,
  loadLocalFloorPlanLayout,
  saveLocalFloorPlanLayout,
} from '../floor-plan-builder/lib/floorPlanStorage'
import {
  loadPublishedFloorPlan,
  savePublishedFloorPlan,
  setActiveBuilderLayoutCache,
} from '../services/floorPlanService'
import { builderLayoutToHostLayout } from './builderToHostLayout'

const PublishedFloorPlanContext = createContext({
  builderLayout: null,
  layout: null,
  hasLayout: false,
  isLoading: false,
  loadError: null,
  saveError: null,
  saveLayout: async () => null,
  reload: () => {},
})

export function PublishedFloorPlanProvider({ children, workspaceId = '' }) {
  const [builderLayout, setBuilderLayout] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [saveError, setSaveError] = useState(null)

  const applyBuilderLayout = useCallback((nextLayout) => {
    const normalized = nextLayout ? cloneBuilderLayout(nextLayout) : null
    setBuilderLayout(normalized)
    setActiveBuilderLayoutCache(normalized)
  }, [])

  const readStoredLayout = useCallback(async () => {
    const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

    if (!normalizedWorkspaceId) {
      return {
        layout: loadLocalFloorPlanLayout(''),
        error: null,
      }
    }

    const result = await loadPublishedFloorPlan(normalizedWorkspaceId)
    return {
      layout: result.layout,
      error: result.error,
    }
  }, [workspaceId])

  const reload = useCallback(async (nextBuilderLayout) => {
    if (nextBuilderLayout?.floors?.length) {
      applyBuilderLayout(nextBuilderLayout)
      setLoadError(null)
      return
    }

    setIsLoading(true)
    try {
      const result = await readStoredLayout()
      applyBuilderLayout(result.layout)
      setLoadError(result.error)
    } finally {
      setIsLoading(false)
    }
  }, [applyBuilderLayout, readStoredLayout])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setIsLoading(true)
      setLoadError(null)

      try {
        const result = await readStoredLayout()
        if (cancelled) return
        applyBuilderLayout(result.layout)
        setLoadError(result.error)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [applyBuilderLayout, readStoredLayout])

  const saveLayout = useCallback(async ({ floors, activeFloorId, objects }) => {
    const payload = {
      version: 1,
      floors,
      activeFloorId,
      objects,
      publishedAt: new Date().toISOString(),
    }

    setSaveError(null)
    const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

    try {
      const saved = normalizedWorkspaceId
        ? await savePublishedFloorPlan(normalizedWorkspaceId, payload)
        : saveLocalFloorPlanLayout(payload, normalizedWorkspaceId)

      if (saved) {
        applyBuilderLayout(saved)
        window.dispatchEvent(new CustomEvent(PUBLISHED_LAYOUT_EVENT, { detail: saved }))
      }

      return saved
    } catch (error) {
      const message = error?.message || 'Unable to save floor plan right now.'
      setSaveError(message)

      const localSaved = saveLocalFloorPlanLayout(payload, normalizedWorkspaceId)
      if (localSaved) {
        applyBuilderLayout(localSaved)
        window.dispatchEvent(new CustomEvent(PUBLISHED_LAYOUT_EVENT, { detail: localSaved }))
      }

      return localSaved
    }
  }, [applyBuilderLayout, workspaceId])

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
    () => builderLayoutToHostLayout(builderLayout),
    [builderLayout],
  )

  const value = useMemo(() => ({
    builderLayout,
    layout,
    hasLayout: Boolean(layout?.tables?.length),
    isLoading,
    loadError,
    saveError,
    saveLayout,
    reload,
  }), [builderLayout, isLoading, layout, loadError, reload, saveError, saveLayout])

  return (
    <PublishedFloorPlanContext.Provider value={value}>
      {children}
    </PublishedFloorPlanContext.Provider>
  )
}

export function usePublishedFloorPlan() {
  return useContext(PublishedFloorPlanContext)
}
