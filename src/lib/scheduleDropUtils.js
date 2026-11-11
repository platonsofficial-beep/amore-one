import { findDepartment, findPosition } from './venueCatalogTemplates'
import { positionLabelsMatch } from './departmentCatalogUtils'

export function getEmployeePositionNames(employee) {
  if (Array.isArray(employee?.positions) && employee.positions.length > 0) {
    return employee.positions.map((position) => position.name).filter(Boolean)
  }

  if (employee?.position) {
    return `${employee.position}`.split(',').map((item) => item.trim()).filter(Boolean)
  }

  return []
}

export function getEmployeeFirstName(employee) {
  const fullName = `${employee?.full_name || employee?.name || ''}`.trim()
  if (!fullName) return 'Staff'
  return fullName.split(/\s+/)[0]
}

export function collectEmployeePositionNames(employee) {
  const names = [
    ...getEmployeePositionNames(employee),
    employee?.primaryPosition,
    ...(Array.isArray(employee?.additionalPositions) ? employee.additionalPositions : []),
  ]

  const unique = []
  const seen = new Set()
  names.forEach((name) => {
    const trimmed = `${name ?? ''}`.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) return
    seen.add(key)
    unique.push(trimmed)
  })
  return unique
}

export function buildSchedulePositionFilterOptions({
  positions = [],
  shifts = [],
  employees = [],
} = {}) {
  const names = new Set()

  ;(positions ?? []).forEach((position) => {
    const name = `${position?.name ?? ''}`.trim()
    if (name) names.add(name)
  })

  ;(shifts ?? []).forEach((shift) => {
    const role = `${shift?.role ?? ''}`.trim()
    if (role) names.add(role)
  })

  ;(employees ?? []).forEach((employee) => {
    collectEmployeePositionNames(employee).forEach((name) => names.add(name))
  })

  return ['All', ...Array.from(names).sort((left, right) => left.localeCompare(right))]
}

function scheduleEmployeePositionNames(employee) {
  const names = [
    ...collectEmployeePositionNames(employee),
    ...(`${employee?.position ?? ''}`.split(',').map((item) => item.trim())),
  ]
  if (Array.isArray(employee?.positions)) {
    employee.positions.forEach((position) => {
      if (typeof position === 'string') names.push(position.trim())
    })
  }
  const unique = []
  const seen = new Set()
  names.forEach((name) => {
    const trimmed = `${name ?? ''}`.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) return
    seen.add(key)
    unique.push(trimmed)
  })
  return unique
}

/** Department dropdown on Staff availability. "All" keeps everyone. */
export function employeeMatchesScheduleDepartment(employee, departmentFilter = 'All') {
  const filter = `${departmentFilter ?? 'All'}`.trim() || 'All'
  if (filter === 'All') return true

  const department = `${employee?.department ?? ''}`.trim()
  const filterDepartment = findDepartment(filter)
  if (!filterDepartment) return department === filter

  const employeeDepartment = findDepartment(department)
  if (!employeeDepartment) return false
  return employeeDepartment.key === filterDepartment.key
}

/**
 * Position dropdown on Staff availability. Matches the person's own
 * position labels, including catalog aliases. "Head Bartender" is not
 * "Bartender".
 */
export function employeeMatchesSchedulePosition(employee, positionFilter = 'All') {
  const filter = `${positionFilter ?? 'All'}`.trim() || 'All'
  if (filter === 'All') return true

  const names = scheduleEmployeePositionNames(employee)
  if (names.length === 0) return false

  const filterPosition = findPosition(filter)
  return names.some((name) => {
    if (positionLabelsMatch(name, filter)) return true
    if (!filterPosition) return false
    const employeePosition = findPosition(name)
    return Boolean(employeePosition && employeePosition.key === filterPosition.key)
  })
}

/** Staff-row and assign-card filters. Department, position, and name search all apply. */
export function filterScheduleStaffEmployees(employees = [], {
  department = 'All',
  position = 'All',
  search = '',
} = {}) {
  const needle = `${search ?? ''}`.trim().toLowerCase()
  return (employees ?? []).filter((employee) => {
    if (!employeeMatchesScheduleDepartment(employee, department)) return false
    if (!employeeMatchesSchedulePosition(employee, position)) return false
    if (!needle) return true
    const name = `${employee?.full_name || employee?.name || ''}`.toLowerCase()
    return name.includes(needle)
  })
}

export function getEmployeePrimaryPosition(employee) {
  const names = getEmployeePositionNames(employee)
  if (names.length > 0) return names[0]
  return `${employee?.position ?? ''}`.trim() || 'Staff'
}

export function isEmployeeUnavailable(employee) {
  if (!employee?.status) return false
  const normalized = `${employee.status}`.toLowerCase()
  return normalized.includes('day off')
    || normalized.includes('vacation')
    || normalized.includes('sick')
    || normalized.includes('leave')
}

export function inferAreaFromTemplate(template) {
  const directArea = `${template?.defaultArea ?? ''}`.trim()
  if (directArea) {
    return { area: directArea, inferred: false }
  }

  const signature = `${template?.name ?? ''} ${template?.defaultRole ?? ''}`.toLowerCase()
  if (signature.includes('service')) return { area: 'Service', inferred: true }
  if (signature.includes('bar')) return { area: 'Bar', inferred: true }
  if (signature.includes('kitchen')) return { area: 'Kitchen', inferred: true }
  if (signature.includes('host')) return { area: 'Host', inferred: true }
  if (signature.includes('manager')) return { area: 'Management', inferred: true }
  return { area: '', inferred: false }
}

export function resolvePositionForDrop(employee, { area, defaultRole = '' }, areaPositionCatalog = {}) {
  const employeeRoles = getEmployeePositionNames(employee)
  const areaRoles = areaPositionCatalog[area] ?? []
  const areaSet = new Set(areaRoles.map((item) => item.toLowerCase()))
  const compatibleEmployeeRoles = employeeRoles.filter((role) => areaSet.has(role.toLowerCase()))

  if (compatibleEmployeeRoles.length === 1) return compatibleEmployeeRoles[0]
  if (compatibleEmployeeRoles.length === 0 && employeeRoles.length === 1) return employeeRoles[0]
  if (compatibleEmployeeRoles.length === 0 && employeeRoles.length === 0 && areaRoles.length === 1) return areaRoles[0]
  if (compatibleEmployeeRoles.length === 0 && employeeRoles.length > 0 && areaRoles.length === 0) return employeeRoles[0]

  const templateRole = `${defaultRole ?? ''}`.trim()
  if (templateRole) return templateRole
  if (employeeRoles.length === 1) return employeeRoles[0]
  return ''
}

export function isEmployeeAssignedInCell(cell, employeeId) {
  if (!employeeId) return false
  return (cell?.shifts ?? []).some((shift) => String(shift.employeeId) === String(employeeId))
}
