import {
  getTablePresetDetails,
  getTableSizeForPreset,
} from '../models/floorPlanObject'
import {
  getTableMinSize,
  keepsTableAspectRatio,
} from './tableTransformUtils'

/** Canonical table dimensions live on object.size.width / object.size.height (workspace units). */

export function parseTableDimension(value, fallback, minimum = 1) {
  if (value !== undefined && value !== null && `${value}`.trim() !== '') {
    const parsed = Math.round(Number(value))
    if (Number.isFinite(parsed)) {
      return Math.max(minimum, parsed)
    }
  }

  const fallbackValue = Math.round(Number(fallback))
  return Math.max(minimum, Number.isFinite(fallbackValue) ? fallbackValue : minimum)
}

export function normalizeTableSize(size = {}, shape = 'round') {
  const minSize = getTableMinSize(shape)
  let width = parseTableDimension(size.width, minSize.width, minSize.width)
  let height = parseTableDimension(size.height, minSize.height, minSize.height)

  if (keepsTableAspectRatio(shape)) {
    const dim = Math.max(width, height)
    width = dim
    height = dim
  }

  return { width, height }
}

/**
 * Merge explicit width/height patches onto a base size.
 * When aspect ratio is locked, a single-axis change drives both dimensions.
 */
export function resolveTableSizeFromPatch({
  baseSize,
  shape,
  explicitWidth,
  explicitHeight,
}) {
  const minSize = getTableMinSize(shape)
  const current = normalizeTableSize(baseSize, shape)

  let width = explicitWidth !== undefined
    ? parseTableDimension(explicitWidth, current.width, minSize.width)
    : current.width
  let height = explicitHeight !== undefined
    ? parseTableDimension(explicitHeight, current.height, minSize.height)
    : current.height

  if (keepsTableAspectRatio(shape)) {
    if (explicitWidth !== undefined && explicitHeight === undefined) {
      const dim = width
      width = dim
      height = dim
    } else if (explicitHeight !== undefined && explicitWidth === undefined) {
      const dim = height
      width = dim
      height = dim
    } else {
      const dim = Math.max(width, height)
      width = dim
      height = dim
    }
  }

  return normalizeTableSize({ width, height }, shape)
}

export function buildTableSizeResetPatch(shape = 'round') {
  const { width, height } = getTableSizeForPreset(shape, 'medium')
  return {
    sizePreset: 'medium',
    size: { width, height },
    width,
    height,
  }
}

export function getTablePresetSizePatch(shape, preset = 'medium') {
  const details = getTablePresetDetails(shape, preset)
  return {
    sizePreset: preset,
    size: { width: details.width, height: details.height },
    width: details.width,
    height: details.height,
  }
}

export function isTableAtMinimumSize(size, shape = 'round') {
  const minSize = getTableMinSize(shape)
  const normalized = normalizeTableSize(size, shape)
  return normalized.width <= minSize.width && normalized.height <= minSize.height
}

export function canDecreaseTableDimension(value, delta, shape = 'round', axis = 'width') {
  const minSize = getTableMinSize(shape)
  const minimum = axis === 'height' ? minSize.height : minSize.width
  const current = Math.max(minimum, Math.round(Number(value) || minimum))
  return current + delta >= minimum
}

/** Normalize aspect-locked tables to a square size while preserving center. */
export function normalizeTableBounds({
  position = { x: 0, y: 0 },
  size = { width: 0, height: 0 },
  shape = 'round',
}) {
  const nextSize = normalizeTableSize(size, shape)
  if (!keepsTableAspectRatio(shape)) {
    return {
      position: {
        x: Number(position.x) || 0,
        y: Number(position.y) || 0,
      },
      size: nextSize,
    }
  }

  const centerX = (Number(position.x) || 0) + (Number(size.width) || 0) / 2
  const centerY = (Number(position.y) || 0) + (Number(size.height) || 0) / 2

  return {
    position: {
      x: centerX - nextSize.width / 2,
      y: centerY - nextSize.height / 2,
    },
    size: nextSize,
  }
}
