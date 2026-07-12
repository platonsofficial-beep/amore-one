import { getTableHalfExtents } from './hostFloorPlanViewport'

export const DINING_TIMER_EXTERNAL_LABEL_SIZE = {
  widthPercent: 5.5,
  heightPercent: 2.6,
}

export const DINING_TIMER_EXTERNAL_LABEL_SAFETY_GAP_PERCENT = 0.55

export const DINING_TIMER_EXTERNAL_LABEL_CANVAS_BOUNDS = {
  minX: 2.5,
  minY: 2.5,
  maxX: 97.5,
  maxY: 96,
}

const PLACEMENT_CANDIDATES = [
  { position: 'below', offsetX: 0, offsetY: 0 },
  { position: 'above', offsetX: 0, offsetY: 0 },
  { position: 'right', offsetX: 0, offsetY: 0 },
  { position: 'left', offsetX: 0, offsetY: 0 },
  { position: 'above', offsetX: 0, offsetY: 0.2 },
]

export function getFloorTableBounds(table) {
  const x = Number(table?.x)
  const y = Number(table?.y)
  const { halfW, halfH } = getTableHalfExtents(table)

  return {
    centerX: x,
    centerY: y,
    halfW,
    halfH,
    left: x - halfW,
    right: x + halfW,
    top: y - halfH,
    bottom: y + halfH,
    width: halfW * 2,
    height: halfH * 2,
  }
}

export function getDiningTimerExternalLabelBounds(
  tableBounds,
  placement,
  {
    labelSize = DINING_TIMER_EXTERNAL_LABEL_SIZE,
    safetyGap = DINING_TIMER_EXTERNAL_LABEL_SAFETY_GAP_PERCENT,
  } = {},
) {
  const halfLabelW = labelSize.widthPercent / 2
  const halfLabelH = labelSize.heightPercent / 2
  const offsetX = Number(placement?.offsetX) || 0
  const offsetY = Number(placement?.offsetY) || 0

  let centerX = tableBounds.centerX + offsetX
  let centerY = tableBounds.centerY + offsetY

  switch (placement?.position) {
    case 'below':
      centerY = tableBounds.bottom + safetyGap + halfLabelH + offsetY
      break
    case 'above':
      centerY = tableBounds.top - safetyGap - halfLabelH + offsetY
      break
    case 'right':
      centerX = tableBounds.right + safetyGap + halfLabelW + offsetX
      break
    case 'left':
      centerX = tableBounds.left - safetyGap - halfLabelW + offsetX
      break
    default:
      break
  }

  return {
    centerX,
    centerY,
    left: centerX - halfLabelW,
    right: centerX + halfLabelW,
    top: centerY - halfLabelH,
    bottom: centerY + halfLabelH,
    width: labelSize.widthPercent,
    height: labelSize.heightPercent,
  }
}

function expandRect(rect, gap = 0) {
  return {
    left: rect.left - gap,
    right: rect.right + gap,
    top: rect.top - gap,
    bottom: rect.bottom + gap,
  }
}

function rectsOverlap(leftRect, rightRect) {
  return leftRect.left < rightRect.right
    && leftRect.right > rightRect.left
    && leftRect.top < rightRect.bottom
    && leftRect.bottom > rightRect.top
}

function isWithinCanvas(labelBounds, canvasBounds) {
  return labelBounds.left >= canvasBounds.minX
    && labelBounds.right <= canvasBounds.maxX
    && labelBounds.top >= canvasBounds.minY
    && labelBounds.bottom <= canvasBounds.maxY
}

export function isDiningTimerExternalLabelPlacementBlocked({
  table,
  placement,
  allTables = [],
  placedLabelBounds = [],
  labelSize = DINING_TIMER_EXTERNAL_LABEL_SIZE,
  safetyGap = DINING_TIMER_EXTERNAL_LABEL_SAFETY_GAP_PERCENT,
  canvasBounds = DINING_TIMER_EXTERNAL_LABEL_CANVAS_BOUNDS,
  excludeTableId = null,
} = {}) {
  const tableBounds = getFloorTableBounds(table)
  const labelBounds = getDiningTimerExternalLabelBounds(tableBounds, placement, {
    labelSize,
    safetyGap,
  })

  if (!isWithinCanvas(labelBounds, canvasBounds)) {
    return true
  }

  const labelRect = expandRect(labelBounds, safetyGap)

  for (const otherTable of allTables) {
    if (excludeTableId && String(otherTable.id) === String(excludeTableId)) continue
    const otherRect = expandRect(getFloorTableBounds(otherTable), safetyGap)
    if (rectsOverlap(labelRect, otherRect)) {
      return true
    }
  }

  for (const placedBounds of placedLabelBounds) {
    const placedRect = expandRect(placedBounds, safetyGap * 0.5)
    if (rectsOverlap(labelRect, placedRect)) {
      return true
    }
  }

  return false
}

export function resolveDiningTimerExternalLabelPlacement({
  table,
  allTables = [],
  placedLabelBounds = [],
  labelSize = DINING_TIMER_EXTERNAL_LABEL_SIZE,
  safetyGap = DINING_TIMER_EXTERNAL_LABEL_SAFETY_GAP_PERCENT,
  canvasBounds = DINING_TIMER_EXTERNAL_LABEL_CANVAS_BOUNDS,
} = {}) {
  for (const candidate of PLACEMENT_CANDIDATES) {
    const blocked = isDiningTimerExternalLabelPlacementBlocked({
      table,
      placement: candidate,
      allTables,
      placedLabelBounds,
      labelSize,
      safetyGap,
      canvasBounds,
      excludeTableId: table?.id,
    })

    if (!blocked) {
      return candidate
    }
  }

  return { position: 'above', offsetX: 0, offsetY: 0 }
}

export function compareTablesForDiningTimerLabelPlacement(left, right) {
  const yDiff = Number(left?.y) - Number(right?.y)
  if (Math.abs(yDiff) > 0.01) return yDiff
  const xDiff = Number(left?.x) - Number(right?.x)
  if (Math.abs(xDiff) > 0.01) return xDiff
  return String(left?.id ?? '').localeCompare(String(right?.id ?? ''))
}

export function buildDiningTimerExternalLabelPlacementMap({
  labelTables = [],
  allTables = [],
  labelSize = DINING_TIMER_EXTERNAL_LABEL_SIZE,
  safetyGap = DINING_TIMER_EXTERNAL_LABEL_SAFETY_GAP_PERCENT,
  canvasBounds = DINING_TIMER_EXTERNAL_LABEL_CANVAS_BOUNDS,
} = {}) {
  const placements = new Map()
  const placedLabelBounds = []

  const orderedTables = [...labelTables].sort((left, right) => (
    compareTablesForDiningTimerLabelPlacement(left.table, right.table)
  ))

  orderedTables.forEach(({ id, table }) => {
    const placement = resolveDiningTimerExternalLabelPlacement({
      table,
      allTables,
      placedLabelBounds,
      labelSize,
      safetyGap,
      canvasBounds,
    })

    placements.set(id, placement)

    const labelBounds = getDiningTimerExternalLabelBounds(
      getFloorTableBounds(table),
      placement,
      { labelSize, safetyGap },
    )
    placedLabelBounds.push(labelBounds)
  })

  return placements
}
