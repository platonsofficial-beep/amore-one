function normalizeNumericValue(value) {
  if (value === null || value === undefined || value === '') return null

  const trimmed = `${value}`.trim()
  if (!trimmed) return null
  if (trimmed.toLowerCase() === 'tbd' || trimmed.toLowerCase() === 'n/a') return null

  const cleaned = trimmed.replace(/[$,\s]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Resolve salary for employee create/update payloads.
 * Unauthorized editors must preserve the existing stored salary on edit
 * and must not invent a blank overwrite.
 */
export function resolveEmployeeSalaryForSave({
  canViewSalary = false,
  formSalary = '',
  existingSalary = '',
  isEditing = false,
} = {}) {
  if (canViewSalary) {
    return normalizeNumericValue(formSalary)
  }

  if (isEditing) {
    return normalizeNumericValue(existingSalary)
  }

  return null
}
