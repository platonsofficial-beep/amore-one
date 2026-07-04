import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  PUBLISHED_LAYOUT_EVENT,
  cloneBuilderLayout,
  loadFloorPlanLayout,
  saveFloorPlanLayout,
} from '../floor-plan-builder/lib/floorPlanStorage'
import { builderLayoutToHostLayout } from './builderToHostLayout'

const PublishedFloorPlanContext = createContext({
  builderLayout: null,
  layout: null,
  hasLayout: false,
  saveLayout: () => null,
  reload: () => {},
})

export function PublishedFloorPlanProvider({ children }) {
  const [builderLayout, setBuilderLayout] = useState(() => loadFloorPlanLayout())

  const layout = useMemo(
    () => builderLayoutToHostLayout(builderLayout),
    [builderLayout],
  )

  const saveLayout = useCallback(({ floors, activeFloorId, objects }) => {
    const payload = saveFloorPlanLayout({ floors, activeFloorId, objects })
    if (payload) {
      setBuilderLayout(payload)
    }
    return payload
  }, [])

  const reload = useCallback((nextBuilderLayout) => {
    if (nextBuilderLayout?.floors?.length) {
      setBuilderLayout(cloneBuilderLayout(nextBuilderLayout))
      return
    }

    setBuilderLayout(loadFloorPlanLayout())
  }, [])

  useEffect(() => {
    const handlePublished = (event) => {
      reload(event.detail ?? null)
    }

    const handleStorage = (event) => {
      if (!event.key || event.key.includes('amore-floor-plan-published')) {
        reload(null)
      }
    }

    window.addEventListener(PUBLISHED_LAYOUT_EVENT, handlePublished)
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener(PUBLISHED_LAYOUT_EVENT, handlePublished)
      window.removeEventListener('storage', handleStorage)
    }
  }, [reload])

  const value = useMemo(() => ({
    builderLayout,
    layout,
    hasLayout: Boolean(layout?.tables?.length),
    saveLayout,
    reload,
  }), [builderLayout, layout, reload, saveLayout])

  return (
    <PublishedFloorPlanContext.Provider value={value}>
      {children}
    </PublishedFloorPlanContext.Provider>
  )
}

export function usePublishedFloorPlan() {
  return useContext(PublishedFloorPlanContext)
}
