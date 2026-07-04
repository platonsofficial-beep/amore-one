import {
  enrichReservationWithSeatingAssignment,
  formatHostListTableLabel,
  getReservationSeatingAssignment,
  normalizeUnitKey,
  seatingUnitMatchesFloorUnit,
} from './seatingAssignment'
import {
  getFloorAssignmentPriority,
  reservationOccupiesFloorTables,
} from './reservationHostStatus'

const DEBUG_PREFIX = '[floor-assignment]'

export function getReservationDateKey(reservation) {
  const raw = reservation?.date ?? reservation?.reservation_date ?? ''
  const value = `${raw}`.trim()
  if (!value) return ''
  if (value.includes('T')) return value.split('T')[0]
  return value.slice(0, 10)
}

export function getAssignedUnitsForReservation(reservation) {
  return getReservationSeatingAssignment(reservation).assignedUnits ?? []
}

export function reservationHasAssignedTables(reservation) {
  return getAssignedUnitsForReservation(reservation).length > 0
    || Boolean(`${reservation?.tableNumber ?? ''}`.trim())
}

export function findFloorUnitForAssignedUnit(assignedUnit, floorUnits = []) {
  if (!assignedUnit || !floorUnits.length) return null

  return floorUnits.find((floorUnit) => seatingUnitMatchesFloorUnit(assignedUnit, floorUnit)) ?? null
}

function isReservationEligibleForFloor(reservation, todayKey, { syncWithList = false } = {}) {
  if (!reservationOccupiesFloorTables(reservation?.status)) return false

  if (syncWithList) return true

  return getReservationDateKey(reservation) === todayKey
}

function chooseHigherPriorityReservation(next, current) {
  if (!current) return next
  if (!next) return current

  return getFloorAssignmentPriority(next) >= getFloorAssignmentPriority(current) ? next : current
}

export function buildFloorTableReservationMap({
  layout,
  reservations,
  todayKey,
  syncWithList = false,
  debug = false,
}) {
  const floorUnits = layout?.tables ?? layout?.units ?? []
  const reservationByTableId = new Map()
  const enrichedReservations = (reservations ?? []).map((reservation) => (
    enrichReservationWithSeatingAssignment(reservation)
  ))

  enrichedReservations.forEach((reservation) => {
    if (!isReservationEligibleForFloor(reservation, todayKey, { syncWithList })) return
    if (!reservationHasAssignedTables(reservation)) return

    const assignedUnits = getAssignedUnitsForReservation(reservation)
    const matchedTableIds = []
    const unmatchedUnits = []

    assignedUnits.forEach((unit) => {
      const floorUnit = findFloorUnitForAssignedUnit(unit, floorUnits)
      if (!floorUnit) {
        unmatchedUnits.push(unit)
        return
      }

      matchedTableIds.push(floorUnit.id)
      reservationByTableId.set(
        floorUnit.id,
        chooseHigherPriorityReservation(reservation, reservationByTableId.get(floorUnit.id)),
      )
    })

    if (debug && assignedUnits.length > 0) {
      console.groupCollapsed(`${DEBUG_PREFIX} ${reservation.guestName ?? reservation.id}`)
      console.log('reservationId', reservation.id)
      console.log('dateKey', getReservationDateKey(reservation), 'todayKey', todayKey, 'syncWithList', syncWithList)
      console.log('listTableLabel', formatHostListTableLabel(reservation))
      console.log('assignedUnits', assignedUnits.map((unit) => ({
        id: unit.id,
        label: unit.label,
        keys: [unit.id, unit.label, unit.displayLabel].map(normalizeUnitKey),
      })))
      console.log('matchedTableIds', matchedTableIds)
      console.log('unmatchedUnits', unmatchedUnits.map((unit) => ({
        id: unit.id,
        label: unit.label,
      })))
      console.groupEnd()
    }

    if (debug && assignedUnits.length > 0 && matchedTableIds.length === 0) {
      console.warn(
        `${DEBUG_PREFIX} No floor matches for "${reservation.guestName ?? reservation.id}" `
        + `(list shows "${formatHostListTableLabel(reservation)}"). `
        + `Assigned units:`,
        assignedUnits,
        'Floor unit sample:',
        floorUnits.slice(0, 8).map((unit) => ({
          id: unit.id,
          label: unit.label,
          displayLabel: unit.displayLabel,
          zoneId: unit.zoneId,
          keys: [unit.id, unit.label, unit.displayLabel].map(normalizeUnitKey),
        })),
      )
    }
  })

  return reservationByTableId
}

export function debugFloorAssignmentSnapshot({
  layout,
  reservations,
  todayKey,
  syncWithList = false,
}) {
  if (typeof window === 'undefined') return

  const floorUnits = layout?.tables ?? layout?.units ?? []
  console.info(`${DEBUG_PREFIX} snapshot`, {
    todayKey,
    syncWithList,
    reservationCount: reservations?.length ?? 0,
    floorUnitCount: floorUnits.length,
    floorUnitSample: floorUnits.slice(0, 12).map((unit) => ({
      id: unit.id,
      label: unit.label,
      displayLabel: unit.displayLabel,
      zoneId: unit.zoneId,
    })),
  })

  buildFloorTableReservationMap({
    layout,
    reservations,
    todayKey,
    syncWithList,
    debug: true,
  })
}
