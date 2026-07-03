import { SEATING_UNIT_TYPES } from './seatingAssignment'

function createTableUnit({
  id,
  label,
  x,
  y,
  seats,
  zoneId,
  shape = 'round',
  area,
}) {
  return {
    id,
    label,
    displayLabel: `Table ${label}`,
    x,
    y,
    seats,
    seatedCapacity: seats,
    maxGuestCapacity: seats,
    unitType: SEATING_UNIT_TYPES.TABLE,
    zoneId,
    shape,
    area,
  }
}

function createSectionUnit({
  id,
  label,
  displayLabel,
  x,
  y,
  zoneId,
  unitType,
  seatedCapacity,
  maxGuestCapacity,
  shape = 'section',
  area,
}) {
  return {
    id,
    label,
    displayLabel: displayLabel ?? label,
    x,
    y,
    seats: seatedCapacity,
    seatedCapacity,
    maxGuestCapacity,
    unitType,
    zoneId,
    shape,
    area,
  }
}

export const HOST_FLOOR_PLAN_LAYOUT = {
  id: 'amore-floor',
  name: 'AMORE',
  zones: [
    {
      id: 'main',
      label: 'Main Dining',
      unitIds: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    },
    {
      id: 'bar',
      label: 'Bar',
      unitIds: ['bar-1-1', 'bar-1-2', 'bar-1-3', 'bar-2-1', 'bar-2-2', 'bar-2-3'],
    },
    {
      id: 'patio',
      label: 'Patio',
      unitIds: ['12', '13', '14'],
    },
    {
      id: 'rooftop',
      label: 'Rooftop',
      unitIds: ['15', '16'],
    },
    {
      id: 'lounge',
      label: 'Lounge',
      unitIds: ['island-101', 'island-102', 'island-103', 'island-104', '18'],
    },
  ],
  units: [
    createTableUnit({ id: '1', label: '1', x: 22, y: 28, seats: 2, zoneId: 'main', shape: 'round', area: 'Main Dining' }),
    createTableUnit({ id: '2', label: '2', x: 34, y: 28, seats: 2, zoneId: 'main', shape: 'round', area: 'Main Dining' }),
    createTableUnit({ id: '3', label: '3', x: 46, y: 28, seats: 4, zoneId: 'main', shape: 'square', area: 'Main Dining' }),
    createTableUnit({ id: '4', label: '4', x: 58, y: 28, seats: 4, zoneId: 'main', shape: 'square', area: 'Main Dining' }),
    createTableUnit({ id: '5', label: '5', x: 22, y: 48, seats: 4, zoneId: 'main', shape: 'square', area: 'Main Dining' }),
    createTableUnit({ id: '6', label: '6', x: 34, y: 48, seats: 4, zoneId: 'main', shape: 'square', area: 'Main Dining' }),
    createTableUnit({ id: '7', label: '7', x: 46, y: 48, seats: 6, zoneId: 'main', shape: 'square', area: 'Main Dining' }),
    createTableUnit({ id: '8', label: '8', x: 58, y: 48, seats: 6, zoneId: 'main', shape: 'square', area: 'Main Dining' }),
    createTableUnit({ id: '9', label: '9', x: 40, y: 72, seats: 8, zoneId: 'main', shape: 'rectangle', area: 'Main Dining' }),

    createSectionUnit({
      id: 'bar-1-1',
      label: '1.1',
      displayLabel: 'Bar 1.1',
      x: 14,
      y: 24,
      zoneId: 'bar',
      unitType: SEATING_UNIT_TYPES.BAR,
      seatedCapacity: 2,
      maxGuestCapacity: 3,
      area: 'Bar',
    }),
    createSectionUnit({
      id: 'bar-1-2',
      label: '1.2',
      displayLabel: 'Bar 1.2',
      x: 34,
      y: 24,
      zoneId: 'bar',
      unitType: SEATING_UNIT_TYPES.BAR,
      seatedCapacity: 2,
      maxGuestCapacity: 3,
      area: 'Bar',
    }),
    createSectionUnit({
      id: 'bar-1-3',
      label: '1.3',
      displayLabel: 'Bar 1.3',
      x: 54,
      y: 24,
      zoneId: 'bar',
      unitType: SEATING_UNIT_TYPES.BAR,
      seatedCapacity: 2,
      maxGuestCapacity: 4,
      area: 'Bar',
    }),
    createSectionUnit({
      id: 'bar-2-1',
      label: '2.1',
      displayLabel: 'Bar 2.1',
      x: 14,
      y: 52,
      zoneId: 'bar',
      unitType: SEATING_UNIT_TYPES.BAR,
      seatedCapacity: 2,
      maxGuestCapacity: 4,
      area: 'Bar',
    }),
    createSectionUnit({
      id: 'bar-2-2',
      label: '2.2',
      displayLabel: 'Bar 2.2',
      x: 34,
      y: 52,
      zoneId: 'bar',
      unitType: SEATING_UNIT_TYPES.BAR,
      seatedCapacity: 2,
      maxGuestCapacity: 4,
      area: 'Bar',
    }),
    createSectionUnit({
      id: 'bar-2-3',
      label: '2.3',
      displayLabel: 'Bar 2.3',
      x: 54,
      y: 52,
      zoneId: 'bar',
      unitType: SEATING_UNIT_TYPES.BAR,
      seatedCapacity: 2,
      maxGuestCapacity: 4,
      area: 'Bar',
    }),

    createTableUnit({ id: '12', label: '12', x: 30, y: 30, seats: 4, zoneId: 'patio', shape: 'round', area: 'Patio' }),
    createTableUnit({ id: '13', label: '13', x: 50, y: 45, seats: 4, zoneId: 'patio', shape: 'round', area: 'Patio' }),
    createTableUnit({ id: '14', label: '14', x: 30, y: 60, seats: 6, zoneId: 'patio', shape: 'square', area: 'Patio' }),
    createTableUnit({ id: '15', label: '15', x: 28, y: 32, seats: 4, zoneId: 'rooftop', shape: 'round', area: 'Rooftop' }),
    createTableUnit({ id: '16', label: '16', x: 52, y: 52, seats: 6, zoneId: 'rooftop', shape: 'rectangle', area: 'Rooftop' }),

    createSectionUnit({
      id: 'island-101',
      label: '101',
      displayLabel: '101',
      x: 16,
      y: 28,
      zoneId: 'lounge',
      unitType: SEATING_UNIT_TYPES.ISLAND,
      seatedCapacity: 2,
      maxGuestCapacity: 4,
      shape: 'island',
      area: 'Lounge',
    }),
    createSectionUnit({
      id: 'island-102',
      label: '102',
      displayLabel: '102',
      x: 36,
      y: 28,
      zoneId: 'lounge',
      unitType: SEATING_UNIT_TYPES.ISLAND,
      seatedCapacity: 2,
      maxGuestCapacity: 4,
      shape: 'island',
      area: 'Lounge',
    }),
    createSectionUnit({
      id: 'island-103',
      label: '103',
      displayLabel: '103',
      x: 56,
      y: 28,
      zoneId: 'lounge',
      unitType: SEATING_UNIT_TYPES.ISLAND,
      seatedCapacity: 2,
      maxGuestCapacity: 4,
      shape: 'island',
      area: 'Lounge',
    }),
    createSectionUnit({
      id: 'island-104',
      label: '104',
      displayLabel: '104',
      x: 76,
      y: 28,
      zoneId: 'lounge',
      unitType: SEATING_UNIT_TYPES.ISLAND,
      seatedCapacity: 2,
      maxGuestCapacity: 4,
      shape: 'island',
      area: 'Lounge',
    }),
    createTableUnit({ id: '18', label: '18', x: 40, y: 62, seats: 2, zoneId: 'lounge', shape: 'round', area: 'Lounge' }),
  ],
}

export function getHostLayoutUnits(layout = HOST_FLOOR_PLAN_LAYOUT) {
  return layout.units ?? layout.tables ?? []
}

export function getHostUnitById(unitId, layout = HOST_FLOOR_PLAN_LAYOUT) {
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

// Backward-compatible alias used throughout App.jsx
export const DEFAULT_FLOOR_PLAN_LAYOUT = {
  ...HOST_FLOOR_PLAN_LAYOUT,
  tables: HOST_FLOOR_PLAN_LAYOUT.units,
  zones: HOST_FLOOR_PLAN_LAYOUT.zones.map((zone) => ({
    ...zone,
    tableIds: zone.unitIds ?? zone.tableIds ?? [],
  })),
}
