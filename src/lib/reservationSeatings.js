import { DEFAULT_RESERVATION_DURATION_MINUTES } from './reservationConstants'
import {
  normalizeReservationTimeValue,
  parseReservationTimeToMinutes,
} from './timeFormatUtils'

function formatMinutesAsTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60) % 24
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export const CUSTOM_SEATING_VALUE = '__custom__'

const ALL_DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6]

export function normalizeDaysOfWeek(days) {
  if (!Array.isArray(days)) return [...ALL_DAYS_OF_WEEK]

  const normalized = [...new Set(
    days
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  )].sort((left, right) => left - right)

  return normalized.length > 0 ? normalized : [...ALL_DAYS_OF_WEEK]
}

export function normalizeReservationSeatingInput(record) {
  if (!record) return null

  const name = `${record.name ?? ''}`.trim()
  if (!name) return null

  const startTime = normalizeReservationTimeValue(record.startTime ?? record.start_time ?? '')
  if (!startTime) return null

  const durationMinutes = Math.max(
    15,
    Math.min(480, Number(record.durationMinutes ?? record.duration_minutes) || DEFAULT_RESERVATION_DURATION_MINUTES),
  )

  return {
    name,
    startTime,
    durationMinutes,
    daysOfWeek: normalizeDaysOfWeek(record.daysOfWeek ?? record.days_of_week),
    sortOrder: Math.max(0, Number(record.sortOrder ?? record.sort_order) || 0),
    isActive: record.isActive ?? record.is_active ?? true,
    workspaceId: record.workspaceId ?? record.workspace_id ?? '',
  }
}

export function validateReservationSeatingForm(form) {
  const name = `${form?.name ?? ''}`.trim()
  if (!name) {
    return { ok: false, error: 'Seating name is required.' }
  }

  const startTime = normalizeReservationTimeValue(form?.startTime ?? form?.start_time ?? '')
  if (!startTime) {
    return { ok: false, error: 'Start time is required.' }
  }

  const durationMinutes = Number(form?.durationMinutes ?? form?.duration_minutes)
  if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) {
    return { ok: false, error: 'Duration must be between 15 and 480 minutes.' }
  }

  const rawDays = form?.daysOfWeek ?? form?.days_of_week
  if (!Array.isArray(rawDays) || rawDays.length === 0) {
    return { ok: false, error: 'Select at least one day of the week.' }
  }

  const daysOfWeek = normalizeDaysOfWeek(rawDays)
  if (daysOfWeek.length === 0) {
    return { ok: false, error: 'Select at least one day of the week.' }
  }

  return {
    ok: true,
    seating: {
      name,
      startTime,
      durationMinutes: Math.max(15, Math.min(480, durationMinutes)),
      daysOfWeek,
      sortOrder: Math.max(0, Number(form?.sortOrder ?? form?.sort_order) || 0),
      isActive: form?.isActive ?? form?.is_active ?? true,
    },
  }
}

export function serializeReservationSeatingRow(seating, workspaceId) {
  const normalized = normalizeReservationSeatingInput(seating)
  if (!normalized) {
    throw new Error('Seating details are invalid.')
  }

  return {
    workspace_id: workspaceId,
    name: normalized.name,
    start_time: normalized.startTime,
    duration_minutes: normalized.durationMinutes,
    days_of_week: normalized.daysOfWeek,
    sort_order: normalized.sortOrder,
    is_active: normalized.isActive,
  }
}

export function normalizeReservationSeating(record) {
  if (!record) return null

  const id = `${record.id ?? ''}`.trim()
  if (!id) return null

  const input = normalizeReservationSeatingInput(record)
  if (!input) return null

  return {
    id,
    ...input,
    workspaceId: record.workspaceId ?? record.workspace_id ?? input.workspaceId,
    createdAt: record.createdAt ?? record.created_at ?? null,
    updatedAt: record.updatedAt ?? record.updated_at ?? null,
  }
}

export function sortReservationSeatings(seatings = []) {
  return [...seatings]
    .map((entry) => normalizeReservationSeating(entry))
    .filter(Boolean)
    .sort((left, right) => (
      (left.sortOrder - right.sortOrder)
      || left.startTime.localeCompare(right.startTime)
      || left.name.localeCompare(right.name)
    ))
}

export function buildSeatingsById(seatings = []) {
  const map = new Map()
  sortReservationSeatings(seatings).forEach((seating) => {
    map.set(seating.id, seating)
  })
  return map
}

export function getDayOfWeekFromDateKey(dateKey) {
  const normalized = `${dateKey ?? ''}`.slice(0, 10)
  if (!normalized) return null

  const parsed = new Date(`${normalized}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.getDay()
}

export function isSeatingActiveOnDate(seating, dateKey) {
  const normalized = normalizeReservationSeating(seating)
  if (!normalized?.isActive) return false

  const dayOfWeek = getDayOfWeekFromDateKey(dateKey)
  if (dayOfWeek === null) return false
  return normalized.daysOfWeek.includes(dayOfWeek)
}

export function getActiveSeatingsForDate(seatings = [], dateKey) {
  return sortReservationSeatings(seatings).filter((seating) => (
    isSeatingActiveOnDate(seating, dateKey)
  ))
}

export function resolveHostStationInitialSeatingId(activeSeatings = [], nowMinutes = 0) {
  const sorted = sortReservationSeatings(activeSeatings)
  if (sorted.length === 0) return null

  const startEntries = sorted
    .map((seating) => ({
      id: seating.id,
      startMinutes: parseReservationTimeToMinutes(seating.startTime),
    }))
    .filter((entry) => entry.startMinutes !== null)

  if (startEntries.length === 0) return sorted[0].id

  const currentMinutes = Number(nowMinutes)
  if (!Number.isFinite(currentMinutes)) return sorted[0].id

  const firstStart = startEntries[0].startMinutes
  const lastStart = startEntries[startEntries.length - 1].startMinutes

  if (currentMinutes < firstStart) return startEntries[0].id
  if (currentMinutes >= lastStart) return startEntries[startEntries.length - 1].id

  let bestId = startEntries[0].id
  let bestStart = startEntries[0].startMinutes
  let bestDistance = Math.abs(currentMinutes - bestStart)

  for (let index = 1; index < startEntries.length; index += 1) {
    const { id, startMinutes } = startEntries[index]
    const distance = Math.abs(currentMinutes - startMinutes)
    if (distance < bestDistance || (distance === bestDistance && startMinutes > bestStart)) {
      bestId = id
      bestStart = startMinutes
      bestDistance = distance
    }
  }

  return bestId
}

export function isReservationTimeInSeatingWindow(timeValue, seating) {
  const normalizedTime = normalizeReservationTimeValue(timeValue)
  if (!normalizedTime) return false

  const normalized = normalizeReservationSeating(seating) ?? normalizeReservationSeatingInput(seating)
  if (!normalized) return false

  const startMinutes = parseReservationTimeToMinutes(normalized.startTime)
  const timeMinutes = parseReservationTimeToMinutes(normalizedTime)
  if (startMinutes === null || timeMinutes === null) return false

  const durationMinutes = Math.max(15, Number(normalized.durationMinutes) || DEFAULT_RESERVATION_DURATION_MINUTES)
  const endMinutes = startMinutes + durationMinutes

  if (endMinutes <= 1440) {
    return timeMinutes >= startMinutes && timeMinutes < endMinutes
  }

  const wrappedEnd = endMinutes % 1440
  return timeMinutes >= startMinutes || timeMinutes < wrappedEnd
}

export function matchReservationTimeToSeating(timeValue, dateKey, seatings = []) {
  const normalizedTime = normalizeReservationTimeValue(timeValue)
  if (!normalizedTime) return null

  const activeSeatings = getActiveSeatingsForDate(seatings, dateKey)
  const matches = activeSeatings.filter((seating) => (
    isReservationTimeInSeatingWindow(normalizedTime, seating)
  ))

  if (matches.length === 0) return null
  if (matches.length === 1) return matches[0]

  return sortReservationSeatings(matches)[0] ?? null
}

export function resolveReservationSeatingId(reservation, seatings = [], dateKey = null) {
  const resolvedDateKey = dateKey ?? reservation?.date ?? reservation?.reservation_date ?? ''
  const activeSeatings = getActiveSeatingsForDate(seatings, resolvedDateKey)
  const activeSeatingIds = new Set(activeSeatings.map((entry) => entry.id))

  const explicitSeatingId = reservation?.seatingId ?? reservation?.seating_id ?? null
  if (explicitSeatingId && activeSeatingIds.has(explicitSeatingId)) {
    return explicitSeatingId
  }

  const matched = matchReservationTimeToSeating(
    reservation?.time ?? reservation?.reservation_time,
    resolvedDateKey,
    seatings,
  )
  return matched?.id ?? null
}

export function reservationMatchesTableDayViewSeating(
  reservation,
  seating,
  dateKey,
  seatings = [],
) {
  const normalizedSeating = normalizeReservationSeating(seating)
  if (!normalizedSeating) return false

  const resolvedSeatingId = resolveReservationSeatingId(reservation, seatings, dateKey)
  if (!resolvedSeatingId) return false

  return String(resolvedSeatingId) === String(normalizedSeating.id)
}

export function resolveSeatingDuration(seating, fallback = DEFAULT_RESERVATION_DURATION_MINUTES) {
  const normalized = normalizeReservationSeating(seating)
  if (!normalized) return fallback
  return normalized.durationMinutes
}

export function resolveReservationBlockedInterval(
  reservation,
  seatingsById = new Map(),
  {
    fallbackDurationMinutes = DEFAULT_RESERVATION_DURATION_MINUTES,
  } = {},
) {
  const seatingId = reservation?.seatingId ?? reservation?.seating_id ?? null
  const seating = seatingId ? seatingsById.get(seatingId) : null
  const timeValue = normalizeReservationTimeValue(
    seating?.startTime ?? reservation?.time ?? reservation?.reservation_time,
  )

  if (!timeValue) return null

  const durationMinutes = seating
    ? resolveSeatingDuration(seating)
    : fallbackDurationMinutes

  return {
    timeValue,
    durationMinutes,
    seatingId: seating?.id ?? seatingId ?? null,
  }
}

export function buildSeatingFormDefaults(seating = null) {
  const normalized = normalizeReservationSeating(seating)
  if (!normalized) {
    return {
      name: '',
      startTime: '19:00',
      durationMinutes: DEFAULT_RESERVATION_DURATION_MINUTES,
      daysOfWeek: [...ALL_DAYS_OF_WEEK],
      sortOrder: 0,
      isActive: true,
    }
  }

  return {
    name: normalized.name,
    startTime: normalized.startTime,
    durationMinutes: normalized.durationMinutes,
    daysOfWeek: [...normalized.daysOfWeek],
    sortOrder: normalized.sortOrder,
    isActive: normalized.isActive,
  }
}

export const DAY_OF_WEEK_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

export const SEATING_TIME_INTERVAL_MINUTES = 15

export function getSeatingWindowTimeOptions(seating, { intervalMinutes = SEATING_TIME_INTERVAL_MINUTES } = {}) {
  const normalized = normalizeReservationSeating(seating) ?? normalizeReservationSeatingInput(seating)
  if (!normalized) return []

  const startMinutes = parseReservationTimeToMinutes(normalized.startTime)
  if (startMinutes === null) return []

  const safeInterval = Math.max(5, Number(intervalMinutes) || SEATING_TIME_INTERVAL_MINUTES)
  const lastStart = startMinutes + normalized.durationMinutes - safeInterval
  const options = []

  for (let minute = startMinutes; minute <= lastStart; minute += safeInterval) {
    options.push(formatMinutesAsTime(minute))
  }

  return options
}

export function formatSeatingChipLabel(seating) {
  const normalized = normalizeReservationSeating(seating) ?? normalizeReservationSeatingInput(seating)
  if (!normalized) return ''
  return `${normalized.name} · ${normalized.startTime}`
}

export function formatSeatingDaysLabel(daysOfWeek = []) {
  const normalized = normalizeDaysOfWeek(daysOfWeek)
  if (normalized.length === ALL_DAYS_OF_WEEK.length) return 'Every day'

  return normalized
    .map((day) => DAY_OF_WEEK_OPTIONS.find((entry) => entry.value === day)?.label ?? '')
    .filter(Boolean)
    .join(', ')
}
