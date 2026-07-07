import { normalizeOperationsLogType } from '../lib/operationsUtils'
import { supabase } from '../lib/supabaseClient'
import { getMemberDisplayNamesByAuthUserIds } from './membershipService'

const OPERATIONS_LOGS_TABLE = 'operations_logs'

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

function mapOperationsLog(record) {
  return {
    id: record.id,
    workspaceId: record.workspace_id ?? record.workspaceId ?? '',
    type: normalizeOperationsLogType(record.type),
    title: record.title ?? '',
    message: record.message ?? '',
    createdBy: record.created_by ?? record.createdBy ?? null,
    createdAt: record.created_at ?? record.createdAt ?? null,
  }
}

function serializeOperationsLog(log, workspaceId) {
  return {
    workspace_id: workspaceId,
    type: normalizeOperationsLogType(log.type),
    title: `${log.title ?? ''}`.trim(),
    message: `${log.message ?? ''}`.trim(),
    created_by: log.createdBy ?? log.created_by ?? null,
  }
}

async function enrichOperationsLogs(logs = []) {
  const authUserIds = logs.map((log) => log.createdBy).filter(Boolean)
  const nameByAuthUserId = await getMemberDisplayNamesByAuthUserIds(authUserIds)

  return logs.map((log) => ({
    ...log,
    createdByName: log.createdBy ? (nameByAuthUserId[log.createdBy] ?? 'System') : 'System',
  }))
}

export async function getOperationsLogs(workspaceId, { limit = 50 } = {}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) return []

  const { data, error } = await supabase
    .from(OPERATIONS_LOGS_TABLE)
    .select('*')
    .eq('workspace_id', normalizedWorkspaceId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Number(limit) || 50))

  if (error) {
    console.error('[operationsLogService] getOperationsLogs error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Operations logs table is not ready yet.')
    }
    throw new Error(error.message || 'Unable to load logbook entries right now.')
  }

  const mapped = (data ?? []).map(mapOperationsLog)
  return enrichOperationsLogs(mapped)
}

export async function createOperationsLog(workspaceId, log, createdBy = null) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to create a log entry.')
  }

  const payload = {
    ...serializeOperationsLog(log, normalizedWorkspaceId),
    created_by: createdBy ?? log.createdBy ?? null,
  }

  const { data, error } = await supabase
    .from(OPERATIONS_LOGS_TABLE)
    .insert([payload])
    .select('*')
    .single()

  if (error) {
    console.error('[operationsLogService] createOperationsLog error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Operations logs table is not ready yet.')
    }
    throw new Error(error.message || 'Unable to create log entry right now.')
  }

  const [enriched] = await enrichOperationsLogs([mapOperationsLog(data)])
  return enriched
}

export async function updateOperationsLog(workspaceId, logId, log) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedLogId = `${logId ?? ''}`.trim()
  if (!normalizedWorkspaceId || !normalizedLogId) {
    throw new Error('Workspace and log entry are required.')
  }

  const { data, error } = await supabase
    .from(OPERATIONS_LOGS_TABLE)
    .update({
      type: normalizeOperationsLogType(log.type),
      title: `${log.title ?? ''}`.trim(),
      message: `${log.message ?? ''}`.trim(),
    })
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedLogId)
    .select('*')
    .single()

  if (error) {
    console.error('[operationsLogService] updateOperationsLog error:', error)
    throw new Error(error.message || 'Unable to update log entry right now.')
  }

  const [enriched] = await enrichOperationsLogs([mapOperationsLog(data)])
  return enriched
}

export async function deleteOperationsLog(workspaceId, logId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedLogId = `${logId ?? ''}`.trim()
  if (!normalizedWorkspaceId || !normalizedLogId) {
    throw new Error('Workspace and log entry are required.')
  }

  const { error } = await supabase
    .from(OPERATIONS_LOGS_TABLE)
    .delete()
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedLogId)

  if (error) {
    console.error('[operationsLogService] deleteOperationsLog error:', error)
    throw new Error(error.message || 'Unable to delete log entry right now.')
  }
}
