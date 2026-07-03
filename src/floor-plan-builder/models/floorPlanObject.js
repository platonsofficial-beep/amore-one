import { createDefaultFloor } from './floorWorkspace'

export const FLOOR_PLAN_OBJECT_TYPES = {
  TABLE: 'table',
  WALL: 'wall',
  DIVIDER: 'divider',
  DOOR: 'door',
  WINDOW: 'window',
  CHAIR: 'chair',
  SOFA: 'sofa',
  BAR_STOOL: 'bar-stool',
  BAR: 'bar',
  KITCHEN: 'kitchen',
  HOST_DESK: 'host-desk',
  WAITING_AREA: 'waiting-area',
  PLANT: 'plant',
  ARTWORK: 'artwork',
  TEXT: 'text',
  DJ_BOOTH: 'dj-booth',
  STAGE: 'stage',
  EMERGENCY_EXIT: 'emergency-exit',
  TOILET: 'toilet',
}

const DEFAULT_SIZES = {
  [FLOOR_PLAN_OBJECT_TYPES.TABLE]: { width: 108, height: 108 },
  [FLOOR_PLAN_OBJECT_TYPES.WALL]: { width: 160, height: 12 },
  [FLOOR_PLAN_OBJECT_TYPES.DIVIDER]: { width: 120, height: 8 },
  [FLOOR_PLAN_OBJECT_TYPES.DOOR]: { width: 72, height: 16 },
  [FLOOR_PLAN_OBJECT_TYPES.WINDOW]: { width: 88, height: 12 },
  [FLOOR_PLAN_OBJECT_TYPES.CHAIR]: { width: 40, height: 40 },
  [FLOOR_PLAN_OBJECT_TYPES.SOFA]: { width: 120, height: 56 },
  [FLOOR_PLAN_OBJECT_TYPES.BAR_STOOL]: { width: 36, height: 36 },
  [FLOOR_PLAN_OBJECT_TYPES.BAR]: { width: 200, height: 64 },
  [FLOOR_PLAN_OBJECT_TYPES.KITCHEN]: { width: 180, height: 120 },
  [FLOOR_PLAN_OBJECT_TYPES.HOST_DESK]: { width: 100, height: 48 },
  [FLOOR_PLAN_OBJECT_TYPES.WAITING_AREA]: { width: 160, height: 100 },
  [FLOOR_PLAN_OBJECT_TYPES.PLANT]: { width: 48, height: 48 },
  [FLOOR_PLAN_OBJECT_TYPES.ARTWORK]: { width: 64, height: 48 },
  [FLOOR_PLAN_OBJECT_TYPES.TEXT]: { width: 120, height: 32 },
  [FLOOR_PLAN_OBJECT_TYPES.DJ_BOOTH]: { width: 140, height: 80 },
  [FLOOR_PLAN_OBJECT_TYPES.STAGE]: { width: 240, height: 120 },
  [FLOOR_PLAN_OBJECT_TYPES.EMERGENCY_EXIT]: { width: 72, height: 72 },
  [FLOOR_PLAN_OBJECT_TYPES.TOILET]: { width: 80, height: 80 },
}

export function createFloorPlanObject({
  id,
  type,
  position,
  rotation = 0,
  size,
  properties = {},
  zIndex = 1,
  floorId = 'main-dining',
}) {
  const defaultSize = DEFAULT_SIZES[type] ?? { width: 80, height: 80 }

  return {
    id,
    type,
    position: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
    },
    rotation,
    size: {
      width: size?.width ?? defaultSize.width,
      height: size?.height ?? defaultSize.height,
    },
    properties,
    zIndex,
    floorId,
  }
}

export const TABLE_SHAPE_SIZES = {
  round: { width: 108, height: 108 },
  square: { width: 104, height: 104 },
  rectangle: { width: 136, height: 92 },
  island: { width: 180, height: 96 },
}

export function getTableShapeSize(shape) {
  return TABLE_SHAPE_SIZES[shape] ?? TABLE_SHAPE_SIZES.round
}

export function getDefaultCapacityForShape(shape) {
  if (shape === 'island') return 6
  if (shape === 'rectangle') return 6
  return 4
}

export function createDemoTableObject({
  id,
  tableNumber,
  capacity,
  shape,
  position,
  area = 'Main Dining',
}) {
  const shapeSizes = TABLE_SHAPE_SIZES

  return createFloorPlanObject({
    id,
    type: FLOOR_PLAN_OBJECT_TYPES.TABLE,
    position,
    size: shapeSizes[shape] ?? shapeSizes.round,
    properties: {
      name: `Table ${tableNumber}`,
      tableNumber: String(tableNumber),
      capacity,
      shape,
      area,
      visible: true,
      locked: false,
    },
  })
}

export function getNextTableNumber(objects) {
  const numbers = objects
    .filter((object) => object.type === FLOOR_PLAN_OBJECT_TYPES.TABLE)
    .map((object) => Number.parseInt(object.properties.tableNumber, 10))
    .filter((value) => Number.isFinite(value))

  if (numbers.length === 0) return 1
  return Math.max(...numbers) + 1
}

export function createTableObjectFromType({
  tableType,
  position,
  floorId,
  areaLabel,
  tableNumber,
  objects,
}) {
  const shape = tableType.shape ?? 'round'
  const size = getTableShapeSize(shape)
  const nextNumber = tableNumber ?? getNextTableNumber(objects)
  const defaultCapacity = getDefaultCapacityForShape(shape)

  return createFloorPlanObject({
    id: `table-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: FLOOR_PLAN_OBJECT_TYPES.TABLE,
    position,
    size,
    floorId,
    properties: {
      name: `Table ${nextNumber}`,
      tableNumber: String(nextNumber),
      capacity: defaultCapacity,
      shape,
      area: areaLabel,
      visible: true,
      locked: false,
    },
  })
}

export function getDemoFloorPlanObjects() {
  const floor = createDefaultFloor()

  return [
    createDemoTableObject({
      id: 'table-1',
      tableNumber: '1',
      capacity: 2,
      shape: 'round',
      position: { x: floor.x + 220, y: floor.y + 200 },
    }),
    createDemoTableObject({
      id: 'table-2',
      tableNumber: '2',
      capacity: 4,
      shape: 'square',
      position: { x: floor.x + 560, y: floor.y + 200 },
    }),
    createDemoTableObject({
      id: 'table-3',
      tableNumber: '3',
      capacity: 6,
      shape: 'rectangle',
      position: { x: floor.x + 920, y: floor.y + 200 },
    }),
    createDemoTableObject({
      id: 'table-4',
      tableNumber: '4',
      capacity: 4,
      shape: 'round',
      position: { x: floor.x + 420, y: floor.y + 520 },
    }),
  ]
}

export function formatObjectTypeLabel(type) {
  return `${type ?? 'object'}`
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function getObjectDisplayLabel(object) {
  if (object.type === FLOOR_PLAN_OBJECT_TYPES.TABLE) {
    return `Table ${object.properties.tableNumber ?? ''}`.trim()
  }

  return formatObjectTypeLabel(object.type)
}
