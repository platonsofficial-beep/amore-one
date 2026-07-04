import { toSeatingUnitFromLayoutUnit } from './hostFloorPlanLayout'
import {
  formatHostListUnitLabel,
  getReservationSeatingAssignment,
  seatingUnitMatchesFloorUnit,
} from './seatingAssignment'

function normalizeReservationStatus(status) {
  return `${status ?? ''}`.trim().toLowerCase()
}

export function getLayoutUnitsForArea(layout, areaId) {
  if (!layout || !areaId) return []

  return (layout.units ?? layout.tables ?? [])
    .filter((unit) => unit.zoneId === areaId)
    .map((unit) => toSeatingUnitFromLayoutUnit(unit))
    .filter(Boolean)
    .sort((left, right) => {
      const leftLabel = formatHostListUnitLabel(left.label)
      const rightLabel = formatHostListUnitLabel(right.label)
      return leftLabel.localeCompare(rightLabel, undefined, { numeric: true })
    })
}

export function getOccupiedUnitIds(reservations, todayKey, excludeReservationId = null, layout = null) {
  const occupied = new Map()
  const layoutUnits = layout ? (layout.units ?? layout.tables ?? []) : []

  reservations.forEach((reservation) => {
    if (`${reservation.date ?? ''}`.slice(0, 10) !== todayKey) return
    if (excludeReservationId && String(reservation.id) === String(excludeReservationId)) return

    const status = normalizeReservationStatus(reservation.status)
    if (status === 'cancelled' || status === 'no show' || status === 'completed') return

    const assignment = getReservationSeatingAssignment(reservation)
    assignment.assignedUnits.forEach((unit) => {
      const layoutUnit = layoutUnits.find((entry) => seatingUnitMatchesFloorUnit(unit, entry))
      const unitId = layoutUnit?.id ?? unit.id
      if (!unitId) return

      occupied.set(unitId, {
        reservationId: reservation.id,
        guestName: reservation.guestName,
      })
    })
  })

  return occupied
}

export function isUnitSelectable(unitId, occupiedUnitIds, selectedUnitIds) {
  if (selectedUnitIds.includes(unitId)) return true
  return !occupiedUnitIds.has(unitId)
}

export function resolveAreaIdForReservation(layout, reservation, assignedUnits = []) {
  if (!layout?.zones?.length) return ''

  if (assignedUnits.length > 0) {
    const firstUnit = (layout.units ?? layout.tables ?? []).find((unit) => unit.id === assignedUnits[0].id)
    if (firstUnit?.zoneId) return firstUnit.zoneId
  }

  const areaLabel = `${reservation?.area ?? ''}`.trim().toLowerCase()
  if (areaLabel) {
    const zone = layout.zones.find((entry) => entry.label.toLowerCase() === areaLabel)
    if (zone) return zone.id
  }

  return layout.zones[0]?.id ?? ''
}

export function unitIdsMatch(leftId, rightId) {
  return String(leftId) === String(rightId)
}

export function findLayoutUnit(layout, unitId) {
  return (layout?.units ?? layout?.tables ?? []).find((unit) => unitIdsMatch(unit.id, unitId)) ?? null
}

export function syncAssignedUnitsWithLayout(layout, assignedUnits = []) {
  return assignedUnits
    .map((unit) => {
      const layoutUnit = findLayoutUnit(layout, unit.id)
      return layoutUnit ? toSeatingUnitFromLayoutUnit(layoutUnit) : unit
    })
    .filter(Boolean)
}

export function toggleAssignedUnit(assignedUnits, unit) {
  const exists = assignedUnits.some((entry) => unitIdsMatch(entry.id, unit.id))
  if (exists) {
    return assignedUnits.filter((entry) => !unitIdsMatch(entry.id, unit.id))
  }
  return [...assignedUnits, unit]
}

export function matchUnitLabelToId(layout, label) {
  const key = `${label ?? ''}`.trim().toLowerCase().replace(/^table\s*/i, '').replace(/^t/, '')
  if (!key) return null

  const unit = (layout?.units ?? layout?.tables ?? []).find((entry) => {
    const unitKey = `${entry.label ?? ''}`.trim().toLowerCase().replace(/^table\s*/i, '').replace(/^t/, '')
    const displayKey = `${entry.displayLabel ?? ''}`.trim().toLowerCase().replace(/^table\s*/i, '').replace(/^t/, '')
    return unitKey === key || displayKey === key
  })

  return unit?.id ?? null
}
