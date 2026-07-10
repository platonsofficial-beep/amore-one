import { useCallback, useEffect, useRef, useState } from 'react'
import { screenToWorld } from '../lib/camera'
import { floorBoundaryService } from '../services/FloorBoundaryService'
import { createObjectDragManager } from '../services/ObjectDragManager'
import { snapService } from '../services/SnapService'
import { resolvePendingDragSelection } from './dragSelection'

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
  const pendingSelectionRef = useRef(null)
  const onSelectObjectRef = useRef(onSelectObject)
  const onToggleSelectionRef = useRef(onToggleSelection)
  const [draggingObjectId, setDraggingObjectId] = useState(null)

  useEffect(() => {
    cameraRef.current = camera
    viewportSizeRef.current = viewportSize
    snapEnabledRef.current = snapEnabled
    floorBoundsRef.current = floorBounds
    selectedTableIdsRef.current = selectedTableIds
    multiSelectEnabledRef.current = multiSelectEnabled
    onSelectObjectRef.current = onSelectObject
    onToggleSelectionRef.current = onToggleSelection
  }, [
    camera,
    floorBounds,
    multiSelectEnabled,
    onSelectObject,
    onToggleSelection,
    selectedTableIds,
    snapEnabled,
    viewportSize,
  ])

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

  const applyPendingSelection = useCallback(({ objectId, moved }) => {
    const pending = pendingSelectionRef.current
    pendingSelectionRef.current = null
    if (!pending) return

    const action = resolvePendingDragSelection({
      objectId: pending.objectId ?? objectId,
      wasSelected: pending.wasSelected,
      isMultiSelect: pending.isMultiSelect,
      moved,
    })

    if (!action) return

    if (action.type === 'SELECT_OBJECT') {
      onSelectObjectRef.current(action.objectId)
      return
    }

    onToggleSelectionRef.current(action.objectId)
  }, [])

  const dragManagerRef = useRef(null)

  if (!dragManagerRef.current) {
    dragManagerRef.current = createObjectDragManager({
      snapService,
      boundaryService: floorBoundaryService,
      getClientToWorld: (clientX, clientY) => clientToWorld(clientX, clientY),
      onMoveObject,
      onDragComplete: ({ moved }) => {
        applyPendingSelection({ moved })
        setDraggingObjectId(null)
      },
    })
  }

  const dragManager = dragManagerRef.current
  dragManager.getClientToWorld = clientToWorld
  dragManager.onMoveObject = onMoveObject
  dragManager.onDragComplete = ({ moved }) => {
    applyPendingSelection({ moved })
    setDraggingObjectId(null)
  }

  const handleObjectPointerDown = useCallback((event, object) => {
    event.stopPropagation()

    if (!isEditing) return false
    if (object.properties?.locked === true) return false
    if (event.pointerType !== 'touch' && event.isPrimary === false) return false

    const wasSelected = selectedTableIdsRef.current.includes(object.id)
    const isMultiSelect = multiSelectEnabledRef.current

    pendingSelectionRef.current = {
      objectId: object.id,
      wasSelected,
      isMultiSelect,
    }

    const started = dragManager.start(event, object, {
      snapEnabled: snapEnabledRef.current,
      floorBounds: floorBoundsRef.current,
    })

    if (started) {
      setDraggingObjectId(object.id)
    } else {
      pendingSelectionRef.current = null
    }

    return started
  }, [dragManager, isEditing])

  const handleDragMove = useCallback((event) => {
    dragManager.move(event)
  }, [dragManager])

  const endDrag = useCallback((event) => {
    if (!dragManager.isActive()) return
    dragManager.end(event)
  }, [dragManager])

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
