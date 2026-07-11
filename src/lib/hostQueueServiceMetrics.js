import { findLayoutUnit } from './reservationTableOptions'
import {
  getReservationSeatingAssignment,
} from './seatingAssignment'
import {
  isReservationInHouseStatus,
  normalizeReservationStatus,
} from './reservationHostStatus'
import {
  buildHostQueueScopeReservations,
  HOST_QUEUE_ALL_AREAS,
} from './hostQueuePipeline'

const EXPECTED_EXCLUDED_STATUS_IDS = new Set([
  'Checked Out',
  'Not Shown',
  'Cancelled',
  'Rejected',
])

export function isReservationExpectedForServiceMetrics(reservation) {
  const status = normalizeReservationStatus(reservation?.status)
  if (EXPECTED_EXCLUDED_STATUS_IDS.has(status)) return false
  if (isReservationInHouseStatus(status)) return false
  return true
}

export function getExpectedAssignedTableIdsForScope(
  reservation,
  layout = null,
  areaFilterId = HOST_QUEUE_ALL_AREAS,
) {
  if (!isReservationExpectedForServiceMetrics(reservation)) {
    return new Set()
  }

  const assignment = getReservationSeatingAssignment(reservation)
  const tableIds = new Set()

  ;(assignment?.assignedUnits ?? []).forEach((unit) => {
    const layoutUnit = findLayoutUnit(layout, unit.id)
    if (!layoutUnit?.id) return

    if (
      areaFilterId !== HOST_QUEUE_ALL_AREAS
      && String(layoutUnit.zoneId) !== String(areaFilterId)
    ) {
      return
    }

    tableIds.add(String(layoutUnit.id))
  })

  return tableIds
}

export function countPublishedTablesInScope(
  layout = null,
  areaFilterId = HOST_QUEUE_ALL_AREAS,
) {
  const tables = layout?.tables ?? layout?.units ?? []
  if (areaFilterId === HOST_QUEUE_ALL_AREAS) {
    return tables.length
  }

  return tables.filter((table) => String(table.zoneId) === String(areaFilterId)).length
}

export function buildHostQueueServiceMetrics(
  reservations = [],
  {
    layout = null,
    areaFilterId = HOST_QUEUE_ALL_AREAS,
  } = {},
) {
  let expectedGuests = 0
  const expectedTableIds = new Set()
  let inHouseGuests = 0

  reservations.forEach((reservation) => {
    const guests = Math.max(0, Number(reservation?.guests) || 0)
    const status = normalizeReservationStatus(reservation?.status)

    if (isReservationExpectedForServiceMetrics(reservation)) {
      expectedGuests += guests
      getExpectedAssignedTableIdsForScope(reservation, layout, areaFilterId)
        .forEach((tableId) => expectedTableIds.add(tableId))
    }

    if (isReservationInHouseStatus(status)) {
      inHouseGuests += guests
    }
  })

  return {
    expectedGuests,
    expectedAssignedTables: expectedTableIds.size,
    totalPublishedTables: countPublishedTablesInScope(layout, areaFilterId),
    inHouseGuests,
  }
}

export function buildHostQueueServiceMetricsFromReservations(
  reservations = [],
  {
    selectedSeating = null,
    seatings = [],
    dateKey = '',
    areaFilterId = HOST_QUEUE_ALL_AREAS,
    layout = null,
  } = {},
) {
  const scopedReservations = buildHostQueueScopeReservations(reservations, {
    selectedSeating,
    seatings,
    dateKey,
    areaFilterId,
    layout,
  })

  return buildHostQueueServiceMetrics(scopedReservations, {
    layout,
    areaFilterId,
  })
}
