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
