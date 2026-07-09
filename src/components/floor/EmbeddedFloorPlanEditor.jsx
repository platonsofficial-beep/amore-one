import { useCallback, useEffect, useRef, useState } from 'react'
import { FloorPlanBuilderProvider } from '../../floor-plan-builder/context/floorPlanBuilderContextState'
import { useFloorPlanBuilder } from '../../floor-plan-builder/hooks/useFloorPlanBuilder'
import { BuilderToolbox } from '../../floor-plan-builder/components/BuilderToolbox'
import { BuilderInspector } from '../../floor-plan-builder/components/BuilderInspector'
import { BuilderCanvas } from '../../floor-plan-builder/components/BuilderCanvas'
import { useBuilderEditorLayout } from '../../floor-plan-builder/hooks/useBuilderEditorLayout'
import { useCanvasViewport } from '../../floor-plan-builder/hooks/useCanvasViewport'
import { EditorZoomControls } from '../../floor-plan-builder/components/EditorZoomControls'
import { getResetCameraForEditorWorkspace } from '../../floor-plan-builder/lib/editorViewport'
import { cloneBuilderLayout } from '../../floor-plan-builder/lib/floorPlanStorage'
import { getAdjacentAreaId } from '../../floor-plan-builder/models/floorPlans'
import { usePublishedFloorPlan } from '../../lib/PublishedFloorPlanContext'
import { DEFAULT_FLOOR_SIZE, WORKSPACE_EXPAND_STEP } from '../../floor-plan-builder/models/floorWorkspace'
import { FLOOR_PLAN_OBJECT_TYPES } from '../../floor-plan-builder/models/floorPlanObject'
import '../../floor-plan-builder/floorPlanBuilder.css'

const TABLET_EDITOR_BREAKPOINT = 1180

function useEditorTabletLayout() {
  const [isTablet, setIsTablet] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= TABLET_EDITOR_BREAKPOINT : false
  ))

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const mediaQuery = window.matchMedia(`(max-width: ${TABLET_EDITOR_BREAKPOINT}px)`)
    const update = () => setIsTablet(mediaQuery.matches)
    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  return isTablet
}

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
  onSaveDraft,
  onPublishLayout,
  hasUnpublishedDraft,
  initialAreaId,
  onActiveAreaChange,
}) {
  const editorRef = useRef(null)
  const toolbarRef = useRef(null)
  const sidebarRef = useRef(null)
  const layout = useBuilderEditorLayout(editorRef, toolbarRef, sidebarRef)
  const { state, dispatch, activeWorkspaceBounds } = useFloorPlanBuilder()
  const didApplyInitialAreaRef = useRef(false)
  const didInitialFitRef = useRef(false)
  const lastFittedFloorRef = useRef('')
  const [toolsPanelOpen, setToolsPanelOpen] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth > TABLET_EDITOR_BREAKPOINT : true
  ))
  const [inspectorPanelOpen, setInspectorPanelOpen] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth > TABLET_EDITOR_BREAKPOINT : true
  ))
  const isTabletLayout = useEditorTabletLayout()

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

    const fitWorkspaceInViewport = () => {
      const rect = container.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return false

      dispatch({
        type: 'SET_CAMERA',
        payload: getResetCameraForEditorWorkspace(
          activeWorkspaceBounds,
          rect.width,
          rect.height,
        ),
      })
      return true
    }

    const floorChanged = lastFittedFloorRef.current !== state.activeFloorId
    const needsInitialFit = !didInitialFitRef.current

    if (needsInitialFit || floorChanged) {
      if (fitWorkspaceInViewport()) {
        didInitialFitRef.current = true
        lastFittedFloorRef.current = state.activeFloorId
      }
    }

    return undefined
  }, [
    activeWorkspaceBounds,
    containerRef,
    dispatch,
    state.activeFloorId,
  ])

  const selectionCount = state.selectedTableIds.length

  useEffect(() => {
    if (selectionCount > 0) {
      setInspectorPanelOpen(true)
    }
  }, [selectionCount])

  const workspaceLayoutKey = layout.sidebarWidth + layout.toolbarHeight

  const exitEditMode = useCallback(() => {
    onExit?.()
  }, [onExit])

  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isPublishingLayout, setIsPublishingLayout] = useState(false)

  const buildLayoutPayload = () => ({
    floors: state.floors,
    activeFloorId: state.activeFloorId,
    objects: state.objects,
  })

  const handleSaveDraft = async () => {
    setIsSavingDraft(true)
    try {
      await onSaveDraft(buildLayoutPayload())
      dispatch({ type: 'MARK_DRAFT_SAVED' })
    } finally {
      setIsSavingDraft(false)
    }
  }

  const handlePublish = async () => {
    setIsPublishingLayout(true)
    try {
      await onPublishLayout(buildLayoutPayload())
      dispatch({ type: 'MARK_DRAFT_SAVED' })
      exitEditMode()
    } finally {
      setIsPublishingLayout(false)
    }
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

  const handleExpandCanvasWidth = () => {
    dispatch({
      type: 'UPDATE_FLOOR_WORKSPACE',
      payload: {
        floorId: state.activeFloorId,
        widthDelta: WORKSPACE_EXPAND_STEP,
      },
    })
  }

  const handleExpandCanvasHeight = () => {
    dispatch({
      type: 'UPDATE_FLOOR_WORKSPACE',
      payload: {
        floorId: state.activeFloorId,
        heightDelta: WORKSPACE_EXPAND_STEP,
      },
    })
  }

  const handleResetCanvasSize = () => {
    dispatch({
      type: 'UPDATE_FLOOR_WORKSPACE',
      payload: {
        floorId: state.activeFloorId,
        reset: true,
      },
    })
    requestAnimationFrame(() => {
      viewportControls.fitFloor()
    })
  }

  const activeWorkspace = state.floors.find((floor) => floor.id === state.activeFloorId)?.workspace
  const canvasWidth = activeWorkspace?.width ?? DEFAULT_FLOOR_SIZE.width
  const canvasHeight = activeWorkspace?.height ?? DEFAULT_FLOOR_SIZE.height
  const activeFloorTableCount = state.objects.filter((object) => (
    object.floorId === state.activeFloorId && object.type === FLOOR_PLAN_OBJECT_TYPES.TABLE
  )).length
  const isBusy = isSavingDraft || isPublishingLayout

  const handleClearLayout = () => {
    if (activeFloorTableCount === 0) return

    const confirmed = window.confirm(
      'Are you sure you want to delete this layout? This will remove all tables from this area.',
    )
    if (!confirmed) return

    dispatch({ type: 'CLEAR_ACTIVE_FLOOR_LAYOUT' })
  }

  return (
    <div className="unified-floor-editor">
      <div
        ref={editorRef}
        className={`fpb-editor fpb-editor-simple fpb-editor-embedded${toolsPanelOpen ? ' is-tools-open' : ''}${inspectorPanelOpen ? ' is-inspector-open' : ''}${isTabletLayout ? ' is-tablet-layout' : ''}`}
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
            {hasUnpublishedDraft ? (
              <span className="unified-floor-editor-draft-badge" role="status">Unpublished draft</span>
            ) : null}
          </div>
          <div className="unified-floor-editor-toolbar-actions">
            <button
              type="button"
              className={`fpb-toolbar-btn unified-floor-editor-panel-toggle${toolsPanelOpen ? ' is-active' : ''}`}
              onClick={() => setToolsPanelOpen((current) => !current)}
              aria-pressed={toolsPanelOpen}
            >
              Tools
            </button>
            <button
              type="button"
              className={`fpb-toolbar-btn unified-floor-editor-panel-toggle${inspectorPanelOpen ? ' is-active' : ''}`}
              onClick={() => setInspectorPanelOpen((current) => !current)}
              aria-pressed={inspectorPanelOpen}
            >
              Properties
            </button>
            <div className="unified-floor-editor-canvas-size" aria-label="Canvas size">
              <span className="unified-floor-editor-canvas-size-label">Canvas</span>
              <span className="unified-floor-editor-canvas-size-value">
                {canvasWidth}×{canvasHeight}
              </span>
              <button
                type="button"
                className="fpb-toolbar-btn unified-floor-editor-canvas-size-btn"
                onClick={handleExpandCanvasWidth}
                title={`Add ${WORKSPACE_EXPAND_STEP}px to the right`}
              >
                + Width
              </button>
              <button
                type="button"
                className="fpb-toolbar-btn unified-floor-editor-canvas-size-btn"
                onClick={handleExpandCanvasHeight}
                title={`Add ${WORKSPACE_EXPAND_STEP}px to the bottom`}
              >
                + Height
              </button>
              <button
                type="button"
                className="fpb-toolbar-btn unified-floor-editor-canvas-size-btn"
                onClick={handleResetCanvasSize}
                title={`Reset to ${DEFAULT_FLOOR_SIZE.width}×${DEFAULT_FLOOR_SIZE.height}`}
              >
                Reset size
              </button>
            </div>
            {selectionCount >= 2 ? (
              <span className="unified-floor-editor-selection-count" role="status">
                {selectionCount} tables selected
              </span>
            ) : null}
            <EditorZoomControls
              zoom={state.camera.zoom}
              onZoomIn={viewportControls.zoomIn}
              onZoomOut={viewportControls.zoomOut}
              onViewFit={viewportControls.fitFloor}
            />
            <button
              type="button"
              className="fpb-toolbar-btn fpb-toolbar-btn-danger unified-floor-editor-clear-layout-btn"
              onClick={handleClearLayout}
              disabled={activeFloorTableCount === 0 || isBusy}
            >
              Clear layout
            </button>
            <button type="button" className="fpb-toolbar-btn" onClick={handleCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="fpb-toolbar-btn"
              onClick={handleSaveDraft}
              disabled={isBusy}
            >
              {isSavingDraft ? 'Saving…' : 'Save draft'}
            </button>
            <button
              type="button"
              className="fpb-toolbar-btn fpb-toolbar-btn-primary"
              onClick={handlePublish}
              disabled={isBusy}
            >
              {isPublishingLayout ? 'Publishing…' : 'Publish layout'}
            </button>
            <button type="button" className="fpb-toolbar-btn" onClick={handleExit}>
              Exit edit
            </button>
          </div>
        </div>

        <div ref={sidebarRef} className="fpb-editor-sidebar">
          <BuilderToolbox
            onClose={() => setToolsPanelOpen(false)}
            showCloseButton={isTabletLayout}
          />
        </div>

        <div className="fpb-editor-canvas">
          <BuilderCanvas
            containerRef={containerRef}
            viewportControls={viewportControls}
            workspaceLayoutKey={workspaceLayoutKey}
          />
        </div>

        <div className="fpb-editor-inspector">
          <BuilderInspector
            onClose={() => setInspectorPanelOpen(false)}
            showCloseButton={isTabletLayout}
          />
        </div>
      </div>
    </div>
  )
}

export function EmbeddedFloorPlanEditor({ onExit, initialAreaId, onActiveAreaChange }) {
  const containerRef = useRef(null)
  const {
    builderLayout,
    saveDraftLayout,
    publishLayout,
    saveError,
    hasUnpublishedDraft,
  } = usePublishedFloorPlan()
  const initialLayoutRef = useRef(undefined)

  if (initialLayoutRef.current === undefined) {
    initialLayoutRef.current = cloneBuilderLayout(builderLayout)
  }

  const handleSaveDraft = useCallback((layoutPayload) => (
    saveDraftLayout(layoutPayload)
  ), [saveDraftLayout])

  const handlePublishLayout = useCallback((layoutPayload) => (
    publishLayout(layoutPayload)
  ), [publishLayout])

  return (
    <FloorPlanBuilderProvider initialEditing initialLayout={initialLayoutRef.current}>
      {saveError ? (
        <div className="floor-plan-persistence-notice" role="status">{saveError}</div>
      ) : null}
      <EmbeddedFloorPlanEditorShell
        containerRef={containerRef}
        onExit={onExit}
        onSaveDraft={handleSaveDraft}
        onPublishLayout={handlePublishLayout}
        hasUnpublishedDraft={hasUnpublishedDraft}
        initialAreaId={initialAreaId}
        onActiveAreaChange={onActiveAreaChange}
      />
    </FloorPlanBuilderProvider>
  )
}
