import {
  clampCameraZoom,
  createCamera,
  getCameraFitToBounds,
  getObjectsBoundingBox,
} from './camera'

export const EDITOR_EMPTY_VIEW_SIZE = {
  width: 900,
  height: 630,
}

export const EDITOR_OBJECT_FIT_PADDING = 140
/** Minimum zoom for editor view-fit — keeps tablet editing at restaurant scale. */
export const EDITOR_TARGET_MIN_ZOOM = 0.7
export const EDITOR_TARGET_MAX_ZOOM = 1
export const EDITOR_FIT_ZOOM_PADDING = 0.96
export const EDITOR_EMBEDDED_FIT_MARGIN = 28

export function getEditorContentBounds({
  objects = [],
  workspaceBounds = null,
  padding = EDITOR_OBJECT_FIT_PADDING,
} = {}) {
  const objectBounds = getObjectsBoundingBox(objects)

  if (objectBounds) {
    return {
      minX: objectBounds.minX - padding,
      minY: objectBounds.minY - padding,
      maxX: objectBounds.maxX + padding,
      maxY: objectBounds.maxY + padding,
      width: objectBounds.width + padding * 2,
      height: objectBounds.height + padding * 2,
      centerX: objectBounds.centerX,
      centerY: objectBounds.centerY,
    }
  }

  if (!workspaceBounds) return null

  const centerX = workspaceBounds.centerX
  const centerY = workspaceBounds.centerY
  const halfWidth = EDITOR_EMPTY_VIEW_SIZE.width / 2
  const halfHeight = EDITOR_EMPTY_VIEW_SIZE.height / 2

  return {
    minX: centerX - halfWidth,
    minY: centerY - halfHeight,
    maxX: centerX + halfWidth,
    maxY: centerY + halfHeight,
    width: EDITOR_EMPTY_VIEW_SIZE.width,
    height: EDITOR_EMPTY_VIEW_SIZE.height,
    centerX,
    centerY,
  }
}

export function getEditorWorkspaceFitBounds(workspaceBounds) {
  if (!workspaceBounds) return null

  return {
    minX: workspaceBounds.minX,
    minY: workspaceBounds.minY,
    maxX: workspaceBounds.maxX,
    maxY: workspaceBounds.maxY,
    width: workspaceBounds.width,
    height: workspaceBounds.height,
    centerX: workspaceBounds.centerX,
    centerY: workspaceBounds.centerY,
  }
}

export function getEditorFitZoom(
  bounds,
  viewportWidth,
  viewportHeight,
  margin = EDITOR_EMBEDDED_FIT_MARGIN,
) {
  const fitZoom = getCameraFitToBounds(bounds, viewportWidth, viewportHeight, margin).zoom
  let zoom = clampCameraZoom(fitZoom * EDITOR_FIT_ZOOM_PADDING)

  if (zoom < EDITOR_TARGET_MIN_ZOOM) {
    zoom = EDITOR_TARGET_MIN_ZOOM
  }

  if (zoom > EDITOR_TARGET_MAX_ZOOM) {
    zoom = EDITOR_TARGET_MAX_ZOOM
  }

  return zoom
}

export function getResetCameraForEditorWorkspace(
  workspaceBounds,
  viewportWidth,
  viewportHeight,
  { margin = EDITOR_EMBEDDED_FIT_MARGIN } = {},
) {
  const bounds = getEditorWorkspaceFitBounds(workspaceBounds)
  if (!bounds || viewportWidth < 1 || viewportHeight < 1) {
    return createCamera()
  }

  return createCamera({
    x: bounds.centerX,
    y: bounds.centerY,
    zoom: getEditorFitZoom(bounds, viewportWidth, viewportHeight, margin),
  })
}

export function getResetCameraForEditorContent(
  _objects,
  workspaceBounds,
  viewportWidth,
  viewportHeight,
  options = {},
) {
  return getResetCameraForEditorWorkspace(
    workspaceBounds,
    viewportWidth,
    viewportHeight,
    options,
  )
}
