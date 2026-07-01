import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { useObjectDrag } from '../hooks/useObjectDrag'
import { getStageTransform } from '../lib/camera'
import { VIEWPORT_ANIMATION_MS } from '../hooks/useCanvasViewport'
import { CanvasRulers } from './CanvasRulers'
import { CanvasNavigationWidget } from './CanvasNavigationWidget'
import { CanvasWorld } from './CanvasWorld'

export function BuilderCanvas({ containerRef, viewportControls, isZooming = false, workspaceLayoutKey = 0 }) {
  const {
    state,
    dispatch,
    visibleObjects,
    activeFloor,
    activeWorkspace,
    activeWorkspaceBounds,
  } = useFloorPlanBuilder()
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [isViewportAnimating, setIsViewportAnimating] = useState(false)

  const measureViewport = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    setViewportSize({
      width: container.clientWidth,
      height: container.clientHeight,
    })
  }, [containerRef])

  useLayoutEffect(() => {
    measureViewport()
  }, [measureViewport, workspaceLayoutKey])

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return undefined

    const observer = new ResizeObserver(measureViewport)
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef, measureViewport])

  const runAnimatedNavigation = useCallback((action) => {
    setIsViewportAnimating(true)
    action()
    window.setTimeout(() => setIsViewportAnimating(false), VIEWPORT_ANIMATION_MS)
  }, [])

  const handleMoveObject = useCallback((objectId, position) => {
    dispatch({ type: 'MOVE_OBJECT', payload: { objectId, position } })
  }, [dispatch])

  const handleSelectObject = useCallback((objectId) => {
    dispatch({ type: 'SELECT_OBJECT', payload: { objectId } })
  }, [dispatch])

  const handleClearSelection = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTION' })
  }, [dispatch])

  const {
    draggingObjectId,
    handleObjectPointerDown,
    handleDragMove,
    endDrag,
    isDragging,
  } = useObjectDrag({
    containerRef,
    camera: state.camera,
    viewportSize,
    activeTool: state.activeTool,
    snapEnabled: state.settings.snapEnabled,
    floorBounds: activeWorkspaceBounds,
    onMoveObject: handleMoveObject,
    onSelectObject: handleSelectObject,
    onClearSelection: handleClearSelection,
  })

  const handleViewportPointerDown = useCallback((event) => {
    const startedPan = viewportControls.tryStartPan(event, state.activeTool)
    if (startedPan) {
      event.currentTarget.classList.add('is-panning')
    }
  }, [state.activeTool, viewportControls])

  const handlePointerMove = useCallback((event) => {
    handleDragMove(event)
    viewportControls.handlePointerMove(event)
  }, [handleDragMove, viewportControls])

  const handlePointerUp = useCallback((event) => {
    endDrag(event)
    viewportControls.handlePointerUp(event)
    event.currentTarget.classList.remove('is-panning')
  }, [endDrag, viewportControls])

  const handleViewportDoubleClick = (event) => {
    const isBackground = event.target === event.currentTarget
      || event.target.classList.contains('fpb-world-root')
      || event.target.classList.contains('fpb-world-grid')
      || event.target.classList.contains('fpb-canvas-workspace-surface')
    if (!isBackground) return
    runAnimatedNavigation(() => viewportControls.resetView())
  }

  const handleCanvasBackgroundClick = (event) => {
    if (isDragging) return
    if (event.target === event.currentTarget) {
      dispatch({ type: 'CLEAR_SELECTION' })
    }
  }

  const canvasCursor = isDragging
    ? 'grabbing'
    : state.activeTool === 'pan'
      ? 'grab'
      : 'default'

  return (
    <section
      className="fpb-canvas-shell"
      aria-label="Layout canvas"
      data-grid-enabled={state.settings.gridEnabled ? 'true' : 'false'}
      data-zooming={isZooming ? 'true' : 'false'}
    >
      <div className="fpb-canvas-frame">
        <CanvasRulers
          camera={state.camera}
          viewportWidth={viewportSize.width}
          viewportHeight={viewportSize.height}
        />

        <div className="fpb-canvas-viewport-wrap">
          <div
            ref={containerRef}
            className="fpb-canvas-viewport"
            style={{ cursor: canvasCursor }}
            onPointerDown={handleViewportPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onAuxClick={(event) => event.preventDefault()}
            onDoubleClick={handleViewportDoubleClick}
            onClick={handleCanvasBackgroundClick}
          >
            <div
              className={`fpb-canvas-stage${isViewportAnimating ? ' is-animating' : ''}`}
              style={{
                transform: getStageTransform(state.camera, viewportSize),
              }}
            >
              <CanvasWorld
                floor={activeWorkspace}
                floorLabel={activeFloor.label}
                objects={visibleObjects}
                selectedObjectIds={state.selectedObjectIds}
                draggingObjectId={draggingObjectId}
                activeTool={state.activeTool}
                gridEnabled={state.settings.gridEnabled}
                onFloorBackgroundClick={() => {
                  if (!isDragging) {
                    dispatch({ type: 'CLEAR_SELECTION' })
                  }
                }}
                onObjectPointerDown={handleObjectPointerDown}
                onObjectPointerMove={handlePointerMove}
                onObjectPointerUp={handlePointerUp}
              />
            </div>
          </div>

          <CanvasNavigationWidget
            zoom={state.camera.zoom}
            onZoomIn={() => runAnimatedNavigation(viewportControls.zoomIn)}
            onZoomOut={() => runAnimatedNavigation(viewportControls.zoomOut)}
            onFitAll={() => runAnimatedNavigation(viewportControls.fitFloor)}
            onZoomTo100={() => runAnimatedNavigation(viewportControls.zoomTo100)}
            onResetView={() => runAnimatedNavigation(viewportControls.resetView)}
          />

          <div className="fpb-canvas-hint" aria-hidden="true">
            Scroll to pan · Shift + scroll horizontal · Ctrl + scroll to zoom · Double-click to reset view
          </div>
        </div>
      </div>
    </section>
  )
}
