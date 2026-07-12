import { stripCustomerTypeFromNotes } from './reservationCustomerType'
import { stripPurposeFromNotes } from './reservationPurpose'

export const SEATING_UNIT_TYPES = {
  TABLE: 'table',
  BAR: 'bar',
  ISLAND: 'island',
  LOUNGE: 'lounge',
}

export const SEATING_ASSIGNMENT_MARKER = '\n@@SEATING@@'

export function createEmptySeatingAssignment() {
  return {
    assignedUnits: [],
    extraChairs: 0,
    standingGuests: 0,
    totalSeatedCapacity: 0,
    totalGuestCapacity: 0,
  }
}

export function normalizeSeatingUnit(unit) {
  if (!unit) return null

  const seatedCapacity = Number(unit.seatedCapacity) || 0
  const maxGuestCapacity = Math.max(
    seatedCapacity,
    Number(unit.maxGuestCapacity) || seatedCapacity,
  )

  return {
    id: `${unit.id ?? ''}`,
    label: `${unit.label ?? ''}`.trim(),
    area: `${unit.area ?? ''}`.trim(),
    seatedCapacity,
    maxGuestCapacity,
    type: unit.type ?? SEATING_UNIT_TYPES.TABLE,
  }
}

function collectAssignedUnitKeys(unit) {
  const normalized = normalizeSeatingUnit(unit)
  if (!normalized) return []

  const keys = new Set()
  const idKey = normalized.id ? normalizeUnitKey(normalized.id) : ''
  const labelKey = normalizeUnitKey(normalized.label)

  if (idKey) keys.add(idKey)
  if (labelKey) keys.add(labelKey)

  return [...keys]
}

export function dedupeAssignedUnits(assignedUnits = []) {
  const seen = new Set()
  const units = []

  assignedUnits.forEach((unit) => {
    const normalized = normalizeSeatingUnit(unit)
    if (!normalized) return

    const keys = collectAssignedUnitKeys(normalized)
    if (!keys.length) return

    if (keys.some((key) => seen.has(key))) return

    keys.forEach((key) => seen.add(key))
    units.push(normalized)
  })

  return units
}

export function computeSeatingAssignmentTotals(assignment, partySize = 0) {
  const assignedUnits = dedupeAssignedUnits(assignment?.assignedUnits ?? [])
  const extraChairs = Math.max(0, Number(assignment?.extraChairs) || 0)
  const standingGuests = Math.max(0, Number(assignment?.standingGuests) || 0)
  const totalSeatedCapacity = assignedUnits.reduce((sum, unit) => sum + unit.seatedCapacity, 0) + extraChairs
  const totalGuestCapacity = assignedUnits.reduce((sum, unit) => sum + unit.maxGuestCapacity, 0) + extraChairs + standingGuests
  const guests = Math.max(0, Number(partySize) || 0)
  const capacityGap = guests - totalGuestCapacity

  return {
    assignedUnits,
    extraChairs,
    standingGuests,
    totalSeatedCapacity,
    totalGuestCapacity,
    guests,
    capacityGap,
    isOverCapacity: capacityGap > 0,
    isUnderCapacity: guests > 0 && totalGuestCapacity < guests,
  }
}

export function buildSeatingAssignment({ assignedUnits = [], extraChairs = 0, standingGuests = 0, partySize = 0 }) {
  const totals = computeSeatingAssignmentTotals({ assignedUnits, extraChairs, standingGuests }, partySize)

  return {
    assignedUnits: totals.assignedUnits,
    extraChairs: totals.extraChairs,
    standingGuests: totals.standingGuests,
    totalSeatedCapacity: totals.totalSeatedCapacity,
    totalGuestCapacity: totals.totalGuestCapacity,
  }
}

export function formatSeatingAssignmentLabels(assignment) {
  const units = dedupeAssignedUnits(assignment?.assignedUnits ?? [])
  if (!units.length) return ''

  return units.map((unit) => unit.label).join(' + ')
}

export function formatHostListTableLabel(reservation) {
  const assignment = getReservationSeatingAssignment(reservation)
  if (assignment?.assignedUnits?.length > 0) {
    return assignment.assignedUnits
      .map((unit) => formatHostListUnitLabel(unit.label))
      .join(' + ')
  }

  const tableNumber = `${reservation?.tableNumber ?? ''}`.trim()
  if (!tableNumber) return '—'

  return tableNumber
    .split('+')
    .map((part) => formatHostListUnitLabel(part))
    .join(' + ')
}

export function formatHostListUnitLabel(label) {
  const raw = `${label ?? ''}`.trim()
  if (!raw) return '—'

  const tableMatch = raw.match(/^table\s+(\d+)$/i)
  if (tableMatch) return `T${tableMatch[1]}`
  if (/^\d+$/.test(raw)) return `T${raw}`

  return raw
}

export function formatHostListTableTooltip(reservation) {
  const assignment = getReservationSeatingAssignment(reservation)
  if (assignment?.assignedUnits?.length > 0) {
    return formatSeatingAssignmentSummary(assignment, reservation.guests)
  }

  const tableNumber = `${reservation?.tableNumber ?? ''}`.trim()
  return tableNumber || 'No table assigned'
}

export function formatHostFloorReservationTooltipMeta(reservation, { guestType = 'Regular' } = {}) {
  const tables = formatHostListTableLabel(reservation)
  const typeLabel = `${guestType ?? 'Regular'}`.trim() || 'Regular'

  if (!tables || tables === '—') return typeLabel
  return `${tables} · ${typeLabel}`
}

export function formatSeatingAssignmentDrawerLabels(assignment) {
  const units = assignment?.assignedUnits ?? []
  if (!units.length) return '—'

  return units.map((unit) => formatHostListUnitLabel(unit.label)).join(' + ')
}

export function formatSeatingAssignmentSummary(assignment, partySize = 0) {
  const totals = computeSeatingAssignmentTotals(assignment, partySize)
  const labels = formatSeatingAssignmentLabels(assignment)
  const parts = [labels]

  if (totals.extraChairs > 0) {
    parts.push(`${totals.extraChairs} extra chair${totals.extraChairs === 1 ? '' : 's'}`)
  }

  if (totals.standingGuests > 0) {
    parts.push(`${totals.standingGuests} standing`)
  }

  return parts.filter(Boolean).join(' · ')
}

export function seatingUnitAllowsStanding(type) {
  return type === SEATING_UNIT_TYPES.BAR
    || type === SEATING_UNIT_TYPES.ISLAND
    || type === SEATING_UNIT_TYPES.LOUNGE
}

export function assignmentAllowsStanding(assignment) {
  const units = assignment?.assignedUnits ?? []
  if (units.length === 0) return false
  return units.every((unit) => seatingUnitAllowsStanding(unit.type))
}

export function encodeSeatingAssignmentInNotes(notes, assignment) {
  const userNotes = stripSeatingAssignmentFromNotes(notes)
  if (!assignment?.assignedUnits?.length) return userNotes

  const payload = JSON.stringify({
    assignedUnits: assignment.assignedUnits,
    extraChairs: assignment.extraChairs ?? 0,
    standingGuests: assignment.standingGuests ?? 0,
    totalSeatedCapacity: assignment.totalSeatedCapacity ?? 0,
    totalGuestCapacity: assignment.totalGuestCapacity ?? 0,
  })

  return userNotes ? `${userNotes}${SEATING_ASSIGNMENT_MARKER}${payload}` : `${SEATING_ASSIGNMENT_MARKER}${payload}`
}

export function stripSeatingAssignmentFromNotes(notes) {
  const value = `${notes ?? ''}`
  const markerIndex = value.indexOf(SEATING_ASSIGNMENT_MARKER)
  if (markerIndex < 0) return value.trim()

  return value.slice(0, markerIndex).trim()
}

export function parseSeatingAssignmentFromNotes(notes) {
  const value = `${notes ?? ''}`
  const markerIndex = value.indexOf(SEATING_ASSIGNMENT_MARKER)
  if (markerIndex < 0) return createEmptySeatingAssignment()

  const raw = value.slice(markerIndex + SEATING_ASSIGNMENT_MARKER.length).trim()
  if (!raw) return createEmptySeatingAssignment()

  try {
    const parsed = JSON.parse(raw)
    return buildSeatingAssignment({
      assignedUnits: (parsed.assignedUnits ?? []).map(normalizeSeatingUnit).filter(Boolean),
      extraChairs: parsed.extraChairs ?? 0,
      standingGuests: parsed.standingGuests ?? 0,
    })
  } catch {
    return createEmptySeatingAssignment()
  }
}

export function enrichReservationWithSeatingAssignment(reservation) {
  if (!reservation) return reservation

  const rawNotes = reservation.notes ?? ''
  const seatingAssignment = getReservationSeatingAssignment({
    ...reservation,
    notes: rawNotes,
  })
  const displayNotes = stripPurposeFromNotes(
    stripCustomerTypeFromNotes(stripSeatingAssignmentFromNotes(rawNotes)),
  )
  const tableNumber = seatingAssignment.assignedUnits.length > 0
    ? formatSeatingAssignmentLabels(seatingAssignment)
    : `${reservation.tableNumber ?? ''}`.trim()

  return {
    ...reservation,
    notes: displayNotes,
    seatingAssignment,
    tableNumber,
  }
}

export function getReservationSeatingAssignment(reservation) {
  if (!reservation) return createEmptySeatingAssignment()

  if (reservation.seatingAssignment?.assignedUnits?.length > 0) {
    return buildSeatingAssignment({
      assignedUnits: reservation.seatingAssignment.assignedUnits,
      extraChairs: reservation.seatingAssignment.extraChairs ?? 0,
      standingGuests: reservation.seatingAssignment.standingGuests ?? 0,
      partySize: reservation.guests,
    })
  }

  const rawNotes = `${reservation.notes ?? ''}`
  if (rawNotes.includes(SEATING_ASSIGNMENT_MARKER)) {
    return parseSeatingAssignmentFromNotes(rawNotes)
  }

  const fromTableNumber = parseTableNumberToAssignedUnits(reservation.tableNumber)
  if (fromTableNumber.length > 0) {
    return buildSeatingAssignment({ assignedUnits: fromTableNumber })
  }

  return createEmptySeatingAssignment()
}

export function normalizeUnitKey(value) {
  const raw = `${value ?? ''}`.trim().toLowerCase()
  if (!raw) return ''

  const embeddedNumber = raw.match(/(?:^|[^0-9a-z])t(?:able)?[\s\-_#]*(\d+)(?:[^0-9]|$)/)
    ?? raw.match(/^(\d+)$/)
  if (embeddedNumber?.[1]) return embeddedNumber[1]

  return raw
    .replace(/^table[\s\-_]*/i, '')
    .replace(/^bar[\s\-_]*/i, '')
    .replace(/^t(?=\d)/, '')
}

export function getFloorUnitMatchKeys(unit) {
  if (!unit) return []

  return [
    normalizeUnitKey(unit.label),
    normalizeUnitKey(unit.displayLabel),
    normalizeUnitKey(unit.id),
  ].filter(Boolean)
}

export function seatingUnitMatchesFloorUnit(assignedUnit, floorUnit) {
  if (!assignedUnit || !floorUnit) return false

  if (assignedUnit.id && floorUnit.id && String(assignedUnit.id) === String(floorUnit.id)) {
    return true
  }

  const assignedKeys = getFloorUnitMatchKeys(assignedUnit)
  if (!assignedKeys.length) return false

  const floorKeys = getFloorUnitMatchKeys(floorUnit)
  return assignedKeys.some((key) => floorKeys.includes(key))
}

function parseTableNumberToAssignedUnits(tableNumber) {
  const raw = `${tableNumber ?? ''}`.trim()
  if (!raw) return []

  const parts = raw.includes('+') ? raw.split('+') : [raw]

  return parts
    .map((part) => normalizeSeatingUnit({ id: '', label: part.trim() }))
    .filter((unit) => unit?.label)
}

export function getReservationAssignedUnitsForMatching(reservation) {
  const assignment = getReservationSeatingAssignment(reservation)
  return dedupeAssignedUnits(assignment.assignedUnits ?? [])
}

export function resolveSeatingDraftUnitIdsForReservation(reservation, layout) {
  const floorUnits = layout?.tables ?? layout?.units ?? []
  if (!reservation || !floorUnits.length) return []

  const assignedUnits = getReservationAssignedUnitsForMatching(reservation)
  if (!assignedUnits.length) return []

  const ids = []
  const seen = new Set()

  assignedUnits.forEach((assignedUnit) => {
    const floorUnit = floorUnits.find((unit) => seatingUnitMatchesFloorUnit(assignedUnit, unit))
    if (!floorUnit?.id) return

    const unitId = String(floorUnit.id)
    if (seen.has(unitId)) return

    seen.add(unitId)
    ids.push(floorUnit.id)
  })

  return ids
}

export function resolveSeatingDraftFromReservation(reservation, layout) {
  const assignment = getReservationSeatingAssignment(reservation)

  return {
    unitIds: resolveSeatingDraftUnitIdsForReservation(reservation, layout),
    extraChairs: assignment.extraChairs ?? 0,
    standingGuests: assignment.standingGuests ?? 0,
  }
}

export function reservationUsesSeatingUnit(reservation, unit) {
  if (!reservation || !unit) return false

  const assignedUnits = getReservationAssignedUnitsForMatching(reservation)
  if (assignedUnits.length === 0) return false

  return assignedUnits.some((entry) => seatingUnitMatchesFloorUnit(entry, unit))
}
