import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { useObjectDrag } from '../hooks/useObjectDrag'
import { useTableTransform } from '../hooks/useTableTransform'
import { getStageTransform, screenToWorld } from '../lib/camera'
import { TABLE_TYPES } from '../models/componentCatalog'
import {
  createTableObjectFromType,
  findReferenceTableForShape,
  resolveTableSizeForNewTable,
} from '../models/floorPlanObject'
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
  const isEditing = state.mode === 'editing'

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

  const handleAddToSelection = useCallback((objectId) => {
    dispatch({ type: 'ADD_TABLE_TO_SELECTION', payload: { objectId } })
  }, [dispatch])

  const handleRemoveFromSelection = useCallback((objectId) => {
    dispatch({ type: 'REMOVE_TABLE_FROM_SELECTION', payload: { objectId } })
  }, [dispatch])

  const handleTransformTable = useCallback((objectId, preview) => {
    dispatch({
      type: 'TRANSFORM_TABLE',
      payload: {
        objectId,
        position: preview.position,
        size: preview.size,
        rotation: preview.rotation,
      },
    })
  }, [dispatch])

  const {
    transformingObjectId,
    isTransforming,
    handleResizePointerDown,
    handleRotatePointerDown,
    handleTransformMove,
    endTransform,
  } = useTableTransform({
    containerRef,
    camera: state.camera,
    viewportSize,
    floorBounds: activeWorkspaceBounds,
    onTransformTable: handleTransformTable,
  })

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
    snapEnabled: state.settings.snapEnabled,
    floorBounds: activeWorkspaceBounds,
    isEditing,
    selectedTableIds: state.selectedTableIds,
    onMoveObject: handleMoveObject,
    onAddToSelection: handleAddToSelection,
    onRemoveFromSelection: handleRemoveFromSelection,
  })

  const handleObjectPointerDownWrapped = useCallback((event, object) => {
    if (!isEditing) {
      handleSelectObject(object.id)
      return false
    }
    return handleObjectPointerDown(event, object)
  }, [handleObjectPointerDown, handleSelectObject, isEditing])

  const handleResizePointerDownWrapped = useCallback((event, object, handle) => {
    if (!isEditing) return false
    return handleResizePointerDown(event, object, handle)
  }, [handleResizePointerDown, isEditing])

  const handleRotatePointerDownWrapped = useCallback((event, object) => {
    if (!isEditing) return false
    return handleRotatePointerDown(event, object)
  }, [handleRotatePointerDown, isEditing])

  const handleViewportPointerDown = useCallback((event) => {
    const startedPan = viewportControls.tryStartPan(event, 'select')
    if (startedPan) {
      event.currentTarget.classList.add('is-panning')
    }
  }, [viewportControls])

  const handlePointerMove = useCallback((event) => {
    handleTransformMove(event)
    handleDragMove(event)
    viewportControls.handlePointerMove(event)
  }, [handleDragMove, handleTransformMove, viewportControls])

  const handlePointerUp = useCallback((event) => {
    endTransform(event)
    endDrag(event)
    viewportControls.handlePointerUp(event)
    event.currentTarget.classList.remove('is-panning')
  }, [endDrag, endTransform, viewportControls])

  const handleFloorBackgroundPointerUp = useCallback((event) => {
    if (isDragging || isTransforming || viewportControls.isPanning()) return
    if (!isEditing) {
      dispatch({ type: 'CLEAR_SELECTION' })
      return
    }

    const container = containerRef.current
    if (!container) return

    const viewport = {
      width: container.clientWidth,
      height: container.clientHeight,
    }
    if (viewport.width < 1 || viewport.height < 1) return

    const tableType = TABLE_TYPES.find((entry) => entry.id === state.toolboxSelectionId)
    if (tableType) {
      const rect = container.getBoundingClientRect()
      const screenPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
      const worldPoint = screenToWorld(screenPoint, state.camera, viewport)
      const shape = tableType.shape ?? 'round'
      const referenceTable = findReferenceTableForShape({
        objects: state.objects,
        shape,
        floorId: state.activeFloorId,
        selectedTableIds: state.selectedTableIds,
      })
      const size = resolveTableSizeForNewTable(shape, referenceTable)
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
        selectedTableIds: state.selectedTableIds,
        size,
        floors: state.floors,
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
    isTransforming,
    isEditing,
    state.floors,
    state.activeFloorId,
    state.camera,
    state.objects,
    state.selectedTableIds,
    state.toolboxSelectionId,
    viewportControls,
  ])

  const canvasCursor = isDragging
    ? 'grabbing'
    : isTransforming
      ? 'grabbing'
      : isEditing && state.toolboxSelectionId
        ? 'crosshair'
        : 'default'

  return (
    <section className={`fpb-canvas-shell fpb-canvas-shell-simple${isEditing ? '' : ' is-view-mode'}`} aria-label="Floor plan canvas">
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
        {isEditing && visibleObjects.length === 0 ? (
          <div className="fpb-canvas-empty-guide" role="status">
            <p className="fpb-canvas-empty-guide-eyebrow">Start your layout</p>
            <h3>Add your first table</h3>
            <p>Choose a table shape in Tools, then tap the floor to place it.</p>
          </div>
        ) : null}
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
            selectedTableIds={state.selectedTableIds}
            draggingObjectId={draggingObjectId}
            transformingObjectId={transformingObjectId}
            activeTool="select"
            isEditable={isEditing}
            onFloorBackgroundPointerUp={handleFloorBackgroundPointerUp}
            onObjectPointerDown={handleObjectPointerDownWrapped}
            onObjectPointerMove={handlePointerMove}
            onObjectPointerUp={handlePointerUp}
            onResizePointerDown={handleResizePointerDownWrapped}
            onRotatePointerDown={handleRotatePointerDownWrapped}
          />
        </div>
      </div>
    </section>
  )
}
