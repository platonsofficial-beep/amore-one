import { FLOOR_PLAN_OBJECT_TYPES, formatBuilderTableLabel } from '../floor-plan-builder/models/floorPlanObject'
import { createDefaultFloor, createDefaultWorkspace, getFloorBounds } from '../floor-plan-builder/models/floorWorkspace'
import { normalizeTableSection } from '../floor-plan-builder/lib/tableSections'
import { loadLocalFloorPlanLayout } from '../floor-plan-builder/lib/floorPlanStorage'
import { getActiveBuilderLayoutCache } from '../services/floorPlanService'
import { SEATING_UNIT_TYPES } from './seatingAssignment'

function getFloorWorkspace(floors, floorId) {
  const floor = floors.find((entry) => entry.id === floorId)
  return {
    ...createDefaultFloor(),
    ...(floor?.workspace ?? createDefaultWorkspace()),
  }
}

function objectCenterPercent(object, workspace) {
  const bounds = getFloorBounds(workspace)
  const centerX = object.position.x + object.size.width / 2
  const centerY = object.position.y + object.size.height / 2

  return {
    x: ((centerX - bounds.minX) / bounds.width) * 100,
    y: ((centerY - bounds.minY) / bounds.height) * 100,
    widthPercent: (object.size.width / bounds.width) * 100,
    heightPercent: (object.size.height / bounds.height) * 100,
  }
}

function sectionUnitType(shape, floorId) {
  if (floorId === 'bar') return SEATING_UNIT_TYPES.BAR
  if (floorId === 'lounge' || shape === 'island') return SEATING_UNIT_TYPES.ISLAND
  return SEATING_UNIT_TYPES.LOUNGE
}

function tableToUnits(object, floor, floors) {
  const workspace = getFloorWorkspace(floors, object.floorId)
  const {
    x,
    y,
    widthPercent,
    heightPercent,
  } = objectCenterPercent(object, workspace)
  const properties = object.properties ?? {}
  const sections = (properties.sections ?? []).map(normalizeTableSection)
  const areaLabel = floor.label
  const shape = properties.shape ?? 'round'
  const rotation = object.rotation ?? 0

  if (sections.length > 0) {
    const cols = Math.ceil(Math.sqrt(sections.length))
    const rows = Math.ceil(sections.length / cols)

    return sections.map((section, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      const unitType = sectionUnitType(shape, floor.id)
      const sectionX = x - (widthPercent / 2) + ((col + 0.5) / cols) * widthPercent
      const sectionY = y - (heightPercent / 2) + ((row + 0.5) / rows) * heightPercent
      const unitId = `${object.id}--${section.id}`
      const displayLabel = floor.id === 'bar' ? `Bar ${section.label}` : section.label

      return {
        id: unitId,
        label: section.label,
        displayLabel,
        x: sectionX,
        y: sectionY,
        seats: section.stools,
        seatedCapacity: section.stools,
        maxGuestCapacity: section.maxGuests,
        unitType,
        zoneId: floor.id,
        shape: shape === 'island' ? 'island' : 'section',
        area: areaLabel,
        rotation,
        widthPercent: widthPercent / cols,
        heightPercent: heightPercent / rows,
        builderObjectId: object.id,
      }
    })
  }

  const capacity = Math.max(1, Number(properties.capacity) || 1)
  const tableNumber = `${properties.tableNumber ?? ''}`.trim()
  const displayLabel = formatBuilderTableLabel(object)

  return [{
    id: object.id,
    label: tableNumber || properties.name || object.id,
    displayLabel,
    x,
    y,
    seats: capacity,
    seatedCapacity: capacity,
    maxGuestCapacity: capacity,
    unitType: SEATING_UNIT_TYPES.TABLE,
    zoneId: floor.id,
    shape,
    area: areaLabel,
    rotation,
    widthPercent,
    heightPercent,
    builderObjectId: object.id,
  }]
}

export function builderLayoutToHostLayout(builderLayout) {
  if (!builderLayout?.floors?.length) return null

  const { floors, objects } = builderLayout
  const units = []

  const zones = floors.map((floor) => {
    const workspace = getFloorWorkspace(floors, floor.id)
    const floorObjects = objects.filter((object) => (
      object.type === FLOOR_PLAN_OBJECT_TYPES.TABLE
      && object.floorId === floor.id
      && object.properties?.visible !== false
    ))
    const floorUnits = floorObjects.flatMap((object) => tableToUnits(object, floor, floors))
    units.push(...floorUnits)

    return {
      id: floor.id,
      label: floor.label,
      workspaceWidth: workspace.width,
      workspaceHeight: workspace.height,
      unitIds: floorUnits.map((unit) => unit.id),
      tableIds: floorUnits.map((unit) => unit.id),
    }
  })

  return {
    id: 'published-floor-plan',
    name: 'AMORE',
    zones,
    units,
    tables: units,
    publishedAt: builderLayout.publishedAt ?? null,
  }
}

export function loadPublishedHostLayout(workspaceId = '') {
  const cached = getActiveBuilderLayoutCache()
  const saved = cached ?? loadLocalFloorPlanLayout(workspaceId)
  if (!saved) return null
  return builderLayoutToHostLayout(saved)
}
