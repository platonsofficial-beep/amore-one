import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { useObjectDrag } from '../hooks/useObjectDrag'
import { getStageTransform, screenToWorld } from '../lib/camera'
import { TABLE_TYPES } from '../models/componentCatalog'
import { createTableObjectFromType } from '../models/floorPlanObject'
import { floorBoundaryService } from '../services/FloorBoundaryService'
import { CanvasWorld } from './CanvasWorld'

export function BuilderCanvas({ containerRef, viewportControls, workspaceLayoutKey = 0 }) {
  const {
    state,
    dispatch,
    visibleObjects,
    activeFloor,
    activeWorkspace,
    activeWorkspaceBounds,
  } = useFloorPlanBuilder()
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })

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
    activeTool: 'select',
    snapEnabled: state.settings.snapEnabled,
    floorBounds: activeWorkspaceBounds,
    onMoveObject: handleMoveObject,
    onSelectObject: handleSelectObject,
    onClearSelection: handleClearSelection,
  })

  const handleViewportPointerDown = useCallback((event) => {
    const startedPan = viewportControls.tryStartPan(event, 'select')
    if (startedPan) {
      event.currentTarget.classList.add('is-panning')
    }
  }, [viewportControls])

  const handlePointerMove = useCallback((event) => {
    handleDragMove(event)
    viewportControls.handlePointerMove(event)
  }, [handleDragMove, viewportControls])

  const handlePointerUp = useCallback((event) => {
    endDrag(event)
    viewportControls.handlePointerUp(event)
    event.currentTarget.classList.remove('is-panning')
  }, [endDrag, viewportControls])

  const handleFloorBackgroundClick = useCallback((event) => {
    if (isDragging) return

    const tableType = TABLE_TYPES.find((entry) => entry.id === state.toolboxSelectionId)
    if (tableType && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const screenPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
      const worldPoint = screenToWorld(screenPoint, state.camera, viewportSize)
      const shapeSizes = {
        round: { width: 108, height: 108 },
        square: { width: 104, height: 104 },
        rectangle: { width: 136, height: 92 },
        island: { width: 180, height: 96 },
      }
      const size = shapeSizes[tableType.shape] ?? shapeSizes.round
      const centeredPosition = floorBoundaryService.clampToFloor(
        {
          x: worldPoint.x - (size.width / 2),
          y: worldPoint.y - (size.height / 2),
        },
        size,
        activeWorkspaceBounds,
      )
      const object = createTableObjectFromType({
        tableType,
        position: centeredPosition,
        floorId: state.activeFloorId,
        areaLabel: activeFloor.label,
        objects: state.objects,
      })

      dispatch({ type: 'ADD_OBJECT', payload: { object } })
      return
    }

    dispatch({ type: 'CLEAR_SELECTION' })
  }, [
    activeFloor.label,
    activeWorkspaceBounds,
    containerRef,
    dispatch,
    isDragging,
    state.activeFloorId,
    state.camera,
    state.objects,
    state.toolboxSelectionId,
    viewportSize,
  ])

  const canvasCursor = isDragging
    ? 'grabbing'
    : state.toolboxSelectionId
      ? 'crosshair'
      : 'default'

  return (
    <section className="fpb-canvas-shell fpb-canvas-shell-simple" aria-label="Floor plan canvas">
      <div
        ref={containerRef}
        className="fpb-canvas-viewport"
        style={{ cursor: canvasCursor }}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onAuxClick={(event) => event.preventDefault()}
      >
        <div
          className="fpb-canvas-stage"
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
            activeTool="select"
            onFloorBackgroundClick={handleFloorBackgroundClick}
            onObjectPointerDown={handleObjectPointerDown}
            onObjectPointerMove={handlePointerMove}
            onObjectPointerUp={handlePointerUp}
          />
        </div>
      </div>
    </section>
  )
}
