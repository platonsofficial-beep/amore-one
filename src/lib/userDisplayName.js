function resolveEmployeeRecordName(employee) {
  return `${employee?.name ?? employee?.fullName ?? ''}`.trim()
}

function resolveAuthEmailFallback(membership, user) {
  const email = `${membership?.email ?? user?.email ?? ''}`.trim()
  if (!email) return ''

  const localPart = email.split('@')[0]?.trim()
  return localPart || email
}

export function resolveUserDisplayName({ membership, employees = [], user } = {}) {
  const employeeId = `${membership?.employeeId ?? membership?.employee_id ?? ''}`.trim()

  if (employeeId && Array.isArray(employees) && employees.length > 0) {
    const employee = employees.find((item) => `${item?.id ?? ''}` === employeeId)
    const employeeName = resolveEmployeeRecordName(employee)
    if (employeeName) return employeeName
  }

  const displayName = `${membership?.displayName ?? ''}`.trim()
  if (displayName) return displayName

  return resolveAuthEmailFallback(membership, user)
}
