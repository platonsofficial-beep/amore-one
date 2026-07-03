import { FLOOR_PLAN_OBJECT_TYPES } from '../models/floorPlanObject'
import { createDefaultFloor, createDefaultWorkspace, getWorkspaceBounds } from '../models/floorWorkspace'
import { fitTableRectToFloor } from './tableTransformUtils'

const MIN_GAP = 36
const FLOOR_MARGIN = 72
const ROW_BREAK_THRESHOLD = 120

function getFloorWorkspaceBounds(floors, floorId) {
  const floor = floors.find((entry) => entry.id === floorId)
  const workspace = {
    ...createDefaultFloor(),
    ...(floor?.workspace ?? createDefaultWorkspace()),
  }
  return getWorkspaceBounds(workspace)
}

function sortTablesForArrange(left, right) {
  const leftCenterY = left.position.y + left.size.height / 2
  const rightCenterY = right.position.y + right.size.height / 2

  if (Math.abs(leftCenterY - rightCenterY) > ROW_BREAK_THRESHOLD) {
    return leftCenterY - rightCenterY
  }

  return (left.position.x + left.size.width / 2) - (right.position.x + right.size.width / 2)
}

function buildRowGroups(tables, cols) {
  const rows = []
  for (let index = 0; index < tables.length; index += cols) {
    rows.push(tables.slice(index, index + cols))
  }
  return rows
}

function measureLayout(tables, cols, minGap, availW, availH) {
  const rows = buildRowGroups(tables, cols)
  const rowWidths = rows.map((rowTables) => (
    rowTables.reduce((sum, table) => sum + table.size.width, 0) + minGap * Math.max(rowTables.length - 1, 0)
  ))
  const rowHeights = rows.map((rowTables) => (
    Math.max(...rowTables.map((table) => table.size.height))
  ))

  const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0) + minGap * Math.max(rows.length - 1, 0)
  const maxRowWidth = Math.max(...rowWidths, 0)

  if (maxRowWidth > availW || totalHeight > availH) return null

  return {
    cols,
    rows,
    rowWidths,
    rowHeights,
    totalHeight,
    maxRowWidth,
    score: maxRowWidth * totalHeight,
  }
}

function chooseBestColumnCount(tables, minGap, availW, availH) {
  let bestLayout = null

  for (let cols = 1; cols <= tables.length; cols += 1) {
    const layout = measureLayout(tables, cols, minGap, availW, availH)
    if (!layout) continue
    if (!bestLayout || layout.score > bestLayout.score) {
      bestLayout = layout
    }
  }

  return bestLayout ?? measureLayout(tables, 1, minGap, availW, availH)
}

export function autoArrangeFloorTables(objects, floorId, floors) {
  const bounds = getFloorWorkspaceBounds(floors, floorId)
  const tables = objects
    .filter((object) => (
      object.type === FLOOR_PLAN_OBJECT_TYPES.TABLE
      && object.floorId === floorId
      && object.properties?.visible !== false
    ))
    .sort(sortTablesForArrange)

  if (!tables.length) return objects

  const availW = bounds.width - FLOOR_MARGIN * 2
  const availH = bounds.height - FLOOR_MARGIN * 2
  const layout = chooseBestColumnCount(tables, MIN_GAP, availW, availH)
  if (!layout) return objects

  const positions = new Map()
  const verticalRemainder = Math.max(0, availH - layout.totalHeight)
  const verticalGap = layout.rows.length > 1
    ? MIN_GAP + verticalRemainder / (layout.rows.length - 1)
    : 0

  let y = bounds.minY + FLOOR_MARGIN

  layout.rows.forEach((rowTables, rowIndex) => {
    const rowContentWidth = rowTables.reduce((sum, table) => sum + table.size.width, 0)
    const horizontalRemainder = Math.max(
      0,
      availW - rowContentWidth - MIN_GAP * Math.max(rowTables.length - 1, 0),
    )
    const horizontalGap = rowTables.length > 1
      ? MIN_GAP + horizontalRemainder / (rowTables.length - 1)
      : 0
    const totalRowWidth = rowContentWidth + horizontalGap * Math.max(rowTables.length - 1, 0)
    let x = bounds.minX + FLOOR_MARGIN + Math.max(0, (availW - totalRowWidth) / 2)

    rowTables.forEach((table) => {
      const shape = table.properties?.shape ?? 'round'
      const fitted = fitTableRectToFloor(
        { x, y },
        table.size,
        bounds,
        shape,
      )

      positions.set(table.id, fitted.position)
      x += table.size.width + horizontalGap
    })

    y += layout.rowHeights[rowIndex] + verticalGap
  })

  return objects.map((object) => {
    const nextPosition = positions.get(object.id)
    if (!nextPosition) return object
    return {
      ...object,
      position: nextPosition,
    }
  })
}
