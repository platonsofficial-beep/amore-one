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

export const TIME_STEP_SECONDS = 900

const RESERVATION_QUARTER_MINUTES = [0, 15, 30, 45]

const CLOCK_24H = Object.freeze({
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatTimeFromMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60) % 24
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function compareTimeValues(left, right) {
  const leftMinutes = parseReservationTimeToMinutes(left)
  const rightMinutes = parseReservationTimeToMinutes(right)
  if (leftMinutes === null && rightMinutes === null) return 0
  if (leftMinutes === null) return 1
  if (rightMinutes === null) return -1
  return leftMinutes - rightMinutes
}

export function buildQuarterHourTimeOptions() {
  const options = []

  for (let hour = 0; hour < 24; hour += 1) {
    RESERVATION_QUARTER_MINUTES.forEach((minute) => {
      options.push(formatTimeFromMinutes(hour * 60 + minute))
    })
  }

  return options
}

export function getTimeSelectOptions(value) {
  const normalized = snapTimeToQuarter(value)
  const options = buildQuarterHourTimeOptions()

  if (normalized && !options.includes(normalized)) {
    return [...options, normalized].sort(compareTimeValues)
  }

  return options
}

export function splitDateTimeLocalValue(value) {
  const trimmed = `${value ?? ''}`.trim()
  if (!trimmed) return { date: '', time: '' }

  if (trimmed.includes('T')) {
    const [date, time] = trimmed.split('T')
    return {
      date: date ?? '',
      time: snapTimeToQuarter(time ?? ''),
    }
  }

  return { date: trimmed.slice(0, 10), time: '' }
}

export function combineDateAndTime(date, time) {
  const datePart = `${date ?? ''}`.trim()
  const timePart = snapTimeToQuarter(time)
  if (!datePart) return ''
  if (!timePart) return datePart
  return `${datePart}T${timePart}`
}

export function snapTimeToQuarter(value) {
  return snapReservationTimeToQuarter(value)
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

export function toDateTimeLocalValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

export function snapDateTimeLocalValue(value) {
  const trimmed = `${value ?? ''}`.trim()
  if (!trimmed) return ''

  const [datePart, timePart] = trimmed.split('T')
  if (!datePart) return trimmed
  if (!timePart) return trimmed

  const snappedTime = snapTimeToQuarter(timePart)
  return `${datePart}T${snappedTime || timePart}`
}

export function formatTimestampTime24(value, fallback = '—') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return new Intl.DateTimeFormat('en-GB', CLOCK_24H).format(date)
}

export function formatTimestampDayAndTime24(value, fallback = '') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback

  const day = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(date)
  const time = new Intl.DateTimeFormat('en-GB', CLOCK_24H).format(date)

  return `${day} ${time}`
}

export function formatTimestampDateTime24(value, { weekday = false } = {}, fallback = '') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback

  return new Intl.DateTimeFormat('en-GB', {
    ...(weekday ? { weekday: 'short' } : {}),
    day: 'numeric',
    month: 'short',
    ...CLOCK_24H,
  }).format(date)
}

export const TIME_INPUT_PROPS = {
  type: 'time',
  lang: 'en-GB',
  step: TIME_STEP_SECONDS,
  className: 'time-input-24h',
}

export const DATETIME_LOCAL_INPUT_PROPS = {
  type: 'datetime-local',
  lang: 'en-GB',
  step: TIME_STEP_SECONDS,
  className: 'time-input-24h',
}
