import { toSeatingUnitFromLayoutUnit } from './hostFloorPlanLayout'
import {
  DEFAULT_RESERVATION_DURATION_MINUTES,
  RESERVATION_TURNOVER_BUFFER_MINUTES,
} from './reservationConstants'
import {
  normalizeReservationStatus,
  isTerminalReservationStatus,
} from './reservationHostStatus'
import { resolveReservationBlockedInterval, reservationMatchesTableDayViewSeating } from './reservationSeatings'
import { parseTimeToMinutes } from './shiftHoursUtils'
import { normalizeReservationDateKey } from './timeFormatUtils'
import {
  dedupeAssignedUnits,
  formatHostListUnitLabel,
  getReservationAssignedUnitsForMatching,
  seatingUnitMatchesFloorUnit,
} from './seatingAssignment'

export { DEFAULT_RESERVATION_DURATION_MINUTES, RESERVATION_TURNOVER_BUFFER_MINUTES } from './reservationConstants'
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
    durationMinutes = null,
    bufferMinutes = RESERVATION_TURNOVER_BUFFER_MINUTES,
    seatingId = null,
    seatingsById = new Map(),
  } = {},
) {
  const conflicts = new Map()
  const normalizedDateKey = `${dateKey ?? ''}`.slice(0, 10)
  if (!normalizedDateKey) return conflicts

  const selectedSeating = seatingId ? seatingsById.get(seatingId) : null
  const seatingsList = seatingsById.size > 0 ? [...seatingsById.values()] : []
  const candidateTime = selectedSeating?.startTime ?? timeValue
  const candidateDuration = durationMinutes
    ?? (selectedSeating ? selectedSeating.durationMinutes : DEFAULT_RESERVATION_DURATION_MINUTES)

  const candidateInterval = buildReservationBlockedInterval(
    candidateTime,
    candidateDuration,
    bufferMinutes,
  )
  if (!candidateInterval) return conflicts

  const layoutUnits = layout ? (layout.units ?? layout.tables ?? []) : []

  reservations.forEach((reservation) => {
    if (normalizeReservationDateKey(reservation) !== normalizedDateKey) return
    if (excludeReservationId && String(reservation.id) === String(excludeReservationId)) return
    if (!reservationBlocksTableAvailability(reservation)) return

    if (
      selectedSeating
      && seatingsList.length > 0
      && !reservationMatchesTableDayViewSeating(
        reservation,
        selectedSeating,
        normalizedDateKey,
        seatingsList,
      )
    ) {
      return
    }

    const blocked = resolveReservationBlockedInterval(reservation, seatingsById, {
      fallbackDurationMinutes: DEFAULT_RESERVATION_DURATION_MINUTES,
    })
    if (!blocked?.timeValue) return

    const existingInterval = buildReservationBlockedInterval(
      blocked.timeValue,
      blocked.durationMinutes,
      bufferMinutes,
    )
    if (!reservationBlockedIntervalsOverlap(candidateInterval, existingInterval)) return

    getReservationAssignedUnitsForMatching(reservation).forEach((unit) => {
      const unitId = resolveOccupiedUnitId(unit, layoutUnits)
      if (!unitId) return

      const guests = Math.max(0, Number(reservation.guests ?? reservation.party_size) || 0)
      conflicts.set(unitId, {
        reservationId: reservation.id,
        guestName: reservation.guestName ?? reservation.guest_name ?? '',
        time: blocked.timeValue,
        guests,
        status: normalizeReservationStatus(reservation.status),
        seatingId: blocked.seatingId,
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
  return dedupeAssignedUnits(
    assignedUnits
      .map((unit) => {
        const layoutUnit = findLayoutUnit(layout, unit.id)
        return layoutUnit ? toSeatingUnitFromLayoutUnit(layoutUnit) : unit
      })
      .filter(Boolean),
  )
}

export function toggleAssignedUnit(assignedUnits, unit) {
  const normalizedUnits = dedupeAssignedUnits(assignedUnits)
  const exists = normalizedUnits.some((entry) => (
    unitIdsMatch(entry.id, unit.id)
    || seatingUnitMatchesFloorUnit(entry, unit)
  ))

  if (exists) {
    return normalizedUnits.filter((entry) => (
      !unitIdsMatch(entry.id, unit.id)
      && !seatingUnitMatchesFloorUnit(entry, unit)
    ))
  }

  return dedupeAssignedUnits([...normalizedUnits, unit])
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
