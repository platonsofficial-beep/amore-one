import { supabase } from '../lib/supabaseClient'

const ACTIVITY_TABLE = 'inventory_migration_activity'
const CAN_MANAGE_STOCK_RPC = 'can_manage_workspace_stock'
const ACTIVITY_SELECT = 'id, session_id, workspace_id, activity_type, activity_text, created_by, operator_display_name, created_at'

const ACTIVITY_TYPE_LABELS = {
  session_started: 'Session started',
  session_completed: 'Session completed',
  session_cancelled: 'Session cancelled',
  note: 'Note',
}

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

function formatActivityLabel(type, text) {
  const typeKey = `${type ?? ''}`.trim()
  const typeLabel = ACTIVITY_TYPE_LABELS[typeKey] ?? (typeKey || 'Activity')
  const detail = `${text ?? ''}`.trim()
  if (!detail) return typeLabel
  if (typeKey === 'note') return detail
  return `${typeLabel}: ${detail}`
}

/**
 * Map a persisted activity row into a read-only display record.
 * Never fabricates values.
 */
export function mapInventoryMigrationActivityRow(row) {
  if (!row || typeof row !== 'object') {
    return {
      id: null,
      sessionId: '—',
      workspaceId: null,
      activityType: '—',
      activity: '—',
      operator: '—',
      createdAt: '—',
    }
  }

  return {
    id: row.id ?? null,
    sessionId: displayOrDash(row.session_id ?? row.sessionId),
    workspaceId: row.workspace_id ?? row.workspaceId ?? null,
    activityType: displayOrDash(row.activity_type ?? row.activityType),
    activity: formatActivityLabel(
      row.activity_type ?? row.activityType,
      row.activity_text ?? row.activityText,
    ),
    operator: displayOrDash(row.operator_display_name ?? row.operatorDisplayName),
    createdAt: formatTimestamp(row.created_at ?? row.createdAt),
  }
}

/**
 * Read-only: load migration activity for a workspace (newest first).
 * Never inserts, updates, or deletes.
 */
export async function getInventoryMigrationActivity(workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

  if (!normalizedWorkspaceId) {
    return {
      rows: [],
      error: null,
      unavailable: false,
      activityAvailable: false,
    }
  }

  if (!supabase) {
    return {
      rows: [],
      error: 'Supabase is not configured.',
      unavailable: true,
      activityAvailable: false,
    }
  }

  const { data: canManage, error: authError } = await supabase.rpc(CAN_MANAGE_STOCK_RPC, {
    target_workspace_id: normalizedWorkspaceId,
  })

  if (authError) {
    return {
      rows: [],
      error: authError.message || 'Unable to verify migration activity read access.',
      unavailable: false,
      activityAvailable: false,
    }
  }

  if (canManage !== true) {
    return {
      rows: [],
      error: 'You do not have permission to view migration activity for this workspace.',
      unavailable: false,
      activityAvailable: false,
    }
  }

  const { data, error } = await supabase
    .from(ACTIVITY_TABLE)
    .select(ACTIVITY_SELECT)
    .eq('workspace_id', normalizedWorkspaceId)
    .order('created_at', { ascending: false })

  if (error) {
    return {
      rows: [],
      error: error.message || 'Unable to load migration activity.',
      unavailable: isTableUnavailableError(error),
      activityAvailable: false,
    }
  }

  const list = Array.isArray(data) ? data : []
  const rows = list
    .filter((row) => `${row?.workspace_id ?? ''}`.trim() === normalizedWorkspaceId)
    .map(mapInventoryMigrationActivityRow)

  return {
    rows,
    error: null,
    unavailable: false,
    activityAvailable: true,
  }
}
