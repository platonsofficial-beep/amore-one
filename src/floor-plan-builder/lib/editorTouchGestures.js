export const TOUCH_PAN_THRESHOLD_PX = 8

export function isTouchPointer(event) {
  return event?.pointerType === 'touch'
}

export function isEmptyCanvasTarget(target) {
  if (!target || typeof target.closest !== 'function') return true
  return !target.closest(
    '.fpb-canvas-object, .fpb-handle, .fpb-editor-toolbar, .fpb-toolbar-btn, button, a, input, textarea, select',
  )
}

/** Arm a pan on touch-down over empty floor. Mouse clicks stay clicks. */
export function shouldArmTouchBackgroundPan(event) {
  if (!isTouchPointer(event)) return false
  if (event.isPrimary === false) return false
  if (event.button != null && event.button !== 0 && event.button !== -1) return false
  return isEmptyCanvasTarget(event.target)
}

export function panExceededThreshold(
  startX,
  startY,
  clientX,
  clientY,
  threshold = TOUCH_PAN_THRESHOLD_PX,
) {
  return Math.hypot(clientX - startX, clientY - startY) >= threshold
}

export function clampEditorZoom(zoom, minZoom, maxZoom) {
  return Math.min(maxZoom, Math.max(minZoom, zoom))
}

/**
 * Pinch zoom around the world point under the gesture's start, then keep
 * that point under the fingers' current midpoint so a pinch can also pan.
 */
export function cameraForPinch({
  startZoom,
  startDistance,
  distance,
  startWorld,
  midX,
  midY,
  viewportWidth,
  viewportHeight,
  minZoom,
  maxZoom,
}) {
  const scale = startDistance > 0 ? distance / startDistance : 1
  const zoom = clampEditorZoom(startZoom * scale, minZoom, maxZoom)
  const halfW = viewportWidth / 2
  const halfH = viewportHeight / 2
  return {
    zoom,
    x: startWorld.x - (midX - halfW) / zoom,
    y: startWorld.y - (midY - halfH) / zoom,
  }
}
