import { useCallback, useEffect, useRef } from 'react'
import {
  clampCameraZoom,
  createCamera,
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
  getCameraAtZoom,
  getCameraFitToBounds,
  getResetCameraForWorkspace,
  screenToWorld,
} from '../lib/camera'
import {
  cameraForPinch,
  panExceededThreshold,
  shouldArmTouchBackgroundPan,
} from '../lib/editorTouchGestures'

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
  const armedPanRef = useRef(null)
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

  const releasePanPointer = useCallback((event) => {
    const pointerId = event?.pointerId
    const target = event?.currentTarget
    if (pointerId == null || !target?.hasPointerCapture?.(pointerId)) return
    try {
      target.releasePointerCapture(pointerId)
    } catch {
      // Touch browsers can drop capture during a second-finger transition.
    }
  }, [])

  const clearPan = useCallback((event) => {
    armedPanRef.current = null
    panSessionRef.current = null
    releasePanPointer(event)
  }, [releasePanPointer])

  const tryStartPinch = useCallback((event) => {
    if (event.touches?.length !== 2) return false

    const rect = getContainerRect()
    const viewport = getViewportSize()
    if (!rect || !viewport) return false

    clearPan(event)

    const [touchA, touchB] = event.touches
    const distance = Math.hypot(
      touchA.clientX - touchB.clientX,
      touchA.clientY - touchB.clientY,
    )
    if (distance < 1) return false

    const midX = ((touchA.clientX + touchB.clientX) / 2) - rect.left
    const midY = ((touchA.clientY + touchB.clientY) / 2) - rect.top
    const current = cameraRef.current

    pinchSessionRef.current = {
      startDistance: distance,
      startZoom: current.zoom,
      startWorld: screenToWorld({ x: midX, y: midY }, current, viewport),
    }
    return true
  }, [clearPan, getContainerRect, getViewportSize])

  const handlePinchMove = useCallback((event) => {
    const session = pinchSessionRef.current
    const viewport = getViewportSize()
    const rect = getContainerRect()
    if (!session || !viewport || !rect || event.touches?.length !== 2) return false

    const [touchA, touchB] = event.touches
    const distance = Math.hypot(
      touchA.clientX - touchB.clientX,
      touchA.clientY - touchB.clientY,
    )
    if (distance < 1 || session.startDistance < 1) return false

    setCamera(cameraForPinch({
      startZoom: session.startZoom,
      startDistance: session.startDistance,
      distance,
      startWorld: session.startWorld,
      midX: ((touchA.clientX + touchB.clientX) / 2) - rect.left,
      midY: ((touchA.clientY + touchB.clientY) / 2) - rect.top,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      minZoom: MIN_CAMERA_ZOOM,
      maxZoom: MAX_CAMERA_ZOOM,
    }))
    return true
  }, [getContainerRect, getViewportSize, setCamera])

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

    if (pinchSessionRef.current) return false

    if (!isMiddleButton && !isPanTool) {
      if (!shouldArmTouchBackgroundPan(event)) return false
      armedPanRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
      }
      return false
    }

    event.preventDefault()
    armedPanRef.current = null
    startPan(event.clientX, event.clientY)
    panSessionRef.current = {
      ...panSessionRef.current,
      pointerId: event.pointerId,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    return true
  }, [startPan])

  const promoteArmedPan = useCallback((event) => {
    const armed = armedPanRef.current
    if (!armed || armed.active || armed.pointerId !== event.pointerId) return false
    if (!panExceededThreshold(armed.startX, armed.startY, event.clientX, event.clientY)) return false

    startPan(event.clientX, event.clientY)
    panSessionRef.current = {
      ...panSessionRef.current,
      pointerId: event.pointerId,
    }
    armed.active = true
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      // Capture can fail once a second finger arrives.
    }
    return true
  }, [startPan])

  const handlePointerMove = useCallback((event) => {
    if (pinchSessionRef.current) return
    promoteArmedPan(event)
    if (!panSessionRef.current) return
    if (panSessionRef.current.pointerId !== event.pointerId) return
    if (event.cancelable) event.preventDefault()
    updatePan(event.clientX, event.clientY)
  }, [promoteArmedPan, updatePan])

  const finishPointer = useCallback((event) => {
    const armed = armedPanRef.current
    if (armed?.pointerId === event.pointerId) {
      armedPanRef.current = null
    }
    if (!panSessionRef.current) return
    if (panSessionRef.current.pointerId !== event.pointerId) return

    endPan()
    releasePanPointer(event)
  }, [endPan, releasePanPointer])

  const handlePointerUp = useCallback((event) => {
    finishPointer(event)
  }, [finishPointer])

  const handlePointerCancel = useCallback((event) => {
    finishPointer(event)
    endPinch()
  }, [endPinch, finishPointer])

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
    handlePointerCancel,
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
