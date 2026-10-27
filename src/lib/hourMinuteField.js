const HOUR_MINUTE = /^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/

export function parseHourMinute(value) {
  const match = `${value ?? ''}`.trim().match(HOUR_MINUTE)
  if (!match) return { hour: '', minute: '' }
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return { hour: '', minute: '' }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return { hour: '', minute: '' }
  return {
    hour: String(hour).padStart(2, '0'),
    minute: String(minute).padStart(2, '0'),
  }
}

export function buildHourOptions() {
  return Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
}

export function buildMinuteOptions(step = 15, currentMinute = '') {
  const safeStep = Number(step)
  const increment = Number.isInteger(safeStep) && safeStep > 0 && safeStep <= 30 ? safeStep : 15
  const minutes = []
  for (let minute = 0; minute < 60; minute += increment) {
    minutes.push(String(minute).padStart(2, '0'))
  }
  const current = `${currentMinute ?? ''}`.trim()
  if (/^\d{2}$/.test(current) && !minutes.includes(current)) {
    minutes.push(current)
    minutes.sort()
  }
  return minutes
}

export function formatHourMinute(hour, minute) {
  const parsed = parseHourMinute(`${hour ?? ''}:${minute ?? ''}`)
  if (!parsed.hour || !parsed.minute) return ''
  return `${parsed.hour}:${parsed.minute}`
}
