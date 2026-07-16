import { supabase } from '../lib/supabaseClient'

const ACK_TABLE = 'inventory_migration_stage_attention_acknowledgements'
const CAN_MANAGE_STOCK_RPC = 'can_manage_workspace_stock'
const ACK_SELECT = [
  'id',
  'workspace_id',
  'session_id',
  'prior_step_id',
  'prior_result_id',
  'prior_step_name',
  'next_step_id',
  'next_step_name',
  'acknowledged_by',
  'operator_display_name',
  'note',
  'acknowledged_at',
  'created_at',
].join(', ')

export const MIGRATION_ATTENTION_ACK_BOUNDARIES = Object.freeze([
  Object.freeze({ priorStepName: 'integrity_audit', nextStepName: 'preflight' }),
  Object.freeze({ priorStepName: 'preview', nextStepName: 'phase1' }),
  Object.freeze({ priorStepName: 'phase1', nextStepName: 'phase2' }),
])

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

function displayOrDash(value) {
  if (value === null || value === undefined) return '—'
  const text = `${value}`.trim()
  return text ? text : '—'
}

function formatTimestamp(value) {
  if (value === null || value === undefined || value === '') return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

/**
 * Map a persisted acknowledgement row into a read-only domain record.
 */
export function mapInventoryMigrationAttentionAckRow(row) {
  if (!row || typeof row !== 'object') {
    return {
      id: null,
      workspaceId: null,
      sessionId: null,
      priorStepId: null,
      priorResultId: null,
      priorStepName: '—',
      nextStepId: null,
      nextStepName: '—',
      operator: '—',
      note: null,
      acknowledgedAt: '—',
    }
  }

  const noteRaw = row.note ?? null
  const note = noteRaw === null || noteRaw === undefined
    ? null
    : (`${noteRaw}`.trim() || null)

  return {
    id: row.id ?? null,
    workspaceId: row.workspace_id ?? row.workspaceId ?? null,
    sessionId: row.session_id ?? row.sessionId ?? null,
    priorStepId: row.prior_step_id ?? row.priorStepId ?? null,
    priorResultId: row.prior_result_id ?? row.priorResultId ?? null,
    priorStepName: displayOrDash(row.prior_step_name ?? row.priorStepName),
    nextStepId: row.next_step_id ?? row.nextStepId ?? null,
    nextStepName: displayOrDash(row.next_step_name ?? row.nextStepName),
    operator: displayOrDash(row.operator_display_name ?? row.operatorDisplayName),
    note,
    acknowledgedAt: formatTimestamp(row.acknowledged_at ?? row.acknowledgedAt),
  }
}

export function sortInventoryMigrationAttentionAcks(rows) {
  const list = Array.isArray(rows) ? [...rows] : []
  return list.sort((a, b) => {
    const aAt = Date.parse(a?.acknowledged_at ?? a?.acknowledgedAt ?? '')
    const bAt = Date.parse(b?.acknowledged_at ?? b?.acknowledgedAt ?? '')
    const safeA = Number.isFinite(aAt) ? aAt : 0
    const safeB = Number.isFinite(bAt) ? bAt : 0
    if (safeA !== safeB) return safeA - safeB
    return `${a?.id ?? ''}`.localeCompare(`${b?.id ?? ''}`)
  })
}

/**
 * Read-only: load attention acknowledgements for a workspace session.
 * Never writes. Does not call the acknowledge RPC.
 */
export async function getInventoryMigrationStageAttentionAcknowledgements(
  workspaceId,
  { sessionId = null } = {},
) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedSessionId = `${sessionId ?? ''}`.trim() || null

  if (!normalizedWorkspaceId) {
    return {
      rows: [],
      error: null,
      unavailable: false,
      acknowledgementsAvailable: false,
    }
  }

  if (!supabase) {
    return {
      rows: [],
      error: 'Supabase is not configured.',
      unavailable: true,
      acknowledgementsAvailable: false,
    }
  }

  const { data: canManage, error: authError } = await supabase.rpc(CAN_MANAGE_STOCK_RPC, {
    target_workspace_id: normalizedWorkspaceId,
  })

  if (authError) {
    return {
      rows: [],
      error: authError.message || 'Unable to verify acknowledgement read access.',
      unavailable: false,
      acknowledgementsAvailable: false,
    }
  }

  if (canManage !== true) {
    return {
      rows: [],
      error: 'You do not have permission to view migration acknowledgements for this workspace.',
      unavailable: false,
      acknowledgementsAvailable: false,
    }
  }

  let query = supabase
    .from(ACK_TABLE)
    .select(ACK_SELECT)
    .eq('workspace_id', normalizedWorkspaceId)

  if (normalizedSessionId) {
    query = query.eq('session_id', normalizedSessionId)
  }

  const { data, error } = await query.order('acknowledged_at', { ascending: true })

  if (error) {
    return {
      rows: [],
      error: error.message || 'Unable to load migration acknowledgements.',
      unavailable: isTableUnavailableError(error),
      acknowledgementsAvailable: false,
    }
  }

  const list = Array.isArray(data) ? data : []
  const scoped = list.filter((row) => {
    if (`${row?.workspace_id ?? ''}`.trim() !== normalizedWorkspaceId) return false
    if (normalizedSessionId && `${row?.session_id ?? ''}`.trim() !== normalizedSessionId) {
      return false
    }
    return true
  })

  return {
    rows: sortInventoryMigrationAttentionAcks(scoped).map(mapInventoryMigrationAttentionAckRow),
    error: null,
    unavailable: false,
    acknowledgementsAvailable: true,
  }
}
