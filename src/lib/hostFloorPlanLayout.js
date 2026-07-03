import { SEATING_UNIT_TYPES } from './seatingAssignment'

export { SEATING_UNIT_TYPES }

export function getHostLayoutUnits(layout) {
  if (!layout) return []
  return layout.units ?? layout.tables ?? []
}

export function getHostUnitById(unitId, layout) {
  if (!unitId || !layout) return null
  return getHostLayoutUnits(layout).find((unit) => unit.id === unitId) ?? null
}

export function toSeatingUnitFromLayoutUnit(unit) {
  if (!unit) return null

  return {
    id: unit.id,
    label: unit.displayLabel ?? unit.label,
    area: unit.area ?? '',
    seatedCapacity: unit.seatedCapacity ?? unit.seats ?? 0,
    maxGuestCapacity: unit.maxGuestCapacity ?? unit.seats ?? 0,
    type: unit.unitType ?? SEATING_UNIT_TYPES.TABLE,
  }
}
