export function normalizeScheduleDateKey(value) {
  const raw = `${value ?? ''}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

/**
 * Prefer the day the manager clicked. Otherwise use today, even when the open
 * week does not contain today. The first visible day is only a last resort.
 */
export function resolveAddShiftDate({ requestedDate = '', weekDateKeys = [], todayKey = '' } = {}) {
  const keys = (weekDateKeys ?? []).map(normalizeScheduleDateKey).filter(Boolean)
  const requested = normalizeScheduleDateKey(requestedDate)
  if (requested && (keys.length === 0 || keys.includes(requested))) return requested

  const today = normalizeScheduleDateKey(todayKey)
  if (today) return today

  return keys[0] || ''
}
