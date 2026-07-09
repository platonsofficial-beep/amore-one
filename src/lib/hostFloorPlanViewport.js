import { getFloorUnitMatchKeys, getReservationSeatingAssignment, normalizeUnitKey, seatingUnitMatchesFloorUnit } from './seatingAssignment'
import { reservationOccupiesFloorTables } from './reservationHostStatus'

const DEFAULT_HALF_PERCENT = 6.5
const FIT_BOUNDS_INSET_X = 2.5
const FIT_BOUNDS_INSET_Y_TOP = 2.5
const FIT_BOUNDS_INSET_Y_BOTTOM = 4
export const HOST_FLOOR_MIN_ZOOM = 0.65
export const HOST_FLOOR_MAX_ZOOM = 2.4

export const RESERVATION_LINK_STROKE = 'rgba(232, 196, 110, 0.88)'

export const RESERVATION_LINK_PALETTE = [
  {
    id: 'gold',
    colorClass: 'link-tone-gold',
    stroke: RESERVATION_LINK_STROKE,
    glow: 'rgba(212, 175, 55, 0.42)',
  },
  {
    id: 'sky',
    colorClass: 'link-tone-sky',
    stroke: 'rgba(142, 166, 212, 0.78)',
    glow: 'rgba(142, 166, 212, 0.28)',
  },
  {
    id: 'mint',
    colorClass: 'link-tone-mint',
    stroke: 'rgba(115, 184, 109, 0.78)',
    glow: 'rgba(115, 184, 109, 0.28)',
  },
  {
    id: 'violet',
    colorClass: 'link-tone-violet',
    stroke: 'rgba(167, 139, 212, 0.78)',
    glow: 'rgba(167, 139, 212, 0.28)',
  },
]

export function getTableHalfExtents(table, halfPercent = DEFAULT_HALF_PERCENT) {
  const halfW = table.widthPercent ? table.widthPercent / 2 : halfPercent
  const halfH = table.heightPercent
    ? table.heightPercent / 2
    : table.widthPercent
      ? table.widthPercent / 2
      : halfPercent

  return { halfW, halfH }
}

export function getTablesBoundingBox(tables, halfPercent = DEFAULT_HALF_PERCENT) {
  if (!tables?.length) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  tables.forEach((table) => {
    const { halfW, halfH } = getTableHalfExtents(table, halfPercent)
    minX = Math.min(minX, table.x - halfW)
    minY = Math.min(minY, table.y - halfH)
    maxX = Math.max(maxX, table.x + halfW)
    maxY = Math.max(maxY, table.y + halfH)
  })

  const safeMinX = Math.max(minX, FIT_BOUNDS_INSET_X)
  const safeMinY = Math.max(minY, FIT_BOUNDS_INSET_Y_TOP)
  const safeMaxX = Math.min(maxX, 100 - FIT_BOUNDS_INSET_X)
  const safeMaxY = Math.min(maxY, 100 - FIT_BOUNDS_INSET_Y_BOTTOM)
  const safeWidth = Math.max(safeMaxX - safeMinX, 8)
  const safeHeight = Math.max(safeMaxY - safeMinY, 8)

  return {
    minX: safeMinX,
    minY: safeMinY,
    maxX: safeMaxX,
    maxY: safeMaxY,
    width: safeWidth,
    height: safeHeight,
    centerX: (safeMinX + safeMaxX) / 2,
    centerY: (safeMinY + safeMaxY) / 2,
  }
}

export function computeHostFloorFit({
  viewportWidth,
  viewportHeight,
}) {
  if (!viewportWidth || !viewportHeight) {
    return { zoom: 1, pan: { x: 0, y: 0 } }
  }

  // Published layout space is already sized via CSS aspect-ratio.
  // Do not apply a second fit-to-table-bounds zoom layer.
  return { zoom: 1, pan: { x: 0, y: 0 } }
}

export function orderTablesForReservationLink(tables) {
  if (!tables?.length) return []

  return [...tables].sort((left, right) => {
    const yDiff = Number(left.y) - Number(right.y)
    if (Math.abs(yDiff) > 0.01) return yDiff
    return Number(left.x) - Number(right.x)
  })
}

export function orderPointsForReservationLink(points) {
  if (points.length <= 2) return points

  return orderTablesForReservationLink(
    points.map((point, index) => ({ id: index, x: point.x, y: point.y })),
  ).map((entry) => ({ x: entry.x, y: entry.y }))
}

function buildTableLookup(tableStates) {
  const tablesById = new Map()
  const tablesByLabel = new Map()

  tableStates.forEach(({ table }) => {
    if (!table) return

    tablesById.set(String(table.id), table)

    getFloorUnitMatchKeys(table).forEach((key) => {
      tablesByLabel.set(key, table)
    })
  })

  return { tablesById, tablesByLabel }
}

function assignedUnitMatchesTable(unit, table) {
  return seatingUnitMatchesFloorUnit(unit, table)
}

function resolveAssignedTable(unit, tablesById, tablesByLabel, tablesOnFloor = []) {
  if (!unit) return null

  const byId = tablesById.get(String(unit.id ?? ''))
  if (byId) return byId

  const labelKey = normalizeUnitKey(unit.label)
  if (labelKey) {
    const byLabel = tablesByLabel.get(labelKey)
    if (byLabel) return byLabel
  }

  return tablesOnFloor.find((table) => seatingUnitMatchesFloorUnit(unit, table)) ?? null
}

function buildLinkPoints(tables) {
  return tables
    .map((table) => getTableLinkCenter(table))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
}

export function getTableLinkCenter(table) {
  const x = Number(table?.x)
  const y = Number(table?.y)

  // Host layout stores x/y as table centers in 0–100 canvas space
  // (see objectCenterPercent in builderToHostLayout).
  return { x, y }
}

function resolveOrderedTablesForGroup(group, tablesById, tablesByLabel) {
  const assignedUnits = getReservationSeatingAssignment(group.reservation).assignedUnits ?? []
  const seenTableIds = new Set()
  let resolved = []

  if (assignedUnits.length >= 2) {
    resolved = assignedUnits
      .map((unit) => (
        resolveAssignedTable(unit, tablesById, tablesByLabel, group.tablesOnFloor)
        ?? group.tablesOnFloor.find((table) => assignedUnitMatchesTable(unit, table))
        ?? null
      ))
      .filter((table) => {
        if (!table || seenTableIds.has(table.id)) return false
        seenTableIds.add(table.id)
        return true
      })
  }

  group.tablesOnFloor.forEach((table) => {
    if (seenTableIds.has(table.id)) return
    seenTableIds.add(table.id)
    resolved.push(table)
  })

  return orderTablesForReservationLink(resolved)
}

function resolveLinkVisualTone(tableStates, reservationId) {
  const phases = tableStates
    .filter((entry) => entry.reservation && String(entry.reservation.id) === String(reservationId))
    .map((entry) => entry.operational?.phase)
    .filter(Boolean)

  if (phases.some((phase) => phase === 'seated' || phase === 'waiting')) {
    return 'link-tone-in-house'
  }

  if (phases.some((phase) => phase === 'upcoming')) {
    return 'link-tone-upcoming'
  }

  return 'link-tone-default'
}

export function buildReservationLinkGroups(tableStates) {
  const { tablesById, tablesByLabel } = buildTableLookup(tableStates)
  const groupsByReservation = new Map()

  tableStates.forEach(({ table, reservation }) => {
    if (!reservation || !reservationOccupiesFloorTables(reservation.status)) return

    const key = String(reservation.id)
    if (!groupsByReservation.has(key)) {
      groupsByReservation.set(key, {
        reservationId: key,
        reservation,
        tablesOnFloor: [],
      })
    }

    const group = groupsByReservation.get(key)
    if (!group.tablesOnFloor.some((entry) => entry.id === table.id)) {
      group.tablesOnFloor.push(table)
    }
  })

  return [...groupsByReservation.values()]
    .filter((group) => group.tablesOnFloor.length >= 2)
    .map((group) => {
      const orderedTables = resolveOrderedTablesForGroup(group, tablesById, tablesByLabel)
      if (orderedTables.length < 2) return null

      const points = buildLinkPoints(orderedTables)
      if (points.length < 2) return null

      return {
        reservationId: group.reservationId,
        tableIds: orderedTables.map((entry) => entry.id),
        points,
        colorClass: resolveLinkVisualTone(tableStates, group.reservationId),
      }
    })
    .filter(Boolean)
}

export function getReservationLinkDebugInfo(tableStates, reservation) {
  const assignedUnits = getReservationSeatingAssignment(reservation).assignedUnits ?? []
  const { tablesById, tablesByLabel } = buildTableLookup(tableStates)
  const tablesOnFloor = tableStates
    .filter((entry) => entry.reservation && String(entry.reservation.id) === String(reservation.id))
    .map((entry) => entry.table)

  const resolvedTables = resolveOrderedTablesForGroup(
    { reservation, tablesOnFloor },
    tablesById,
    tablesByLabel,
  )

  return {
    reservationId: reservation?.id,
    assignedUnitIds: assignedUnits.map((unit) => unit.id),
    tablesOnFloorIds: tablesOnFloor.map((table) => table.id),
    resolvedTableIds: resolvedTables.map((table) => table?.id ?? null),
    computedPoints: buildLinkPoints(resolvedTables),
  }
}

export function buildReservationLinkTableMeta(linkGroups) {
  const meta = new Map()

  linkGroups.forEach((group) => {
    group.tableIds.forEach((tableId, index) => {
      meta.set(tableId, {
        colorClass: group.colorClass,
        isMultiLinked: group.tableIds.length > 1,
        isLinkPrimary: index === 0,
      })
    })
  })

  return meta
}
