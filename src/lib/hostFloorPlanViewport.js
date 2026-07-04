import { getReservationSeatingAssignment, normalizeUnitKey } from './seatingAssignment'

const LINKABLE_STATUSES = new Set(['booked', 'arrived', 'seated', 'dining'])

const DEFAULT_HALF_PERCENT = 5.5
const FIT_PADDING = 80
const FIT_ZOOM_SAFETY = 0.94
export const HOST_FLOOR_MIN_ZOOM = 0.65
export const HOST_FLOOR_MAX_ZOOM = 2.4

export const RESERVATION_LINK_PALETTE = [
  {
    id: 'gold',
    colorClass: 'link-tone-gold',
    stroke: 'rgba(232, 196, 110, 0.9)',
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

  const width = Math.max(maxX - minX, 8)
  const height = Math.max(maxY - minY, 8)

  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  }
}

export function computeHostFloorFit({
  tables,
  viewportWidth,
  viewportHeight,
  minZoom = HOST_FLOOR_MIN_ZOOM,
  maxZoom = HOST_FLOOR_MAX_ZOOM,
}) {
  if (!viewportWidth || !viewportHeight) {
    return { zoom: 1, pan: { x: 0, y: 0 } }
  }

  const bounds = getTablesBoundingBox(tables)
  if (!bounds) {
    return { zoom: 1, pan: { x: 0, y: 0 } }
  }

  const contentPxW = (bounds.width / 100) * viewportWidth
  const contentPxH = (bounds.height / 100) * viewportHeight
  const availableW = Math.max(viewportWidth - FIT_PADDING * 2, 1)
  const availableH = Math.max(viewportHeight - FIT_PADDING * 2, 1)

  let zoom = Math.min(availableW / contentPxW, availableH / contentPxH) * FIT_ZOOM_SAFETY
  zoom = Math.min(maxZoom, Math.max(minZoom, zoom))

  const centerPxX = (bounds.centerX / 100) * viewportWidth
  const centerPxY = (bounds.centerY / 100) * viewportHeight

  return {
    zoom,
    pan: {
      x: (viewportWidth / 2 - centerPxX) * zoom,
      y: (viewportHeight / 2 - centerPxY) * zoom,
    },
  }
}

export function orderPointsForReservationLink(points) {
  if (points.length <= 2) return points

  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length

  return [...points].sort((left, right) => (
    Math.atan2(left.y - centerY, left.x - centerX)
    - Math.atan2(right.y - centerY, right.x - centerX)
  ))
}

function buildTableLookup(tableStates) {
  const tablesById = new Map()
  const tablesByLabel = new Map()

  tableStates.forEach(({ table }) => {
    if (!table) return

    tablesById.set(String(table.id), table)

    const labelKey = normalizeUnitKey(table.label)
    const displayKey = normalizeUnitKey(table.displayLabel)
    if (labelKey) tablesByLabel.set(labelKey, table)
    if (displayKey) tablesByLabel.set(displayKey, table)
  })

  return { tablesById, tablesByLabel }
}

function assignedUnitMatchesTable(unit, table) {
  if (!unit || !table) return false
  if (String(unit.id) === String(table.id)) return true

  const unitLabel = normalizeUnitKey(unit.label)
  if (!unitLabel) return false

  return unitLabel === normalizeUnitKey(table.label)
    || unitLabel === normalizeUnitKey(table.displayLabel)
}

function resolveAssignedTable(unit, tablesById, tablesByLabel) {
  if (!unit) return null

  const byId = tablesById.get(String(unit.id ?? ''))
  if (byId) return byId

  const labelKey = normalizeUnitKey(unit.label)
  if (!labelKey) return null

  return tablesByLabel.get(labelKey) ?? null
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

export function buildReservationLinkGroups(tableStates) {
  const { tablesById, tablesByLabel } = buildTableLookup(tableStates)
  const groupsByReservation = new Map()

  tableStates.forEach(({ table, reservation, status }) => {
    if (!reservation || !LINKABLE_STATUSES.has(status)) return

    const assignedUnits = getReservationSeatingAssignment(reservation).assignedUnits ?? []
    if (assignedUnits.length < 2) return

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
    .map((group, index) => {
      const assignedUnits = getReservationSeatingAssignment(group.reservation).assignedUnits ?? []
      const seenTableIds = new Set()
      let orderedTables = assignedUnits
        .map((unit) => (
          resolveAssignedTable(unit, tablesById, tablesByLabel)
          ?? group.tablesOnFloor.find((table) => assignedUnitMatchesTable(unit, table))
          ?? null
        ))
        .filter((table) => {
          if (!table || seenTableIds.has(table.id)) return false
          seenTableIds.add(table.id)
          return true
        })

      if (orderedTables.length < 2) {
        orderedTables = [...group.tablesOnFloor]
          .sort((left, right) => {
            if (left.y !== right.y) return left.y - right.y
            return left.x - right.x
          })
      } else {
        group.tablesOnFloor.forEach((table) => {
          if (seenTableIds.has(table.id)) return
          seenTableIds.add(table.id)
          orderedTables.push(table)
        })
      }

      if (orderedTables.length < 2) return null

      const points = buildLinkPoints(orderedTables)
      if (points.length < 2) return null

      const palette = RESERVATION_LINK_PALETTE[index % RESERVATION_LINK_PALETTE.length]

      return {
        reservationId: group.reservationId,
        assignedUnitIds: assignedUnits.map((unit) => unit.id),
        tableIds: orderedTables.map((entry) => entry.id),
        points,
        colorClass: palette.colorClass,
        stroke: palette.stroke,
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

  const resolvedTables = assignedUnits.map((unit) => (
    resolveAssignedTable(unit, tablesById, tablesByLabel)
    ?? tablesOnFloor.find((table) => assignedUnitMatchesTable(unit, table))
    ?? null
  ))

  return {
    reservationId: reservation?.id,
    assignedUnitIds: assignedUnits.map((unit) => unit.id),
    tablesOnFloorIds: tablesOnFloor.map((table) => table.id),
    resolvedTableIds: resolvedTables.map((table) => table?.id ?? null),
    computedPoints: buildLinkPoints(resolvedTables.filter(Boolean)),
  }
}

export function buildReservationLinkTableMeta(linkGroups) {
  const meta = new Map()

  linkGroups.forEach((group) => {
    group.tableIds.forEach((tableId, index) => {
      meta.set(tableId, {
        colorClass: group.colorClass,
        stroke: group.stroke,
        isMultiLinked: group.tableIds.length > 1,
        isLinkPrimary: index === 0,
      })
    })
  })

  return meta
}
