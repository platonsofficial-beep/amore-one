import { useCallback, useEffect, useRef } from 'react'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 2
const ZOOM_STEP = 0.08

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

export function useCanvasViewport({
  viewport,
  onViewportChange,
  containerRef,
}) {
  const panSessionRef = useRef(null)
  const spacePressedRef = useRef(false)

  const zoomBy = useCallback((delta, anchorPoint = null) => {
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const anchorX = anchorPoint?.x ?? rect.width / 2
    const anchorY = anchorPoint?.y ?? rect.height / 2
    const nextZoom = clampZoom(viewport.zoom + delta)
    if (nextZoom === viewport.zoom) return

    const worldX = (anchorX - viewport.panX) / viewport.zoom
    const worldY = (anchorY - viewport.panY) / viewport.zoom

    onViewportChange({
      zoom: nextZoom,
      panX: anchorX - worldX * nextZoom,
      panY: anchorY - worldY * nextZoom,
    })
  }, [containerRef, onViewportChange, viewport.panX, viewport.panY, viewport.zoom])

  const zoomIn = useCallback(() => {
    zoomBy(ZOOM_STEP * 2)
  }, [zoomBy])

  const zoomOut = useCallback(() => {
    zoomBy(-ZOOM_STEP * 2)
  }, [zoomBy])

  const resetZoom = useCallback(() => {
    onViewportChange({ zoom: 1, panX: 0, panY: 0 })
  }, [onViewportChange])

  const handleWheel = useCallback((event) => {
    event.preventDefault()
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const anchorX = event.clientX - rect.left
    const anchorY = event.clientY - rect.top
    const direction = event.deltaY < 0 ? 1 : -1
    const intensity = event.ctrlKey || event.metaKey ? 0.14 : 0.08
    zoomBy(direction * intensity, { x: anchorX, y: anchorY })
  }, [containerRef, zoomBy])

  const startPan = useCallback((clientX, clientY) => {
    panSessionRef.current = {
      startX: clientX,
      startY: clientY,
      originPanX: viewport.panX,
      originPanY: viewport.panY,
    }
  }, [viewport.panX, viewport.panY])

  const updatePan = useCallback((clientX, clientY) => {
    const session = panSessionRef.current
    if (!session) return

    onViewportChange({
      panX: session.originPanX + (clientX - session.startX),
      panY: session.originPanY + (clientY - session.startY),
    })
  }, [onViewportChange])

  const endPan = useCallback(() => {
    panSessionRef.current = null
  }, [])

  const handlePointerDown = useCallback((event) => {
    const isMiddleButton = event.button === 1
    const isSpacePan = event.button === 0 && spacePressedRef.current

    if (!isMiddleButton && !isSpacePan) return

    event.preventDefault()
    startPan(event.clientX, event.clientY)
    panSessionRef.current = {
      ...panSessionRef.current,
      pointerId: event.pointerId,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [startPan])

  const handlePointerMove = useCallback((event) => {
    if (!panSessionRef.current) return
    updatePan(event.clientX, event.clientY)
  }, [updatePan])

  const handlePointerUp = useCallback((event) => {
    if (!panSessionRef.current) return
    endPan()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [endPan])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code === 'Space' && !event.repeat) {
        spacePressedRef.current = true
      }
    }

    const handleKeyUp = (event) => {
      if (event.code === 'Space') {
        spacePressedRef.current = false
        endPan()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [endPan])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [containerRef, handleWheel])

  return {
    zoomIn,
    zoomOut,
    resetZoom,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    isSpacePressed: () => spacePressedRef.current,
  }
}

export function formatZoomPercent(zoom) {
  return `${Math.round(zoom * 100)}%`
}
