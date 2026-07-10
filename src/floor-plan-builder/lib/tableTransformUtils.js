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

export function computeResizeFromHandle({
  handle,
  pointerWorld,
  origin,
  shape,
  floorBounds,
}) {
  const object = {
    position: origin.position,
    size: origin.size,
    rotation: origin.rotation ?? 0,
  }
  const localPointer = worldToObjectLocal(pointerWorld, object)
  const { position, size } = object

  let localW = size.width
  let localH = size.height

  if (handle === 'se') {
    localW = localPointer.x
    localH = localPointer.y
  } else if (handle === 'sw') {
    localW = size.width - localPointer.x
    localH = localPointer.y
  } else if (handle === 'ne') {
    localW = localPointer.x
    localH = size.height - localPointer.y
  } else if (handle === 'nw') {
    localW = size.width - localPointer.x
    localH = size.height - localPointer.y
  }

  const sized = applyMinSize(localW, localH, shape)

  if (handle === 'se') {
    return fitTableRectToFloor(
      { x: position.x, y: position.y },
      sized,
      floorBounds,
      shape,
    )
  }

  if (handle === 'sw') {
    const anchor = localTopLeftToWorld({ x: size.width, y: 0 }, object)
    return fitTableRectToFloor(
      { x: anchor.x - sized.width, y: anchor.y },
      sized,
      floorBounds,
      shape,
    )
  }

  if (handle === 'ne') {
    const anchor = localTopLeftToWorld({ x: 0, y: size.height }, object)
    return fitTableRectToFloor(
      { x: anchor.x, y: anchor.y - sized.height },
      sized,
      floorBounds,
      shape,
    )
  }

  const anchor = localTopLeftToWorld({ x: size.width, y: size.height }, object)
  return fitTableRectToFloor(
    { x: anchor.x - sized.width, y: anchor.y - sized.height },
    sized,
    floorBounds,
    shape,
  )
}

export function computeRotationFromPointer(pointerWorld, object, startPointerAngle, startRotation, shiftKey) {
  const center = getObjectCenter(object)
  const pointerAngle = Math.atan2(pointerWorld.y - center.y, pointerWorld.x - center.x)
  const deltaDegrees = ((pointerAngle - startPointerAngle) * 180) / Math.PI
  return snapRotation(startRotation + deltaDegrees, shiftKey)
}
