import { supabase } from '../lib/supabaseClient'

const START_SESSION_RPC = 'start_inventory_migration_session'
const CANCEL_SESSION_RPC = 'cancel_inventory_migration_session'
const COMPLETE_SESSION_RPC = 'complete_inventory_migration_session'
const TRANSITION_STEP_RPC = 'transition_inventory_migration_step'
const ACKNOWLEDGE_ATTENTION_RPC = 'acknowledge_inventory_migration_stage_attention'

const RUN_PERSIST_RPC = 'run_inventory_migration_persist'
const RUN_AUTO_LINK_RPC = 'run_inventory_migration_auto_link'
const RUN_AUTO_CREATE_RPC = 'run_inventory_migration_auto_create'
const RUN_INTEGRITY_AUDIT_RPC = 'run_inventory_migration_integrity_audit'
const RUN_PREFLIGHT_RPC = 'run_inventory_migration_preflight'
const RUN_PREVIEW_RPC = 'run_inventory_migration_preview'
const RUN_PHASE1_RPC = 'run_inventory_migration_phase1'
const RUN_PHASE2_RPC = 'run_inventory_migration_phase2'
const RUN_POST_APPLY_AUDIT_RPC = 'run_inventory_migration_post_apply_audit'

const FOUNDATION_STEP_NAME = 'foundation'
const FOUNDATION_COMPLETED_STATUS = 'completed'

function requireConfiguredSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
}

function requireId(value, label) {
  const normalized = `${value ?? ''}`.trim()
  if (!normalized) {
    throw new Error(`${label} is required.`)
  }
  return normalized
}

async function callMigrationRpc(rpcName, args) {
  requireConfiguredSupabase()
  const { data, error } = await supabase.rpc(rpcName, args)
  if (error) {
    throw error
  }
  return data
}

/**
 * Start a new running inventory migration session for the workspace.
 * Thin wrapper — no orchestration.
 */
export async function startInventoryMigrationSession(workspaceId) {
  const p_workspace_id = requireId(workspaceId, 'Workspace ID')
  return callMigrationRpc(START_SESSION_RPC, { p_workspace_id })
}

/**
 * Cancel a running inventory migration session.
 * Thin wrapper — no orchestration.
 */
export async function cancelInventoryMigrationSession(workspaceId, sessionId) {
  const p_workspace_id = requireId(workspaceId, 'Workspace ID')
  const p_session_id = requireId(sessionId, 'Session ID')
  return callMigrationRpc(CANCEL_SESSION_RPC, { p_workspace_id, p_session_id })
}

/**
 * Complete a running inventory migration session (SQL completion gate applies).
 * Thin wrapper — no orchestration.
 */
export async function completeInventoryMigrationSession(workspaceId, sessionId) {
  const p_workspace_id = requireId(workspaceId, 'Workspace ID')
  const p_session_id = requireId(sessionId, 'Session ID')
  return callMigrationRpc(COMPLETE_SESSION_RPC, { p_workspace_id, p_session_id })
}

/**
 * Locked foundation-only transition: foundation → completed.
 * Does not expose arbitrary step names or target statuses.
 */
export async function completeInventoryMigrationFoundationStep(workspaceId, sessionId) {
  const p_workspace_id = requireId(workspaceId, 'Workspace ID')
  const p_session_id = requireId(sessionId, 'Session ID')
  return callMigrationRpc(TRANSITION_STEP_RPC, {
    p_workspace_id,
    p_session_id,
    p_step_name: FOUNDATION_STEP_NAME,
    p_target_status: FOUNDATION_COMPLETED_STATUS,
  })
}

export async function runInventoryMigrationPersist(workspaceId, sessionId) {
  const p_workspace_id = requireId(workspaceId, 'Workspace ID')
  const p_session_id = requireId(sessionId, 'Session ID')
  return callMigrationRpc(RUN_PERSIST_RPC, { p_workspace_id, p_session_id })
}

export async function runInventoryMigrationAutoLink(workspaceId, sessionId) {
  const p_workspace_id = requireId(workspaceId, 'Workspace ID')
  const p_session_id = requireId(sessionId, 'Session ID')
  return callMigrationRpc(RUN_AUTO_LINK_RPC, { p_workspace_id, p_session_id })
}

export async function runInventoryMigrationAutoCreate(workspaceId, sessionId) {
  const p_workspace_id = requireId(workspaceId, 'Workspace ID')
  const p_session_id = requireId(sessionId, 'Session ID')
  return callMigrationRpc(RUN_AUTO_CREATE_RPC, { p_workspace_id, p_session_id })
}

export async function runInventoryMigrationIntegrityAudit(workspaceId, sessionId) {
  const p_workspace_id = requireId(workspaceId, 'Workspace ID')
  const p_session_id = requireId(sessionId, 'Session ID')
  return callMigrationRpc(RUN_INTEGRITY_AUDIT_RPC, { p_workspace_id, p_session_id })
}

export async function runInventoryMigrationPreflight(workspaceId, sessionId) {
  const p_workspace_id = requireId(workspaceId, 'Workspace ID')
  const p_session_id = requireId(sessionId, 'Session ID')
  return callMigrationRpc(RUN_PREFLIGHT_RPC, { p_workspace_id, p_session_id })
}

export async function runInventoryMigrationPreview(workspaceId, sessionId) {
  const p_workspace_id = requireId(workspaceId, 'Workspace ID')
  const p_session_id = requireId(sessionId, 'Session ID')
  return callMigrationRpc(RUN_PREVIEW_RPC, { p_workspace_id, p_session_id })
}

export async function runInventoryMigrationPhase1(workspaceId, sessionId) {
  const p_workspace_id = requireId(workspaceId, 'Workspace ID')
  const p_session_id = requireId(sessionId, 'Session ID')
  return callMigrationRpc(RUN_PHASE1_RPC, { p_workspace_id, p_session_id })
}

/**
 * Phase 2 quantity apply. Caller must supply maintenance confirmation explicitly.
 * Does not force true.
 */
export async function runInventoryMigrationPhase2(
  workspaceId,
  sessionId,
  confirmMaintenanceWindow,
) {
  const p_workspace_id = requireId(workspaceId, 'Workspace ID')
  const p_session_id = requireId(sessionId, 'Session ID')
  if (typeof confirmMaintenanceWindow !== 'boolean') {
    throw new Error('Maintenance window confirmation boolean is required.')
  }
  return callMigrationRpc(RUN_PHASE2_RPC, {
    p_workspace_id,
    p_session_id,
    p_confirm_maintenance_window: confirmMaintenanceWindow,
  })
}

export async function runInventoryMigrationPostApplyAudit(workspaceId, sessionId) {
  const p_workspace_id = requireId(workspaceId, 'Workspace ID')
  const p_session_id = requireId(sessionId, 'Session ID')
  return callMigrationRpc(RUN_POST_APPLY_AUDIT_RPC, { p_workspace_id, p_session_id })
}

/**
 * Acknowledge attention_required for one V1 next-stage boundary.
 * Does not infer next_step_name. Does not execute stages.
 */
export async function acknowledgeInventoryMigrationStageAttention(
  workspaceId,
  sessionId,
  priorResultId,
  nextStepName,
  note = null,
) {
  const p_workspace_id = requireId(workspaceId, 'Workspace ID')
  const p_session_id = requireId(sessionId, 'Session ID')
  const p_prior_result_id = requireId(priorResultId, 'Prior result ID')
  const p_next_step_name = requireId(nextStepName, 'Next step name')
  return callMigrationRpc(ACKNOWLEDGE_ATTENTION_RPC, {
    p_workspace_id,
    p_session_id,
    p_prior_result_id,
    p_next_step_name,
    p_note: note ?? null,
  })
}
