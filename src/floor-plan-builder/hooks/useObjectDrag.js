import { useCallback, useEffect, useRef, useState } from 'react'
import { screenToWorld } from '../lib/camera'
import { floorBoundaryService } from '../services/FloorBoundaryService'
import { createObjectDragManager } from '../services/ObjectDragManager'
import { snapService } from '../services/SnapService'

export function useObjectDrag({
  containerRef,
  camera,
  viewportSize,
  snapEnabled,
  floorBounds,
  isEditing,
  multiSelectEnabled,
  selectedTableIds,
  onMoveObject,
  onSelectObject,
  onToggleSelection,
}) {
  const cameraRef = useRef(camera)
  const viewportSizeRef = useRef(viewportSize)
  const snapEnabledRef = useRef(snapEnabled)
  const floorBoundsRef = useRef(floorBounds)
  const selectedTableIdsRef = useRef(selectedTableIds)
  const multiSelectEnabledRef = useRef(multiSelectEnabled)
  const pendingClickRef = useRef(null)
  const [draggingObjectId, setDraggingObjectId] = useState(null)

  useEffect(() => {
    cameraRef.current = camera
    viewportSizeRef.current = viewportSize
    snapEnabledRef.current = snapEnabled
    floorBoundsRef.current = floorBounds
    selectedTableIdsRef.current = selectedTableIds
    multiSelectEnabledRef.current = multiSelectEnabled
  }, [camera, floorBounds, multiSelectEnabled, selectedTableIds, snapEnabled, viewportSize])

  const clientToWorld = useCallback((clientX, clientY) => {
    const container = containerRef.current
    const viewport = viewportSizeRef.current
    if (!container || !viewport.width || !viewport.height) {
      return { x: 0, y: 0 }
    }

    const rect = container.getBoundingClientRect()
    return screenToWorld(
      { x: clientX - rect.left, y: clientY - rect.top },
      cameraRef.current,
      viewport,
    )
  }, [containerRef])

  const dragManagerRef = useRef(null)

  if (!dragManagerRef.current) {
    dragManagerRef.current = createObjectDragManager({
      snapService,
      boundaryService: floorBoundaryService,
      getClientToWorld: (clientX, clientY) => clientToWorld(clientX, clientY),
      onMoveObject,
      onDragComplete: () => {
        setDraggingObjectId(null)
      },
    })
  }

  const dragManager = dragManagerRef.current
  dragManager.getClientToWorld = clientToWorld
  dragManager.onMoveObject = onMoveObject
  dragManager.onDragComplete = () => {
    setDraggingObjectId(null)
  }

  const handleObjectPointerDown = useCallback((event, object) => {
    event.stopPropagation()

    if (!isEditing) return false
    if (object.properties?.locked === true) return false
    if (event.isPrimary === false) return false

    const isSelected = selectedTableIdsRef.current.includes(object.id)
    const isMultiSelect = multiSelectEnabledRef.current

    if (!isMultiSelect) {
      if (!isSelected) {
        onSelectObject(object.id)
      }
      pendingClickRef.current = null
    } else if (!isSelected) {
      onToggleSelection(object.id)
      pendingClickRef.current = null
    } else {
      pendingClickRef.current = { objectId: object.id }
    }

    const started = dragManager.start(event, object, {
      snapEnabled: snapEnabledRef.current,
      floorBounds: floorBoundsRef.current,
    })

    if (started) {
      setDraggingObjectId(object.id)
    }

    return started
  }, [dragManager, isEditing, onSelectObject, onToggleSelection])

  const handleDragMove = useCallback((event) => {
    dragManager.move(event)
  }, [dragManager])

  const endDrag = useCallback((event) => {
    if (!dragManager.isActive()) return

    const pending = pendingClickRef.current
    const moved = dragManager.end(event) ?? false

    if (pending && !moved) {
      onToggleSelection(pending.objectId)
    }

    pendingClickRef.current = null
  }, [dragManager, onToggleSelection])

  useEffect(() => () => {
    dragManager.dispose()
  }, [dragManager])

  return {
    draggingObjectId,
    handleObjectPointerDown,
    handleDragMove,
    endDrag,
    isDragging: Boolean(draggingObjectId),
  }
}
