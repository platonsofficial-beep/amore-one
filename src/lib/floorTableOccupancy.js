import { getReservationDateKey } from './floorAssignmentMapping'
import { getReservationOperationalPhase } from './floorTableOperationalState'
import {
  isReservationInHouseStatus,
  isTerminalReservationStatus,
  normalizeReservationStatus,
} from './reservationHostStatus'
import {
  getReservationAssignedUnitsForMatching,
  seatingUnitMatchesFloorUnit,
} from './seatingAssignment'

/**
 * One selector for portrait tables, landscape chips, and the in-house count.
 * A booking occupies a table on the selected day when it is not finished and
 * its assignment matches the published table by id or label.
 */
export function reservationOccupiesFloorOnDate(reservation, dateKey = '') {
  const normalizedDate = `${dateKey ?? ''}`.slice(0, 10)
  if (!normalizedDate) return false
  if (getReservationDateKey(reservation) !== normalizedDate) return false
  return !isTerminalReservationStatus(reservation?.status)
}

export function reservationIsArrivedOnFloor(reservation, nowMinutes = null, dateKey = '') {
  if (!reservationOccupiesFloorOnDate(reservation, dateKey)) return false
  if (isReservationInHouseStatus(reservation?.status)) return true
  const status = normalizeReservationStatus(reservation?.status)
  if (status === 'Waiting') return true
  return getReservationOperationalPhase(reservation, nowMinutes, dateKey) === 'waiting'
}

export function resolveOccupiedFloorTableId(unit, layoutUnits = []) {
  if (!unit) return ''
  const layoutUnit = layoutUnits.find((entry) => seatingUnitMatchesFloorUnit(unit, entry))
  return `${layoutUnit?.id ?? ''}`.trim()
}

export function collectArrivedFloorTableIds(
  reservations = [],
  {
    layout = null,
    dateKey = '',
    nowMinutes = null,
    areaFilterId = '',
  } = {},
) {
  const layoutUnits = layout?.tables ?? layout?.units ?? []
  const ids = new Set()

  ;(reservations ?? []).forEach((reservation) => {
    if (!reservationIsArrivedOnFloor(reservation, nowMinutes, dateKey)) return

    getReservationAssignedUnitsForMatching(reservation).forEach((unit) => {
      const tableId = resolveOccupiedFloorTableId(unit, layoutUnits)
      if (!tableId) return
      if (areaFilterId && areaFilterId !== '__all__') {
        const table = layoutUnits.find((entry) => String(entry.id) === tableId)
        if (table && String(table.zoneId) !== String(areaFilterId)) return
      }
      ids.add(tableId)
    })
  })

  return ids
}
