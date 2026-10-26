export function normalizeScheduleDateKey(value) {
  const raw = `${value ?? ''}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

/**
 * Prefer the day the manager clicked. Otherwise stay on the week on screen:
 * today when that week contains it, then the week's first day.
 */
export function resolveAddShiftDate({ requestedDate = '', weekDateKeys = [], todayKey = '' } = {}) {
  const keys = (weekDateKeys ?? []).map(normalizeScheduleDateKey).filter(Boolean)
  const requested = normalizeScheduleDateKey(requestedDate)
  if (requested && (keys.length === 0 || keys.includes(requested))) return requested

  const today = normalizeScheduleDateKey(todayKey)
  if (today && (keys.length === 0 || keys.includes(today))) return today

  return keys[0] || ''
}
