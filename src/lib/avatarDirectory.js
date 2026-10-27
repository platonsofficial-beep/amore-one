export function resolveAvatarPhoto({
  records = [],
  urls = {},
  optimistic = {},
  employeeId = '',
  memberId = '',
  authUserId = '',
} = {}) {
  const employeeKey = `${employeeId ?? ''}`.trim()
  const memberKey = `${memberId ?? ''}`.trim()
  const authKey = `${authUserId ?? ''}`.trim()
  if (!employeeKey && !memberKey && !authKey) return null

  const record = records.find((row) => (
    (employeeKey && row?.employeeId === employeeKey)
    || (memberKey && row?.memberId === memberKey)
    || (authKey && row?.authUserId === authKey)
  )) || null
  const ownerId = authKey || `${record?.authUserId ?? ''}`.trim()
  const pending = ownerId ? optimistic[ownerId] : null

  if (pending?.removed) return null

  const recordPath = `${record?.avatarPath ?? ''}`.trim()
  if (pending?.url && pending.path && pending.path !== recordPath) {
    return {
      url: pending.url,
      updatedAt: `${pending.updatedAt ?? ''}`.trim(),
      path: pending.path,
    }
  }

  if (!recordPath) {
    if (!pending?.url) return null
    return {
      url: pending.url,
      updatedAt: `${pending.updatedAt ?? ''}`.trim(),
      path: `${pending.path ?? ''}`.trim(),
    }
  }

  const signedUrl = `${urls[recordPath] ?? ''}`.trim()
  const url = signedUrl || (pending?.path === recordPath ? pending.url : '')
  if (!url) return null
  return {
    url,
    updatedAt: `${record?.avatarUpdatedAt ?? pending?.updatedAt ?? ''}`.trim(),
    path: recordPath,
  }
}
