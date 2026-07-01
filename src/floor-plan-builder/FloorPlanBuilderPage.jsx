import { useEffect, useRef, useState } from 'react'
import { FloorPlanBuilderProvider } from './context/floorPlanBuilderContextState'
import { useFloorPlanBuilder } from './hooks/useFloorPlanBuilder'
import { BuilderToolbar } from './components/BuilderToolbar'
import { BuilderToolbox } from './components/BuilderToolbox'
import { BuilderCanvas } from './components/BuilderCanvas'
import { BuilderInspector } from './components/BuilderInspector'
import { BuilderStatusBar } from './components/BuilderStatusBar'
import { useBuilderEditorLayout } from './hooks/useBuilderEditorLayout'
import { useCanvasViewport } from './hooks/useCanvasViewport'
import { getResetCameraForWorkspace } from './lib/camera'
import './floorPlanBuilder.css'

function FloorPlanBuilderShell({ onBack, containerRef }) {
  const editorRef = useRef(null)
  const toolbarRef = useRef(null)
  const sidebarRef = useRef(null)
  const inspectorRef = useRef(null)
  const statusRef = useRef(null)
  const layout = useBuilderEditorLayout(
    editorRef,
    toolbarRef,
    sidebarRef,
    inspectorRef,
    statusRef,
  )
  const { state, dispatch, activeWorkspaceBounds } = useFloorPlanBuilder()
  const [isZooming, setIsZooming] = useState(false)
  const activeFloorIdRef = useRef(state.activeFloorId)

  const viewportControls = useCanvasViewport({
    camera: state.camera,
    onCameraChange: (patch) => dispatch({ type: 'SET_CAMERA', payload: patch }),
    containerRef,
    onZoomActivity: setIsZooming,
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
  }, [activeWorkspaceBounds, containerRef, dispatch, layout.workspaceHeight, layout.workspaceWidth, layout.toolbarHeight, layout.statusHeight, state.activeFloorId])

  const workspaceLayoutKey = layout.workspaceWidth + layout.workspaceHeight

  return (
    <div className="fpb-page">
      <div
        ref={editorRef}
        className="fpb-editor"
        style={{
          '--fpb-toolbar-height': `${layout.toolbarHeight}px`,
          '--fpb-status-height': `${layout.statusHeight}px`,
        }}
      >
        <div ref={toolbarRef} className="fpb-editor-toolbar">
          <BuilderToolbar onBack={onBack} />
        </div>

        <div ref={sidebarRef} className="fpb-editor-sidebar">
          <BuilderToolbox />
        </div>

        <div className="fpb-editor-canvas">
          <BuilderCanvas
            containerRef={containerRef}
            viewportControls={viewportControls}
            isZooming={isZooming}
            workspaceLayoutKey={workspaceLayoutKey}
          />
        </div>

        <div ref={inspectorRef} className="fpb-editor-inspector">
          <BuilderInspector />
        </div>

        <div ref={statusRef} className="fpb-editor-status">
          <BuilderStatusBar />
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
