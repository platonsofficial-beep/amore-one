import {
  enrichReservationWithSeatingAssignment,
  formatHostListTableLabel,
  getReservationSeatingAssignment,
  normalizeUnitKey,
  reservationUsesSeatingUnit,
  seatingUnitMatchesFloorUnit,
} from './seatingAssignment'
import {
  getFloorAssignmentPriority,
  isReservationInHouse,
  isReservationWaiting,
  reservationOccupiesFloorTables,
} from './reservationHostStatus'
import { DEFAULT_RESERVATION_DURATION_MINUTES } from './reservationTableOptions'
import { parseTimeToMinutes } from './shiftHoursUtils'
import { normalizeReservationDateKey } from './timeFormatUtils'

const DEBUG_PREFIX = '[floor-assignment]'
const SERVICE_DAY_EARLY_MORNING_CUTOFF = 360

export function getReservationDateKey(reservation) {
  return normalizeReservationDateKey(reservation)
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

function toServiceDayMinutes(timeValue) {
  const minutes = parseTimeToMinutes(timeValue)
  if (minutes === null) return null
  return minutes < SERVICE_DAY_EARLY_MORNING_CUTOFF ? minutes + 1440 : minutes
}

function toServiceDayNowMinutes(nowMinutes) {
  if (nowMinutes === null || nowMinutes === undefined) return null
  return nowMinutes < SERVICE_DAY_EARLY_MORNING_CUTOFF
    ? nowMinutes + 1440
    : nowMinutes
}

function compareReservationsByTime(left, right) {
  const leftMinutes = toServiceDayMinutes(left?.time) ?? 99999
  const rightMinutes = toServiceDayMinutes(right?.time) ?? 99999
  return leftMinutes - rightMinutes
}

function dedupeReservationsById(reservations) {
  const seen = new Set()

  return reservations.filter((reservation) => {
    if (!reservation || reservation.id === undefined || reservation.id === null) return false
    const reservationId = String(reservation.id)
    if (seen.has(reservationId)) return false
    seen.add(reservationId)
    return true
  })
}

export function getReservationsForFloorTable(
  table,
  reservations,
  todayKey,
  { syncWithList = false, floorUnits = [] } = {},
) {
  if (!table?.id) return []

  const tableId = String(table.id)
  const enrichedReservations = (reservations ?? []).map((reservation) => (
    enrichReservationWithSeatingAssignment(reservation)
  ))

  const matched = enrichedReservations.filter((reservation) => {
    if (!isReservationEligibleForFloor(reservation, todayKey, { syncWithList })) return false
    if (!reservationHasAssignedTables(reservation)) return false

    const assignedUnits = getAssignedUnitsForReservation(reservation)
    const matchesViaFloorMap = assignedUnits.some((unit) => {
      const floorUnit = findFloorUnitForAssignedUnit(unit, floorUnits)
      return floorUnit && String(floorUnit.id) === tableId
    })

    if (matchesViaFloorMap) return true

    return reservationUsesSeatingUnit(reservation, table)
  })

  return dedupeReservationsById(matched.sort(compareReservationsByTime))
}

export function pickHighlightedFloorTableReservation(reservations, nowMinutes, todayKey) {
  if (!reservations?.length) return null

  const inHouse = reservations.find((reservation) => (
    isReservationInHouse(reservation)
    || isReservationWaiting(reservation, todayKey, nowMinutes)
  ))
  if (inHouse) return inHouse

  const nowKey = toServiceDayNowMinutes(nowMinutes)
  if (nowKey === null) return reservations[0]

  const activeByWindow = reservations.find((reservation) => {
    const start = toServiceDayMinutes(reservation.time)
    if (start === null) return false
    const end = start + DEFAULT_RESERVATION_DURATION_MINUTES
    return nowKey >= start && nowKey < end
  })
  if (activeByWindow) return activeByWindow

  const upcoming = reservations
    .map((reservation) => ({ reservation, start: toServiceDayMinutes(reservation.time) }))
    .filter(({ start }) => start !== null && start >= nowKey)
    .sort((left, right) => left.start - right.start)
  if (upcoming.length > 0) return upcoming[0].reservation

  const past = reservations
    .map((reservation) => ({ reservation, start: toServiceDayMinutes(reservation.time) }))
    .filter(({ start }) => start !== null && start < nowKey)
    .sort((left, right) => right.start - left.start)

  return past[0]?.reservation ?? reservations[0]
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
