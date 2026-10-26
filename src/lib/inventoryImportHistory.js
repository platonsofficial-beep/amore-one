export const RECENT_INVENTORY_IMPORT_LIMIT = 5

const STATUS_LABELS = {
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
  ready: 'Ready to apply',
  applying: 'Applying',
}

function finiteCount(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function applyResult(row) {
  const result = row?.apply_result ?? row?.applyResult
  return result && typeof result === 'object' && !Array.isArray(result) ? result : null
}

function readCount(row, resultKey, columnKey) {
  const result = applyResult(row)
  if (result && result[resultKey] != null && result[resultKey] !== '') {
    return finiteCount(result[resultKey], 0)
  }
  return finiteCount(row?.[columnKey], 0)
}

export function inventoryImportStatusLabel(status) {
  const key = `${status ?? ''}`.trim()
  return STATUS_LABELS[key] || 'In progress'
}

export function inventoryImportActorId(row) {
  const result = applyResult(row)
  const operator = `${result?.operator_user_id ?? result?.operatorUserId ?? ''}`.trim()
  if (operator) return operator
  return `${row?.created_by ?? row?.createdBy ?? ''}`.trim()
}

export function inventoryImportOccurredAt(row) {
  return row?.apply_completed_at
    ?? row?.applyCompletedAt
    ?? row?.completed_at
    ?? row?.completedAt
    ?? row?.created_at
    ?? row?.createdAt
    ?? null
}

export function mapInventoryImportHistorySession(row) {
  if (!row || typeof row !== 'object') return null
  const id = `${row.id ?? row.session_id ?? row.sessionId ?? ''}`.trim()
  if (!id) return null
  const status = `${row.status ?? ''}`.trim()
  return {
    id,
    workspaceId: `${row.workspace_id ?? row.workspaceId ?? ''}`.trim(),
    status,
    statusLabel: inventoryImportStatusLabel(status),
    sourceFilename: `${row.source_filename ?? row.sourceFilename ?? ''}`.trim(),
    actorId: inventoryImportActorId(row),
    occurredAt: inventoryImportOccurredAt(row),
    createdCount: readCount(row, 'created_count', 'create_rows'),
    linkedCount: readCount(row, 'linked_count', 'link_rows'),
  }
}
