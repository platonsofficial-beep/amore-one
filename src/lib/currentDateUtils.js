import { formatLocalDateKey } from './weekUtils'

function resolveTimeZone(timeZone) {
  const trimmed = `${timeZone ?? ''}`.trim()
  return trimmed || undefined
}

function getHourInTimeZone(date, timeZone) {
  const resolvedTimeZone = resolveTimeZone(timeZone)
  if (!resolvedTimeZone) return date.getHours()

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: resolvedTimeZone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date)

  return Number(parts.find((part) => part.type === 'hour')?.value ?? date.getHours())
}

export function getLocalNow() {
  return new Date()
}

export function getCurrentDateKey(date = getLocalNow(), timeZone = '') {
  const resolvedTimeZone = resolveTimeZone(timeZone)
  if (!resolvedTimeZone) {
    return formatLocalDateKey(date)
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: resolvedTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (year && month && day) {
    return `${year}-${month}-${day}`
  }

  return formatLocalDateKey(date)
}

export function formatCurrentDateLabel(date = getLocalNow(), timeZone = '') {
  const resolvedTimeZone = resolveTimeZone(timeZone)

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(resolvedTimeZone ? { timeZone: resolvedTimeZone } : {}),
  }).format(date)
}

export function getTimeGreeting(date = getLocalNow(), timeZone = '') {
  const hour = getHourInTimeZone(date, timeZone)

  if (hour < 12) return 'Good Morning'
  if (hour < 18) return 'Good Afternoon'
  return 'Good Evening'
}
