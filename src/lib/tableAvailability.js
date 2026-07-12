import {
  getConflictingUnitIds,
} from './reservationTableOptions'
import {
  getActiveSeatingsForDate,
  normalizeReservationSeating,
} from './reservationSeatings'
import { isTerminalReservationStatus, normalizeReservationStatus } from './reservationHostStatus'
import { formatTime24 } from './timeFormatUtils'
import { countPublishedTablesInScope } from './hostQueueServiceMetrics'
import { HOST_QUEUE_ALL_AREAS } from './hostQueuePipeline'

export { getConflictingUnitIds } from './reservationTableOptions'

export function reservationBlocksTableAvailability(status) {
  return !isTerminalReservationStatus(status)
}

function getAssignableTableIdsInScope(layout = null, areaFilterId = HOST_QUEUE_ALL_AREAS) {
  const tables = layout?.tables ?? layout?.units ?? []
  const scopedTables = areaFilterId === HOST_QUEUE_ALL_AREAS
    ? tables
    : tables.filter((table) => String(table.zoneId) === String(areaFilterId))

  return new Set(scopedTables.map((table) => String(table.id)))
}

function filterUnavailableTableIdsToScope(unavailableTableIds, layout = null, areaFilterId = HOST_QUEUE_ALL_AREAS) {
  const assignableTableIds = getAssignableTableIdsInScope(layout, areaFilterId)
  const scopedIds = new Set()

  unavailableTableIds.forEach((tableId) => {
    const normalizedId = String(tableId)
    if (assignableTableIds.has(normalizedId)) {
      scopedIds.add(normalizedId)
    }
  })

  return scopedIds
}

export function buildHostSeatingTableAvailability(
  reservations = [],
  {
    seating = null,
    dateKey = '',
    layout = null,
    areaFilterId = HOST_QUEUE_ALL_AREAS,
    seatingsById = new Map(),
  } = {},
) {
  const totalTables = countPublishedTablesInScope(layout, areaFilterId)
  const conflicts = seating
    ? getConflictingUnitIds(reservations, dateKey, seating.startTime, {
      seatingId: seating.id,
      durationMinutes: seating.durationMinutes,
      seatingsById,
      layout,
    })
    : new Map()

  const unavailableTableIds = filterUnavailableTableIdsToScope(
    new Set(conflicts.keys()),
    layout,
    areaFilterId,
  )
  const unavailableTables = unavailableTableIds.size
  const availableTables = Math.max(0, totalTables - unavailableTables)

  return {
    totalTables,
    unavailableTables,
    availableTables,
    unavailableTableIds,
  }
}

export function formatHostSeatingTableAvailabilityDisplay({
  availableTables = 0,
  totalTables = 0,
} = {}) {
  return `${availableTables}/${totalTables} available`
}

export function formatHostSeatingTableAvailabilityAccessible({
  availableTables = 0,
  totalTables = 0,
} = {}) {
  return `${availableTables} of ${totalTables} tables available`
}

export function formatTableConflictReason(conflict) {
  if (!conflict) return 'Unavailable'

  const parts = []
  if (conflict.time) {
    parts.push(`Reserved at ${formatTime24(conflict.time)}`)
  }
  if (conflict.guests) {
    parts.push(`${conflict.guests} guest${conflict.guests === 1 ? '' : 's'}`)
  }
  if (conflict.guestName) {
    parts.push(conflict.guestName)
  }

  return parts.join(' · ') || 'Unavailable'
}

export function findReservationForTableSeating(
  reservations,
  table,
  dateKey,
  seating,
  {
    layout = null,
    seatingsById = new Map(),
    excludeReservationId = null,
  } = {},
) {
  const normalizedSeating = normalizeReservationSeating(seating)
  if (!normalizedSeating || !table) return null

  const conflicts = getConflictingUnitIds(reservations, dateKey, normalizedSeating.startTime, {
    seatingId: normalizedSeating.id,
    durationMinutes: normalizedSeating.durationMinutes,
    seatingsById,
    layout,
    excludeReservationId,
  })

  const conflict = conflicts.get(table.id)
  if (!conflict?.reservationId) return null

  return reservations.find((reservation) => (
    String(reservation.id) === String(conflict.reservationId)
  )) ?? null
}

export function buildFloorTableSeatingRows(
  table,
  reservations,
  dateKey,
  seatings = [],
  {
    layout = null,
    seatingsById = null,
  } = {},
) {
  const byId = seatingsById ?? new Map(seatings.map((entry) => [entry.id, entry]))
  const activeSeatings = getActiveSeatingsForDate(seatings, dateKey)

  return activeSeatings.map((seating) => {
    const reservation = findReservationForTableSeating(
      reservations,
      table,
      dateKey,
      seating,
      { layout, seatingsById: byId },
    )

    return {
      seating,
      reservation,
      isAvailable: !reservation,
      timeLabel: formatTime24(seating.startTime),
    }
  })
}

export function buildTableSeatingDayIndicators(
  table,
  reservations,
  dateKey,
  seatings = [],
  {
    layout = null,
    seatingsById = null,
  } = {},
) {
  const byId = seatingsById ?? new Map(seatings.map((entry) => [entry.id, entry]))
  const activeSeatings = getActiveSeatingsForDate(seatings, dateKey)

  return activeSeatings.map((seating) => {
    const reservation = findReservationForTableSeating(
      reservations,
      table,
      dateKey,
      seating,
      { layout, seatingsById: byId },
    )
    const { hostIndicator } = resolveSeatingFloorStatus(null, reservation)

    return {
      seatingId: seating.id,
      seatingName: seating.name,
      startTime: seating.startTime,
      state: reservation ? hostIndicator : 'empty',
      reservation,
      ariaLabel: reservation
        ? `${seating.name} · Reserved by ${reservation.guestName || 'Guest'} at ${formatTime24(reservation.time)}`
        : `${seating.name} · Available`,
    }
  })
}

export function resolveSeatingFloorStatus(conflict, reservation) {
  if (!conflict && !reservation) {
    return { floorStatus: 'available', hostIndicator: 'empty' }
  }

  const status = normalizeReservationStatus(reservation?.status ?? conflict?.status ?? 'Pending')
  if (['Checked In', 'Walk In', 'Checked In (Partial)'].includes(status)) {
    return { floorStatus: 'seated', hostIndicator: 'seated' }
  }
  if (status === 'Waiting') {
    return { floorStatus: 'arrived', hostIndicator: 'waiting' }
  }

  return { floorStatus: 'upcoming', hostIndicator: 'confirmed' }
}
