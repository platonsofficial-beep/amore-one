import { getTableHalfExtents } from './hostFloorPlanViewport'

const SAFE_LAYOUT_INSET = {
  x: 3.5,
  yTop: 3.5,
  yBottom: 6.5,
}

function clampPercent(value, min, max) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/**
 * Keeps table centers inside the floor rectangle with edge padding.
 * Only nudges tables that would otherwise cross the border.
 */
export function getClampedTableLayoutCoords(table, inset = SAFE_LAYOUT_INSET) {
  const rawX = Number(table?.x)
  const rawY = Number(table?.y)
  const { halfW, halfH } = getTableHalfExtents(table)
  const xInset = typeof inset === 'number' ? inset : inset.x
  const yTopInset = typeof inset === 'number' ? inset : inset.yTop
  const yBottomInset = typeof inset === 'number' ? inset : inset.yBottom

  return {
    x: clampPercent(rawX, xInset + halfW, 100 - xInset - halfW),
    y: clampPercent(rawY, yTopInset + halfH, 100 - yBottomInset - halfH),
  }
}

/**
 * Shared layout math for published Builder tables.
 * Host reservations render the same center point, size, and rotation
 * that builderToHostLayout derives from Builder object.position/size.
 */
export function getPublishedTableLayoutStyle(table) {
  const { x, y } = getClampedTableLayoutCoords(table)
  const widthPercent = Number(table?.widthPercent)
  const heightPercent = Number(table?.heightPercent ?? table?.widthPercent)
  const rotation = Number(table?.rotation) || 0
  const hasPublishedSize = Number.isFinite(widthPercent) && widthPercent > 0
    && Number.isFinite(heightPercent) && heightPercent > 0

  const style = {
    left: `${x}%`,
    top: `${y}%`,
  }

  if (hasPublishedSize) {
    style['--floor-table-width'] = `${widthPercent}%`
    style['--floor-table-height'] = `${heightPercent}%`
  }

  if (rotation) {
    style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`
  }

  return {
    style,
    hasPublishedSize,
  }
}

export function getFloorLayoutSpaceStyle(zone) {
  const width = Number(zone?.workspaceWidth) || 2200
  const height = Number(zone?.workspaceHeight) || 1400

  return {
    '--floor-aspect-ratio': `${width} / ${height}`,
  }
}
