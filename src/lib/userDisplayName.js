function resolveEmployeeRecordName(employee) {
  return `${employee?.name ?? employee?.fullName ?? ''}`.trim()
}

function resolveAuthEmailFallback(membership, user) {
  const email = `${membership?.email ?? user?.email ?? ''}`.trim()
  if (!email) return ''

  const localPart = email.split('@')[0]?.trim()
  return localPart || email
}

/**
 * Personal name stored for the signed-in member.
 * Linked employee full name, then workspace_members.display_name.
 * An email local-part is not a personal name.
 */
export function resolveStoredUserDisplayName({ membership, employees = [] } = {}) {
  const employeeId = `${membership?.employeeId ?? membership?.employee_id ?? ''}`.trim()

  if (employeeId && Array.isArray(employees) && employees.length > 0) {
    const employee = employees.find((item) => `${item?.id ?? ''}` === employeeId)
    const employeeName = resolveEmployeeRecordName(employee)
    if (employeeName) return employeeName
  }

  return `${membership?.displayName ?? membership?.display_name ?? ''}`.trim()
}

export function resolveUserDisplayName({ membership, employees = [], user } = {}) {
  const storedName = resolveStoredUserDisplayName({ membership, employees })
  if (storedName) return storedName

  return resolveAuthEmailFallback(membership, user)
}
