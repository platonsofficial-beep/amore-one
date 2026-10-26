import { supabase } from '../lib/supabaseClient'
import { getMemberDisplayNamesByAuthUserIds } from './membershipService'
import {
  RECENT_INVENTORY_IMPORT_LIMIT,
  mapInventoryImportHistorySession,
} from '../lib/inventoryImportHistory'

const SESSION_COLUMNS = [
  'id',
  'workspace_id',
  'status',
  'source_filename',
  'created_by',
  'created_at',
  'completed_at',
  'apply_completed_at',
  'apply_result',
  'create_rows',
  'link_rows',
].join(', ')

/**
 * Last few import sessions for this workspace.
 * Members can already select inventory_import_sessions. This does not write.
 *
 * @param {{ workspaceId?: string, limit?: number }} input
 */
export async function listRecentInventoryImportSessions(input = {}) {
  const workspaceId = `${input.workspaceId ?? ''}`.trim()
  if (!workspaceId) return []
  if (!supabase) {
    throw new Error('Recent imports are not available yet.')
  }

  const limit = Number(input.limit) > 0
    ? Number(input.limit)
    : RECENT_INVENTORY_IMPORT_LIMIT

  const { data, error } = await supabase
    .from('inventory_import_sessions')
    .select(SESSION_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(error.message || 'Could not load recent imports.')
  }

  const sessions = (data ?? [])
    .map((row) => mapInventoryImportHistorySession(row))
    .filter(Boolean)

  let names = {}
  try {
    names = await getMemberDisplayNamesByAuthUserIds(
      workspaceId,
      sessions.map((session) => session.actorId),
    )
  } catch {
    names = {}
  }

  return sessions.map((session) => ({
    ...session,
    actorName: names[session.actorId] || 'Unknown',
  }))
}
