import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { PUBLISHED_LAYOUT_EVENT } from '../floor-plan-builder/lib/floorPlanStorage'
import { loadPublishedHostLayout } from './builderToHostLayout'

const PublishedFloorPlanContext = createContext({
  layout: null,
  hasLayout: false,
  reload: () => {},
})

export function PublishedFloorPlanProvider({ children }) {
  const [layout, setLayout] = useState(() => loadPublishedHostLayout())

  const reload = useCallback(() => {
    setLayout(loadPublishedHostLayout())
  }, [])

  useEffect(() => {
    const handlePublished = () => reload()

    const handleStorage = (event) => {
      if (!event.key || event.key.includes('amore-floor-plan-published')) {
        reload()
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
    layout,
    hasLayout: Boolean(layout?.tables?.length),
    reload,
  }), [layout, reload])

  return (
    <PublishedFloorPlanContext.Provider value={value}>
      {children}
    </PublishedFloorPlanContext.Provider>
  )
}

export function usePublishedFloorPlan() {
  return useContext(PublishedFloorPlanContext)
}
