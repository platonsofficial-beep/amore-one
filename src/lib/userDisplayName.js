function resolveEmployeeRecordName(employee) {
  return `${employee?.name || employee?.fullName || employee?.full_name || ''}`.trim()
}

function resolveAuthEmailFallback(membership, user) {
  const email = `${membership?.email ?? user?.email ?? ''}`.trim()
  if (!email) return ''

  const localPart = email.split('@')[0]?.trim()
  return localPart || email
}

/**
 * Name stored for the signed-in member.
 * Linked employee full name, then workspace_members.display_name.
 * An email local-part is not a stored name.
 */
export function resolveStoredUserDisplayName({ membership, employees = [] } = {}) {
  const employeeId = `${membership?.employeeId ?? membership?.employee_id ?? ''}`.trim()

  if (employeeId && Array.isArray(employees) && employees.length > 0) {
    const employee = employees.find((item) => `${item?.id ?? ''}` === employeeId)
    const employeeName = resolveEmployeeRecordName(employee)
    if (employeeName) return employeeName
  }

  const displayName = `${membership?.displayName ?? membership?.display_name ?? ''}`.trim()
  // 0036: a display name that is just the email (or its local part, e.g. from
  // sign-up) is not a real stored name.
  return isEmailDerivedName(displayName, membership) ? '' : displayName
}

function isEmailDerivedName(name, membership, user) {
  if (!name) return false
  const emails = [membership?.email, user?.email].map((value) => `${value ?? ''}`.trim().toLowerCase()).filter(Boolean)
  const lowered = name.toLowerCase()
  return emails.some((email) => lowered === email || lowered === email.split('@')[0])
}

export function resolveUserDisplayName({ membership, employees = [], user } = {}) {
  const storedName = resolveStoredUserDisplayName({ membership, employees })
  if (storedName) return storedName

  const profileName = `${user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? ''}`.trim()
  if (profileName && !isEmailDerivedName(profileName, membership, user)) return profileName

  return resolveAuthEmailFallback(membership, user)
}
