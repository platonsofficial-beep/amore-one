import { FLOOR_PLAN_OBJECT_TYPES } from '../models/floorPlanObject'
import { createDefaultFloor, createDefaultWorkspace, getFloorBounds } from '../models/floorWorkspace'
import { fitTableRectToFloor } from './tableTransformUtils'

const MIN_GAP = 24

function getFloorWorkspaceBounds(floors, floorId) {
  const floor = floors.find((entry) => entry.id === floorId)
  const workspace = {
    ...createDefaultFloor(),
    ...(floor?.workspace ?? createDefaultWorkspace()),
  }
  return getFloorBounds(workspace)
}

function isSelectedTable(object, floorId) {
  return object
    && object.type === FLOOR_PLAN_OBJECT_TYPES.TABLE
    && object.floorId === floorId
    && object.properties?.visible !== false
}

function getSelectedTables(objects, selectedTableIds, floorId) {
  return selectedTableIds
    .map((objectId) => objects.find((object) => object.id === objectId))
    .filter((object) => isSelectedTable(object, floorId))
}

function equalGap(sortedTables, axis) {
  if (sortedTables.length < 2) return MIN_GAP

  const gaps = []
  for (let index = 1; index < sortedTables.length; index += 1) {
    const previous = sortedTables[index - 1]
    const current = sortedTables[index]

    if (axis === 'x') {
      const previousEdge = previous.position.x + previous.size.width
      gaps.push(Math.max(MIN_GAP, current.position.x - previousEdge))
    } else {
      const previousEdge = previous.position.y + previous.size.height
      gaps.push(Math.max(MIN_GAP, current.position.y - previousEdge))
    }
  }

  const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
  return Number.isFinite(average) ? average : MIN_GAP
}

function applyAlignedPosition(table, position, bounds) {
  const shape = table.properties?.shape ?? 'round'
  const fitted = fitTableRectToFloor(position, table.size, bounds, shape)

  return {
    position: fitted.position,
    size: fitted.size,
  }
}

function applyUpdates(objects, updates) {
  return objects.map((object) => {
    const update = updates.get(object.id)
    if (!update) return object

    return {
      ...object,
      position: update.position,
      size: update.size,
      properties: update.properties ?? object.properties,
    }
  })
}

export function alignSelectedTablesHorizontal(objects, selectedTableIds, floorId, floors) {
  const selectedTables = getSelectedTables(objects, selectedTableIds, floorId)
  if (selectedTables.length < 2) {
    return { objects, aligned: false, reason: 'need-multiple' }
  }

  const bounds = getFloorWorkspaceBounds(floors, floorId)
  const sortedTables = [...selectedTables].sort((left, right) => left.position.x - right.position.x)
  const averageY = sortedTables.reduce((sum, table) => sum + table.position.y, 0) / sortedTables.length
  const gap = equalGap(sortedTables, 'x')
  const updates = new Map()

  let nextX = sortedTables[0].position.x

  sortedTables.forEach((table, index) => {
    const aligned = applyAlignedPosition(table, { x: nextX, y: averageY }, bounds)
    updates.set(table.id, aligned)

    if (index < sortedTables.length - 1) {
      nextX = aligned.position.x + aligned.size.width + gap
    }
  })

  return {
    aligned: true,
    objects: applyUpdates(objects, updates),
  }
}

export function alignSelectedTablesVertical(objects, selectedTableIds, floorId, floors) {
  const selectedTables = getSelectedTables(objects, selectedTableIds, floorId)
  if (selectedTables.length < 2) {
    return { objects, aligned: false, reason: 'need-multiple' }
  }

  const bounds = getFloorWorkspaceBounds(floors, floorId)
  const sortedTables = [...selectedTables].sort((left, right) => left.position.y - right.position.y)
  const averageX = sortedTables.reduce((sum, table) => sum + table.position.x, 0) / sortedTables.length
  const gap = equalGap(sortedTables, 'y')
  const updates = new Map()

  let nextY = sortedTables[0].position.y

  sortedTables.forEach((table, index) => {
    const aligned = applyAlignedPosition(table, { x: averageX, y: nextY }, bounds)
    updates.set(table.id, aligned)

    if (index < sortedTables.length - 1) {
      nextY = aligned.position.y + aligned.size.height + gap
    }
  })

  return {
    aligned: true,
    objects: applyUpdates(objects, updates),
  }
}

export function matchSelectedTablesSize(objects, selectedTableIds, floorId, floors) {
  if (!selectedTableIds?.length || selectedTableIds.length < 2) {
    return { objects, matched: false }
  }

  const selectedTables = getSelectedTables(objects, selectedTableIds, floorId)
  if (selectedTables.length < 2) {
    return { objects, matched: false }
  }

  const referenceTable = selectedTables[0]
  const referenceSize = {
    width: referenceTable.size.width,
    height: referenceTable.size.height,
  }
  const referenceShape = referenceTable.properties?.shape ?? 'round'
  const bounds = getFloorWorkspaceBounds(floors, floorId)
  const selectedSet = new Set(selectedTableIds)

  return {
    matched: true,
    objects: objects.map((object) => {
      if (!selectedSet.has(object.id) || !isSelectedTable(object, floorId)) return object

      const fitted = fitTableRectToFloor(object.position, referenceSize, bounds, referenceShape)

      return {
        ...object,
        position: fitted.position,
        size: fitted.size,
        properties: {
          ...object.properties,
          shape: referenceShape,
        },
      }
    }),
  }
}
