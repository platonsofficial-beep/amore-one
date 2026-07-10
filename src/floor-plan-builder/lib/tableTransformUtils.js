import { floorBoundaryService } from '../services/FloorBoundaryService'

export const TABLE_MIN_SIZES = {
  round: { width: 64, height: 64 },
  square: { width: 64, height: 64 },
  rectangle: { width: 80, height: 64 },
  island: { width: 100, height: 64 },
}

export function keepsTableAspectRatio(shape) {
  return shape === 'round' || shape === 'square'
}

export function normalizeRotation(degrees) {
  const value = Number(degrees) || 0
  return ((value % 360) + 360) % 360
}

export function snapRotation(degrees, shiftKey) {
  const normalized = normalizeRotation(degrees)
  if (!shiftKey) return normalized
  return normalizeRotation(Math.round(normalized / 15) * 15)
}

export function stepRotation(degrees, delta) {
  return normalizeRotation((Number(degrees) || 0) + delta)
}

export function getTableMinSize(shape) {
  return TABLE_MIN_SIZES[shape] ?? TABLE_MIN_SIZES.round
}

function getObjectCenter(object) {
  return {
    x: object.position.x + object.size.width / 2,
    y: object.position.y + object.size.height / 2,
  }
}

export function worldToObjectLocal(point, object) {
  const center = getObjectCenter(object)
  const rotation = object.rotation ?? 0
  const rad = (-rotation * Math.PI) / 180
  const dx = point.x - center.x
  const dy = point.y - center.y

  const localCenterX = (dx * Math.cos(rad)) - (dy * Math.sin(rad))
  const localCenterY = (dx * Math.sin(rad)) + (dy * Math.cos(rad))

  return {
    x: localCenterX + (object.size.width / 2),
    y: localCenterY + (object.size.height / 2),
  }
}

export function localTopLeftToWorld(point, object) {
  const center = getObjectCenter(object)
  const rotation = object.rotation ?? 0
  const rad = (rotation * Math.PI) / 180
  const localCenterX = point.x - (object.size.width / 2)
  const localCenterY = point.y - (object.size.height / 2)

  return {
    x: center.x + (localCenterX * Math.cos(rad)) - (localCenterY * Math.sin(rad)),
    y: center.y + (localCenterX * Math.sin(rad)) + (localCenterY * Math.cos(rad)),
  }
}

function applyMinSize(width, height, shape) {
  const minSize = getTableMinSize(shape)
  let nextWidth = Math.max(minSize.width, width)
  let nextHeight = Math.max(minSize.height, height)

  if (keepsTableAspectRatio(shape)) {
    const dim = Math.max(nextWidth, nextHeight)
    nextWidth = dim
    nextHeight = dim
  }

  return { width: nextWidth, height: nextHeight }
}

function worldDeltaToLocal(dx, dy, rotationDeg) {
  const rad = (-rotationDeg * Math.PI) / 180
  return {
    x: (dx * Math.cos(rad)) - (dy * Math.sin(rad)),
    y: (dx * Math.sin(rad)) + (dy * Math.cos(rad)),
  }
}

function localOffsetToWorld(localOffset, anchorWorld, rotationDeg) {
  const rad = (rotationDeg * Math.PI) / 180
  return {
    x: anchorWorld.x + (localOffset.x * Math.cos(rad)) - (localOffset.y * Math.sin(rad)),
    y: anchorWorld.y + (localOffset.x * Math.sin(rad)) + (localOffset.y * Math.cos(rad)),
  }
}

export function getResizeAnchorWorld(handle, origin) {
  const object = {
    position: { ...origin.position },
    size: { ...origin.size },
    rotation: origin.rotation ?? 0,
  }

  if (handle === 'se') {
    return localTopLeftToWorld({ x: 0, y: 0 }, object)
  }
  if (handle === 'sw') {
    return localTopLeftToWorld({ x: object.size.width, y: 0 }, object)
  }
  if (handle === 'ne') {
    return localTopLeftToWorld({ x: 0, y: object.size.height }, object)
  }
  return localTopLeftToWorld({ x: object.size.width, y: object.size.height }, object)
}

function getResizePositionFromAnchor(handle, anchorWorld, sized, rotationDeg) {
  if (handle === 'se') {
    return { x: anchorWorld.x, y: anchorWorld.y }
  }
  if (handle === 'sw') {
    return localOffsetToWorld({ x: -sized.width, y: 0 }, anchorWorld, rotationDeg)
  }
  if (handle === 'ne') {
    return localOffsetToWorld({ x: 0, y: -sized.height }, anchorWorld, rotationDeg)
  }
  return localOffsetToWorld({ x: -sized.width, y: -sized.height }, anchorWorld, rotationDeg)
}

function getLocalDimensionsFromPointer(handle, pointerWorld, anchorWorld, rotationDeg) {
  const local = worldDeltaToLocal(
    pointerWorld.x - anchorWorld.x,
    pointerWorld.y - anchorWorld.y,
    rotationDeg,
  )

  if (handle === 'se') {
    return { width: local.x, height: local.y }
  }
  if (handle === 'sw') {
    return { width: -local.x, height: local.y }
  }
  if (handle === 'ne') {
    return { width: local.x, height: -local.y }
  }
  return { width: -local.x, height: -local.y }
}

export function fitTableRectToFloor(position, size, floorBounds, shape) {
  const minSize = getTableMinSize(shape)
  let width = Math.max(minSize.width, size.width)
  let height = Math.max(minSize.height, size.height)

  if (keepsTableAspectRatio(shape)) {
    const dim = Math.max(width, height)
    width = dim
    height = dim
  }

  const floorWidth = floorBounds.maxX - floorBounds.minX
  const floorHeight = floorBounds.maxY - floorBounds.minY
  width = Math.min(width, floorWidth)
  height = Math.min(height, floorHeight)

  if (keepsTableAspectRatio(shape)) {
    const dim = Math.min(width, height)
    width = dim
    height = dim
  }

  let x = position.x
  let y = position.y

  if (x < floorBounds.minX) x = floorBounds.minX
  if (y < floorBounds.minY) y = floorBounds.minY
  if (x + width > floorBounds.maxX) x = Math.max(floorBounds.minX, floorBounds.maxX - width)
  if (y + height > floorBounds.maxY) y = Math.max(floorBounds.minY, floorBounds.maxY - height)

  const clampedPosition = floorBoundaryService.clampToFloor(
    { x, y },
    { width, height },
    floorBounds,
  )

  if (clampedPosition.x + width > floorBounds.maxX) {
    width = Math.max(minSize.width, floorBounds.maxX - clampedPosition.x)
  }
  if (clampedPosition.y + height > floorBounds.maxY) {
    height = Math.max(minSize.height, floorBounds.maxY - clampedPosition.y)
  }

  if (keepsTableAspectRatio(shape)) {
    const dim = Math.min(width, height)
    width = dim
    height = dim
  }

  return {
    position: clampedPosition,
    size: { width, height },
  }
}

function isValidPointerWorld(point) {
  return point
    && Number.isFinite(point.x)
    && Number.isFinite(point.y)
}

function isValidBounds({ position, size }) {
  return Number.isFinite(position?.x)
    && Number.isFinite(position?.y)
    && Number.isFinite(size?.width)
    && Number.isFinite(size?.height)
    && size.width > 0
    && size.height > 0
}

export function preserveResizeAnchor(handle, anchorWorld, bounds, rotationDeg = 0) {
  const currentAnchor = getResizeAnchorWorld(handle, {
    position: bounds.position,
    size: bounds.size,
    rotation: rotationDeg,
  })

  return {
    position: {
      x: bounds.position.x + (anchorWorld.x - currentAnchor.x),
      y: bounds.position.y + (anchorWorld.y - currentAnchor.y),
    },
    size: { ...bounds.size },
  }
}

export function finalizeResizeFromHandle({
  handle,
  pointerWorld,
  origin,
  shape,
  floorBounds,
  anchorWorld,
}) {
  if (!isValidPointerWorld(pointerWorld)) {
    return null
  }

  const rotation = origin.rotation ?? 0
  const anchor = anchorWorld ?? getResizeAnchorWorld(handle, origin)
  const raw = getLocalDimensionsFromPointer(handle, pointerWorld, anchor, rotation)
  const sized = applyMinSize(raw.width, raw.height, shape)
  const position = getResizePositionFromAnchor(handle, anchor, sized, rotation)

  let result = fitTableRectToFloor(position, sized, floorBounds, shape)
  result = preserveResizeAnchor(handle, anchor, result, rotation)
  result.position = floorBoundaryService.clampToFloor(
    result.position,
    result.size,
    floorBounds,
  )
  result = preserveResizeAnchor(handle, anchor, result, rotation)
  result.position = floorBoundaryService.clampToFloor(
    result.position,
    result.size,
    floorBounds,
  )

  if (!isValidBounds(result)) {
    return null
  }

  return result
}

export function computeResizeFromHandle(params) {
  return finalizeResizeFromHandle(params)
}

export function computeRotationFromPointer(pointerWorld, object, startPointerAngle, startRotation, shiftKey) {
  const center = getObjectCenter(object)
  const pointerAngle = Math.atan2(pointerWorld.y - center.y, pointerWorld.x - center.x)
  const deltaDegrees = ((pointerAngle - startPointerAngle) * 180) / Math.PI
  return snapRotation(startRotation + deltaDegrees, shiftKey)
}
