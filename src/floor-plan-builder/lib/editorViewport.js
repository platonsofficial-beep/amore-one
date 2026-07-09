import {
  clampCameraZoom,
  createCamera,
  getCameraFitToBounds,
  getObjectsBoundingBox,
} from './camera'

export const EDITOR_EMPTY_VIEW_SIZE = {
  width: 960,
  height: 720,
}

export const EDITOR_OBJECT_FIT_PADDING = 140
export const EDITOR_MIN_USABLE_ZOOM = 0.42
export const EDITOR_EMPTY_MIN_ZOOM = 0.62
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

  const camera = getCameraFitToBounds(bounds, viewportWidth, viewportHeight, margin)

  return createCamera({
    x: bounds.centerX,
    y: bounds.centerY,
    zoom: clampCameraZoom(camera.zoom * 0.96),
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
