import { buildUniqueEmployeeDisplayLabels } from './uniqueEmployeeDisplayLabels'

/**
 * Short names for shift chips, unique across the workspace employee list.
 * Full first name, then the shortest surname prefix that tells people apart.
 */
export function buildShiftDisplayNames(employees = []) {
  return buildUniqueEmployeeDisplayLabels(employees)
}

export function lookupShiftDisplayName(labels, employeeId = '', fullName = '') {
  const id = `${employeeId ?? ''}`.trim()
  if (id && labels?.has?.(id)) return labels.get(id)

  const name = `${fullName ?? ''}`.trim()
  if (!name || name === 'Unassigned') return 'Unassigned'

  const solo = buildUniqueEmployeeDisplayLabels([{ id: '__shift_name__', full_name: name }])
  return solo.get('__shift_name__') || name
}
