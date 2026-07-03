import { useEffect, useRef } from 'react'
import { FloorPlanBuilderProvider } from './context/floorPlanBuilderContextState'
import { useFloorPlanBuilder } from './hooks/useFloorPlanBuilder'
import { BuilderToolbar } from './components/BuilderToolbar'
import { BuilderToolbox } from './components/BuilderToolbox'
import { BuilderInspector } from './components/BuilderInspector'
import { BuilderCanvas } from './components/BuilderCanvas'
import { useBuilderEditorLayout } from './hooks/useBuilderEditorLayout'
import { useCanvasViewport } from './hooks/useCanvasViewport'
import { getResetCameraForWorkspace } from './lib/camera'
import './floorPlanBuilder.css'

function FloorPlanBuilderShell({ onBack, containerRef }) {
  const editorRef = useRef(null)
  const toolbarRef = useRef(null)
  const sidebarRef = useRef(null)
  const layout = useBuilderEditorLayout(editorRef, toolbarRef, sidebarRef)
  const { state, dispatch, activeWorkspaceBounds } = useFloorPlanBuilder()
  const activeFloorIdRef = useRef(state.activeFloorId)

  const viewportControls = useCanvasViewport({
    camera: state.camera,
    onCameraChange: (patch) => dispatch({ type: 'SET_CAMERA', payload: patch }),
    containerRef,
    floorBounds: activeWorkspaceBounds,
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const fitFloorInViewport = () => {
      const rect = container.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return false

      dispatch({
        type: 'SET_CAMERA',
        payload: getResetCameraForWorkspace(
          activeWorkspaceBounds,
          rect.width,
          rect.height,
        ),
      })
      return true
    }

    const floorChanged = activeFloorIdRef.current !== state.activeFloorId
    activeFloorIdRef.current = state.activeFloorId

    if (floorChanged || !fitFloorInViewport()) {
      const observer = new ResizeObserver(() => {
        fitFloorInViewport()
      })
      observer.observe(container)
      return () => observer.disconnect()
    }

    return undefined
  }, [activeWorkspaceBounds, containerRef, dispatch, layout.toolbarHeight, layout.sidebarWidth, state.activeFloorId])

  const workspaceLayoutKey = layout.sidebarWidth + layout.toolbarHeight

  return (
    <div className="fpb-page">
      <div
        ref={editorRef}
        className="fpb-editor fpb-editor-simple"
        data-builder-mode={state.mode}
        style={{ '--fpb-toolbar-height': `${layout.toolbarHeight}px` }}
      >
        <div ref={toolbarRef} className="fpb-editor-toolbar">
          <BuilderToolbar
            onBack={onBack}
            onViewFit={viewportControls.fitFloor}
          />
        </div>

        <div ref={sidebarRef} className="fpb-editor-sidebar">
          <BuilderToolbox />
        </div>

        <div className="fpb-editor-canvas">
          <BuilderCanvas
            containerRef={containerRef}
            viewportControls={viewportControls}
            workspaceLayoutKey={workspaceLayoutKey}
          />
        </div>

        <div className="fpb-editor-inspector">
          <BuilderInspector />
        </div>
      </div>
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
