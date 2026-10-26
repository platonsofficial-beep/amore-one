export function normalizeScheduleDateKey(value) {
  const raw = `${value ?? ''}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

export function shiftsInWeek(shifts = [], weekDateKeys = []) {
  const keys = new Set((weekDateKeys ?? []).map(normalizeScheduleDateKey).filter(Boolean))
  return (shifts ?? []).filter((shift) => keys.has(normalizeScheduleDateKey(shift?.date ?? shift?.shift_date)))
}
