import { supabase } from '../lib/supabaseClient'

const STEPS_TABLE = 'inventory_migration_session_steps'
const SESSIONS_TABLE = 'inventory_migration_sessions'
const CAN_MANAGE_STOCK_RPC = 'can_manage_workspace_stock'
const STEPS_SELECT = 'id, session_id, workspace_id, step_name, status, started_at, completed_at, created_at'
const SESSION_SELECT = 'id, workspace_id, status, started_at'

export const MIGRATION_SESSION_STEP_ORDER = Object.freeze([
  'foundation',
  'persist',
  'auto_link',
  'auto_create',
  'integrity_audit',
  'preflight',
  'preview',
  'phase1',
  'phase2',
  'post_apply_audit',
])

const STEP_LABELS = {
  foundation: 'Foundation',
  persist: 'Persist',
  auto_link: 'Auto Link',
  auto_create: 'Auto Create',
  integrity_audit: 'Integrity Audit',
  preflight: 'Preflight',
  preview: 'Preview',
  phase1: 'Phase 1',
  phase2: 'Phase 2',
  post_apply_audit: 'Post-Apply Audit',
}

const STATUS_LABELS = {
  waiting: 'Waiting',
  running: 'Running',
  completed: 'Completed',
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

function stepSortIndex(stepName) {
  const index = MIGRATION_SESSION_STEP_ORDER.indexOf(`${stepName ?? ''}`.trim())
  return index === -1 ? MIGRATION_SESSION_STEP_ORDER.length : index
}

/**
 * Map a persisted session step row into a read-only display record.
 * Never fabricates values.
 */
export function mapInventoryMigrationSessionStepRow(row) {
  if (!row || typeof row !== 'object') {
    return {
      id: null,
      sessionId: '—',
      workspaceId: null,
      stepName: '—',
      step: '—',
      statusKey: '—',
      status: '—',
      startedAt: '—',
      completedAt: '—',
    }
  }

  const stepKey = `${row.step_name ?? row.stepName ?? ''}`.trim()
  const statusKey = `${row.status ?? ''}`.trim()

  return {
    id: row.id ?? null,
    sessionId: displayOrDash(row.session_id ?? row.sessionId),
    workspaceId: row.workspace_id ?? row.workspaceId ?? null,
    stepName: displayOrDash(stepKey),
    step: STEP_LABELS[stepKey] ?? (stepKey || '—'),
    statusKey: displayOrDash(statusKey),
    status: STATUS_LABELS[statusKey] ?? (statusKey || '—'),
    startedAt: formatTimestamp(row.started_at ?? row.startedAt),
    completedAt: formatTimestamp(row.completed_at ?? row.completedAt),
  }
}

export function sortInventoryMigrationSessionSteps(rows) {
  const list = Array.isArray(rows) ? [...rows] : []
  return list.sort((a, b) => {
    const aKey = a?.step_name ?? a?.stepName ?? ''
    const bKey = b?.step_name ?? b?.stepName ?? ''
    return stepSortIndex(aKey) - stepSortIndex(bKey)
  })
}

async function resolveTargetSessionId(workspaceId) {
  const { data: runningRows, error: runningError } = await supabase
    .from(SESSIONS_TABLE)
    .select(SESSION_SELECT)
    .eq('workspace_id', workspaceId)
    .eq('status', 'running')
    .limit(1)

  if (runningError) {
    return {
      sessionId: null,
      error: runningError,
    }
  }

  let row = Array.isArray(runningRows) && runningRows.length > 0 ? runningRows[0] : null

  if (!row) {
    const { data: latestRows, error: latestError } = await supabase
      .from(SESSIONS_TABLE)
      .select(SESSION_SELECT)
      .eq('workspace_id', workspaceId)
      .order('started_at', { ascending: false })
      .limit(1)

    if (latestError) {
      return {
        sessionId: null,
        error: latestError,
      }
    }

    row = Array.isArray(latestRows) && latestRows.length > 0 ? latestRows[0] : null
  }

  if (!row || `${row.workspace_id ?? ''}`.trim() !== workspaceId) {
    return {
      sessionId: null,
      error: null,
    }
  }

  return {
    sessionId: row.id ?? null,
    error: null,
  }
}

/**
 * Read-only: load session steps for the current running session,
 * else the latest session by started_at. Ordered by canonical stage list.
 * Never inserts, updates, or deletes.
 */
export async function getInventoryMigrationSessionSteps(workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

  if (!normalizedWorkspaceId) {
    return {
      rows: [],
      sessionId: null,
      error: null,
      unavailable: false,
      stepsAvailable: false,
    }
  }

  if (!supabase) {
    return {
      rows: [],
      sessionId: null,
      error: 'Supabase is not configured.',
      unavailable: true,
      stepsAvailable: false,
    }
  }

  const { data: canManage, error: authError } = await supabase.rpc(CAN_MANAGE_STOCK_RPC, {
    target_workspace_id: normalizedWorkspaceId,
  })

  if (authError) {
    return {
      rows: [],
      sessionId: null,
      error: authError.message || 'Unable to verify migration session steps read access.',
      unavailable: false,
      stepsAvailable: false,
    }
  }

  if (canManage !== true) {
    return {
      rows: [],
      sessionId: null,
      error: 'You do not have permission to view migration session steps for this workspace.',
      unavailable: false,
      stepsAvailable: false,
    }
  }

  const sessionResult = await resolveTargetSessionId(normalizedWorkspaceId)
  if (sessionResult.error) {
    return {
      rows: [],
      sessionId: null,
      error: sessionResult.error.message || 'Unable to resolve migration session for steps.',
      unavailable: isTableUnavailableError(sessionResult.error),
      stepsAvailable: false,
    }
  }

  if (!sessionResult.sessionId) {
    return {
      rows: [],
      sessionId: null,
      error: null,
      unavailable: false,
      stepsAvailable: true,
    }
  }

  const { data, error } = await supabase
    .from(STEPS_TABLE)
    .select(STEPS_SELECT)
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('session_id', sessionResult.sessionId)

  if (error) {
    return {
      rows: [],
      sessionId: sessionResult.sessionId,
      error: error.message || 'Unable to load migration session steps.',
      unavailable: isTableUnavailableError(error),
      stepsAvailable: false,
    }
  }

  const list = Array.isArray(data) ? data : []
  const scoped = list.filter((row) => (
    `${row?.workspace_id ?? ''}`.trim() === normalizedWorkspaceId
    && `${row?.session_id ?? ''}`.trim() === `${sessionResult.sessionId}`
  ))
  const rows = sortInventoryMigrationSessionSteps(scoped).map(mapInventoryMigrationSessionStepRow)

  return {
    rows,
    sessionId: sessionResult.sessionId,
    error: null,
    unavailable: false,
    stepsAvailable: true,
  }
}
