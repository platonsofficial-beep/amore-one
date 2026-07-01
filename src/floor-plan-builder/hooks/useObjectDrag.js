import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { screenToWorld } from '../lib/camera'
import { floorBoundaryService } from '../services/FloorBoundaryService'
import { createObjectDragManager } from '../services/ObjectDragManager'
import { createObjectSelectionManager } from '../services/ObjectSelectionManager'
import { snapService } from '../services/SnapService'

export function useObjectDrag({
  containerRef,
  camera,
  viewportSize,
  activeTool,
  snapEnabled,
  floorBounds,
  onMoveObject,
  onSelectObject,
  onClearSelection,
}) {
  const cameraRef = useRef(camera)
  const viewportSizeRef = useRef(viewportSize)
  const snapEnabledRef = useRef(snapEnabled)
  const floorBoundsRef = useRef(floorBounds)
  const activeToolRef = useRef(activeTool)
  const [draggingObjectId, setDraggingObjectId] = useState(null)

  useEffect(() => {
    cameraRef.current = camera
    viewportSizeRef.current = viewportSize
    snapEnabledRef.current = snapEnabled
    floorBoundsRef.current = floorBounds
    activeToolRef.current = activeTool
  }, [activeTool, camera, floorBounds, snapEnabled, viewportSize])

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

  const selectionManager = useMemo(() => createObjectSelectionManager({
    onSelect: onSelectObject,
    onClear: onClearSelection,
  }), [onClearSelection, onSelectObject])

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

    const { selected, draggable } = selectionManager.handleObjectPointerDown(
      object,
      activeToolRef.current,
    )

    if (!selected || !draggable) return false

    const started = dragManager.start(event, object, {
      snapEnabled: snapEnabledRef.current,
      floorBounds: floorBoundsRef.current,
    })

    if (started) {
      setDraggingObjectId(object.id)
    }

    return started
  }, [dragManager, selectionManager])

  const handleDragMove = useCallback((event) => {
    dragManager.move(event)
  }, [dragManager])

  const endDrag = useCallback((event) => {
    if (!dragManager.isActive()) return
    dragManager.end(event)
    setDraggingObjectId(null)
  }, [dragManager])

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
    selectionManager,
  }
}
