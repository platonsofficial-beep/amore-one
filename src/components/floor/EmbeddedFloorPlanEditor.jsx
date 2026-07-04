import { useCallback, useEffect, useRef } from 'react'
import { FloorPlanBuilderProvider } from '../../floor-plan-builder/context/floorPlanBuilderContextState'
import { useFloorPlanBuilder } from '../../floor-plan-builder/hooks/useFloorPlanBuilder'
import { BuilderToolbox } from '../../floor-plan-builder/components/BuilderToolbox'
import { BuilderInspector } from '../../floor-plan-builder/components/BuilderInspector'
import { BuilderCanvas } from '../../floor-plan-builder/components/BuilderCanvas'
import { useBuilderEditorLayout } from '../../floor-plan-builder/hooks/useBuilderEditorLayout'
import { useCanvasViewport } from '../../floor-plan-builder/hooks/useCanvasViewport'
import { getResetCameraForWorkspace } from '../../floor-plan-builder/lib/camera'
import { cloneBuilderLayout } from '../../floor-plan-builder/lib/floorPlanStorage'
import { getAdjacentAreaId } from '../../floor-plan-builder/models/floorPlans'
import { usePublishedFloorPlan } from '../../lib/PublishedFloorPlanContext'
import '../../floor-plan-builder/floorPlanBuilder.css'

function EditorAreaSwitcher({ floors, activeFloorId, onChange }) {
  const activeFloor = floors.find((floor) => floor.id === activeFloorId) ?? floors[0]

  const switchArea = (direction) => {
    onChange(getAdjacentAreaId(floors, activeFloorId, direction))
  }

  return (
    <div className="floor-plan-area-switcher unified-floor-editor-area-switcher" aria-label="Restaurant area">
      <button
        type="button"
        className="floor-plan-area-nav-btn"
        onClick={() => switchArea('prev')}
        aria-label="Previous area"
      >
        ‹
      </button>

      <label className="floor-plan-area-select">
        <span className="sr-only">Restaurant area</span>
        <select
          className="floor-plan-area-select-input"
          value={activeFloorId}
          onChange={(event) => onChange(event.target.value)}
        >
          {floors.map((floor) => (
            <option key={floor.id} value={floor.id}>{floor.label}</option>
          ))}
        </select>
        <span className="floor-plan-area-select-chevron" aria-hidden="true">▾</span>
      </label>

      <button
        type="button"
        className="floor-plan-area-nav-btn"
        onClick={() => switchArea('next')}
        aria-label="Next area"
      >
        ›
      </button>

      <span className="floor-plan-area-current">{activeFloor?.label}</span>
    </div>
  )
}

function EmbeddedFloorPlanEditorShell({
  containerRef,
  onExit,
  onSaveLayout,
  initialAreaId,
  onActiveAreaChange,
}) {
  const editorRef = useRef(null)
  const toolbarRef = useRef(null)
  const sidebarRef = useRef(null)
  const layout = useBuilderEditorLayout(editorRef, toolbarRef, sidebarRef)
  const { state, dispatch, activeWorkspaceBounds } = useFloorPlanBuilder()
  const activeFloorIdRef = useRef(state.activeFloorId)
  const didApplyInitialAreaRef = useRef(false)

  const viewportControls = useCanvasViewport({
    camera: state.camera,
    onCameraChange: (patch) => dispatch({ type: 'SET_CAMERA', payload: patch }),
    containerRef,
    floorBounds: activeWorkspaceBounds,
  })

  useEffect(() => {
    if (didApplyInitialAreaRef.current) return

    if (!initialAreaId || !state.floors.some((floor) => floor.id === initialAreaId)) {
      didApplyInitialAreaRef.current = true
      return
    }

    didApplyInitialAreaRef.current = true
    if (state.activeFloorId !== initialAreaId) {
      dispatch({
        type: 'SET_ACTIVE_FLOOR',
        payload: { floorId: initialAreaId },
      })
    }
  }, [dispatch, initialAreaId, state.activeFloorId, state.floors])

  useEffect(() => {
    onActiveAreaChange?.(state.activeFloorId)
  }, [onActiveAreaChange, state.activeFloorId])

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

  const exitEditMode = useCallback(() => {
    onExit?.()
  }, [onExit])

  const selectionCount = state.selectedTableIds.length

  const handleSave = () => {
    onSaveLayout({
      floors: state.floors,
      activeFloorId: state.activeFloorId,
      objects: state.objects,
    })
    exitEditMode()
  }

  const handleCancel = () => {
    dispatch({ type: 'CANCEL_EDITING' })
    exitEditMode()
  }

  const handleExit = () => {
    if (state.hasUnsavedChanges) {
      dispatch({ type: 'CANCEL_EDITING' })
    }
    exitEditMode()
  }

  const handleAreaChange = (floorId) => {
    dispatch({
      type: 'SET_ACTIVE_FLOOR',
      payload: { floorId },
    })
  }

  return (
    <div className="unified-floor-editor">
      <div
        ref={editorRef}
        className="fpb-editor fpb-editor-simple fpb-editor-embedded"
        data-builder-mode={state.mode}
        style={{ '--fpb-toolbar-height': `${layout.toolbarHeight}px` }}
      >
        <div ref={toolbarRef} className="fpb-editor-toolbar unified-floor-editor-toolbar">
          <div className="unified-floor-editor-toolbar-main">
            <span className="unified-floor-editor-mode">Edit layout</span>
            <EditorAreaSwitcher
              floors={state.floors}
              activeFloorId={state.activeFloorId}
              onChange={handleAreaChange}
            />
          </div>
          <div className="unified-floor-editor-toolbar-actions">
            {selectionCount >= 2 ? (
              <span className="unified-floor-editor-selection-count" role="status">
                {selectionCount} tables selected
              </span>
            ) : null}
            <button type="button" className="fpb-toolbar-btn" onClick={viewportControls.fitFloor}>
              View fit
            </button>
            <button type="button" className="fpb-toolbar-btn" onClick={handleCancel}>
              Cancel
            </button>
            <button type="button" className="fpb-toolbar-btn fpb-toolbar-btn-primary" onClick={handleSave}>
              Save layout
            </button>
            <button type="button" className="fpb-toolbar-btn" onClick={handleExit}>
              Exit edit
            </button>
          </div>
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

export function EmbeddedFloorPlanEditor({ onExit, initialAreaId, onActiveAreaChange }) {
  const containerRef = useRef(null)
  const { builderLayout, saveLayout } = usePublishedFloorPlan()
  const initialLayoutRef = useRef(undefined)

  if (initialLayoutRef.current === undefined) {
    initialLayoutRef.current = cloneBuilderLayout(builderLayout)
  }

  const handleSaveLayout = useCallback((layoutPayload) => {
    saveLayout(layoutPayload)
  }, [saveLayout])

  return (
    <FloorPlanBuilderProvider initialEditing initialLayout={initialLayoutRef.current}>
      <EmbeddedFloorPlanEditorShell
        containerRef={containerRef}
        onExit={onExit}
        onSaveLayout={handleSaveLayout}
        initialAreaId={initialAreaId}
        onActiveAreaChange={onActiveAreaChange}
      />
    </FloorPlanBuilderProvider>
  )
}
