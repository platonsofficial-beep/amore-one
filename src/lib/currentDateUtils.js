import { t, uiLocale } from '../i18n/i18n'
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

  return new Intl.DateTimeFormat(uiLocale('en-US'), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(resolvedTimeZone ? { timeZone: resolvedTimeZone } : {}),
  }).format(date)
}

export function getTimeGreeting(date = getLocalNow(), timeZone = '') {
  let hour = getHourInTimeZone(date, timeZone)
  if (!Number.isFinite(hour)) hour = date.getHours()
  // Some engines report midnight as 24 with hour12: false.
  if (hour === 24) hour = 0

  // Hospitality day: morning 05:00–11:59, afternoon 12:00–17:59, evening 18:00–04:59.
  if (hour >= 5 && hour < 12) return t('Good morning')
  if (hour >= 12 && hour < 18) return t('Good afternoon')
  return t('Good evening')
}
