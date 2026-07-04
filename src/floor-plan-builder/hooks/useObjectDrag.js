import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  selectedTableIds,
  onMoveObject,
  onAddToSelection,
  onRemoveFromSelection,
}) {
  const cameraRef = useRef(camera)
  const viewportSizeRef = useRef(viewportSize)
  const snapEnabledRef = useRef(snapEnabled)
  const floorBoundsRef = useRef(floorBounds)
  const selectedTableIdsRef = useRef(selectedTableIds)
  const pendingClickRef = useRef(null)
  const [draggingObjectId, setDraggingObjectId] = useState(null)

  useEffect(() => {
    cameraRef.current = camera
    viewportSizeRef.current = viewportSize
    snapEnabledRef.current = snapEnabled
    floorBoundsRef.current = floorBounds
    selectedTableIdsRef.current = selectedTableIds
  }, [camera, floorBounds, selectedTableIds, snapEnabled, viewportSize])

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
    })
  }

  const dragManager = dragManagerRef.current
  dragManager.getClientToWorld = clientToWorld
  dragManager.onMoveObject = onMoveObject

  const handleObjectPointerDown = useCallback((event, object) => {
    event.stopPropagation()

    if (!isEditing) return false
    if (object.properties?.locked === true) return false

    const isSelected = selectedTableIdsRef.current.includes(object.id)

    if (!isSelected) {
      onAddToSelection(object.id)
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
  }, [dragManager, isEditing, onAddToSelection])

  const handleDragMove = useCallback((event) => {
    dragManager.move(event)
  }, [dragManager])

  const endDrag = useCallback((event) => {
    if (!dragManager.isActive()) return

    const moved = dragManager.session?.moved ?? false
    const pending = pendingClickRef.current

    dragManager.end(event)
    setDraggingObjectId(null)

    if (pending && !moved) {
      onRemoveFromSelection(pending.objectId)
    }

    pendingClickRef.current = null
  }, [dragManager, onRemoveFromSelection])

  useLayoutEffect(() => {
    if (dragManager.isActive() && dragManager.session?.previewPosition) {
      dragManager.applyTransform(dragManager.session.previewPosition)
    }
  })

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
