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
  [FLOOR_PLAN_OBJECT_TYPES.TABLE]: { width: 140, height: 140 },
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

export const TABLE_SIZE_PRESETS = {
  square: {
    small: { width: 90, height: 90, capacity: 2 },
    medium: { width: 140, height: 140, capacity: 4 },
    large: { width: 200, height: 200, capacity: 6 },
  },
  round: {
    small: { width: 90, height: 90, capacity: 2 },
    medium: { width: 140, height: 140, capacity: 4 },
    large: { width: 200, height: 200, capacity: 6 },
  },
  rectangle: {
    small: { width: 140, height: 90, capacity: 4 },
    medium: { width: 200, height: 120, capacity: 6 },
    large: { width: 280, height: 150, capacity: 8 },
  },
  island: {
    small: { width: 140, height: 90, capacity: 4 },
    medium: { width: 200, height: 120, capacity: 6 },
    large: { width: 280, height: 150, capacity: 8 },
  },
}

export const TABLE_SHAPE_SIZES = Object.fromEntries(
  Object.entries(TABLE_SIZE_PRESETS).map(([shape, presets]) => [
    shape,
    { width: presets.medium.width, height: presets.medium.height },
  ]),
)

export function getTableShapeSize(shape) {
  return TABLE_SHAPE_SIZES[shape] ?? TABLE_SHAPE_SIZES.round
}

export function getTablePresetDetails(shape, preset = 'medium') {
  const shapePresets = TABLE_SIZE_PRESETS[shape] ?? TABLE_SIZE_PRESETS.round
  return shapePresets[preset] ?? shapePresets.medium
}

export function getTablePresetCapacity(shape, preset = 'medium') {
  return getTablePresetDetails(shape, preset).capacity
}

export function getTableSizeForPreset(shape, preset = 'medium') {
  const { width, height } = getTablePresetDetails(shape, preset)
  return { width, height }
}

export const TABLE_CAPACITY_MIN = 1
export const TABLE_CAPACITY_MAX = 20

export function clampTableCapacity(value, {
  min = TABLE_CAPACITY_MIN,
  max = TABLE_CAPACITY_MAX,
} = {}) {
  const parsed = Math.round(Number(value))
  if (!Number.isFinite(parsed)) return min
  return Math.min(max, Math.max(min, parsed))
}

export function adjustTableDimension(value, delta, minimum = 44) {
  const current = Math.max(minimum, Math.round(Number(value) || minimum))
  return Math.max(minimum, current + delta)
}

export function getDefaultCapacityForShape(shape) {
  return getTablePresetCapacity(shape, 'medium')
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

export function parseNumericTableNumber(value) {
  const raw = `${value ?? ''}`.trim()
  if (!/^\d+$/.test(raw)) return null

  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function getNextTableNumber(objects, floorId = null) {
  const numbers = objects
    .filter((object) => object.type === FLOOR_PLAN_OBJECT_TYPES.TABLE)
    .filter((object) => !floorId || object.floorId === floorId)
    .map((object) => parseNumericTableNumber(object.properties?.tableNumber))
    .filter((value) => value !== null)

  if (numbers.length === 0) return 1
  return Math.max(...numbers) + 1
}

export function findReferenceTableForShape({
  objects,
  shape,
  floorId = null,
  selectedTableIds = [],
}) {
  const isMatch = (object) => (
    object?.type === FLOOR_PLAN_OBJECT_TYPES.TABLE
    && (object.properties?.shape ?? 'round') === shape
    && (!floorId || object.floorId === floorId)
  )

  for (let index = selectedTableIds.length - 1; index >= 0; index -= 1) {
    const object = objects.find((entry) => entry.id === selectedTableIds[index])
    if (isMatch(object)) return object
  }

  for (let index = objects.length - 1; index >= 0; index -= 1) {
    if (isMatch(objects[index])) return objects[index]
  }

  return null
}

export function resolveTableSizeForNewTable(shape, referenceTable) {
  const referenceWidth = Number(referenceTable?.size?.width)
  const referenceHeight = Number(referenceTable?.size?.height)

  if (
    Number.isFinite(referenceWidth)
    && referenceWidth > 0
    && Number.isFinite(referenceHeight)
    && referenceHeight > 0
  ) {
    return {
      width: referenceWidth,
      height: referenceHeight,
    }
  }

  return getTableShapeSize(shape)
}

export function createTableObjectFromType({
  tableType,
  position,
  floorId,
  areaLabel,
  tableNumber,
  objects,
  selectedTableIds = [],
  size: sizeOverride,
  floors = [],
}) {
  const shape = tableType.shape ?? 'round'
  const referenceTable = findReferenceTableForShape({
    objects,
    shape,
    floorId,
    selectedTableIds,
  })
  const size = sizeOverride ?? resolveTableSizeForNewTable(shape, referenceTable)
  const nextNumber = tableNumber ?? getNextTableNumber(objects)
  const defaultCapacity = getDefaultCapacityForShape(shape)
  const tableLabel = `T${nextNumber}`

  return normalizeFloorPlanTableObject(
    createFloorPlanObject({
      id: `table-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: FLOOR_PLAN_OBJECT_TYPES.TABLE,
      position,
      size,
      floorId,
      properties: {
        name: tableLabel,
        tableNumber: String(nextNumber),
        capacity: defaultCapacity,
        shape,
        area: areaLabel,
        visible: true,
        locked: false,
        sections: [],
      },
    }),
    { floors, defaultFloorId: floorId },
  )
}

const TABLE_SHAPES = new Set(['round', 'square', 'rectangle', 'island'])

function normalizeTableRotation(degrees) {
  const value = Number(degrees) || 0
  return ((value % 360) + 360) % 360
}

export function normalizeFloorPlanTableObject(
  object,
  { floors = [], defaultFloorId = 'main-dining' } = {},
) {
  if (!object || object.type !== FLOOR_PLAN_OBJECT_TYPES.TABLE) {
    return object
  }

  const shape = TABLE_SHAPES.has(object.properties?.shape)
    ? object.properties.shape
    : 'round'
  const shapeSize = getTableShapeSize(shape)
  const rawNumber = `${object.properties?.tableNumber ?? object.properties?.name ?? ''}`.trim()
  const numericNumber = parseNumericTableNumber(rawNumber) ?? 1
  const tableNumber = rawNumber || String(numericNumber)
  const tableLabel = formatBuilderTableLabel({
    type: FLOOR_PLAN_OBJECT_TYPES.TABLE,
    properties: { tableNumber },
  })
  const resolvedFloorId = floors.some((floor) => floor.id === object.floorId)
    ? object.floorId
    : (defaultFloorId || floors[0]?.id || 'main-dining')
  const floor = floors.find((entry) => entry.id === resolvedFloorId)

  return {
    ...object,
    id: `${object.id ?? `table-${Date.now()}`}`.trim() || `table-${Date.now()}`,
    type: FLOOR_PLAN_OBJECT_TYPES.TABLE,
    floorId: resolvedFloorId,
    rotation: normalizeTableRotation(object.rotation),
    position: {
      x: Number(object.position?.x) || 0,
      y: Number(object.position?.y) || 0,
    },
    size: {
      width: Math.max(1, Number(object.size?.width) || shapeSize.width),
      height: Math.max(1, Number(object.size?.height) || shapeSize.height),
    },
    properties: {
      ...(object.properties ?? {}),
      name: object.properties?.name ?? tableLabel,
      tableNumber,
      capacity: Math.max(1, Number(object.properties?.capacity) || getDefaultCapacityForShape(shape)),
      shape,
      area: object.properties?.area ?? floor?.label ?? 'Main Dining',
      visible: object.properties?.visible !== false,
      locked: object.properties?.locked === true,
      sections: Array.isArray(object.properties?.sections) ? object.properties.sections : [],
    },
  }
}

export function normalizeLayoutObjects(objects = [], floors = [], defaultFloorId = 'main-dining') {
  return (objects ?? []).map((object) => (
    object?.type === FLOOR_PLAN_OBJECT_TYPES.TABLE
      ? normalizeFloorPlanTableObject(object, { floors, defaultFloorId })
      : object
  ))
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

export function formatBuilderTableLabel(object) {
  if (!object || object.type !== FLOOR_PLAN_OBJECT_TYPES.TABLE) {
    return formatObjectTypeLabel(object?.type)
  }

  const raw = `${object.properties?.tableNumber ?? object.properties?.name ?? ''}`.trim()
  if (!raw) return 'Table'
  if (/^T\d+/i.test(raw)) return raw.toUpperCase()
  if (/^\d+$/.test(raw)) return `T${raw}`
  return raw
}

export function getObjectDisplayLabel(object) {
  if (object.type === FLOOR_PLAN_OBJECT_TYPES.TABLE) {
    return formatBuilderTableLabel(object)
  }

  return formatObjectTypeLabel(object.type)
}
