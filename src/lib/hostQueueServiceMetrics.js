import {
  getReservationSeatingAssignment,
  seatingUnitMatchesFloorUnit,
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

const RESERVED_DAY_STATUS_IDS = new Set([
  'Pending',
  'Confirmed',
  'Checked In',
  'Walk In',
  'Late Booking',
  'Waiting',
])

const SEATED_TABLE_STATUS_IDS = new Set([
  'Checked In',
  'Walk In',
  'Checked In (Partial)',
])

export function isReservationExpectedForServiceMetrics(reservation) {
  const status = normalizeReservationStatus(reservation?.status)
  if (EXPECTED_EXCLUDED_STATUS_IDS.has(status)) return false
  if (isReservationInHouseStatus(status)) return false
  return true
}

export function isReservationReservedForDayMetrics(reservation) {
  const status = normalizeReservationStatus(reservation?.status)
  return RESERVED_DAY_STATUS_IDS.has(status)
}

export function isReservationSeatedForTableMetrics(reservation) {
  const status = normalizeReservationStatus(reservation?.status)
  return SEATED_TABLE_STATUS_IDS.has(status)
}

function getAssignedTableIdsForScope(
  reservation,
  layout = null,
  areaFilterId = HOST_QUEUE_ALL_AREAS,
  { includeReservation = () => true } = {},
) {
  if (!includeReservation(reservation)) {
    return new Set()
  }

  const assignment = getReservationSeatingAssignment(reservation)
  const tableIds = new Set()
  const layoutUnits = layout?.tables ?? layout?.units ?? []

  ;(assignment?.assignedUnits ?? []).forEach((unit) => {
    const layoutUnit = layoutUnits.find((entry) => seatingUnitMatchesFloorUnit(unit, entry))
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

export function getExpectedAssignedTableIdsForScope(
  reservation,
  layout = null,
  areaFilterId = HOST_QUEUE_ALL_AREAS,
) {
  return getAssignedTableIdsForScope(
    reservation,
    layout,
    areaFilterId,
    { includeReservation: isReservationExpectedForServiceMetrics },
  )
}

export function getReservedTableIdsForScope(
  reservation,
  layout = null,
  areaFilterId = HOST_QUEUE_ALL_AREAS,
) {
  return getAssignedTableIdsForScope(
    reservation,
    layout,
    areaFilterId,
    { includeReservation: isReservationReservedForDayMetrics },
  )
}

export function getSeatedTableIdsForScope(
  reservation,
  layout = null,
  areaFilterId = HOST_QUEUE_ALL_AREAS,
) {
  return getAssignedTableIdsForScope(
    reservation,
    layout,
    areaFilterId,
    { includeReservation: isReservationSeatedForTableMetrics },
  )
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
  const reservedTableIds = new Set()
  const seatedTableIds = new Set()
  let unplacedSeatedReservations = 0
  let inHouseGuests = 0

  reservations.forEach((reservation) => {
    const guests = Math.max(0, Number(reservation?.guests) || 0)
    const status = normalizeReservationStatus(reservation?.status)

    if (isReservationExpectedForServiceMetrics(reservation)) {
      expectedGuests += guests
    }

    getReservedTableIdsForScope(reservation, layout, areaFilterId)
      .forEach((tableId) => reservedTableIds.add(tableId))

    const seatedIds = getSeatedTableIdsForScope(reservation, layout, areaFilterId)
    seatedIds.forEach((tableId) => seatedTableIds.add(tableId))
    if (isReservationSeatedForTableMetrics(reservation) && seatedIds.size === 0) {
      const seatedAnywhere = areaFilterId !== HOST_QUEUE_ALL_AREAS
        ? getSeatedTableIdsForScope(reservation, layout, HOST_QUEUE_ALL_AREAS)
        : seatedIds
      if (seatedAnywhere.size === 0) {
        unplacedSeatedReservations += 1
      }
    }

    if (isReservationInHouseStatus(status)) {
      inHouseGuests += guests > 0 ? guests : 1
    }
  })

  const totalPublishedTables = countPublishedTablesInScope(layout, areaFilterId)
  const reservedTables = reservedTableIds.size
  const freeTables = Math.max(0, totalPublishedTables - reservedTables)

  return {
    expectedGuests,
    reservedTables,
    totalPublishedTables,
    freeTables,
    seatedTables: seatedTableIds.size + unplacedSeatedReservations,
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

export function buildHostQueueSeatingChipMetricsMap(
  reservations = [],
  {
    seatings = [],
    dateKey = '',
    areaFilterId = HOST_QUEUE_ALL_AREAS,
    layout = null,
  } = {},
) {
  const metricsBySeatingId = {}

  seatings.forEach((seating) => {
    if (!seating?.id) return
    metricsBySeatingId[seating.id] = buildHostQueueServiceMetricsFromReservations(
      reservations,
      {
        selectedSeating: seating,
        seatings,
        dateKey,
        areaFilterId,
        layout,
      },
    )
  })

  return metricsBySeatingId
}

export function formatHostQueueSeatingChipMetricsLine({
  expectedGuests = 0,
  reservedTables = 0,
  seatedTables = 0,
  inHouseGuests = 0,
} = {}) {
  return `👥${expectedGuests} · 🍽${reservedTables} · 🪑${seatedTables} · 👤${inHouseGuests}`
}
