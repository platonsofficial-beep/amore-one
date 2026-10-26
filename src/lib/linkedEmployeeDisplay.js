function employeeName(employee) {
  return `${employee?.name ?? employee?.fullName ?? employee?.full_name ?? ''}`.trim()
}

function uniqueNameMatch(employees, candidateNames) {
  const targets = new Set(
    (candidateNames ?? [])
      .map((name) => `${name ?? ''}`.trim().toLowerCase())
      .filter(Boolean),
  )
  if (targets.size === 0) return null

  const matches = (employees ?? []).filter((employee) => {
    const name = employeeName(employee).toLowerCase()
    return name && targets.has(name)
  })
  if (matches.length !== 1) return null
  return employeeName(matches[0]) || null
}

/**
 * Display-only linked employee. A unique name match is shown without writing employee_id.
 */
export function resolveDisplayedLinkedEmployee(employees = [], {
  employeeId = '',
  displayName = '',
  managerName = '',
} = {}) {
  const persistedId = `${employeeId ?? ''}`.trim()
  if (persistedId) {
    const linked = (employees ?? []).find((employee) => String(employee.id) === persistedId)
    const name = employeeName(linked)
    return {
      name: name || null,
      persisted: Boolean(name),
      matchedByName: false,
    }
  }

  const matchedName = uniqueNameMatch(employees, [displayName, managerName])
  return {
    name: matchedName,
    persisted: false,
    matchedByName: Boolean(matchedName),
  }
}
