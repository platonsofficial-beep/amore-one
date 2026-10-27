import { buildMemberPermissionUpsertRows } from '../lib/memberAccess'
import { supabase } from '../lib/supabaseClient'

const TABLE = 'workspace_member_permissions'

function assertClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
}

export async function fetchMemberPermissionRows(workspaceId, memberId) {
  assertClient()
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedMemberId = `${memberId ?? ''}`.trim()
  if (!normalizedWorkspaceId || !normalizedMemberId) return []

  const { data, error } = await supabase
    .from(TABLE)
    .select('module, level')
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('member_id', normalizedMemberId)

  if (error) {
    throw new Error(error.message || 'Unable to load access right now.')
  }

  return Array.isArray(data) ? data : []
}

export async function saveMemberPermissionLevels({
  workspaceId,
  memberId,
  levels,
  updatedBy = null,
  updatedAt = new Date().toISOString(),
} = {}) {
  assertClient()
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedMemberId = `${memberId ?? ''}`.trim()
  if (!normalizedWorkspaceId || !normalizedMemberId) {
    throw new Error('A workspace member is required.')
  }

  const rows = buildMemberPermissionUpsertRows({
    workspaceId: normalizedWorkspaceId,
    memberId: normalizedMemberId,
    levels,
    updatedBy,
    updatedAt,
  })

  const { error } = await supabase
    .from(TABLE)
    .upsert(rows, { onConflict: 'workspace_id,member_id,module' })

  if (error) {
    throw new Error(error.message || 'Unable to save access right now.')
  }

  return rows
}
