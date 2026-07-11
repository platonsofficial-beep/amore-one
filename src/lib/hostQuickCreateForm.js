import {
  formatHostListUnitLabel,
  getReservationAssignedUnitsForMatching,
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
  seatingId: null,
  seatingManuallyOverridden: false,
  recommendedSeatingId: null,
  seatingAreaId: '',
  area: '',
  assignedUnits: [],
  tableSelectionNotice: '',
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
  return summary ? `Selected table · ${summary}` : 'No table selected'
}

export function buildHostQuickCreateAvailabilityKey(form, reservations = []) {
  if (!form?.date || !form?.seatingId || !form?.seatingAreaId) return ''

  const normalizedDate = normalizeReservationDateKey(form.date)
  if (!normalizedDate) return ''

  return reservations
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
    const capacityCompatible = isTableCapacityCompatible(unit, partySize)
    const isSelectable = isUnitSelectable(unit.id, conflictingUnitIds, selectedUnitIds)
      && capacityCompatible

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
      label: formatHostQuickCreateTableOptionLabel(unit, partySize),
    }
  })

  options.sort((left, right) => {
    if (left.isSelectable !== right.isSelectable) {
      return left.isSelectable ? -1 : 1
    }
    return left.label.localeCompare(right.label, undefined, { numeric: true })
  })

  return {
    options,
    availableCount: options.filter((entry) => entry.isSelectable).length,
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

  if (tableOptions.availableCount === 0) {
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
    seatingId,
    seatingManuallyOverridden,
    recommendedSeatingId,
    seatingAreaId: areaSelection.seatingAreaId,
    area: areaSelection.area,
    assignedUnits: Array.isArray(prefill?.assignedUnits) ? prefill.assignedUnits : [],
    tableSelectionNotice: '',
  }
}

function clearInvalidAssignedUnits(form, context) {
  const { layout, reservations, seatings } = context
  if (!form.assignedUnits.length) {
    return { assignedUnits: [], tableSelectionNotice: form.tableSelectionNotice }
  }

  const { options } = buildHostQuickCreateTableOptions({
    layout,
    reservations,
    dateKey: form.date,
    time: form.time,
    seatingId: form.seatingId,
    areaId: form.seatingAreaId,
    partySize: form.guests,
    seatings,
    assignedUnits: [],
  })

  const validIds = new Set(
    options.filter((entry) => entry.isSelectable).map((entry) => entry.unit.id),
  )
  const nextAssignedUnits = form.assignedUnits.filter((unit) => (
    validIds.has(unit.id)
    || options.some((entry) => unitIdsMatch(entry.unit.id, unit.id) && entry.isSelectable)
  ))

  if (nextAssignedUnits.length === form.assignedUnits.length) {
    return {
      assignedUnits: form.assignedUnits,
      tableSelectionNotice: form.tableSelectionNotice,
    }
  }

  return {
    assignedUnits: nextAssignedUnits,
    tableSelectionNotice: 'Table selection cleared because availability changed.',
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
    if (form.assignedUnits.length) {
      next.tableSelectionNotice = 'Table selection cleared because availability changed.'
    }
    next.assignedUnits = []
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
    || guestsChanged
    || areaChanged
  ) {
    const cleared = clearInvalidAssignedUnits(next, context)
    next.assignedUnits = cleared.assignedUnits
    if (cleared.tableSelectionNotice) {
      next.tableSelectionNotice = cleared.tableSelectionNotice
    }
  }

  if (
    (seatingChanged || dateChanged || timeChanged)
    && next.seatingId
    && next.assignedUnits.length
  ) {
    const cleared = clearInvalidAssignedUnits(next, context)
    next.assignedUnits = cleared.assignedUnits
    if (cleared.tableSelectionNotice) {
      next.tableSelectionNotice = cleared.tableSelectionNotice
    }
  }

  return next
}

export function toggleHostQuickCreateTableSelection(
  form,
  unit,
  context = {},
  { allowMultipleTables = false } = {},
) {
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

  if (allowMultipleTables) {
    if (!isSelected && !option.isSelectable) return form
    return {
      ...form,
      assignedUnits: toggleAssignedUnit(form.assignedUnits, normalizedUnit),
      tableSelectionNotice: '',
    }
  }

  if (isSelected) {
    return {
      ...form,
      assignedUnits: [],
      tableSelectionNotice: '',
    }
  }

  if (!option.isSelectable) return form

  return {
    ...form,
    assignedUnits: [normalizedUnit],
    tableSelectionNotice: '',
  }
}
