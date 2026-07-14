export function normalizeEmployeePositionDeletionName(name) {
  return `${name ?? ''}`.trim().toLowerCase()
}

export function createPendingEmployeePositionDeletionEntry({ id, name }) {
  const trimmedName = `${name ?? ''}`.trim()
  if (!id || !trimmedName) return null

  return {
    id,
    name: trimmedName,
  }
}

export function queuePendingEmployeePositionDeletion(pending = [], entry) {
  const normalizedEntry = createPendingEmployeePositionDeletionEntry(entry)
  if (!normalizedEntry) return pending

  const entryId = String(normalizedEntry.id)
  if (pending.some((item) => String(item.id) === entryId)) {
    return pending
  }

  return [...pending, normalizedEntry]
}

export function cancelPendingEmployeePositionDeletion(pending = [], { id, name } = {}) {
  if (id) {
    const entryId = String(id)
    return pending.filter((item) => String(item.id) !== entryId)
  }

  const normalizedName = normalizeEmployeePositionDeletionName(name)
  if (!normalizedName) return pending

  return pending.filter((item) => normalizeEmployeePositionDeletionName(item.name) !== normalizedName)
}

export function clearPendingEmployeePositionDeletions() {
  return []
}

export function isEmployeePositionPendingDeletion(pending = [], { id, name } = {}) {
  if (id && pending.some((item) => String(item.id) === String(id))) {
    return true
  }

  const normalizedName = normalizeEmployeePositionDeletionName(name)
  if (!normalizedName) return false

  return pending.some((item) => normalizeEmployeePositionDeletionName(item.name) === normalizedName)
}

export function employeeReferencesWorkspacePosition(employee, workspacePositionId, label) {
  if (!employee) return false

  const normalizedLabel = normalizeEmployeePositionDeletionName(label)
  if (!normalizedLabel && !workspacePositionId) return false

  if (normalizeEmployeePositionDeletionName(employee.primaryPosition) === normalizedLabel) {
    return true
  }

  const additional = Array.isArray(employee.additionalPositions) ? employee.additionalPositions : []
  if (additional.some((entry) => normalizeEmployeePositionDeletionName(entry) === normalizedLabel)) {
    return true
  }

  if (!Array.isArray(employee.positions)) return false

  return employee.positions.some((item) => (
    (workspacePositionId && String(item.id ?? '') === String(workspacePositionId))
    || normalizeEmployeePositionDeletionName(item.name) === normalizedLabel
  ))
}

export function prunePendingEmployeePositionDeletionsForSelection(
  pending = [],
  additionalPositions = [],
  labelsMatch,
) {
  if (!Array.isArray(pending) || pending.length === 0) return pending

  return pending.filter((entry) => !additionalPositions.some((selected) => (
    typeof labelsMatch === 'function' && labelsMatch(selected, entry.name)
  )))
}

export function getPendingEmployeePositionDeletionsForCatalogCleanup(
  pending = [],
  employees = [],
  isCanonicalPosition,
) {
  return pending.filter((entry) => {
    if (!entry?.id) return false
    if (typeof isCanonicalPosition === 'function' && isCanonicalPosition(entry.name)) return false

    return !(employees ?? []).some((employee) => (
      employeeReferencesWorkspacePosition(employee, entry.id, entry.name)
    ))
  })
}
