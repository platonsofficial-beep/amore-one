import { supabase } from '../lib/supabaseClient'
import {
  buildInventoryMigrationSessionPlaceholder,
  buildInventoryMigrationSessionUnavailable,
  createEmptyInventoryMigrationSession,
  mapInventoryMigrationSessionSummary,
  MIGRATION_SESSION_STATUS,
  normalizeInventoryMigrationSession,
  resolveInventoryMigrationSessionStatus,
} from '../lib/inventoryMigrationSession'

const SESSIONS_TABLE = 'inventory_migration_sessions'
const CAN_MANAGE_STOCK_RPC = 'can_manage_workspace_stock'
const SESSION_SELECT = 'id, workspace_id, status, started_by, operator_display_name, started_at, finished_at, created_at, updated_at'

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

function failedResult(workspaceId, errorMessage, unavailable = false) {
  const base = buildInventoryMigrationSessionUnavailable({ workspaceId })
  return {
    ...base,
    error: errorMessage,
    unavailable,
    sessionAvailable: false,
  }
}

/**
 * Map a persisted session row into the in-memory domain shape.
 * Never fabricates ids, operators, or timestamps.
 */
export function mapPersistedInventoryMigrationSessionRow(row) {
  if (!row || typeof row !== 'object') {
    return createEmptyInventoryMigrationSession()
  }

  return normalizeInventoryMigrationSession({
    sessionId: row.id ?? null,
    workspaceId: row.workspace_id ?? row.workspaceId ?? null,
    operator: row.operator_display_name ?? row.operatorDisplayName ?? null,
    startedAt: row.started_at ?? row.startedAt ?? null,
    finishedAt: row.finished_at ?? row.finishedAt ?? null,
    status: resolveInventoryMigrationSessionStatus(row.status),
  })
}

/**
 * Read-only: load the current running session, else the latest session by started_at.
 * Workspace-scoped. Never inserts, updates, or deletes.
 *
 * Priority:
 *   1. status = running
 *   2. latest by started_at DESC (completed or cancelled)
 *   3. empty → Not Started placeholder
 *   4. fetch failure → Unknown (no fabricated identity)
 */
export async function getInventoryMigrationSessionSummary(workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const placeholder = buildInventoryMigrationSessionPlaceholder({
    workspaceId: normalizedWorkspaceId || null,
  })

  if (!normalizedWorkspaceId) {
    return {
      ...placeholder,
      error: null,
      unavailable: false,
      sessionAvailable: false,
    }
  }

  if (!supabase) {
    return failedResult(
      normalizedWorkspaceId,
      'Supabase is not configured.',
      true,
    )
  }

  const { data: canManage, error: authError } = await supabase.rpc(CAN_MANAGE_STOCK_RPC, {
    target_workspace_id: normalizedWorkspaceId,
  })

  if (authError) {
    return failedResult(
      normalizedWorkspaceId,
      authError.message || 'Unable to verify migration session read access.',
      false,
    )
  }

  if (canManage !== true) {
    return failedResult(
      normalizedWorkspaceId,
      'You do not have permission to view migration sessions for this workspace.',
      false,
    )
  }

  const { data: runningRows, error: runningError } = await supabase
    .from(SESSIONS_TABLE)
    .select(SESSION_SELECT)
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('status', 'running')
    .limit(1)

  if (runningError) {
    return failedResult(
      normalizedWorkspaceId,
      runningError.message || 'Unable to load migration session.',
      isTableUnavailableError(runningError),
    )
  }

  let row = Array.isArray(runningRows) && runningRows.length > 0 ? runningRows[0] : null

  if (!row) {
    const { data: latestRows, error: latestError } = await supabase
      .from(SESSIONS_TABLE)
      .select(SESSION_SELECT)
      .eq('workspace_id', normalizedWorkspaceId)
      .order('started_at', { ascending: false })
      .limit(1)

    if (latestError) {
      return failedResult(
        normalizedWorkspaceId,
        latestError.message || 'Unable to load migration session.',
        isTableUnavailableError(latestError),
      )
    }

    row = Array.isArray(latestRows) && latestRows.length > 0 ? latestRows[0] : null
  }

  if (!row) {
    return {
      ...placeholder,
      error: null,
      unavailable: false,
      sessionAvailable: false,
    }
  }

  // Workspace isolation: never surface a row from another workspace.
  if (`${row.workspace_id ?? ''}`.trim() !== normalizedWorkspaceId) {
    return failedResult(
      normalizedWorkspaceId,
      'Migration session workspace mismatch.',
      false,
    )
  }

  const session = mapPersistedInventoryMigrationSessionRow(row)
  return {
    session,
    summary: mapInventoryMigrationSessionSummary(session),
    error: null,
    unavailable: false,
    sessionAvailable: true,
  }
}

export { MIGRATION_SESSION_STATUS }
