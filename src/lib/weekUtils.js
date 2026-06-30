export function formatLocalDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseLocalDate(dateKey) {
  const [year, month, day] = `${dateKey ?? ''}`.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date()
  }
  return new Date(year, month - 1, day)
}

export function getWeekStartDate(anchor = new Date()) {
  const date = anchor instanceof Date ? new Date(anchor) : parseLocalDate(anchor)
  date.setHours(0, 0, 0, 0)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  return formatLocalDateKey(date)
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

export function isCurrentWeek(weekStartDate) {
  return weekStartDate === getWeekStartDate(new Date())
}

export function formatWeekRange(days) {
  if (!Array.isArray(days) || days.length === 0) return 'No week selected'
  return `${days[0].shortDate} – ${days[days.length - 1].shortDate}`
}

export function formatScheduleDayHeader(dateKey) {
  const date = parseLocalDate(dateKey)
  return {
    weekdayLabel: date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase(),
    calendarLabel: `${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()}`,
  }
}

export function getCurrentWeekStartDate() {
  return getWeekStartDate(new Date())
}

export function getCurrentWeekDateKeys() {
  return getWeekDateKeys(getCurrentWeekStartDate())
}
