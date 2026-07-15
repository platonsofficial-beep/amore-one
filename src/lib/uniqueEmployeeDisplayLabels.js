/**
 * Build compact, unambiguous display labels for Staff Availability cards:
 * full first name + shortest unique surname prefix.
 *
 * Comparison-only normalization: trim, collapse whitespace, case-fold,
 * and strip combining marks (accents/diacritics).
 * Presentation: Proper Case first name + Proper Case surname prefix + ".".
 */

function toCodePoints(value) {
  return Array.from(`${value ?? ''}`)
}

export function normalizeEmployeeNameForComparison(value) {
  return `${value ?? ''}`
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function splitEmployeeDisplayNameParts(fullName = '') {
  const trimmed = `${fullName ?? ''}`.trim().replace(/\s+/g, ' ')
  if (!trimmed) {
    return { firstName: '', surname: '', fullName: '' }
  }

  const parts = trimmed.split(' ')
  if (parts.length === 1) {
    return { firstName: parts[0], surname: '', fullName: trimmed }
  }

  return {
    firstName: parts[0],
    surname: parts.slice(1).join(' '),
    fullName: trimmed,
  }
}

function resolveEmployeeFullName(employee) {
  return `${employee?.full_name || employee?.name || ''}`.trim()
}

function resolveEmployeeKey(employee, index) {
  if (employee?.id != null && `${employee.id}`.trim() !== '') {
    return String(employee.id)
  }
  return `__idx_${index}`
}

function toProperCaseWord(value) {
  const points = toCodePoints(`${value ?? ''}`.trim())
  if (points.length === 0) return ''
  const [first, ...rest] = points
  return `${first.toLocaleUpperCase()}${rest.join('').toLocaleLowerCase()}`
}

function buildLabel(firstName, surname, prefixLength) {
  const safeFirst = toProperCaseWord(firstName) || 'Staff'

  const surnamePoints = toCodePoints(surname)
  if (surnamePoints.length === 0 || prefixLength <= 0) {
    return safeFirst
  }

  const clamped = Math.min(prefixLength, surnamePoints.length)
  const prefix = toProperCaseWord(surnamePoints.slice(0, clamped).join(''))
  return `${safeFirst} ${prefix}.`
}

function resolvePrefixLengths(entries) {
  const lengths = entries.map((entry) => (entry.surnamePoints.length > 0 ? 1 : 0))

  const maxLengths = entries.map((entry) => entry.surnamePoints.length)

  const collisionKey = (index) => {
    const entry = entries[index]
    const prefix = entry.surnamePoints.slice(0, lengths[index]).join('')
    return `${entry.normalizedFirstName}\u0000${normalizeEmployeeNameForComparison(prefix)}`
  }

  let expanded = true
  while (expanded) {
    expanded = false
    const groups = new Map()

    for (let index = 0; index < entries.length; index += 1) {
      const key = collisionKey(index)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(index)
    }

    for (const indexes of groups.values()) {
      if (indexes.length < 2) continue

      for (const index of indexes) {
        if (lengths[index] < maxLengths[index]) {
          lengths[index] += 1
          expanded = true
        }
      }
    }
  }

  return lengths
}

/**
 * @param {Array<object>} employees
 * @returns {Map<string, string>} Map of employee id (or fallback index key) → display label
 */
export function buildUniqueEmployeeDisplayLabels(employees = []) {
  const list = Array.isArray(employees) ? employees : []
  const labels = new Map()

  const prepared = list.map((employee, index) => {
    const key = resolveEmployeeKey(employee, index)
    const rawFullName = resolveEmployeeFullName(employee)
    const { firstName, surname, fullName } = splitEmployeeDisplayNameParts(rawFullName)
    const displayFirstName = firstName || 'Staff'
    const surnamePoints = toCodePoints(surname)
    const normalizedFirstName = normalizeEmployeeNameForComparison(displayFirstName)
    const normalizedSurname = normalizeEmployeeNameForComparison(surname)

    return {
      key,
      firstName: displayFirstName,
      surname,
      surnamePoints,
      fullName: fullName || displayFirstName,
      normalizedFirstName,
      normalizedSurname,
    }
  })

  const groups = new Map()
  for (const entry of prepared) {
    if (!groups.has(entry.normalizedFirstName)) {
      groups.set(entry.normalizedFirstName, [])
    }
    groups.get(entry.normalizedFirstName).push(entry)
  }

  for (const group of groups.values()) {
    const lengths = resolvePrefixLengths(group)
    group.forEach((entry, index) => {
      labels.set(entry.key, buildLabel(entry.firstName, entry.surname, lengths[index]))
    })
  }

  return labels
}
