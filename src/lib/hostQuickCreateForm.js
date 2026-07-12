import {
  formatHostListUnitLabel,
  getReservationAssignedUnitsForMatching,
  buildSeatingAssignment,
  computeSeatingAssignmentTotals,
} from './seatingAssignment'
import {
  buildSeatingsById,
  getActiveSeatingsForDate,
  isReservationTimeInSeatingWindow,
  isSeatingActiveOnDate,
  normalizeReservationSeating,
  resolveReservationSeatingId,
  resolveSeatingDuration,
} from './reservationSeatings'
import { formatTableConflictReason } from './tableAvailability'
import {
  getConflictingUnitIds,
  getLayoutUnitsForArea,
  isUnitSelectable,
  toggleAssignedUnit,
  unitIdsMatch,
} from './reservationTableOptions'
import { formatSeatingWindowLabel } from './tableDayView'
import { normalizeReservationDateKey, normalizeReservationTimeValue } from './timeFormatUtils'

export const EMPTY_HOST_QUICK_CREATE_FORM = {
  guestName: '',
  phone: '',
  date: '',
  time: '',
  guests: '2',
  notes: '',
  customerType: 'Regular',
  seatingId: null,
  seatingManuallyOverridden: false,
  recommendedSeatingId: null,
  seatingAreaId: '',
  area: '',
  assignedUnits: [],
  extraChairs: 0,
  tableSelectionNotice: '',
}

export const WALK_IN_NOTES_MARKER = 'walk-in'

export function buildHostWalkInCreatePrefill({ date = '', nowMinutes = 0 } = {}) {
  const roundedMinutes = Math.round(nowMinutes / 15) * 15
  const hours = Math.floor(roundedMinutes / 60) % 24
  const mins = roundedMinutes % 60
  const time = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`

  return {
    date: normalizeReservationDateKey(date),
    time: normalizeReservationTimeValue(time),
  }
}

export function ensureWalkInNotesMarker(notes) {
  const trimmed = `${notes ?? ''}`.trim()
  const lower = trimmed.toLowerCase()

  if (lower.includes('walk-in') || lower.includes('walk in') || lower.includes('walkin')) {
    return trimmed
  }

  return trimmed ? `${trimmed}\n${WALK_IN_NOTES_MARKER}` : WALK_IN_NOTES_MARKER
}

export function resolveHostQuickCreateCreateStatus(form) {
  return form?.walkIn ? 'Walk In' : 'Pending'
}

export function resolveHostQuickCreateCreateNotes(form) {
  const notes = `${form?.notes ?? ''}`.trim()
  return form?.walkIn ? ensureWalkInNotesMarker(notes) : notes
}

export function formatHostQuickCreateSeatingOptionLabel(seating) {
  const normalized = normalizeReservationSeating(seating)
  if (!normalized) return ''
  const windowLabel = formatSeatingWindowLabel(normalized)
  return windowLabel ? `${normalized.name} · ${windowLabel}` : normalized.name
}

export function resolveHostQuickCreateRecommendedSeatingId(dateKey, timeValue, seatings = []) {
  if (!dateKey || !timeValue) return null
  return resolveReservationSeatingId({ date: dateKey, time: timeValue }, seatings, dateKey)
}

export function isHostQuickCreateSeatingValidForContext(seating, dateKey, timeValue) {
  const normalized = normalizeReservationSeating(seating)
  if (!normalized) return false
  if (!isSeatingActiveOnDate(normalized, dateKey)) return false
  if (!timeValue) return true
  return isReservationTimeInSeatingWindow(timeValue, normalized)
}

export function resolveHostQuickCreateAreaSelection(layout, currentAreaId = '', currentAreaLabel = '') {
  const zones = layout?.zones ?? []
  if (zones.length === 1) {
    return {
      seatingAreaId: zones[0].id,
      area: zones[0].label,
    }
  }

  if (currentAreaId && zones.some((zone) => zone.id === currentAreaId)) {
    const zone = zones.find((entry) => entry.id === currentAreaId)
    return {
      seatingAreaId: currentAreaId,
      area: zone?.label ?? currentAreaLabel,
    }
  }

  if (currentAreaLabel) {
    const zone = zones.find((entry) => entry.label === currentAreaLabel)
    if (zone) {
      return {
        seatingAreaId: zone.id,
        area: zone.label,
      }
    }
  }

  return {
    seatingAreaId: '',
    area: '',
  }
}

export function isTableCapacityCompatible(unit, partySize) {
  const guests = Math.max(0, Number(partySize) || 0)
  if (guests === 0) return true

  const max = Number(unit?.maxGuestCapacity ?? unit?.seatedCapacity) || 0
  if (max > 0 && guests > max) return false

  return true
}

export function formatHostQuickCreateTableCapacityLabel(unit) {
  const min = Number(unit?.minGuestCapacity ?? unit?.seatedCapacity) || 0
  const max = Number(unit?.maxGuestCapacity ?? unit?.seatedCapacity) || 0

  if (min > 0 && max > 0 && min !== max) {
    return `${min}–${max} guests`
  }

  if (max > 0) {
    return `${max} guest${max === 1 ? '' : 's'}`
  }

  return ''
}

export function formatHostQuickCreateSelectedTableSummary(assignedUnits = []) {
  if (!Array.isArray(assignedUnits) || assignedUnits.length === 0) return ''
  return assignedUnits
    .map((unit) => formatHostListUnitLabel(unit.label))
    .join(' + ')
}

export function formatHostQuickCreateTableSelectionStatus(assignedUnits = []) {
  const summary = formatHostQuickCreateSelectedTableSummary(assignedUnits)
  if (!summary) return 'No table selected'
  if (assignedUnits.length === 1) return `Selected table · ${summary}`
  return `Selected tables · ${summary}`
}

export function formatHostQuickCreateTableCapacitySummary(assignedUnits = [], partySize = 0, extraChairs = 0) {
  if (!assignedUnits.length) return ''
  const baseTotals = computeSeatingAssignmentTotals(
    buildSeatingAssignment({ assignedUnits, partySize: Number(partySize) || 0, extraChairs: 0 }),
    partySize,
  )
  const extra = Math.max(0, Math.min(1, Number(extraChairs) || 0))
  const guests = baseTotals.guests

  if (extra > 0) {
    return `Capacity ${baseTotals.totalGuestCapacity} + ${extra} chair · Guests ${guests}`
  }

  return `Capacity ${baseTotals.totalGuestCapacity} · Guests ${guests}`
}

export function formatHostQuickCreateTableCompactCapacity(unit) {
  const min = Number(unit?.minGuestCapacity ?? unit?.seatedCapacity) || 0
  const max = Number(unit?.maxGuestCapacity ?? unit?.seatedCapacity) || 0

  if (min > 0 && max > 0 && min !== max) {
    return `👤${min}–${max}`
  }

  if (max > 0) {
    return `👤${max}`
  }

  return ''
}

export function buildHostQuickCreateAvailabilityKey(form, reservations = [], layout = null) {
  if (!form?.date || !form?.seatingId || !form?.seatingAreaId) return ''

  const normalizedDate = normalizeReservationDateKey(form.date)
  if (!normalizedDate) return ''

  const reservationKey = reservations
    .filter((reservation) => normalizeReservationDateKey(reservation) === normalizedDate)
    .map((reservation) => {
      const unitIds = getReservationAssignedUnitsForMatching(reservation)
        .map((unit) => unit.id)
        .sort()
        .join('+')
      return [
        reservation.id,
        reservation.time ?? reservation.start_time ?? '',
        reservation.status ?? '',
        unitIds,
      ].join(':')
    })
    .sort()
    .join('|')

  const layoutKey = (layout?.units ?? layout?.tables ?? [])
    .filter((unit) => unit.zoneId === form.seatingAreaId)
    .map((unit) => [
      unit.id,
      unit.label ?? '',
      unit.seatedCapacity ?? '',
      unit.maxGuestCapacity ?? '',
    ].join('~'))
    .sort()
    .join('+')

  return [
    normalizedDate,
    normalizeReservationTimeValue(form.time) ?? '',
    form.seatingId,
    form.seatingAreaId,
    `${form.guests ?? ''}`,
    layoutKey,
    reservationKey,
  ].join('::')
}

export function formatHostQuickCreateTableOptionLabel(unit, partySize) {
  const label = formatHostListUnitLabel(unit.label)
  const capacityLabel = formatHostQuickCreateTableCapacityLabel(unit)
  const guests = Math.max(0, Number(partySize) || 0)
  if (guests > 0 && capacityLabel) {
    return `${label} · ${capacityLabel}`
  }
  return label
}

export function formatHostQuickCreateTableUnavailableReason(
  unit,
  conflict,
  partySize,
  seatingsById,
  selectedSeatingId,
) {
  if (!isTableCapacityCompatible(unit, partySize)) {
    const max = Number(unit?.maxGuestCapacity ?? unit?.seatedCapacity) || 0
    return max > 0 ? `Capacity ${max}` : 'Capacity mismatch'
  }

  if (!conflict) return 'Unavailable'

  const conflictSeatingId = conflict.seatingId ?? null
  if (
    conflictSeatingId
    && selectedSeatingId
    && String(conflictSeatingId) !== String(selectedSeatingId)
  ) {
    const seatingName = seatingsById.get(conflictSeatingId)?.name ?? 'another seating'
    return `Reserved in ${seatingName}`
  }

  const reason = formatTableConflictReason(conflict)
  if (reason && reason !== 'Unavailable') {
    return reason.includes('Reserved') ? 'Occupied' : reason
  }

  return 'Occupied'
}

export function buildHostQuickCreateTableOptions({
  layout = null,
  reservations = [],
  dateKey = '',
  time = '',
  seatingId = null,
  areaId = '',
  partySize = 0,
  seatings = [],
  assignedUnits = [],
} = {}) {
  if (!seatingId || !areaId) {
    return { options: [], availableCount: 0, canSelect: false }
  }

  const seatingsById = buildSeatingsById(seatings)
  const selectedSeating = seatingsById.get(seatingId)
  const hasSchedulingContext = Boolean(dateKey && (time || selectedSeating))
  if (!hasSchedulingContext) {
    return { options: [], availableCount: 0, canSelect: false }
  }

  const conflictingUnitIds = getConflictingUnitIds(reservations, dateKey, time, {
    layout,
    seatingId,
    seatingsById,
    durationMinutes: selectedSeating ? resolveSeatingDuration(selectedSeating) : undefined,
  })

  const selectedUnitIds = assignedUnits.map((unit) => unit.id)
  const areaUnits = getLayoutUnitsForArea(layout, areaId)

  const options = areaUnits.map((unit) => {
    const conflict = conflictingUnitIds.get(unit.id)
    const isConflictBlocked = !isUnitSelectable(unit.id, conflictingUnitIds, selectedUnitIds)
    const isSelectable = !isConflictBlocked
    const capacityLabel = formatHostQuickCreateTableCompactCapacity(unit)

    return {
      unit,
      isSelectable,
      disabledReason: isSelectable
        ? ''
        : formatHostQuickCreateTableUnavailableReason(
          unit,
          conflict,
          partySize,
          seatingsById,
          seatingId,
        ),
      label: formatHostListUnitLabel(unit.label),
      capacityLabel,
    }
  })

  options.sort((left, right) => {
    if (left.isSelectable !== right.isSelectable) {
      return left.isSelectable ? -1 : 1
    }
    return left.label.localeCompare(right.label, undefined, { numeric: true })
  })

  const visibleAvailableCount = options.filter((entry) => entry.isSelectable).length

  return {
    options,
    availableCount: visibleAvailableCount,
    canSelect: true,
  }
}

export function getHostQuickCreateTableHelperText(form, tableOptions, seatings = [], { layout = null } = {}) {
  if (!form.time) {
    return 'Choose a time first'
  }

  if (!form.seatingId) {
    return 'Choose a seating to view available tables'
  }

  if (!form.seatingAreaId) {
    return 'Choose an area to view available tables'
  }

  const layoutReady = Boolean(layout?.zones?.length)
  if (!layoutReady || !tableOptions.canSelect) {
    return 'Checking availability...'
  }

  if (tableOptions.availableCount === 0 && !(form.assignedUnits?.length > 0)) {
    const seatingName = seatings.find((entry) => entry.id === form.seatingId)?.name ?? 'this seating'
    return `No available tables in this area for ${seatingName}`
  }

  return ''
}

export function createHostQuickCreateFormState(prefill = {}, { todayKey = '', layout = null, seatings = [] } = {}) {
  const date = normalizeReservationDateKey(prefill?.date ?? todayKey)
  const time = normalizeReservationTimeValue(prefill?.time ?? '')
  const recommendedSeatingId = resolveHostQuickCreateRecommendedSeatingId(date, time, seatings)
  const explicitSeatingId = prefill?.seatingId ?? null
  const seatingManuallyOverridden = Boolean(
    prefill?.seatingManuallyOverridden
    || (explicitSeatingId && explicitSeatingId !== recommendedSeatingId),
  )

  let seatingId = explicitSeatingId ?? recommendedSeatingId
  if (
    seatingId
    && !getActiveSeatingsForDate(seatings, date).some((entry) => entry.id === seatingId)
  ) {
    seatingId = null
  }

  const areaSelection = resolveHostQuickCreateAreaSelection(
    layout,
    prefill?.seatingAreaId ?? '',
    prefill?.area ?? '',
  )

  return {
    ...EMPTY_HOST_QUICK_CREATE_FORM,
    ...prefill,
    guestName: `${prefill?.guestName ?? ''}`,
    phone: `${prefill?.phone ?? ''}`,
    date,
    time,
    guests: `${prefill?.guests ?? '2'}`,
    notes: `${prefill?.notes ?? ''}`,
    customerType: `${prefill?.customerType ?? EMPTY_HOST_QUICK_CREATE_FORM.customerType}`,
    seatingId,
    seatingManuallyOverridden,
    recommendedSeatingId,
    seatingAreaId: areaSelection.seatingAreaId,
    area: areaSelection.area,
    assignedUnits: Array.isArray(prefill?.assignedUnits) ? prefill.assignedUnits : [],
    extraChairs: Math.max(0, Math.min(1, Number(prefill?.extraChairs) || 0)),
    tableSelectionNotice: '',
  }
}

function buildHostQuickCreateConflictContext(form, context = {}) {
  const { layout = null, reservations = [], seatings = [] } = context
  const seatingsById = buildSeatingsById(seatings)
  const selectedSeating = form.seatingId ? seatingsById.get(form.seatingId) : null

  return {
    conflictingUnitIds: getConflictingUnitIds(reservations, form.date, form.time, {
      layout,
      seatingId: form.seatingId,
      seatingsById,
      durationMinutes: selectedSeating ? resolveSeatingDuration(selectedSeating) : undefined,
    }),
    areaUnits: getLayoutUnitsForArea(layout, form.seatingAreaId),
  }
}

function isCanonicalQuickCreateAssignmentValid(unit, { conflictingUnitIds, areaUnits }) {
  const layoutUnit = areaUnits.find((entry) => unitIdsMatch(entry.id, unit.id))
  if (!layoutUnit) return false
  return !conflictingUnitIds.has(layoutUnit.id)
}

function formatRemovedQuickCreateTableNotice(removedUnits = []) {
  if (removedUnits.length === 0) return ''
  if (removedUnits.length === 1) {
    return `${formatHostListUnitLabel(removedUnits[0].label)} was removed because it is no longer available.`
  }
  const labels = removedUnits.map((unit) => formatHostListUnitLabel(unit.label)).join(', ')
  return `${labels} were removed because they are no longer available.`
}

function clearInvalidAssignedUnits(form, context) {
  if (!form.assignedUnits.length) {
    return { assignedUnits: [], tableSelectionNotice: '' }
  }

  const { conflictingUnitIds, areaUnits } = buildHostQuickCreateConflictContext(form, context)
  const nextAssignedUnits = []
  const removedUnits = []

  form.assignedUnits.forEach((unit) => {
    const layoutUnit = areaUnits.find((entry) => unitIdsMatch(entry.id, unit.id))
    if (!layoutUnit || conflictingUnitIds.has(layoutUnit.id)) {
      removedUnits.push(unit)
      return
    }
    nextAssignedUnits.push(layoutUnit)
  })

  if (removedUnits.length === 0) {
    return {
      assignedUnits: nextAssignedUnits,
      tableSelectionNotice: form.tableSelectionNotice,
    }
  }

  return {
    assignedUnits: nextAssignedUnits,
    tableSelectionNotice: formatRemovedQuickCreateTableNotice(removedUnits),
  }
}

export function refreshHostQuickCreateAssignedUnits(form, context = {}) {
  if (!form?.assignedUnits?.length) return form
  if (!form.seatingId || !form.seatingAreaId) return form

  const cleared = clearInvalidAssignedUnits(form, context)
  if (
    cleared.assignedUnits.length === form.assignedUnits.length
    && cleared.tableSelectionNotice === form.tableSelectionNotice
  ) {
    return form
  }

  return {
    ...form,
    assignedUnits: cleared.assignedUnits,
    tableSelectionNotice: cleared.tableSelectionNotice || form.tableSelectionNotice,
  }
}

export function syncHostQuickCreateLayoutContext(form, context = {}) {
  const { layout = null, seatings = [] } = context
  if (!form) return form

  let next = { ...form }
  let changed = false

  const recommendedSeatingId = resolveHostQuickCreateRecommendedSeatingId(
    next.date,
    next.time,
    seatings,
  )

  if (next.recommendedSeatingId !== recommendedSeatingId) {
    next.recommendedSeatingId = recommendedSeatingId
    changed = true
  }

  if (!next.seatingManuallyOverridden && next.time && next.seatingId !== recommendedSeatingId) {
    next.seatingId = recommendedSeatingId
    changed = true
  }

  const areaSelection = resolveHostQuickCreateAreaSelection(
    layout,
    next.seatingAreaId,
    next.area,
  )
  if (!next.seatingAreaId && areaSelection.seatingAreaId) {
    next.seatingAreaId = areaSelection.seatingAreaId
    next.area = areaSelection.area
    changed = true
  }

  return changed ? next : form
}

export function applyHostQuickCreateFormPatch(form, patch, context = {}) {
  const { layout = null, seatings = [] } = context
  const assignedUnitsChanged = Object.hasOwn(patch, 'assignedUnits')
  let next = {
    ...form,
    ...patch,
    tableSelectionNotice: assignedUnitsChanged ? (form.tableSelectionNotice ?? '') : '',
  }

  const zones = layout?.zones ?? []
  const dateChanged = Object.hasOwn(patch, 'date')
  const timeChanged = Object.hasOwn(patch, 'time')
  const seatingChanged = Object.hasOwn(patch, 'seatingId')
  const areaChanged = Object.hasOwn(patch, 'seatingAreaId')
  const guestsChanged = Object.hasOwn(patch, 'guests')

  if (assignedUnitsChanged) {
    next.assignedUnits = Array.isArray(patch.assignedUnits) ? patch.assignedUnits : []
    return next
  }

  if (dateChanged) {
    next.date = normalizeReservationDateKey(next.date)
  }

  if (timeChanged) {
    next.time = normalizeReservationTimeValue(next.time)
  }

  if (seatingChanged) {
    next.recommendedSeatingId = resolveHostQuickCreateRecommendedSeatingId(
      next.date,
      next.time,
      seatings,
    )
    if (!next.seatingId) {
      next.seatingManuallyOverridden = false
    } else {
      next.seatingManuallyOverridden = next.seatingId !== next.recommendedSeatingId
    }
    const zone = zones.find((entry) => entry.id === next.seatingAreaId)
    next.area = zone?.label ?? next.area
  }

  if (areaChanged) {
    const zone = zones.find((entry) => entry.id === next.seatingAreaId)
    next.area = zone?.label ?? ''
    next.assignedUnits = []
    next.tableSelectionNotice = ''
  }

  if (dateChanged || timeChanged) {
    next.recommendedSeatingId = resolveHostQuickCreateRecommendedSeatingId(
      next.date,
      next.time,
      seatings,
    )

    if (!next.seatingManuallyOverridden) {
      next.seatingId = next.recommendedSeatingId
    } else if (next.seatingId) {
      const seating = seatings.find((entry) => entry.id === next.seatingId)
      if (!isHostQuickCreateSeatingValidForContext(seating, next.date, next.time)) {
        next.seatingId = null
        next.seatingManuallyOverridden = false
      }
    }
  }

  if ((dateChanged || timeChanged) && !Object.hasOwn(patch, 'seatingAreaId')) {
    const areaSelection = resolveHostQuickCreateAreaSelection(layout, next.seatingAreaId, next.area)
    if (!next.seatingAreaId && areaSelection.seatingAreaId) {
      next.seatingAreaId = areaSelection.seatingAreaId
      next.area = areaSelection.area
      if (form.assignedUnits.length) {
        next.assignedUnits = []
      }
    }
  }

  if (
    seatingChanged
    || dateChanged
    || timeChanged
  ) {
    const cleared = clearInvalidAssignedUnits(next, context)
    next.assignedUnits = cleared.assignedUnits
    if (cleared.tableSelectionNotice) {
      next.tableSelectionNotice = cleared.tableSelectionNotice
    }
  }

  return next
}

export function toggleHostQuickCreateTableSelection(form, unit, context = {}) {
  if (!unit || !form) return form

  const { options } = buildHostQuickCreateTableOptions({
    layout: context.layout,
    reservations: context.reservations,
    dateKey: form.date,
    time: form.time,
    seatingId: form.seatingId,
    areaId: form.seatingAreaId,
    partySize: form.guests,
    seatings: context.seatings,
    assignedUnits: form.assignedUnits,
  })

  const option = options.find((entry) => unitIdsMatch(entry.unit.id, unit.id))
  if (!option) return form

  const normalizedUnit = option.unit
  const isSelected = form.assignedUnits.some((entry) => unitIdsMatch(entry.id, normalizedUnit.id))

  if (isSelected) {
    return {
      ...form,
      assignedUnits: toggleAssignedUnit(form.assignedUnits, normalizedUnit),
      tableSelectionNotice: '',
    }
  }

  if (!option.isSelectable) return form

  return {
    ...form,
    assignedUnits: toggleAssignedUnit(form.assignedUnits, normalizedUnit),
    tableSelectionNotice: '',
  }
}
