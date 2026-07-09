import { useCallback, useEffect, useRef } from 'react'
import {
  clampCameraZoom,
  createCamera,
  getCameraAtZoom,
  getCameraFitToBounds,
  getResetCameraForWorkspace,
  screenToWorld,
} from '../lib/camera'

const ZOOM_STEP = 0.08
const SCROLL_INTENSITY = 0.85
const ZOOM_IDLE_MS = 280

export function useCanvasViewport({
  camera,
  onCameraChange,
  containerRef,
  onAnimateCamera,
  onZoomActivity,
  floorBounds,
  getFitCamera,
}) {
  const panSessionRef = useRef(null)
  const cameraRef = useRef(camera)
  const zoomIdleTimeoutRef = useRef(null)

  useEffect(() => {
    cameraRef.current = camera
  }, [camera])

  const markZoomActivity = useCallback(() => {
    onZoomActivity?.(true)
    if (zoomIdleTimeoutRef.current) {
      window.clearTimeout(zoomIdleTimeoutRef.current)
    }
    zoomIdleTimeoutRef.current = window.setTimeout(() => {
      onZoomActivity?.(false)
    }, ZOOM_IDLE_MS)
  }, [onZoomActivity])

  const getViewportSize = useCallback(() => {
    const container = containerRef.current
    if (!container) return null

    return {
      width: container.clientWidth,
      height: container.clientHeight,
    }
  }, [containerRef])

  const getContainerRect = useCallback(() => {
    const container = containerRef.current
    if (!container) return null
    return container.getBoundingClientRect()
  }, [containerRef])

  const setCamera = useCallback((nextCamera) => {
    onCameraChange(createCamera(nextCamera))
  }, [onCameraChange])

  const applyCamera = useCallback((nextCamera) => {
    onAnimateCamera?.()
    setCamera(nextCamera)
  }, [onAnimateCamera, setCamera])

  const resetView = useCallback(() => {
    const viewport = getViewportSize()
    if (!viewport || !floorBounds) return

    if (getFitCamera) {
      applyCamera(getFitCamera(viewport.width, viewport.height))
      return
    }

    applyCamera(getResetCameraForWorkspace(
      floorBounds,
      viewport.width,
      viewport.height,
    ))
  }, [applyCamera, floorBounds, getFitCamera, getViewportSize])

  const fitFloor = useCallback(() => {
    const viewport = getViewportSize()
    if (!viewport || !floorBounds) return

    if (getFitCamera) {
      applyCamera(getFitCamera(viewport.width, viewport.height))
      return
    }

    applyCamera(getCameraFitToBounds(
      floorBounds,
      viewport.width,
      viewport.height,
    ))
  }, [applyCamera, floorBounds, getFitCamera, getViewportSize])

  const zoomBy = useCallback((delta, anchorPoint = null) => {
    const rect = getContainerRect()
    const viewport = getViewportSize()
    if (!rect || !viewport) return

    const current = cameraRef.current
    const anchorX = anchorPoint?.x ?? rect.width / 2
    const anchorY = anchorPoint?.y ?? rect.height / 2
    const nextZoom = clampCameraZoom(current.zoom + delta)
    if (nextZoom === current.zoom) return

    markZoomActivity()

    const anchorWorld = screenToWorld({ x: anchorX, y: anchorY }, current, viewport)
    const halfW = viewport.width / 2
    const halfH = viewport.height / 2

    setCamera({
      x: anchorWorld.x - (anchorX - halfW) / nextZoom,
      y: anchorWorld.y - (anchorY - halfH) / nextZoom,
      zoom: nextZoom,
    })
  }, [getContainerRect, getViewportSize, markZoomActivity, setCamera])

  const zoomIn = useCallback(() => {
    zoomBy(ZOOM_STEP * 2)
  }, [zoomBy])

  const zoomOut = useCallback(() => {
    zoomBy(-ZOOM_STEP * 2)
  }, [zoomBy])

  const setZoomAtAnchor = useCallback((targetZoom, anchorPoint = null) => {
    const rect = getContainerRect()
    const viewport = getViewportSize()
    if (!rect || !viewport) return

    const current = cameraRef.current
    const anchorX = anchorPoint?.x ?? rect.width / 2
    const anchorY = anchorPoint?.y ?? rect.height / 2
    const nextZoom = clampCameraZoom(targetZoom)
    if (nextZoom === current.zoom) return

    markZoomActivity()

    const anchorWorld = screenToWorld({ x: anchorX, y: anchorY }, current, viewport)
    const halfW = viewport.width / 2
    const halfH = viewport.height / 2

    setCamera({
      x: anchorWorld.x - (anchorX - halfW) / nextZoom,
      y: anchorWorld.y - (anchorY - halfH) / nextZoom,
      zoom: nextZoom,
    })
  }, [getContainerRect, getViewportSize, markZoomActivity, setCamera])

  const pinchSessionRef = useRef(null)

  const tryStartPinch = useCallback((event) => {
    if (event.touches?.length !== 2) return false

    const rect = getContainerRect()
    if (!rect) return false

    const [touchA, touchB] = event.touches
    const distance = Math.hypot(
      touchA.clientX - touchB.clientX,
      touchA.clientY - touchB.clientY,
    )
    if (distance < 1) return false

    const centerX = ((touchA.clientX + touchB.clientX) / 2) - rect.left
    const centerY = ((touchA.clientY + touchB.clientY) / 2) - rect.top

    pinchSessionRef.current = {
      startDistance: distance,
      startZoom: cameraRef.current.zoom,
      anchorX: centerX,
      anchorY: centerY,
    }
    return true
  }, [getContainerRect])

  const handlePinchMove = useCallback((event) => {
    const session = pinchSessionRef.current
    if (!session || event.touches?.length !== 2) return false

    const [touchA, touchB] = event.touches
    const distance = Math.hypot(
      touchA.clientX - touchB.clientX,
      touchA.clientY - touchB.clientY,
    )
    if (distance < 1 || session.startDistance < 1) return false

    const scale = distance / session.startDistance
    setZoomAtAnchor(session.startZoom * scale, {
      x: session.anchorX,
      y: session.anchorY,
    })
    return true
  }, [setZoomAtAnchor])

  const endPinch = useCallback(() => {
    pinchSessionRef.current = null
  }, [])

  const isPinching = useCallback(() => Boolean(pinchSessionRef.current), [])

  const zoomTo100 = useCallback(() => {
    const viewport = getViewportSize()
    if (!viewport || !floorBounds) return

    applyCamera(getCameraAtZoom(
      { x: floorBounds.centerX, y: floorBounds.centerY },
      viewport.width,
      viewport.height,
      1,
    ))
  }, [applyCamera, floorBounds, getViewportSize])

  const handleWheel = useCallback((event) => {
    event.preventDefault()
    const current = cameraRef.current

    if (event.ctrlKey) {
      const rect = getContainerRect()
      if (!rect) return
      const anchorX = event.clientX - rect.left
      const anchorY = event.clientY - rect.top
      const direction = event.deltaY < 0 ? 1 : -1
      zoomBy(direction * 0.12, { x: anchorX, y: anchorY })
      return
    }

    const deltaX = event.shiftKey ? event.deltaY : event.deltaX
    const deltaY = event.shiftKey ? 0 : event.deltaY

    setCamera({
      x: current.x - deltaX * SCROLL_INTENSITY / current.zoom,
      y: current.y - deltaY * SCROLL_INTENSITY / current.zoom,
      zoom: current.zoom,
    })
  }, [getContainerRect, setCamera, zoomBy])

  const startPan = useCallback((clientX, clientY) => {
    const current = cameraRef.current
    panSessionRef.current = {
      startX: clientX,
      startY: clientY,
      originX: current.x,
      originY: current.y,
      originZoom: current.zoom,
    }
  }, [])

  const updatePan = useCallback((clientX, clientY) => {
    const session = panSessionRef.current
    if (!session) return

    const deltaX = clientX - session.startX
    const deltaY = clientY - session.startY

    setCamera({
      x: session.originX - deltaX / session.originZoom,
      y: session.originY - deltaY / session.originZoom,
      zoom: session.originZoom,
    })
  }, [setCamera])

  const endPan = useCallback(() => {
    panSessionRef.current = null
  }, [])

  const tryStartPan = useCallback((event, activeTool) => {
    const isMiddleButton = event.button === 1
    const isPanTool = activeTool === 'pan' && event.button === 0

    if (!isMiddleButton && !isPanTool) return false

    event.preventDefault()
    startPan(event.clientX, event.clientY)
    panSessionRef.current = {
      ...panSessionRef.current,
      pointerId: event.pointerId,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    return true
  }, [startPan])

  const handlePointerMove = useCallback((event) => {
    if (!panSessionRef.current) return
    if (panSessionRef.current.pointerId !== event.pointerId) return
    updatePan(event.clientX, event.clientY)
  }, [updatePan])

  const handlePointerUp = useCallback((event) => {
    if (!panSessionRef.current) return
    if (panSessionRef.current.pointerId !== event.pointerId) return

    endPan()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [endPan])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', handleWheel)
      if (zoomIdleTimeoutRef.current) {
        window.clearTimeout(zoomIdleTimeoutRef.current)
      }
    }
  }, [containerRef, handleWheel])

  return {
    zoomIn,
    zoomOut,
    zoomTo100,
    fitFloor,
    resetView,
    tryStartPan,
    handlePointerMove,
    handlePointerUp,
    isPanning: () => Boolean(panSessionRef.current),
    tryStartPinch,
    handlePinchMove,
    endPinch,
    isPinching,
  }
}

export function formatZoomPercent(zoom) {
  return `${Math.round(zoom * 100)}%`
}

export const VIEWPORT_ANIMATION_MS = 250
