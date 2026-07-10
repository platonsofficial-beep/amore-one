import { toSeatingUnitFromLayoutUnit } from './hostFloorPlanLayout'
import {
  buildSeatingAssignment,
  formatHostListTableLabel,
  formatHostListUnitLabel,
  formatSeatingAssignmentLabels,
  getReservationSeatingAssignment,
  seatingUnitMatchesFloorUnit,
} from './seatingAssignment'
import { getHostReservationQuickActions } from './reservationHostStatus'
import {
  buildReservationBlockedInterval,
  findLayoutUnit,
  reservationBlockedIntervalsOverlap,
} from './reservationTableOptions'
import {
  getActiveSeatingsForDate,
  normalizeReservationSeating,
  resolveReservationBlockedInterval,
} from './reservationSeatings'
import { parseTimeToMinutes } from './shiftHoursUtils'
import { formatTime24, normalizeReservationDateKey } from './timeFormatUtils'
import {
  reservationBlocksTableAvailability,
  resolveSeatingFloorStatus,
} from './tableAvailability'

function formatMinutesAsClock(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function formatSeatingWindowLabel(seating) {
  const normalized = normalizeReservationSeating(seating)
  if (!normalized?.startTime) return ''

  const startMinutes = parseTimeToMinutes(normalized.startTime)
  if (startMinutes === null) return formatTime24(normalized.startTime)

  const endMinutes = startMinutes + Math.max(15, Number(normalized.durationMinutes) || 90)
  return `${formatTime24(normalized.startTime)}–${formatMinutesAsClock(endMinutes)}`
}

export function findAllReservationsForTableSeating(
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
  if (!normalizedSeating || !table) return []

  const normalizedDateKey = normalizeReservationDateKey(dateKey)
  const candidateInterval = buildReservationBlockedInterval(
    normalizedSeating.startTime,
    normalizedSeating.durationMinutes,
  )
  if (!candidateInterval) return []

  const matches = []

  reservations.forEach((reservation) => {
    if (normalizeReservationDateKey(reservation) !== normalizedDateKey) return
    if (excludeReservationId && String(reservation.id) === String(excludeReservationId)) return
    if (!reservationBlocksTableAvailability(reservation.status)) return

    const assignedUnits = getReservationSeatingAssignment(reservation).assignedUnits
    const occupiesTable = assignedUnits.some((unit) => seatingUnitMatchesFloorUnit(unit, table))
    if (!occupiesTable) return

    const blocked = resolveReservationBlockedInterval(reservation, seatingsById)
    if (!blocked?.timeValue) return

    const existingInterval = buildReservationBlockedInterval(
      blocked.timeValue,
      blocked.durationMinutes,
    )
    if (!existingInterval || !reservationBlockedIntervalsOverlap(candidateInterval, existingInterval)) return

    matches.push(reservation)
  })

  return matches
}

export function resolveTableDayViewRowState(reservation, { hasConflict = false } = {}) {
  if (hasConflict) {
    return { state: 'problem', hostIndicator: 'problem' }
  }

  if (!reservation) {
    return { state: 'available', hostIndicator: 'empty' }
  }

  const { hostIndicator } = resolveSeatingFloorStatus(null, reservation)
  const status = `${reservation.status ?? ''}`.trim()

  if (['Checked Out', 'Completed'].includes(status)) {
    return { state: 'completed', hostIndicator: 'finished' }
  }
  if (['Checked In', 'Checked In (Partial)', 'Walk In'].includes(status)) {
    return { state: 'seated', hostIndicator: 'seated' }
  }
  if (status === 'Waiting') {
    return { state: 'arrived', hostIndicator: 'waiting' }
  }
  if (hostIndicator === 'waiting') {
    return { state: 'arrived', hostIndicator: 'waiting' }
  }

  return { state: 'reserved', hostIndicator: hostIndicator || 'confirmed' }
}

export function buildFloorTableDayViewRows(
  table,
  reservations,
  dateKey,
  seatings = [],
  {
    layout = null,
    seatingsById = null,
    nowMinutes = 0,
    todayKey = '',
  } = {},
) {
  const byId = seatingsById ?? new Map(seatings.map((entry) => [entry.id, entry]))
  const activeSeatings = getActiveSeatingsForDate(seatings, dateKey)

  return activeSeatings.map((seating) => {
    const conflicts = findAllReservationsForTableSeating(
      reservations,
      table,
      dateKey,
      seating,
      { layout, seatingsById: byId },
    )
    const hasConflict = conflicts.length > 1
    const reservation = hasConflict ? null : (conflicts[0] ?? null)
    const rowState = resolveTableDayViewRowState(reservation, { hasConflict })
    const assignedTablesLabel = reservation ? formatHostListTableLabel(reservation) : ''
    const quickActions = reservation
      ? getHostReservationQuickActions(reservation, { nowMinutes, todayKey: todayKey || dateKey })
      : []
    const notes = `${reservation?.notes ?? ''}`.trim()
    const hasNotes = Boolean(notes && !notes.startsWith('@@SEATING@@'))

    return {
      seating,
      reservation,
      conflicts,
      hasConflict,
      isAvailable: !reservation && !hasConflict,
      timeWindowLabel: formatSeatingWindowLabel(seating),
      state: rowState.state,
      hostIndicator: rowState.hostIndicator,
      assignedTablesLabel,
      quickActions,
      hasNotes,
      statusLabel: reservation?.status ?? '',
    }
  })
}

export function buildReleaseTableAssignmentUpdate(reservation, table, { layout = null } = {}) {
  const assignment = getReservationSeatingAssignment(reservation)
  const layoutUnit = table?.id && layout ? findLayoutUnit(layout, table.id) : table
  const floorUnit = layoutUnit ? toSeatingUnitFromLayoutUnit(layoutUnit) : table
  const nextUnits = assignment.assignedUnits.filter((unit) => !seatingUnitMatchesFloorUnit(unit, floorUnit))
  const tableLabel = formatHostListUnitLabel(floorUnit?.label ?? table?.label ?? table?.displayLabel ?? 'table')

  return {
    tableLabel,
    isLastTable: assignment.assignedUnits.length > 0 && nextUnits.length === 0,
    assignment: buildSeatingAssignment({
      assignedUnits: nextUnits,
      extraChairs: assignment.extraChairs,
      standingGuests: assignment.standingGuests,
      partySize: reservation?.guests,
    }),
    tableNumber: nextUnits.length > 0 ? formatSeatingAssignmentLabels({
      assignedUnits: nextUnits,
      extraChairs: assignment.extraChairs,
      standingGuests: assignment.standingGuests,
    }) : '',
  }
}

export function buildTableDayViewCreatePrefill({
  table,
  dateKey,
  seating,
  layout = null,
} = {}) {
  const layoutUnit = table?.id && layout ? findLayoutUnit(layout, table.id) : table
  const unit = layoutUnit ? toSeatingUnitFromLayoutUnit(layoutUnit) : null
  const assignedUnits = unit ? [unit] : []
  const assignment = buildSeatingAssignment({ assignedUnits })

  return {
    guestName: '',
    phone: '',
    date: normalizeReservationDateKey(dateKey),
    time: seating?.startTime ?? '',
    guests: '2',
    tableNumber: assignedUnits.length ? formatSeatingAssignmentLabels(assignment) : '',
    seatingId: seating?.id ?? null,
    assignedUnits,
    area: layout?.zones?.find((zone) => zone.id === table?.zoneId)?.label ?? '',
    notes: '',
  }
}

export function shouldOpenTableDayViewOnTableClick({
  isHeatmap = false,
  isHostFloorPickActive = false,
  isAssignmentSelection = false,
} = {}) {
  if (isHeatmap) return false
  if (isHostFloorPickActive) return false
  if (isAssignmentSelection) return false
  return true
}

export function isTableAssignmentSelectionClick({
  selectedReservation = null,
  isHostFloorPickActive = false,
  canAssign = false,
  isPickedForSeating = false,
} = {}) {
  if (isHostFloorPickActive) return true
  if (!selectedReservation) return false
  return canAssign || isPickedForSeating
}
