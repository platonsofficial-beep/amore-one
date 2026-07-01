import { useEffect, useRef } from 'react'
import { FloorPlanBuilderProvider } from './context/floorPlanBuilderContextState'
import { useFloorPlanBuilder } from './hooks/useFloorPlanBuilder'
import { BuilderToolbar } from './components/BuilderToolbar'
import { BuilderToolbox } from './components/BuilderToolbox'
import { BuilderCanvas } from './components/BuilderCanvas'
import { BuilderInspector } from './components/BuilderInspector'
import { BuilderStatusBar } from './components/BuilderStatusBar'
import { useCanvasViewport } from './hooks/useCanvasViewport'
import { BUILDER_ARTBOARD } from './models/floorPlanObject'
import './floorPlanBuilder.css'

function FloorPlanBuilderShell({ onBack, containerRef }) {
  const { state, dispatch } = useFloorPlanBuilder()

  const viewportControls = useCanvasViewport({
    viewport: state.viewport,
    onViewportChange: (patch) => dispatch({ type: 'SET_VIEWPORT', payload: patch }),
    containerRef,
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const centerArtboard = () => {
      const rect = container.getBoundingClientRect()
      dispatch({
        type: 'SET_VIEWPORT',
        payload: {
          panX: Math.max(24, (rect.width - BUILDER_ARTBOARD.width) / 2),
          panY: Math.max(24, (rect.height - BUILDER_ARTBOARD.height) / 2),
        },
      })
    }

    centerArtboard()
  }, [containerRef, dispatch])

  return (
    <div className="fpb-page">
      <BuilderToolbar
        onBack={onBack}
        onZoomIn={viewportControls.zoomIn}
        onZoomOut={viewportControls.zoomOut}
      />

      <div className="fpb-workspace">
        <BuilderToolbox />
        <BuilderCanvas
          containerRef={containerRef}
          viewportControls={viewportControls}
        />
        <BuilderInspector />
      </div>

      <BuilderStatusBar />
    </div>
  )
}

export function FloorPlanBuilderPage({ onBack }) {
  const containerRef = useRef(null)

  return (
    <FloorPlanBuilderProvider>
      <FloorPlanBuilderShell onBack={onBack} containerRef={containerRef} />
    </FloorPlanBuilderProvider>
  )
}
