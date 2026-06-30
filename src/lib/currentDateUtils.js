import { formatLocalDateKey } from './weekUtils'

export function getLocalNow() {
  return new Date()
}

export function getCurrentDateKey(date = getLocalNow()) {
  return formatLocalDateKey(date)
}

export function formatCurrentDateLabel(date = getLocalNow()) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

export function getTimeGreeting(date = getLocalNow()) {
  const hour = date.getHours()

  if (hour < 12) return 'Good Morning'
  if (hour < 18) return 'Good Afternoon'
  return 'Good Evening'
}
