import { supabase } from '../lib/supabaseClient'
import {
  buildInventoryMigrationSessionPlaceholder,
  createEmptyInventoryMigrationSession,
  mapInventoryMigrationSessionSummary,
  MIGRATION_SESSION_STATUS,
  normalizeInventoryMigrationSession,
} from '../lib/inventoryMigrationSession'

const SESSIONS_TABLE = 'inventory_migration_sessions'
const CAN_MANAGE_STOCK_RPC = 'can_manage_workspace_stock'

const DB_STATUS_TO_DOMAIN = {
  running: MIGRATION_SESSION_STATUS.RUNNING,
  completed: MIGRATION_SESSION_STATUS.COMPLETED,
  cancelled: MIGRATION_SESSION_STATUS.CANCELLED,
}

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

/**
 * Map a persisted session row into the in-memory domain shape.
 * Never fabricates ids, operators, or timestamps.
 */
export function mapPersistedInventoryMigrationSessionRow(row) {
  if (!row || typeof row !== 'object') {
    return createEmptyInventoryMigrationSession()
  }

  const dbStatus = `${row.status ?? ''}`.trim().toLowerCase()
  const domainStatus = DB_STATUS_TO_DOMAIN[dbStatus] ?? MIGRATION_SESSION_STATUS.UNKNOWN

  return normalizeInventoryMigrationSession({
    sessionId: row.id ?? null,
    workspaceId: row.workspace_id ?? row.workspaceId ?? null,
    operator: row.operator_display_name ?? row.operatorDisplayName ?? null,
    startedAt: row.started_at ?? row.startedAt ?? null,
    finishedAt: row.finished_at ?? row.finishedAt ?? null,
    status: domainStatus,
  })
}

/**
 * Read-only: load the current running session, else the latest session by started_at.
 * Never inserts, updates, or deletes.
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
    return {
      ...placeholder,
      error: 'Supabase is not configured.',
      unavailable: true,
      sessionAvailable: false,
    }
  }

  const { data: canManage, error: authError } = await supabase.rpc(CAN_MANAGE_STOCK_RPC, {
    target_workspace_id: normalizedWorkspaceId,
  })

  if (authError) {
    return {
      ...placeholder,
      error: authError.message || 'Unable to verify migration session read access.',
      unavailable: false,
      sessionAvailable: false,
    }
  }

  if (canManage !== true) {
    return {
      ...placeholder,
      error: 'You do not have permission to view migration sessions for this workspace.',
      unavailable: false,
      sessionAvailable: false,
    }
  }

  const { data: runningRows, error: runningError } = await supabase
    .from(SESSIONS_TABLE)
    .select('id, workspace_id, status, started_by, operator_display_name, started_at, finished_at, created_at, updated_at')
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('status', 'running')
    .limit(1)

  if (runningError) {
    return {
      ...placeholder,
      error: runningError.message || 'Unable to load migration session.',
      unavailable: isTableUnavailableError(runningError),
      sessionAvailable: false,
    }
  }

  let row = Array.isArray(runningRows) && runningRows.length > 0 ? runningRows[0] : null

  if (!row) {
    const { data: latestRows, error: latestError } = await supabase
      .from(SESSIONS_TABLE)
      .select('id, workspace_id, status, started_by, operator_display_name, started_at, finished_at, created_at, updated_at')
      .eq('workspace_id', normalizedWorkspaceId)
      .order('started_at', { ascending: false })
      .limit(1)

    if (latestError) {
      return {
        ...placeholder,
        error: latestError.message || 'Unable to load migration session.',
        unavailable: isTableUnavailableError(latestError),
        sessionAvailable: false,
      }
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

  const session = mapPersistedInventoryMigrationSessionRow(row)
  return {
    session,
    summary: mapInventoryMigrationSessionSummary(session),
    error: null,
    unavailable: false,
    sessionAvailable: true,
  }
}
