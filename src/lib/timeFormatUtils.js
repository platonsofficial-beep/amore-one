export function normalizeTimeValue(value) {
  if (!value) return ''

  const raw = `${value}`.trim()
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match) return ''

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return ''
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return ''

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const RESERVATION_QUARTER_MINUTES = [0, 15, 30, 45]

function formatTimeFromMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60) % 24
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function getReservationTimeServiceOrder(value) {
  const normalized = normalizeTimeValue(value)
  if (!normalized) return Number.POSITIVE_INFINITY

  const [hours, minutes] = normalized.split(':').map(Number)
  const dayMinutes = hours * 60 + minutes

  if (dayMinutes >= 9 * 60) return dayMinutes
  return dayMinutes + 24 * 60
}

export function buildReservationTimeOptions() {
  const options = []

  for (let hour = 9; hour <= 23; hour += 1) {
    RESERVATION_QUARTER_MINUTES.forEach((minute) => {
      options.push(formatTimeFromMinutes(hour * 60 + minute))
    })
  }

  for (let hour = 0; hour <= 2; hour += 1) {
    RESERVATION_QUARTER_MINUTES.forEach((minute) => {
      if (hour === 2 && minute > 0) return
      options.push(formatTimeFromMinutes(hour * 60 + minute))
    })
  }

  return options
}

export function getReservationTimeSelectOptions(value) {
  const normalized = normalizeTimeValue(value)
  const options = buildReservationTimeOptions()

  if (normalized && !options.includes(normalized)) {
    return [...options, normalized].sort(
      (left, right) => getReservationTimeServiceOrder(left) - getReservationTimeServiceOrder(right),
    )
  }

  return options
}

export function snapReservationTimeToQuarter(value) {
  const normalized = normalizeTimeValue(value)
  if (!normalized) return ''

  const [hours, minutes] = normalized.split(':').map(Number)
  const totalMinutes = hours * 60 + minutes
  const snapped = Math.round(totalMinutes / 15) * 15
  return formatTimeFromMinutes(snapped)
}

export function normalizeReservationTimeValue(value) {
  return normalizeTimeValue(value)
}

export function parseReservationTimeToMinutes(value) {
  if (value == null || value === '') return null

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.getHours() * 60 + value.getMinutes()
  }

  const raw = `${value}`.trim()
  if (!raw) return null

  if (raw.includes('T')) {
    const parsed = new Date(raw)
    if (Number.isFinite(parsed.getTime())) {
      return parsed.getHours() * 60 + parsed.getMinutes()
    }
  }

  if (raw.includes(' ')) {
    const timePart = raw.split(' ').pop()
    const normalizedFromDateTime = normalizeTimeValue(timePart)
    if (normalizedFromDateTime) {
      const [hours, minutes] = normalizedFromDateTime.split(':').map(Number)
      return hours * 60 + minutes
    }
  }

  const normalized = normalizeTimeValue(raw)
  if (!normalized) return null

  const [hours, minutes] = normalized.split(':').map(Number)
  return hours * 60 + minutes
}

export function getReservationServiceHour(value) {
  const minutes = parseReservationTimeToMinutes(value)
  if (minutes === null) return null
  return Math.floor(minutes / 60)
}

export function formatServiceHourLabel(hour) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return '—'
  return `${String(hour).padStart(2, '0')}:00`
}

export function normalizeReservationDateKey(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return normalizeReservationDateKey(value.date ?? value.reservation_date ?? '')
  }

  const raw = `${value ?? ''}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

export function formatEuropeanDayMonth(dateKey, fallback = '') {
  const normalized = normalizeReservationDateKey(dateKey)
  if (!normalized) return fallback

  const [, month, day] = normalized.split('-').map(Number)
  if (!Number.isFinite(month) || !Number.isFinite(day)) return fallback

  return `${day}/${month}`
}

export function formatHostReservationListTime(reservation, todayKey) {
  const dateKey = normalizeReservationDateKey(reservation?.date ?? reservation?.reservation_date)
  const clock = formatTime24(reservation?.time ?? reservation?.reservation_time) || '—'
  const normalizedToday = normalizeReservationDateKey(todayKey)

  if (dateKey && dateKey !== normalizedToday) {
    const dayMonth = formatEuropeanDayMonth(dateKey)
    return dayMonth ? `${dayMonth} ${clock}` : clock
  }

  return clock
}

export function formatTime24(value, fallback = '—') {
  const normalized = normalizeTimeValue(value)
  return normalized || fallback
}

export function formatTimeRange24(startTime, endTime, separator = ' — ') {
  return `${formatTime24(startTime)}${separator}${formatTime24(endTime)}`
}

export const TIME_INPUT_PROPS = {
  type: 'time',
  lang: 'en-GB',
  step: 60,
  className: 'time-input-24h',
}
