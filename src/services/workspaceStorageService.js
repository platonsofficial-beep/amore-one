import { supabase } from '../lib/supabaseClient'

const WORKSPACE_STORAGES_TABLE = 'workspace_storages'

/** Narrow select — list contract only; expand only in an explicit sprint. */
export const WORKSPACE_STORAGE_LIST_COLUMNS =
  'id, workspace_id, location_key, name, active, sort_order'

/**
 * @param {Record<string, unknown>|null|undefined} record
 * @returns {{
 *   id: unknown,
 *   workspaceId: string,
 *   locationKey: string,
 *   name: string,
 *   active: boolean,
 *   sortOrder: number,
 * }}
 */
export function mapWorkspaceStorage(record) {
  return {
    id: record?.id ?? null,
    workspaceId: record?.workspace_id ?? record?.workspaceId ?? '',
    locationKey: record?.location_key ?? record?.locationKey ?? '',
    name: record?.name ?? '',
    active: record?.active !== false,
    sortOrder: Number(record?.sort_order ?? record?.sortOrder ?? 0),
  }
}

function requireWorkspaceId(workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to load storages.')
  }
  return normalizedWorkspaceId
}

/**
 * Active workspace storages ordered for catalog display.
 * Read-only — create/archive/rename belong to later sprints.
 *
 * @param {string} workspaceId
 * @returns {Promise<Array<{
 *   id: unknown,
 *   workspaceId: string,
 *   locationKey: string,
 *   name: string,
 *   active: boolean,
 *   sortOrder: number,
 * }>>}
 */
export async function listWorkspaceStorages(workspaceId) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)

  const { data, error } = await supabase
    .from(WORKSPACE_STORAGES_TABLE)
    .select(WORKSPACE_STORAGE_LIST_COLUMNS)
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    console.error('[workspaceStorageService] listWorkspaceStorages error:', error)
    throw new Error(error.message || 'Unable to load workspace storages right now.')
  }

  return (data ?? []).map(mapWorkspaceStorage)
}
