import { supabase } from '../lib/supabaseClient'

const WORKSPACE_STORAGES_TABLE = 'workspace_storages'
const CREATE_RPC = 'create_workspace_storage'
const ARCHIVE_RPC = 'archive_workspace_storage'

/** Narrow select — list contract only; expand only in an explicit sprint. */
export const WORKSPACE_STORAGE_LIST_COLUMNS =
  'id, workspace_id, location_key, name, active, sort_order'

const LOCATION_KEY_MAX_LENGTH = 80

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

function requireWorkspaceId(workspaceId, message = 'Workspace is required.') {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error(message)
  }
  return normalizedWorkspaceId
}

function requireStorageId(storageId) {
  const normalized = `${storageId ?? ''}`.trim()
  if (!normalized) {
    throw new Error('Storage is required to archive.')
  }
  return normalized
}

/**
 * Validate and normalize location_key for create.
 * V1: name equals location_key (RPC sets both).
 *
 * @param {unknown} locationKey
 * @returns {string}
 */
export function normalizeWorkspaceStorageLocationKey(locationKey) {
  if (typeof locationKey !== 'string') {
    throw new Error('Storage location key is required.')
  }

  const trimmed = locationKey.trim()
  if (!trimmed) {
    throw new Error('Storage location key is required.')
  }

  if (locationKey !== trimmed) {
    throw new Error('Storage location key cannot have leading or trailing spaces.')
  }

  if (trimmed.length > LOCATION_KEY_MAX_LENGTH) {
    throw new Error(
      `Storage location key must be ${LOCATION_KEY_MAX_LENGTH} characters or fewer.`,
    )
  }

  return trimmed
}

function firstRpcRow(data) {
  if (Array.isArray(data)) {
    return data[0] ?? null
  }
  if (data && typeof data === 'object') {
    return data
  }
  return null
}

function mapWorkspaceStorageRpcError(error, fallbackMessage) {
  const message = `${error?.message ?? ''}`
  const lower = message.toLowerCase()

  if (lower.includes('workspace_storage_duplicate')) {
    return new Error('A storage with this name already exists in this workspace.')
  }
  if (lower.includes('workspace_storage_blocked_active_items')) {
    return new Error(
      'Cannot archive storage while active products still use this location.',
    )
  }
  if (lower.includes('workspace_storage_blocked_open_count')) {
    return new Error(
      'Cannot archive storage while an open inventory count uses this location.',
    )
  }
  if (lower.includes('workspace_storage_forbidden')) {
    return new Error('Only owner, general manager, or manager can manage storages.')
  }
  if (lower.includes('workspace_storage_not_found')) {
    return new Error('Storage was not found in this workspace.')
  }
  if (lower.includes('workspace_storage_unauthenticated')) {
    return new Error('Sign in required to manage storages.')
  }
  if (lower.includes('workspace_storage_location_key_too_long')) {
    return new Error(
      `Storage location key must be ${LOCATION_KEY_MAX_LENGTH} characters or fewer.`,
    )
  }
  if (
    lower.includes('workspace_storage_location_key_required')
    || lower.includes('workspace_storage_location_key_invalid')
  ) {
    return new Error('Storage location key is required.')
  }

  return new Error(message || fallbackMessage)
}

/**
 * Active workspace storages ordered for catalog display.
 *
 * @param {string} workspaceId
 */
export async function listWorkspaceStorages(workspaceId) {
  const normalizedWorkspaceId = requireWorkspaceId(
    workspaceId,
    'Workspace is required to load storages.',
  )

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

/**
 * Create a workspace storage via SECURITY DEFINER RPC.
 *
 * @param {string} workspaceId
 * @param {string} locationKey
 */
export async function createWorkspaceStorage(workspaceId, locationKey) {
  const p_workspace_id = requireWorkspaceId(
    workspaceId,
    'Workspace is required to create a storage.',
  )
  const p_location_key = normalizeWorkspaceStorageLocationKey(locationKey)

  const { data, error } = await supabase.rpc(CREATE_RPC, {
    p_workspace_id,
    p_location_key,
  })

  if (error) {
    console.error('[workspaceStorageService] createWorkspaceStorage error:', error)
    throw mapWorkspaceStorageRpcError(
      error,
      'Unable to create workspace storage right now.',
    )
  }

  const row = firstRpcRow(data)
  if (!row) {
    throw new Error('Create storage response was empty.')
  }

  return mapWorkspaceStorage(row)
}

/**
 * Archive a workspace storage via SECURITY DEFINER RPC (active=false).
 * Does not delete. Blocks active product refs and open Count sessions.
 *
 * @param {string} workspaceId
 * @param {string} storageId
 */
export async function archiveWorkspaceStorage(workspaceId, storageId) {
  const p_workspace_id = requireWorkspaceId(
    workspaceId,
    'Workspace is required to archive a storage.',
  )
  const p_storage_id = requireStorageId(storageId)

  const { data, error } = await supabase.rpc(ARCHIVE_RPC, {
    p_workspace_id,
    p_storage_id,
  })

  if (error) {
    console.error('[workspaceStorageService] archiveWorkspaceStorage error:', error)
    throw mapWorkspaceStorageRpcError(
      error,
      'Unable to archive workspace storage right now.',
    )
  }

  const row = firstRpcRow(data)
  if (!row) {
    throw new Error('Archive storage response was empty.')
  }

  return mapWorkspaceStorage(row)
}
