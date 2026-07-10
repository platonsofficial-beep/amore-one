import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { screenToWorld } from '../lib/camera'
import { createTableTransformManager } from '../services/TableTransformManager'

export function useTableTransform({
  containerRef,
  camera,
  viewportSize,
  floorBounds,
  onTransformTable,
}) {
  const cameraRef = useRef(camera)
  const viewportSizeRef = useRef(viewportSize)
  const floorBoundsRef = useRef(floorBounds)
  const [transformingObjectId, setTransformingObjectId] = useState(null)

  useEffect(() => {
    cameraRef.current = camera
    viewportSizeRef.current = viewportSize
    floorBoundsRef.current = floorBounds
  }, [camera, floorBounds, viewportSize])

  const clientToWorld = useCallback((clientX, clientY) => {
    const container = containerRef.current
    const viewport = viewportSizeRef.current
    if (!container || !viewport.width || !viewport.height) {
      return null
    }

    const rect = container.getBoundingClientRect()
    return screenToWorld(
      { x: clientX - rect.left, y: clientY - rect.top },
      cameraRef.current,
      viewport,
    )
  }, [containerRef])

  const transformManager = useMemo(() => createTableTransformManager({
    getClientToWorld: clientToWorld,
    onTransformTable,
  }), [clientToWorld, onTransformTable])

  const handleResizePointerDown = useCallback((event, object, handle) => {
    event.stopPropagation()
    const started = transformManager.startResize(event, object, handle, {
      floorBounds: floorBoundsRef.current,
    })
    if (started) {
      setTransformingObjectId(object.id)
    }
    return started
  }, [transformManager])

  const handleRotatePointerDown = useCallback((event, object) => {
    event.stopPropagation()
    const started = transformManager.startRotate(event, object)
    if (started) {
      setTransformingObjectId(object.id)
    }
    return started
  }, [transformManager])

  const handleTransformMove = useCallback((event) => {
    transformManager.move(event)
  }, [transformManager])

  const endTransform = useCallback((event) => {
    if (!transformManager.isActive()) return
    transformManager.end(event)
    setTransformingObjectId(null)
  }, [transformManager])

  useEffect(() => () => {
    transformManager.dispose()
  }, [transformManager])

  return {
    transformingObjectId,
    isTransforming: Boolean(transformingObjectId),
    handleResizePointerDown,
    handleRotatePointerDown,
    handleTransformMove,
    endTransform,
  }
}
