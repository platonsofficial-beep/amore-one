function normalizeNumericValue(value) {
  if (value === null || value === undefined || value === '') return null

  const trimmed = `${value}`.trim()
  if (!trimmed) return null
  if (trimmed.toLowerCase() === 'tbd' || trimmed.toLowerCase() === 'n/a') return null

  const cleaned = trimmed.replace(/[$,\s]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

/** Unauthorized editors omit salary entirely; the database preserves it. */
export function resolveEmployeeSalaryForSave({
  canViewSalary = false,
  formSalary = '',
} = {}) {
  return canViewSalary ? normalizeNumericValue(formSalary) : undefined
}
