import { DEFAULT_RESERVATION_DURATION_MINUTES } from './reservationConstants'
import { normalizeReservationTimeValue } from './timeFormatUtils'

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

export function normalizeReservationSeating(record) {
  if (!record) return null

  const id = `${record.id ?? ''}`.trim()
  if (!id) return null

  const durationMinutes = Math.max(
    15,
    Math.min(480, Number(record.durationMinutes ?? record.duration_minutes) || DEFAULT_RESERVATION_DURATION_MINUTES),
  )

  return {
    id,
    workspaceId: record.workspaceId ?? record.workspace_id ?? '',
    name: `${record.name ?? ''}`.trim() || 'Seating',
    startTime: normalizeReservationTimeValue(record.startTime ?? record.start_time ?? ''),
    durationMinutes,
    daysOfWeek: normalizeDaysOfWeek(record.daysOfWeek ?? record.days_of_week),
    sortOrder: Math.max(0, Number(record.sortOrder ?? record.sort_order) || 0),
    isActive: record.isActive ?? record.is_active ?? true,
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

export function matchReservationTimeToSeating(timeValue, dateKey, seatings = []) {
  const normalizedTime = normalizeReservationTimeValue(timeValue)
  if (!normalizedTime) return null

  const activeSeatings = getActiveSeatingsForDate(seatings, dateKey)
  return activeSeatings.find((seating) => seating.startTime === normalizedTime) ?? null
}

export function resolveSeatingDuration(seating, fallback = DEFAULT_RESERVATION_DURATION_MINUTES) {
  const normalized = normalizeReservationSeating(seating)
  if (!normalized) return fallback
  return normalized.durationMinutes
}

export function resolveReservationSeatingId(reservation, seatings = []) {
  if (reservation?.seatingId) return reservation.seatingId
  if (reservation?.seating_id) return reservation.seating_id

  const matched = matchReservationTimeToSeating(
    reservation?.time ?? reservation?.reservation_time,
    reservation?.date ?? reservation?.reservation_date,
    seatings,
  )
  return matched?.id ?? null
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

export function formatSeatingDaysLabel(daysOfWeek = []) {
  const normalized = normalizeDaysOfWeek(daysOfWeek)
  if (normalized.length === ALL_DAYS_OF_WEEK.length) return 'Every day'

  return normalized
    .map((day) => DAY_OF_WEEK_OPTIONS.find((entry) => entry.value === day)?.label ?? '')
    .filter(Boolean)
    .join(', ')
}
