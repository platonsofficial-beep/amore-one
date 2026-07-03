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

export function computeSeatingAssignmentTotals(assignment, partySize = 0) {
  const assignedUnits = (assignment?.assignedUnits ?? []).map(normalizeSeatingUnit).filter(Boolean)
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
  const units = assignment?.assignedUnits ?? []
  if (!units.length) return ''

  return units.map((unit) => unit.label).join(' + ')
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

  const seatingAssignment = parseSeatingAssignmentFromNotes(reservation.notes)
  const displayNotes = stripSeatingAssignmentFromNotes(reservation.notes)
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

export function normalizeUnitKey(value) {
  return `${value ?? ''}`.trim().toLowerCase().replace(/^table\s*/i, '').replace(/^bar\s*/i, '').replace(/^t/, '')
}

export function reservationUsesSeatingUnit(reservation, unit) {
  if (!reservation || !unit) return false

  const assignment = reservation.seatingAssignment ?? parseSeatingAssignmentFromNotes(reservation.notes)
  if (assignment.assignedUnits.length > 0) {
    return assignment.assignedUnits.some((entry) => entry.id === unit.id)
  }

  const unitKey = normalizeUnitKey(unit.label)
  const displayKey = normalizeUnitKey(unit.displayLabel)
  const tableKey = normalizeUnitKey(reservation.tableNumber)
  if (!unitKey || !tableKey) return false

  if (tableKey === unitKey || tableKey === displayKey) return true

  return tableKey.split('+').some((part) => {
    const key = normalizeUnitKey(part)
    return key === unitKey || key === displayKey
  })
}
