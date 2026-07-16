import { supabase } from '../lib/supabaseClient'
import { MIGRATION_SESSION_STEP_ORDER } from './inventoryMigrationSessionStepsService'

const RESULTS_TABLE = 'inventory_migration_step_results'
const CAN_MANAGE_STOCK_RPC = 'can_manage_workspace_stock'
const RESULTS_SELECT = [
  'id',
  'session_id',
  'step_id',
  'workspace_id',
  'step_name',
  'result_status',
  'result_summary',
  'critical_finding_count',
  'attention_finding_count',
  'executed_by',
  'operator_display_name',
  'executed_at',
  'created_at',
].join(', ')

export const MIGRATION_STEP_RESULT_STATUS = Object.freeze({
  PASSED: 'passed',
  ATTENTION_REQUIRED: 'attention_required',
})

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

function asObjectSummary(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value
  }
  return {}
}

function asNonNegativeCount(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.trunc(n)
}

function stepSortIndex(stepName) {
  const index = MIGRATION_SESSION_STEP_ORDER.indexOf(`${stepName ?? ''}`.trim())
  return index === -1 ? MIGRATION_SESSION_STEP_ORDER.length : index
}

/**
 * Map a persisted step-result row into a read-only domain record.
 * Never fabricates pass/attention evidence.
 */
export function mapInventoryMigrationStepResultRow(row) {
  if (!row || typeof row !== 'object') {
    return {
      id: null,
      sessionId: null,
      stepId: null,
      workspaceId: null,
      stepName: '—',
      resultStatus: '—',
      resultSummary: {},
      criticalFindingCount: 0,
      attentionFindingCount: 0,
      operator: '—',
      executedAt: '—',
    }
  }

  const resultStatus = `${row.result_status ?? row.resultStatus ?? ''}`.trim()

  return {
    id: row.id ?? null,
    sessionId: row.session_id ?? row.sessionId ?? null,
    stepId: row.step_id ?? row.stepId ?? null,
    workspaceId: row.workspace_id ?? row.workspaceId ?? null,
    stepName: displayOrDash(row.step_name ?? row.stepName),
    resultStatus: resultStatus || '—',
    resultSummary: asObjectSummary(row.result_summary ?? row.resultSummary),
    criticalFindingCount: asNonNegativeCount(
      row.critical_finding_count ?? row.criticalFindingCount,
    ),
    attentionFindingCount: asNonNegativeCount(
      row.attention_finding_count ?? row.attentionFindingCount,
    ),
    operator: displayOrDash(row.operator_display_name ?? row.operatorDisplayName),
    executedAt: formatTimestamp(row.executed_at ?? row.executedAt),
  }
}

export function sortInventoryMigrationStepResults(rows) {
  const list = Array.isArray(rows) ? [...rows] : []
  return list.sort((a, b) => {
    const aKey = a?.step_name ?? a?.stepName ?? ''
    const bKey = b?.step_name ?? b?.stepName ?? ''
    const byStep = stepSortIndex(aKey) - stepSortIndex(bKey)
    if (byStep !== 0) return byStep
    const aAt = Date.parse(a?.executed_at ?? a?.executedAt ?? '')
    const bAt = Date.parse(b?.executed_at ?? b?.executedAt ?? '')
    const safeA = Number.isFinite(aAt) ? aAt : 0
    const safeB = Number.isFinite(bAt) ? bAt : 0
    return safeA - safeB
  })
}

/**
 * Read-only: load structured step results for a workspace.
 * Optional sessionId scopes to one session. Never writes.
 */
export async function getInventoryMigrationStepResults(workspaceId, { sessionId = null } = {}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedSessionId = `${sessionId ?? ''}`.trim() || null

  if (!normalizedWorkspaceId) {
    return {
      rows: [],
      error: null,
      unavailable: false,
      resultsAvailable: false,
    }
  }

  if (!supabase) {
    return {
      rows: [],
      error: 'Supabase is not configured.',
      unavailable: true,
      resultsAvailable: false,
    }
  }

  const { data: canManage, error: authError } = await supabase.rpc(CAN_MANAGE_STOCK_RPC, {
    target_workspace_id: normalizedWorkspaceId,
  })

  if (authError) {
    return {
      rows: [],
      error: authError.message || 'Unable to verify migration step results read access.',
      unavailable: false,
      resultsAvailable: false,
    }
  }

  if (canManage !== true) {
    return {
      rows: [],
      error: 'You do not have permission to view migration step results for this workspace.',
      unavailable: false,
      resultsAvailable: false,
    }
  }

  let query = supabase
    .from(RESULTS_TABLE)
    .select(RESULTS_SELECT)
    .eq('workspace_id', normalizedWorkspaceId)

  if (normalizedSessionId) {
    query = query.eq('session_id', normalizedSessionId)
  }

  const { data, error } = await query.order('executed_at', { ascending: true })

  if (error) {
    return {
      rows: [],
      error: error.message || 'Unable to load migration step results.',
      unavailable: isTableUnavailableError(error),
      resultsAvailable: false,
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
    rows: sortInventoryMigrationStepResults(scoped).map(mapInventoryMigrationStepResultRow),
    error: null,
    unavailable: false,
    resultsAvailable: true,
  }
}
