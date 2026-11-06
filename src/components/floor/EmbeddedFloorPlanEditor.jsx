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
import { recordPublishBreadcrumb } from '../../lib/publishFloorPlanDiagnostics'
import { validatePublishReturnToHostReadiness } from '../../lib/publishReturnToHost'
import { DEFAULT_FLOOR_SIZE, WORKSPACE_EXPAND_STEP } from '../../floor-plan-builder/models/floorWorkspace'
import { FLOOR_PLAN_OBJECT_TYPES } from '../../floor-plan-builder/models/floorPlanObject'
import '../../floor-plan-builder/floorPlanBuilder.css'

const TABLET_EDITOR_BREAKPOINT = 1180
const OVERLAY_LAYOUT_QUERY = '(max-width: 900px), (max-height: 520px)'

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  ))

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const mediaQuery = window.matchMedia(query)
    const update = () => setMatches(mediaQuery.matches)
    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [query])

  return matches
}

function isEditableKeyboardTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
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

function CanvasSizeControls({
  canvasWidth,
  canvasHeight,
  onExpandWidth,
  onExpandHeight,
  onReset,
}) {
  return (
    <div className="unified-floor-editor-canvas-size" aria-label="Canvas size">
      <span className="unified-floor-editor-canvas-size-label">Canvas</span>
      <span className="unified-floor-editor-canvas-size-value">
        {canvasWidth}×{canvasHeight}
      </span>
      <button
        type="button"
        className="fpb-toolbar-btn fpb-toolbar-btn-touch unified-floor-editor-canvas-size-btn"
        onClick={onExpandWidth}
        title={`Add ${WORKSPACE_EXPAND_STEP}px to the right`}
      >
        + Width
      </button>
      <button
        type="button"
        className="fpb-toolbar-btn fpb-toolbar-btn-touch unified-floor-editor-canvas-size-btn"
        onClick={onExpandHeight}
        title={`Add ${WORKSPACE_EXPAND_STEP}px to the bottom`}
      >
        + Height
      </button>
      <button
        type="button"
        className="fpb-toolbar-btn fpb-toolbar-btn-touch unified-floor-editor-canvas-size-btn"
        onClick={onReset}
        title={`Reset to ${DEFAULT_FLOOR_SIZE.width}×${DEFAULT_FLOOR_SIZE.height}`}
      >
        Reset size
      </button>
    </div>
  )
}

function EmbeddedFloorPlanEditorShell({
  containerRef,
  onExit,
  onSaveDraft,
  onPublishLayout,
  onReturnToHost,
  hasDisplayableLayout = false,
  hostLayout = null,
  hasUnpublishedDraft,
  initialAreaId,
  onActiveAreaChange,
  canPublishLayout = true,
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
  const [moreOpen, setMoreOpen] = useState(false)
  const moreMenuRef = useRef(null)
  const isTabletLayout = useMediaQuery(`(max-width: ${TABLET_EDITOR_BREAKPOINT}px)`)
  const isOverlayLayout = useMediaQuery(OVERLAY_LAYOUT_QUERY)
  const toolsOpen = isTabletLayout ? toolsPanelOpen : true
  const inspectorOpen = isTabletLayout ? inspectorPanelOpen : true

  const getFitCamera = useCallback((width, height) => (
    getResetCameraForEditorWorkspace(activeWorkspaceBounds, width, height)
  ), [activeWorkspaceBounds])

  const viewportControls = useCanvasViewport({
    camera: state.camera,
    onCameraChange: (patch) => dispatch({ type: 'SET_CAMERA', payload: patch }),
    containerRef,
    floorBounds: activeWorkspaceBounds,
    getFitCamera,
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
      if (isOverlayLayout) setToolsPanelOpen(false)
    }
  }, [isOverlayLayout, selectionCount])

  useEffect(() => {
    if (!moreOpen) return undefined

    const closeOnPointerDown = (event) => {
      if (moreMenuRef.current?.contains(event.target)) return
      setMoreOpen(false)
    }
    const closeOnKey = (event) => {
      if (event.key === 'Escape') setMoreOpen(false)
    }

    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnKey)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnKey)
    }
  }, [moreOpen])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (isEditableKeyboardTarget(event.target)) return

      const key = event.key.toLowerCase()
      if (key === 'z' && event.shiftKey) {
        event.preventDefault()
        dispatch({ type: 'REDO' })
        return
      }
      if (key === 'z') {
        event.preventDefault()
        dispatch({ type: 'UNDO' })
        return
      }
      if (key === 'y') {
        event.preventDefault()
        dispatch({ type: 'REDO' })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  const workspaceLayoutKey = layout.sidebarWidth + layout.toolbarHeight

  const exitEditMode = useCallback(() => {
    onExit?.()
  }, [onExit])

  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [isPublishingLayout, setIsPublishingLayout] = useState(false)
  const [publishError, setPublishError] = useState(null)
  const [publishSuccess, setPublishSuccess] = useState(false)
  const [publishedTransition, setPublishedTransition] = useState(null)
  const [isReturningToHost, setIsReturningToHost] = useState(false)
  const [returnPrepareMessage, setReturnPrepareMessage] = useState('')

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
    setPublishError(null)
    setPublishSuccess(false)
    setPublishedTransition(null)
    setReturnPrepareMessage('')
    try {
      const transition = await onPublishLayout(buildLayoutPayload())
      if (!transition?.ok) {
        throw new Error('Published layout is missing floor areas. Stay in the editor and try again.')
      }
      dispatch({ type: 'MARK_DRAFT_SAVED' })
      setPublishedTransition(transition)
      setPublishSuccess(true)
    } catch (error) {
      setPublishError(error?.message || 'Unable to publish the floor plan right now.')
    } finally {
      setIsPublishingLayout(false)
    }
  }

  const returnReadiness = validatePublishReturnToHostReadiness({
    transition: publishedTransition,
    hasDisplayableLayout,
    layout: hostLayout,
  })

  const handleReturnToHost = async () => {
    if (!publishedTransition || isReturningToHost) return

    setIsReturningToHost(true)
    setReturnPrepareMessage('Preparing published layout…')
    setPublishError(null)

    try {
      const result = await onReturnToHost?.(publishedTransition)
      if (!result?.ok) {
        setReturnPrepareMessage(result?.message || 'Preparing published layout…')
        return
      }

      if (result?.reload) {
        return
      }

      recordPublishBreadcrumb('editor-unmounted')
      exitEditMode()
    } catch (error) {
      setPublishError(error?.message || 'Unable to return to Host Station right now.')
      setReturnPrepareMessage('')
    } finally {
      setIsReturningToHost(false)
    }
  }

  const handleRetryReturn = async () => {
    await handleReturnToHost()
  }

  const handleExit = () => {
    if (state.hasUnsavedChanges) {
      const confirmed = window.confirm('Discard unsaved layout changes and exit?')
      if (!confirmed) return
      dispatch({ type: 'CANCEL_EDITING' })
    }
    exitEditMode()
  }

  const toggleToolsPanel = () => {
    setToolsPanelOpen((current) => {
      const next = !current
      if (next && isOverlayLayout) setInspectorPanelOpen(false)
      return next
    })
  }

  const toggleInspectorPanel = () => {
    setInspectorPanelOpen((current) => {
      const next = !current
      if (next && isOverlayLayout) setToolsPanelOpen(false)
      return next
    })
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
  const canUndo = (state.undoStack?.length ?? 0) > 0
  const canRedo = (state.redoStack?.length ?? 0) > 0
  const exitLabel = state.hasUnsavedChanges ? 'Discard & exit' : 'Exit'

  const requestClearLayout = () => {
    if (activeFloorTableCount === 0) return
    setMoreOpen(false)
    setConfirmAction(canPublishLayout ? 'clear' : 'blocked')
  }

  const requestPublishLayout = () => {
    setConfirmAction(canPublishLayout ? 'publish' : 'blocked')
  }

  const commitClearLayout = () => {
    dispatch({ type: 'CLEAR_ACTIVE_FLOOR_LAYOUT' })
    setConfirmAction(null)
  }

  const commitPublishLayout = () => {
    setConfirmAction(null)
    handlePublish()
  }

  const canvasSizeControls = (
    <CanvasSizeControls
      canvasWidth={canvasWidth}
      canvasHeight={canvasHeight}
      onExpandWidth={handleExpandCanvasWidth}
      onExpandHeight={handleExpandCanvasHeight}
      onReset={handleResetCanvasSize}
    />
  )

  return (
    <div className="unified-floor-editor">
      {confirmAction ? (
        <div className="unified-floor-editor-confirm" role="presentation">
          <div
            className="unified-floor-editor-confirm-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="floor-publish-confirm-title"
          >
            <h3 id="floor-publish-confirm-title">
              {confirmAction === 'blocked'
                ? 'Ask a manager'
                : confirmAction === 'clear'
                  ? 'Clear this area?'
                  : 'Publish the live floor?'}
            </h3>
            <p>
              {confirmAction === 'blocked'
                ? 'Ask a manager to publish or clear the live floor. You can still save a draft.'
                : confirmAction === 'clear'
                  ? 'This removes every table in this area for the whole team.'
                  : 'This changes the live floor for the whole team.'}
            </p>
            <div className="unified-floor-editor-confirm-actions">
              <button type="button" className="fpb-toolbar-btn fpb-toolbar-btn-touch" onClick={() => setConfirmAction(null)}>
                Cancel
              </button>
              {confirmAction === 'clear' ? (
                <button type="button" className="fpb-toolbar-btn fpb-toolbar-btn-touch fpb-toolbar-btn-danger" onClick={commitClearLayout}>
                  Clear area
                </button>
              ) : null}
              {confirmAction === 'publish' ? (
                <button type="button" className="fpb-toolbar-btn fpb-toolbar-btn-touch fpb-toolbar-btn-primary" onClick={commitPublishLayout}>
                  Publish
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {publishSuccess ? (
        <div className="unified-floor-editor-publish-success" role="status">
          <div className="unified-floor-editor-publish-success-copy">
            <strong>Layout published successfully.</strong>
            {returnPrepareMessage && !returnReadiness.ok ? (
              <p>{returnPrepareMessage}</p>
            ) : null}
          </div>
          <div className="unified-floor-editor-publish-success-actions">
            <button
              type="button"
              className="fpb-toolbar-btn fpb-toolbar-btn-primary unified-floor-editor-return-host-btn"
              onClick={handleReturnToHost}
              disabled={isReturningToHost || isPublishingLayout || !returnReadiness.ok}
            >
              {isReturningToHost ? 'Preparing…' : 'Return to Host'}
            </button>
            {returnPrepareMessage && !returnReadiness.ok ? (
              <button
                type="button"
                className="fpb-toolbar-btn"
                onClick={handleRetryReturn}
                disabled={isReturningToHost}
              >
                Retry
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        ref={editorRef}
        className={`fpb-editor fpb-editor-simple fpb-editor-embedded${toolsOpen ? ' is-tools-open' : ''}${inspectorOpen ? ' is-inspector-open' : ''}${isTabletLayout ? ' is-tablet-layout' : ''}${isOverlayLayout ? ' is-overlay-layout' : ''}${moreOpen ? ' is-more-open' : ''}`}
        data-builder-mode={state.mode}
        style={{ '--fpb-toolbar-height': `${layout.toolbarHeight}px` }}
      >
        <div ref={toolbarRef} className="fpb-editor-toolbar unified-floor-editor-toolbar">
          <div className="unified-floor-editor-toolbar-main">
            <span className="unified-floor-editor-mode">Edit layout</span>
            {publishError ? (
              <span className="floor-plan-persistence-notice unified-floor-editor-publish-error" role="alert">
                {publishError}
              </span>
            ) : null}
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
            <div className="unified-floor-editor-toolbar-group" role="group" aria-label="Edit tools">
              <button
                type="button"
                className={`fpb-toolbar-btn fpb-toolbar-btn-touch unified-floor-editor-multi-select-toggle${state.multiSelectEnabled ? ' is-active' : ''}`}
                onClick={() => dispatch({
                  type: 'SET_MULTI_SELECT_ENABLED',
                  payload: { enabled: !state.multiSelectEnabled },
                })}
                aria-pressed={state.multiSelectEnabled}
              >
                Select multiple
              </button>
              <button
                type="button"
                className="fpb-toolbar-btn fpb-toolbar-btn-touch"
                onClick={() => dispatch({ type: 'UNDO' })}
                disabled={!canUndo || isBusy}
                aria-keyshortcuts="Control+Z Meta+Z"
                title="Undo"
              >
                Undo
              </button>
              <button
                type="button"
                className="fpb-toolbar-btn fpb-toolbar-btn-touch"
                onClick={() => dispatch({ type: 'REDO' })}
                disabled={!canRedo || isBusy}
                aria-keyshortcuts="Control+Shift+Z Control+Y Meta+Shift+Z"
                title="Redo"
              >
                Redo
              </button>
              {isTabletLayout ? (
                <>
                  <button
                    type="button"
                    className={`fpb-toolbar-btn fpb-toolbar-btn-touch unified-floor-editor-panel-toggle${toolsOpen ? ' is-active' : ''}`}
                    onClick={toggleToolsPanel}
                    aria-pressed={toolsOpen}
                    aria-expanded={toolsOpen}
                    aria-controls="fpb-embedded-tools"
                    aria-label={toolsOpen ? 'Hide tools' : 'Show tools'}
                  >
                    Tools
                  </button>
                  <button
                    type="button"
                    className={`fpb-toolbar-btn fpb-toolbar-btn-touch unified-floor-editor-panel-toggle${inspectorOpen ? ' is-active' : ''}`}
                    onClick={toggleInspectorPanel}
                    aria-pressed={inspectorOpen}
                    aria-expanded={inspectorOpen}
                    aria-controls="fpb-embedded-properties"
                    aria-label={inspectorOpen ? 'Hide properties' : 'Show properties'}
                  >
                    Properties
                  </button>
                </>
              ) : null}
            </div>
            {state.multiSelectEnabled && selectionCount >= 2 ? (
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
            {isTabletLayout ? null : canvasSizeControls}
            <div className="unified-floor-editor-more" ref={moreMenuRef}>
              <button
                type="button"
                className={`fpb-toolbar-btn fpb-toolbar-btn-touch unified-floor-editor-more-btn${moreOpen ? ' is-active' : ''}`}
                onClick={() => setMoreOpen((current) => !current)}
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                aria-controls="fpb-embedded-more"
              >
                More
              </button>
              {moreOpen ? (
                <div
                  id="fpb-embedded-more"
                  className="unified-floor-editor-more-menu"
                  role="menu"
                  aria-label="More layout actions"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="fpb-toolbar-btn fpb-toolbar-btn-touch fpb-toolbar-btn-danger unified-floor-editor-clear-layout-btn"
                    onClick={requestClearLayout}
                    disabled={activeFloorTableCount === 0 || isBusy}
                  >
                    Clear layout
                  </button>
                  {isTabletLayout ? canvasSizeControls : null}
                </div>
              ) : null}
            </div>
            <div className="unified-floor-editor-toolbar-commit" role="group" aria-label="Save layout">
              <button
                type="button"
                className="fpb-toolbar-btn fpb-toolbar-btn-touch"
                onClick={handleSaveDraft}
                disabled={isBusy}
                title="Save without publishing"
              >
                {isSavingDraft ? 'Saving…' : 'Save draft'}
              </button>
              <button
                type="button"
                className="fpb-toolbar-btn fpb-toolbar-btn-touch fpb-toolbar-btn-primary"
                onClick={requestPublishLayout}
                disabled={isBusy}
                title="Publish to the host floor"
              >
                {isPublishingLayout ? 'Publishing…' : 'Publish layout'}
              </button>
              <button
                type="button"
                className="fpb-toolbar-btn fpb-toolbar-btn-touch unified-floor-editor-exit-btn"
                onClick={handleExit}
                title={state.hasUnsavedChanges ? 'Discard unsaved changes and exit' : 'Exit layout editor'}
              >
                {exitLabel}
              </button>
            </div>
          </div>
        </div>

        <div id="fpb-embedded-tools" ref={sidebarRef} className="fpb-editor-sidebar">
          <BuilderToolbox
            onClose={() => setToolsPanelOpen(false)}
            showCloseButton={isTabletLayout}
            closeLabel="Close tools"
          />
        </div>

        <div className="fpb-editor-canvas">
          <BuilderCanvas
            containerRef={containerRef}
            viewportControls={viewportControls}
            workspaceLayoutKey={workspaceLayoutKey}
          />
        </div>

        <div id="fpb-embedded-properties" className="fpb-editor-inspector">
          <BuilderInspector
            onClose={() => setInspectorPanelOpen(false)}
            showCloseButton={isTabletLayout}
            isTabletLayout={isTabletLayout}
            closeLabel="Close properties"
          />
        </div>
      </div>
    </div>
  )
}

export function EmbeddedFloorPlanEditor({
  onExit,
  initialAreaId,
  onActiveAreaChange,
  onReturnToHost,
  canPublishLayout = true,
}) {
  const containerRef = useRef(null)
  const {
    builderLayout,
    saveDraftLayout,
    publishLayout,
    saveError,
    hasUnpublishedDraft,
    layout,
    hasDisplayableLayout,
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
        onReturnToHost={onReturnToHost}
        hasDisplayableLayout={hasDisplayableLayout}
        hostLayout={layout}
        hasUnpublishedDraft={hasUnpublishedDraft}
        initialAreaId={initialAreaId}
        onActiveAreaChange={onActiveAreaChange}
        canPublishLayout={canPublishLayout}
      />
    </FloorPlanBuilderProvider>
  )
}
