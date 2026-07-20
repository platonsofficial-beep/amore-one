import { supabase } from '../lib/supabaseClient'

const CREATE_SESSION_RPC = 'create_inventory_count_session'
const BUILD_SNAPSHOT_RPC = 'build_inventory_count_snapshot'
const SESSION_ITEMS_TABLE = 'inventory_count_session_items'
const SESSION_LOCATIONS_TABLE = 'inventory_count_session_locations'

const VALID_COUNT_TYPES = new Set(['new', 'quick', 'partial', 'scheduled', 'emergency'])
const VALID_VISIBILITY = new Set(['blind', 'open'])
const NOTE_MAX_LENGTH = 250

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

function isRpcUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === 'PGRST202'
    || code === '42883'
    || message.includes('could not find the function')
    || (message.includes('function') && message.includes('does not exist'))
}

function extractRpcErrorCode(error) {
  const message = `${error?.message ?? error?.details ?? error?.hint ?? ''}`.trim()
  const match = message.match(/inventory_count_(?:session|snapshot)_[a-z0-9_]+/i)
  return match?.[0]?.toLowerCase() ?? ''
}

function mapInventoryCountRpcError(error, fallbackMessage) {
  if (!error) {
    return new Error(fallbackMessage)
  }

  if (isRpcUnavailableError(error)) {
    return new Error(
      'Inventory count RPCs are not ready yet. Run inventory_count SQL migrations in Supabase.',
    )
  }

  const code = extractRpcErrorCode(error)

  switch (code) {
    case 'inventory_count_session_unauthenticated':
    case 'inventory_count_snapshot_unauthenticated':
      return new Error('You must be signed in to manage inventory counts.')
    case 'inventory_count_session_forbidden':
    case 'inventory_count_snapshot_forbidden':
      return new Error('You do not have permission to manage inventory counts for this workspace.')
    case 'inventory_count_session_workspace_required':
    case 'inventory_count_snapshot_workspace_required':
      return new Error('Workspace is required.')
    case 'inventory_count_session_workspace_not_found':
      return new Error('Workspace was not found.')
    case 'inventory_count_session_invalid_count_type':
      return new Error('Invalid inventory count type.')
    case 'inventory_count_session_invalid_visibility':
      return new Error('Invalid inventory count visibility.')
    case 'inventory_count_session_note_too_long':
      return new Error(`Session note must be ${NOTE_MAX_LENGTH} characters or fewer.`)
    case 'inventory_count_session_locations_required':
    case 'inventory_count_snapshot_locations_required':
      return new Error('Select at least one location for this inventory count.')
    case 'inventory_count_session_invalid_location':
      return new Error('One or more locations are invalid.')
    case 'inventory_count_session_duplicate_locations':
      return new Error('Duplicate locations are not allowed.')
    case 'inventory_count_snapshot_session_required':
      return new Error('Inventory count session is required.')
    case 'inventory_count_snapshot_session_not_found':
      return new Error('Inventory count session was not found.')
    case 'inventory_count_snapshot_workspace_mismatch':
      return new Error('Inventory count session does not belong to this workspace.')
    case 'inventory_count_snapshot_session_not_in_progress':
      return new Error('Inventory count session must be in progress to build a snapshot.')
    case 'inventory_count_snapshot_already_exists':
      return new Error('A snapshot has already been created for this inventory count session.')
    default:
      return new Error(error.message || fallbackMessage)
  }
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

export function mapInventoryCountSessionRow(row) {
  if (!row || typeof row !== 'object') {
    return null
  }

  const id = `${row.id ?? ''}`.trim()
  const workspaceId = `${row.workspace_id ?? row.workspaceId ?? ''}`.trim()
  if (!id || !workspaceId) {
    return null
  }

  return {
    id,
    workspaceId,
    status: `${row.status ?? ''}`.trim() || 'in_progress',
    countType: `${row.count_type ?? row.countType ?? ''}`.trim(),
    visibility: `${row.visibility ?? ''}`.trim(),
    includeZeroStock: row.include_zero_stock ?? row.includeZeroStock ?? true,
    includeInactive: row.include_inactive ?? row.includeInactive ?? false,
    note: `${row.note ?? ''}`,
    startedBy: row.started_by ?? row.startedBy ?? null,
    startedAt: row.started_at ?? row.startedAt ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
  }
}

export function mapInventoryCountSnapshotResult(row) {
  if (!row || typeof row !== 'object') {
    return null
  }

  const sessionId = `${row.session_id ?? row.sessionId ?? ''}`.trim()
  if (!sessionId) {
    return null
  }

  const itemsCreated = Number(row.items_created ?? row.itemsCreated ?? 0)
  if (!Number.isFinite(itemsCreated) || itemsCreated < 0) {
    return null
  }

  return {
    sessionId,
    itemsCreated,
    snapshotCreatedAt: row.snapshot_created_at ?? row.snapshotCreatedAt ?? null,
  }
}

function mapNumericQuantity(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function mapInventoryCountSessionItemRow(row) {
  if (!row || typeof row !== 'object') {
    return null
  }

  const id = `${row.id ?? ''}`.trim()
  const sessionId = `${row.session_id ?? row.sessionId ?? ''}`.trim()
  const workspaceId = `${row.workspace_id ?? row.workspaceId ?? ''}`.trim()
  if (!id || !sessionId || !workspaceId) {
    return null
  }

  const itemId = `${row.item_id ?? row.itemId ?? ''}`.trim() || null
  const lineStatus = `${row.line_status ?? row.lineStatus ?? 'pending'}`.trim().toLowerCase() || 'pending'

  return {
    id,
    sessionId,
    workspaceId,
    itemId,
    itemName: `${row.item_name ?? row.itemName ?? ''}`.trim(),
    category: `${row.category ?? 'Other'}`.trim() || 'Other',
    itemType: `${row.item_type ?? row.itemType ?? 'Other'}`.trim() || 'Other',
    unit: `${row.unit ?? ''}`.trim(),
    storageLocation: `${row.storage_location ?? row.storageLocation ?? ''}`.trim(),
    expectedSnapshot: mapNumericQuantity(row.expected_snapshot ?? row.expectedSnapshot) ?? 0,
    countedQuantity: mapNumericQuantity(row.counted_quantity ?? row.countedQuantity),
    lineStatus,
    note: `${row.note ?? ''}`,
  }
}

export function mapInventoryCountSessionLocationRow(row) {
  if (!row || typeof row !== 'object') {
    return null
  }

  const id = `${row.id ?? ''}`.trim()
  const sessionId = `${row.session_id ?? row.sessionId ?? ''}`.trim()
  const workspaceId = `${row.workspace_id ?? row.workspaceId ?? ''}`.trim()
  const locationKey = `${row.location_key ?? row.locationKey ?? ''}`.trim()
  if (!id || !sessionId || !workspaceId || !locationKey) {
    return null
  }

  const sortOrder = Number(row.sort_order ?? row.sortOrder ?? 0)

  return {
    id,
    sessionId,
    workspaceId,
    locationKey,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    status: `${row.status ?? 'not_started'}`.trim().toLowerCase() || 'not_started',
  }
}

/**
 * Create an inventory count session + locations via SECURITY DEFINER RPC.
 * Does not build snapshot items and does not mutate stock.
 */
export async function createInventoryCountSession({
  workspaceId,
  countType,
  visibility,
  includeZeroStock = true,
  includeInactive = false,
  note = '',
  locations = [],
} = {}) {
  requireConfiguredSupabase()

  const p_workspace_id = requireId(workspaceId, 'Workspace')
  const p_count_type = `${countType ?? ''}`.trim().toLowerCase()
  const p_visibility = `${visibility ?? ''}`.trim().toLowerCase()
  const p_note = `${note ?? ''}`
  const p_locations = (Array.isArray(locations) ? locations : [])
    .map((location) => `${location ?? ''}`.trim())
    .filter(Boolean)

  if (!VALID_COUNT_TYPES.has(p_count_type)) {
    throw new Error('Invalid inventory count type.')
  }

  if (!VALID_VISIBILITY.has(p_visibility)) {
    throw new Error('Invalid inventory count visibility.')
  }

  if (p_note.length > NOTE_MAX_LENGTH) {
    throw new Error(`Session note must be ${NOTE_MAX_LENGTH} characters or fewer.`)
  }

  if (p_locations.length === 0) {
    throw new Error('Select at least one location for this inventory count.')
  }

  if (new Set(p_locations).size !== p_locations.length) {
    throw new Error('Duplicate locations are not allowed.')
  }

  const { data, error } = await supabase.rpc(CREATE_SESSION_RPC, {
    p_workspace_id,
    p_count_type,
    p_visibility,
    p_include_zero_stock: Boolean(includeZeroStock),
    p_include_inactive: Boolean(includeInactive),
    p_note,
    p_locations,
  })

  if (error) {
    console.error('[inventoryCountService] createInventoryCountSession error:', error)
    throw mapInventoryCountRpcError(error, 'Unable to create inventory count session right now.')
  }

  const mapped = mapInventoryCountSessionRow(firstRpcRow(data))
  if (!mapped) {
    throw new Error('Inventory count session response was empty or invalid.')
  }

  return mapped
}

/**
 * Build the frozen item snapshot for an in-progress inventory count session.
 * Does not mutate stock quantities or movements.
 */
export async function buildInventoryCountSnapshot({
  workspaceId,
  sessionId,
} = {}) {
  requireConfiguredSupabase()

  const p_workspace_id = requireId(workspaceId, 'Workspace')
  const p_session_id = requireId(sessionId, 'Session')

  const { data, error } = await supabase.rpc(BUILD_SNAPSHOT_RPC, {
    p_workspace_id,
    p_session_id,
  })

  if (error) {
    console.error('[inventoryCountService] buildInventoryCountSnapshot error:', error)
    throw mapInventoryCountRpcError(error, 'Unable to build inventory count snapshot right now.')
  }

  const mapped = mapInventoryCountSnapshotResult(firstRpcRow(data))
  if (!mapped) {
    throw new Error('Inventory count snapshot response was empty or invalid.')
  }

  return mapped
}

/**
 * Load inventory count session locations for the workspace session.
 * Read-only. Ordered by sort_order.
 */
export async function getInventoryCountSessionLocations({
  workspaceId,
  sessionId,
} = {}) {
  requireConfiguredSupabase()

  const normalizedWorkspaceId = requireId(workspaceId, 'Workspace')
  const normalizedSessionId = requireId(sessionId, 'Session')

  const { data, error } = await supabase
    .from(SESSION_LOCATIONS_TABLE)
    .select('id, session_id, workspace_id, location_key, sort_order, status')
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('session_id', normalizedSessionId)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[inventoryCountService] getInventoryCountSessionLocations error:', error)
    throw new Error(error.message || 'Unable to load inventory count locations right now.')
  }

  return (data ?? [])
    .map(mapInventoryCountSessionLocationRow)
    .filter(Boolean)
}

/**
 * Load frozen inventory count session item lines.
 * Read-only. Ordered by storage_location then item_name (stock display order).
 */
export async function getInventoryCountSessionItems({
  workspaceId,
  sessionId,
} = {}) {
  requireConfiguredSupabase()

  const normalizedWorkspaceId = requireId(workspaceId, 'Workspace')
  const normalizedSessionId = requireId(sessionId, 'Session')

  const { data, error } = await supabase
    .from(SESSION_ITEMS_TABLE)
    .select(
      'id, session_id, workspace_id, item_id, item_name, category, item_type, unit, storage_location, expected_snapshot, counted_quantity, line_status, note',
    )
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('session_id', normalizedSessionId)
    .order('storage_location', { ascending: true })
    .order('item_name', { ascending: true })

  if (error) {
    console.error('[inventoryCountService] getInventoryCountSessionItems error:', error)
    throw new Error(error.message || 'Unable to load inventory count items right now.')
  }

  return (data ?? [])
    .map(mapInventoryCountSessionItemRow)
    .filter(Boolean)
}
