import { getReservationDateKey } from './floorAssignmentMapping'
import { toSeatingUnitFromLayoutUnit } from './hostFloorPlanLayout'
import {
  normalizeReservationStatus,
  isTerminalReservationStatus,
} from './reservationHostStatus'
import { parseTimeToMinutes } from './shiftHoursUtils'
import {
  formatHostListUnitLabel,
  getReservationAssignedUnitsForMatching,
  seatingUnitMatchesFloorUnit,
} from './seatingAssignment'

export const DEFAULT_RESERVATION_DURATION_MINUTES = 120
export const RESERVATION_TURNOVER_BUFFER_MINUTES = 15
const SERVICE_DAY_EARLY_MORNING_CUTOFF = 360

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

function toServiceDayMinutes(timeValue) {
  const minutes = parseTimeToMinutes(timeValue)
  if (minutes === null) return null
  return minutes < SERVICE_DAY_EARLY_MORNING_CUTOFF ? minutes + 1440 : minutes
}

export function buildReservationBlockedInterval(
  timeValue,
  durationMinutes = DEFAULT_RESERVATION_DURATION_MINUTES,
  bufferMinutes = RESERVATION_TURNOVER_BUFFER_MINUTES,
) {
  const start = toServiceDayMinutes(timeValue)
  if (start === null) return null

  return {
    start,
    end: start + durationMinutes + bufferMinutes,
  }
}

export function reservationBlockedIntervalsOverlap(leftInterval, rightInterval) {
  if (!leftInterval || !rightInterval) return false
  return leftInterval.start < rightInterval.end && rightInterval.start < leftInterval.end
}

function reservationBlocksTableAvailability(reservation) {
  return !isTerminalReservationStatus(reservation?.status)
}

function resolveOccupiedUnitId(unit, layoutUnits) {
  const layoutUnit = layoutUnits.find((entry) => seatingUnitMatchesFloorUnit(unit, entry))
  return layoutUnit?.id ?? unit.id
}

export function getConflictingUnitIds(
  reservations,
  dateKey,
  timeValue,
  {
    excludeReservationId = null,
    layout = null,
    durationMinutes = DEFAULT_RESERVATION_DURATION_MINUTES,
    bufferMinutes = RESERVATION_TURNOVER_BUFFER_MINUTES,
  } = {},
) {
  const conflicts = new Map()
  const normalizedDateKey = `${dateKey ?? ''}`.slice(0, 10)
  if (!normalizedDateKey) return conflicts

  const candidateInterval = buildReservationBlockedInterval(timeValue, durationMinutes, bufferMinutes)
  if (!candidateInterval) return conflicts

  const layoutUnits = layout ? (layout.units ?? layout.tables ?? []) : []

  reservations.forEach((reservation) => {
    if (getReservationDateKey(reservation) !== normalizedDateKey) return
    if (excludeReservationId && String(reservation.id) === String(excludeReservationId)) return
    if (!reservationBlocksTableAvailability(reservation)) return

    const existingInterval = buildReservationBlockedInterval(
      reservation.time,
      durationMinutes,
      bufferMinutes,
    )
    if (!reservationBlockedIntervalsOverlap(candidateInterval, existingInterval)) return

    getReservationAssignedUnitsForMatching(reservation).forEach((unit) => {
      const unitId = resolveOccupiedUnitId(unit, layoutUnits)
      if (!unitId) return

      conflicts.set(unitId, {
        reservationId: reservation.id,
        guestName: reservation.guestName,
        time: reservation.time,
        status: normalizeReservationStatus(reservation.status),
      })
    })
  })

  return conflicts
}

/** @deprecated Use getConflictingUnitIds with reservation time instead. */
export function getOccupiedUnitIds(reservations, todayKey, excludeReservationId = null, layout = null) {
  return getConflictingUnitIds(reservations, todayKey, '00:00', {
    excludeReservationId,
    layout,
    durationMinutes: 1440,
    bufferMinutes: 0,
  })
}

export function isUnitSelectable(unitId, conflictingUnitIds, selectedUnitIds) {
  if (selectedUnitIds.some((id) => unitIdsMatch(id, unitId))) return true
  return !conflictingUnitIds.has(unitId)
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
