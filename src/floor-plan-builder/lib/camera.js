/**
 * Viewport camera — world coordinates at the CENTER of the viewport.
 * The floor is a rectangle in world space; the camera moves independently.
 */

export const CAMERA_FIT_MARGIN = 80
export const MIN_CAMERA_ZOOM = 0.05
export const MAX_CAMERA_ZOOM = 4

export function createCamera(overrides = {}) {
  return {
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    zoom: clampCameraZoom(overrides.zoom ?? 1),
  }
}

export function clampCameraZoom(zoom) {
  return Math.min(MAX_CAMERA_ZOOM, Math.max(MIN_CAMERA_ZOOM, zoom))
}

export function worldToScreen(point, camera, viewportSize) {
  const halfW = viewportSize.width / 2
  const halfH = viewportSize.height / 2

  return {
    x: (point.x - camera.x) * camera.zoom + halfW,
    y: (point.y - camera.y) * camera.zoom + halfH,
  }
}

export function screenToWorld(screenPoint, camera, viewportSize) {
  const halfW = viewportSize.width / 2
  const halfH = viewportSize.height / 2

  return {
    x: camera.x + (screenPoint.x - halfW) / camera.zoom,
    y: camera.y + (screenPoint.y - halfH) / camera.zoom,
  }
}

export function getStageTransform(camera, viewportSize) {
  if (!viewportSize?.width || !viewportSize?.height) {
    return 'translate3d(0, 0, 0) scale(1)'
  }

  const halfW = viewportSize.width / 2
  const halfH = viewportSize.height / 2

  return [
    `translate3d(${halfW}px, ${halfH}px, 0)`,
    `scale(${camera.zoom})`,
    `translate3d(${-camera.x}px, ${-camera.y}px, 0)`,
  ].join(' ')
}

export function getVisibleWorldExtents(camera, viewportSize) {
  const halfW = viewportSize.width / 2
  const halfH = viewportSize.height / 2
  const invZoom = 1 / camera.zoom

  return {
    minX: camera.x - halfW * invZoom,
    maxX: camera.x + halfW * invZoom,
    minY: camera.y - halfH * invZoom,
    maxY: camera.y + halfH * invZoom,
  }
}

export function getObjectsBoundingBox(objects) {
  if (!objects?.length) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  objects.forEach((object) => {
    minX = Math.min(minX, object.position.x)
    minY = Math.min(minY, object.position.y)
    maxX = Math.max(maxX, object.position.x + object.size.width)
    maxY = Math.max(maxY, object.position.y + object.size.height)
  })

  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)

  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2,
  }
}

export function getFitZoomForBounds(
  bounds,
  viewportWidth,
  viewportHeight,
  margin = CAMERA_FIT_MARGIN,
) {
  if (!bounds || viewportWidth < 1 || viewportHeight < 1) {
    return 1
  }

  const availableWidth = Math.max(viewportWidth - margin * 2, 1)
  const availableHeight = Math.max(viewportHeight - margin * 2, 1)

  return clampCameraZoom(Math.min(
    availableWidth / bounds.width,
    availableHeight / bounds.height,
  ))
}

/** Fit camera: center on floor, zoom so entire floor fits with margin. */
export function getCameraFitToBounds(
  bounds,
  viewportWidth,
  viewportHeight,
  margin = CAMERA_FIT_MARGIN,
) {
  if (!bounds || viewportWidth < 1 || viewportHeight < 1) {
    return createCamera()
  }

  const zoom = getFitZoomForBounds(bounds, viewportWidth, viewportHeight, margin)

  return createCamera({
    x: bounds.centerX,
    y: bounds.centerY,
    zoom,
  })
}

export function getResetCameraForWorkspace(
  bounds,
  viewportWidth,
  viewportHeight,
  margin = CAMERA_FIT_MARGIN,
) {
  return getCameraFitToBounds(bounds, viewportWidth, viewportHeight, margin)
}

export function getCameraAtZoom(
  worldCenter,
  viewportWidth,
  viewportHeight,
  zoom,
) {
  return createCamera({
    x: worldCenter.x,
    y: worldCenter.y,
    zoom,
  })
}

function getRulerTickStep(zoom) {
  if (zoom >= 1.5) return 50
  if (zoom >= 0.75) return 100
  if (zoom >= 0.4) return 200
  return 400
}

/** Ruler ticks in real world coordinates; screen position derived from center camera. */
export function getRulerTicks(cameraAxis, zoom, viewportSize) {
  if (viewportSize < 1) return []

  const half = viewportSize / 2
  const worldMin = cameraAxis - half / zoom
  const worldMax = cameraAxis + half / zoom
  const step = getRulerTickStep(zoom)
  const start = Math.floor(worldMin / step) * step
  const ticks = []

  for (let value = start; value <= worldMax + step * 0.001; value += step) {
    const screenPos = (value - cameraAxis) * zoom + half
    if (screenPos < -60 || screenPos > viewportSize + 60) continue
    ticks.push({ value: Math.round(value), screenPos })
  }

  return ticks
}

export function formatCameraZoomPercent(zoom) {
  return `${Math.round(zoom * 100)}%`
}
