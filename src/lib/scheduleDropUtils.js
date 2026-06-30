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
