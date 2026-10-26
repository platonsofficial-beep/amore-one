/** Venue calendar. Asia/Nicosia and Europe/Nicosia are the same zone. */
export const NICOSIA_TIME_ZONE = 'Asia/Nicosia'

export function formatLocalDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function resolveWeekTimeZone(timeZone) {
  const trimmed = `${timeZone ?? ''}`.trim()
  return trimmed || NICOSIA_TIME_ZONE
}

export function getDateKeyInTimeZone(date, timeZone = NICOSIA_TIME_ZONE) {
  const resolved = resolveWeekTimeZone(timeZone)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: resolved,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  if (!year || !month || !day) return formatLocalDateKey(date)
  return `${year}-${month}-${day}`
}

export function parseLocalDate(dateKey) {
  const [year, month, day] = `${dateKey ?? ''}`.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date()
  }
  return new Date(year, month - 1, day)
}

function mondayOfCalendarDate(date) {
  const cursor = new Date(date)
  cursor.setHours(12, 0, 0, 0)
  const day = cursor.getDay()
  const diff = cursor.getDate() - day + (day === 0 ? -6 : 1)
  cursor.setDate(diff)
  return formatLocalDateKey(cursor)
}

export function getWeekStartDate(anchor = new Date(), timeZone = '') {
  if (typeof anchor === 'string') {
    return mondayOfCalendarDate(parseLocalDate(anchor))
  }

  const instant = anchor instanceof Date ? anchor : new Date()
  const zone = `${timeZone ?? ''}`.trim()
  if (zone) {
    return mondayOfCalendarDate(parseLocalDate(getDateKeyInTimeZone(instant, zone)))
  }

  return mondayOfCalendarDate(instant)
}

export function getWeekDateKeys(weekStartDate) {
  const start = parseLocalDate(weekStartDate)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return formatLocalDateKey(date)
  })
}

export function getWeekDays(weekStartDate, options = {}) {
  const { shiftCounts = {} } = options

  return getWeekDateKeys(weekStartDate).map((key) => {
    const date = parseLocalDate(key)
    return {
      key,
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      shortDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: Number(shiftCounts[key] ?? 0),
    }
  })
}

export function addWeeks(weekStartDate, weeks) {
  const date = parseLocalDate(weekStartDate)
  date.setDate(date.getDate() + weeks * 7)
  return getWeekStartDate(date)
}

export function addCalendarDays(dateKey, days) {
  const date = parseLocalDate(dateKey)
  date.setDate(date.getDate() + days)
  return formatLocalDateKey(date)
}

export function isCurrentWeek(weekStartDate, timeZone = NICOSIA_TIME_ZONE) {
  return weekStartDate === getCurrentWeekStartDate(timeZone)
}

export function formatWeekRange(days) {
  if (!Array.isArray(days) || days.length === 0) return 'No week selected'
  return `${days[0].shortDate} – ${days[days.length - 1].shortDate}`
}

export function formatScheduleDayHeader(dateKey) {
  const date = parseLocalDate(dateKey)
  return {
    weekdayLabel: date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase(),
    weekdayShortLabel: date.toLocaleDateString('en-US', { weekday: 'short' }).replace(/\./g, '').toUpperCase(),
    calendarLabel: `${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}`,
  }
}

export function getCurrentWeekStartDate(timeZone = NICOSIA_TIME_ZONE) {
  return getWeekStartDate(new Date(), resolveWeekTimeZone(timeZone))
}

export function getCurrentWeekDateKeys() {
  return getWeekDateKeys(getCurrentWeekStartDate())
}
