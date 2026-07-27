import { supabase } from '../lib/supabaseClient'
import { getMemberDisplayNamesByAuthUserIds } from './membershipService'

const CREATE_SESSION_RPC = 'create_inventory_count_session'
const BUILD_SNAPSHOT_RPC = 'build_inventory_count_snapshot'
const UPDATE_SESSION_ITEM_RPC = 'update_inventory_count_session_item'
const COMPLETE_LOCATION_RPC = 'complete_inventory_count_location'
const SET_PAUSE_STATE_RPC = 'set_inventory_count_session_pause_state'
const PREVIEW_FINISH_RPC = 'preview_inventory_count_finish'
const POST_FINISH_RPC = 'post_inventory_count_finish'
const CANCEL_COMPLETION_RPC = 'cancel_inventory_count_completion'
const DELETE_SESSION_RPC = 'delete_inventory_count_session'
const REPAIR_CURRENT_LOCATION_RPC = 'repair_inventory_count_current_location'
const APPLY_CORRECTIONS_RPC = 'apply_inventory_count_corrections'
const SESSIONS_TABLE = 'inventory_count_sessions'
const SESSION_ITEMS_TABLE = 'inventory_count_session_items'
const SESSION_LOCATIONS_TABLE = 'inventory_count_session_locations'
const CORRECTIONS_TABLE = 'inventory_count_corrections'
const CORRECTION_LINES_TABLE = 'inventory_count_correction_lines'

const VALID_COUNT_TYPES = new Set(['new', 'quick', 'partial', 'scheduled', 'emergency'])
const VALID_VISIBILITY = new Set(['blind', 'open'])
const NOTE_MAX_LENGTH = 250

const COUNT_TYPE_LABELS = {
  new: 'New Count',
  quick: 'Quick Count',
  partial: 'Partial Count',
  scheduled: 'Scheduled Count',
  emergency: 'Emergency Count',
}

const SESSION_STATUS_LABELS = {
  in_progress: 'In progress',
  paused: 'Paused',
  counting_complete: 'Counting complete',
  posted: 'Posted',
  cancelled: 'Cancelled',
}

const HOME_SESSION_SELECT = [
  'id',
  'workspace_id',
  'status',
  'count_type',
  'visibility',
  'include_zero_stock',
  'include_inactive',
  'note',
  'started_by',
  'started_at',
  'paused_at',
  'completed_at',
  'posted_at',
  'posted_by',
  'snapshot_at',
  'cancelled_at',
  'created_at',
  'updated_at',
].join(', ')

const SESSION_ITEM_SELECT = [
  'id',
  'session_id',
  'workspace_id',
  'item_id',
  'item_name',
  'category',
  'item_type',
  'unit',
  'storage_location',
  'expected_snapshot',
  'counted_quantity',
  'counted_at',
  'expected_at_count',
  'variance_quantity',
  'live_quantity_at_post',
  'posted_movement_id',
  'line_status',
  'note',
].join(', ')

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

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01'
    || code === 'PGRST205'
    || message.includes('does not exist')
    || message.includes('could not find the table')
    || (message.includes('relation') && message.includes('does not exist'))
}

function extractRpcErrorCode(error) {
  const message = `${error?.message ?? error?.details ?? error?.hint ?? ''}`.trim()
  const match = message.match(/inventory_count_(?:session|snapshot|item|location|pause|preview|post|reconcile|cancel|repair|delete|correction)_[a-z0-9_]+/i)
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
    case 'inventory_count_item_unauthenticated':
    case 'inventory_count_location_unauthenticated':
    case 'inventory_count_pause_unauthenticated':
    case 'inventory_count_preview_unauthenticated':
    case 'inventory_count_post_unauthenticated':
    case 'inventory_count_cancel_unauthenticated':
    case 'inventory_count_delete_unauthenticated':
    case 'inventory_count_correction_unauthenticated':
      return new Error('You must be signed in to manage inventory counts.')
    case 'inventory_count_session_forbidden':
    case 'inventory_count_snapshot_forbidden':
    case 'inventory_count_item_forbidden':
    case 'inventory_count_location_forbidden':
    case 'inventory_count_pause_forbidden':
    case 'inventory_count_preview_forbidden':
    case 'inventory_count_post_forbidden':
    case 'inventory_count_cancel_forbidden':
    case 'inventory_count_delete_forbidden':
    case 'inventory_count_correction_forbidden':
      return new Error('You do not have permission to manage inventory counts for this workspace.')
    case 'inventory_count_session_workspace_required':
    case 'inventory_count_snapshot_workspace_required':
    case 'inventory_count_item_workspace_required':
    case 'inventory_count_location_workspace_required':
    case 'inventory_count_pause_workspace_required':
    case 'inventory_count_preview_workspace_required':
    case 'inventory_count_post_workspace_required':
    case 'inventory_count_cancel_workspace_required':
    case 'inventory_count_delete_workspace_required':
    case 'inventory_count_correction_workspace_required':
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
    case 'inventory_count_item_session_required':
    case 'inventory_count_location_session_required':
    case 'inventory_count_pause_session_required':
    case 'inventory_count_preview_session_required':
    case 'inventory_count_post_session_required':
    case 'inventory_count_cancel_session_required':
    case 'inventory_count_delete_session_required':
    case 'inventory_count_correction_session_required':
      return new Error('Inventory count session is required.')
    case 'inventory_count_snapshot_session_not_found':
    case 'inventory_count_item_session_not_found':
    case 'inventory_count_location_session_not_found':
    case 'inventory_count_pause_session_not_found':
    case 'inventory_count_preview_session_not_found':
    case 'inventory_count_post_session_not_found':
    case 'inventory_count_cancel_session_not_found':
    case 'inventory_count_delete_session_not_found':
    case 'inventory_count_correction_session_not_found':
      return new Error('Inventory count session was not found.')
    case 'inventory_count_snapshot_workspace_mismatch':
    case 'inventory_count_item_workspace_mismatch':
    case 'inventory_count_location_workspace_mismatch':
    case 'inventory_count_pause_workspace_mismatch':
    case 'inventory_count_preview_workspace_mismatch':
    case 'inventory_count_post_workspace_mismatch':
    case 'inventory_count_cancel_workspace_mismatch':
    case 'inventory_count_delete_workspace_mismatch':
    case 'inventory_count_correction_workspace_mismatch':
      return new Error('Inventory count session does not belong to this workspace.')
    case 'inventory_count_delete_failed':
      return new Error('Unable to delete inventory count right now.')
    case 'inventory_count_correction_session_not_posted':
      return new Error('Only posted inventory counts can receive corrections.')
    case 'inventory_count_correction_empty':
    case 'inventory_count_correction_payload_required':
    case 'inventory_count_correction_no_changes':
      return new Error('Add at least one non-zero correction before applying.')
    case 'inventory_count_correction_invalid_line':
    case 'inventory_count_correction_line_not_found':
    case 'inventory_count_correction_original_missing':
    case 'inventory_count_correction_item_unlinked':
    case 'inventory_count_correction_duplicate_item':
      return new Error('One or more correction lines are invalid.')
    case 'inventory_count_correction_stock_item_missing':
      return new Error('A stock item referenced by a correction was not found.')
    case 'inventory_count_correction_movement_failed':
    case 'inventory_count_correction_quantity_update_failed':
      return new Error('Unable to apply inventory count corrections right now. Retry.')
    case 'inventory_count_snapshot_session_not_in_progress':
      return new Error('Inventory count session must be in progress to build a snapshot.')
    case 'inventory_count_item_session_not_in_progress':
      return new Error('Inventory count session must be in progress to update counted quantities.')
    case 'inventory_count_location_session_not_in_progress':
      return new Error('Inventory count session must be in progress to complete a location.')
    case 'inventory_count_pause_cannot_pause':
      return new Error('Inventory count session must be in progress to pause.')
    case 'inventory_count_pause_cannot_resume':
      return new Error('Inventory count session must be paused to resume.')
    case 'inventory_count_pause_state_required':
      return new Error('Pause state is required.')
    case 'inventory_count_preview_session_not_complete':
      return new Error('Inventory count session must be counting complete to preview finish.')
    case 'inventory_count_preview_snapshot_missing':
    case 'inventory_count_post_snapshot_missing':
      return new Error('Inventory count snapshot was not found for this session.')
    case 'inventory_count_post_session_cancelled':
      return new Error('Inventory count session was cancelled and cannot be posted.')
    case 'inventory_count_post_already_posted':
      return new Error('Inventory count session has already been posted.')
    case 'inventory_count_post_session_not_complete':
      return new Error('Inventory count session must be counting complete to post.')
    case 'inventory_count_cancel_session_in_progress':
      return new Error('In-progress inventory counts cannot be cancelled from Home. Complete counting first.')
    case 'inventory_count_cancel_session_paused':
      return new Error('Paused inventory counts cannot be cancelled from Home. Resume or complete counting first.')
    case 'inventory_count_cancel_session_posted':
      return new Error('Posted inventory counts cannot be cancelled.')
    case 'inventory_count_cancel_session_cancelled':
      return new Error('Inventory count session is already cancelled.')
    case 'inventory_count_cancel_not_counting_complete':
    case 'inventory_count_cancel_stale_status':
      return new Error('Only counting-complete sessions can be cancelled. Refresh and try again.')
    case 'inventory_count_repair_forbidden':
      return new Error('You do not have permission to repair inventory counts for this workspace.')
    case 'inventory_count_repair_unauthenticated':
      return new Error('Sign in required to repair inventory counts.')
    case 'inventory_count_repair_workspace_required':
    case 'inventory_count_repair_session_required':
      return new Error('Workspace and session are required to repair inventory count.')
    case 'inventory_count_repair_workspace_mismatch':
      return new Error('Inventory count session does not belong to this workspace.')
    case 'inventory_count_repair_session_not_found':
      return new Error('Inventory count session was not found.')
    case 'inventory_count_repair_session_counting_complete':
      return new Error('Counting-complete sessions cannot be repaired.')
    case 'inventory_count_repair_session_posted':
      return new Error('Posted inventory counts cannot be repaired.')
    case 'inventory_count_repair_session_cancelled':
      return new Error('Cancelled inventory counts cannot be repaired.')
    case 'inventory_count_repair_session_status_invalid':
      return new Error('Only in-progress or paused inventory counts can be repaired.')
    case 'inventory_count_repair_multiple_current_locations':
      return new Error('Session has more than one current location; repair refused.')
    case 'inventory_count_repair_postcondition_failed':
      return new Error('Repair did not leave exactly one current location.')
    case 'inventory_count_post_blocked':
      return new Error('Inventory count cannot be posted until all blocking issues are resolved.')
    case 'inventory_count_session_snapshot_at_immutable':
      return new Error('Inventory count snapshot timestamp cannot be changed.')
    case 'inventory_count_item_frozen_field':
      return new Error('Inventory count snapshot fields cannot be changed.')
    case 'inventory_count_snapshot_already_exists':
      return new Error('A snapshot has already been created for this inventory count session.')
    case 'inventory_count_item_session_item_required':
      return new Error('Inventory count item is required.')
    case 'inventory_count_item_not_found':
      return new Error('Inventory count item was not found.')
    case 'inventory_count_item_session_mismatch':
      return new Error('Inventory count item does not belong to this session.')
    case 'inventory_count_item_invalid_quantity':
      return new Error('Counted quantity must be a valid non-negative number.')
    case 'inventory_count_location_location_required':
      return new Error('Inventory count location is required.')
    case 'inventory_count_location_not_found':
      return new Error('Inventory count location was not found.')
    case 'inventory_count_location_session_mismatch':
      return new Error('Inventory count location does not belong to this session.')
    case 'inventory_count_location_not_current':
      return new Error('Only the current location can be completed.')
    case 'inventory_count_location_items_pending':
      return new Error('Count or skip all items in this location before completing it.')
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

  const countType = `${row.count_type ?? row.countType ?? ''}`.trim()
  const status = `${row.status ?? ''}`.trim() || 'in_progress'
  const pausedAtRaw = row.paused_at ?? row.pausedAt
  const completedAtRaw = row.completed_at ?? row.completedAt
  const postedAtRaw = row.posted_at ?? row.postedAt
  const snapshotAtRaw = row.snapshot_at ?? row.snapshotAt
  const cancelledAtRaw = row.cancelled_at ?? row.cancelledAt
  const updatedAtRaw = row.updated_at ?? row.updatedAt
  const postedByRaw = row.posted_by ?? row.postedBy

  return {
    id,
    workspaceId,
    status,
    statusLabel: SESSION_STATUS_LABELS[status] || status,
    countType,
    countTypeLabel: COUNT_TYPE_LABELS[countType] || countType || 'Inventory Count',
    visibility: `${row.visibility ?? ''}`.trim(),
    includeZeroStock: row.include_zero_stock ?? row.includeZeroStock ?? true,
    includeInactive: row.include_inactive ?? row.includeInactive ?? false,
    note: `${row.note ?? ''}`,
    startedBy: row.started_by ?? row.startedBy ?? null,
    startedAt: row.started_at ?? row.startedAt ?? null,
    pausedAt: pausedAtRaw == null || pausedAtRaw === '' ? null : `${pausedAtRaw}`,
    completedAt: completedAtRaw == null || completedAtRaw === '' ? null : `${completedAtRaw}`,
    postedAt: postedAtRaw == null || postedAtRaw === '' ? null : `${postedAtRaw}`,
    postedBy: postedByRaw == null || postedByRaw === '' ? null : `${postedByRaw}`,
    snapshotAt: snapshotAtRaw == null || snapshotAtRaw === '' ? null : `${snapshotAtRaw}`,
    cancelledAt: cancelledAtRaw == null || cancelledAtRaw === '' ? null : `${cancelledAtRaw}`,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: updatedAtRaw == null || updatedAtRaw === '' ? null : `${updatedAtRaw}`,
  }
}

/**
 * Partition workspace sessions for Inventory Count home panels.
 * Active includes counting_complete so open (delete-blocking) sessions stay visible.
 */
export function partitionInventoryCountHomeSessions(sessions = []) {
  const active = []
  const paused = []
  const recent = []

  for (const session of sessions) {
    if (!session?.id) continue
    if (session.status === 'in_progress' || session.status === 'counting_complete') {
      active.push(session)
    } else if (session.status === 'paused') {
      paused.push(session)
    } else if (session.status === 'posted') {
      recent.push(session)
    }
  }

  return { active, paused, recent }
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
  const postedMovementIdRaw = row.posted_movement_id ?? row.postedMovementId
  const countedAtRaw = row.counted_at ?? row.countedAt

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
    countedAt: countedAtRaw == null || countedAtRaw === '' ? null : `${countedAtRaw}`,
    expectedAtCount: mapNumericQuantity(row.expected_at_count ?? row.expectedAtCount),
    varianceQuantity: mapNumericQuantity(row.variance_quantity ?? row.varianceQuantity),
    liveQuantityAtPost: mapNumericQuantity(row.live_quantity_at_post ?? row.liveQuantityAtPost),
    postedMovementId: postedMovementIdRaw == null || postedMovementIdRaw === ''
      ? null
      : `${postedMovementIdRaw}`.trim() || null,
    lineStatus,
    note: `${row.note ?? ''}`,
  }
}

/**
 * Reconstruct as-posted result from frozen post-time fields only.
 * Does not use current live stock.
 */
export function reconstructInventoryCountResultAfterPost({
  liveQuantityAtPost,
  varianceQuantity,
} = {}) {
  const live = mapNumericQuantity(liveQuantityAtPost)
  const variance = mapNumericQuantity(varianceQuantity)
  if (live === null || variance === null) return null
  return live + variance
}

/**
 * Summary cards for posted historical review from persisted line audit fields.
 */
export function summarizeInventoryCountPostedReview(items = []) {
  let totalLines = 0
  let countedLines = 0
  let skippedLines = 0
  let pendingLines = 0
  let changedItems = 0
  let unchangedItems = 0
  let positiveVariances = 0
  let negativeVariances = 0

  for (const item of items) {
    if (!item) continue
    totalLines += 1
    const lineStatus = `${item.lineStatus ?? ''}`.trim().toLowerCase()
    if (lineStatus === 'skipped') {
      skippedLines += 1
      continue
    }
    if (lineStatus !== 'counted') {
      pendingLines += 1
      continue
    }

    countedLines += 1
    const variance = mapNumericQuantity(item.varianceQuantity)
    if (variance === null) continue
    if (variance === 0) {
      unchangedItems += 1
    } else {
      changedItems += 1
      if (variance > 0) positiveVariances += 1
      else negativeVariances += 1
    }
  }

  return {
    totalLines,
    countedLines,
    skippedLines,
    pendingLines,
    changedItems,
    unchangedItems,
    positiveVariances,
    negativeVariances,
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

function buildLocationProgressBySession(locationRows = []) {
  const progressBySessionId = new Map()

  for (const row of locationRows) {
    const mapped = mapInventoryCountSessionLocationRow(row)
    if (!mapped) continue

    const current = progressBySessionId.get(mapped.sessionId) || {
      locationKeys: [],
      completedLocations: 0,
      totalLocations: 0,
    }
    current.locationKeys.push(mapped.locationKey)
    current.totalLocations += 1
    if (mapped.status === 'completed') {
      current.completedLocations += 1
    }
    progressBySessionId.set(mapped.sessionId, current)
  }

  return progressBySessionId
}

function buildItemProgressBySession(itemRows = []) {
  const progressBySessionId = new Map()

  for (const row of itemRows) {
    const sessionId = `${row?.session_id ?? row?.sessionId ?? ''}`.trim()
    if (!sessionId) continue
    const lineStatus = `${row?.line_status ?? row?.lineStatus ?? 'pending'}`.trim().toLowerCase() || 'pending'
    const current = progressBySessionId.get(sessionId) || {
      countedItems: 0,
      pendingItems: 0,
      totalItems: 0,
    }
    current.totalItems += 1
    if (lineStatus === 'counted' || lineStatus === 'skipped') {
      current.countedItems += 1
    } else {
      current.pendingItems += 1
    }
    progressBySessionId.set(sessionId, current)
  }

  return progressBySessionId
}

/**
 * Home-card progress copy (UX only).
 */
export function formatInventoryCountHomeProgress(session) {
  const status = `${session?.status ?? ''}`.trim()
  const countedItems = Number(session?.countedItems) || 0
  const totalItems = Number(session?.totalItems) || 0
  const completedLocations = Number(session?.completedLocations) || 0
  const totalLocations = Number(session?.totalLocations) || 0

  if (status === 'counting_complete') {
    return 'All locations completed · Waiting for Finish'
  }

  if (totalItems > 0) {
    return `${countedItems} / ${totalItems} items counted`
  }

  if (totalLocations > 0 && completedLocations >= totalLocations) {
    return 'All locations completed'
  }

  if (totalLocations > 0) {
    return `${completedLocations} / ${totalLocations} locations`
  }

  return 'No items yet'
}

/**
 * Read-only home list of inventory count sessions for a workspace.
 * Includes location/item progress and operator display names when available.
 */
export async function listInventoryCountHomeSessions({ workspaceId } = {}) {
  requireConfiguredSupabase()

  const normalizedWorkspaceId = requireId(workspaceId, 'Workspace')

  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select(HOME_SESSION_SELECT)
    .eq('workspace_id', normalizedWorkspaceId)
    .order('started_at', { ascending: false })

  if (error) {
    console.error('[inventoryCountService] listInventoryCountHomeSessions error:', error)
    throw new Error(error.message || 'Unable to load inventory count sessions right now.')
  }

  const sessions = (data ?? [])
    .map(mapInventoryCountSessionRow)
    .filter(Boolean)

  if (sessions.length === 0) {
    return partitionInventoryCountHomeSessions([])
  }

  const sessionIds = sessions.map((session) => session.id)
  const operatorIds = [...new Set(sessions.map((session) => session.startedBy).filter(Boolean))]

  const [locationsResult, itemsResult, operatorNames] = await Promise.all([
    supabase
      .from(SESSION_LOCATIONS_TABLE)
      .select('id, session_id, workspace_id, location_key, sort_order, status')
      .eq('workspace_id', normalizedWorkspaceId)
      .in('session_id', sessionIds)
      .order('sort_order', { ascending: true }),
    supabase
      .from(SESSION_ITEMS_TABLE)
      .select('session_id, line_status')
      .eq('workspace_id', normalizedWorkspaceId)
      .in('session_id', sessionIds),
    getMemberDisplayNamesByAuthUserIds(normalizedWorkspaceId, operatorIds),
  ])

  if (locationsResult.error) {
    console.error(
      '[inventoryCountService] listInventoryCountHomeSessions locations error:',
      locationsResult.error,
    )
    throw new Error(
      locationsResult.error.message || 'Unable to load inventory count locations right now.',
    )
  }

  if (itemsResult.error) {
    console.error(
      '[inventoryCountService] listInventoryCountHomeSessions items error:',
      itemsResult.error,
    )
    throw new Error(
      itemsResult.error.message || 'Unable to load inventory count items right now.',
    )
  }

  const progressBySessionId = buildLocationProgressBySession(locationsResult.data ?? [])
  const itemProgressBySessionId = buildItemProgressBySession(itemsResult.data ?? [])

  const enriched = sessions.map((session) => {
    const progress = progressBySessionId.get(session.id) || {
      locationKeys: [],
      completedLocations: 0,
      totalLocations: 0,
    }
    const itemProgress = itemProgressBySessionId.get(session.id) || {
      countedItems: 0,
      pendingItems: 0,
      totalItems: 0,
    }
    const operatorName = session.startedBy
      ? (operatorNames[session.startedBy] || null)
      : null

    return {
      ...session,
      operatorName,
      locations: progress.locationKeys,
      completedLocations: progress.completedLocations,
      totalLocations: progress.totalLocations,
      countedItems: itemProgress.countedItems,
      pendingItems: itemProgress.pendingItems,
      totalItems: itemProgress.totalItems,
      progressLabel: formatInventoryCountHomeProgress({
        ...session,
        completedLocations: progress.completedLocations,
        totalLocations: progress.totalLocations,
        countedItems: itemProgress.countedItems,
        totalItems: itemProgress.totalItems,
      }),
    }
  })

  return partitionInventoryCountHomeSessions(enriched)
}

/**
 * Read one inventory count session (workspace-scoped).
 */
export async function getInventoryCountSession({
  workspaceId,
  sessionId,
} = {}) {
  requireConfiguredSupabase()

  const normalizedWorkspaceId = requireId(workspaceId, 'Workspace')
  const normalizedSessionId = requireId(sessionId, 'Session')

  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select(HOME_SESSION_SELECT)
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedSessionId)
    .maybeSingle()

  if (error) {
    console.error('[inventoryCountService] getInventoryCountSession error:', error)
    throw new Error(error.message || 'Unable to load inventory count session right now.')
  }

  const mapped = mapInventoryCountSessionRow(data)
  if (!mapped) {
    throw new Error('Inventory count session was not found.')
  }

  return mapped
}

const OPEN_COUNT_STATUSES = ['in_progress', 'paused', 'counting_complete']

/**
 * Read-only: resolve the open inventory count session blocking a stock product.
 * Used for Permanent Delete UX guidance only — does not change delete rules.
 */
export async function getOpenInventoryCountBlockerForStockItem({
  workspaceId,
  stockItemId,
} = {}) {
  requireConfiguredSupabase()

  const normalizedWorkspaceId = requireId(workspaceId, 'Workspace')
  const normalizedStockItemId = requireId(stockItemId, 'Stock item')

  const { data: itemRows, error: itemError } = await supabase
    .from(SESSION_ITEMS_TABLE)
    .select('session_id, storage_location')
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('item_id', normalizedStockItemId)

  if (itemError) {
    console.error('[inventoryCountService] getOpenInventoryCountBlockerForStockItem items error:', itemError)
    throw new Error(itemError.message || 'Unable to load inventory count references right now.')
  }

  const sessionIds = [...new Set(
    (itemRows ?? [])
      .map((row) => `${row?.session_id ?? ''}`.trim())
      .filter(Boolean),
  )]

  if (sessionIds.length === 0) {
    return null
  }

  const { data: sessionRows, error: sessionError } = await supabase
    .from(SESSIONS_TABLE)
    .select(HOME_SESSION_SELECT)
    .eq('workspace_id', normalizedWorkspaceId)
    .in('id', sessionIds)
    .in('status', OPEN_COUNT_STATUSES)
    .order('started_at', { ascending: false })
    .limit(1)

  if (sessionError) {
    console.error(
      '[inventoryCountService] getOpenInventoryCountBlockerForStockItem sessions error:',
      sessionError,
    )
    throw new Error(sessionError.message || 'Unable to load inventory count sessions right now.')
  }

  const session = mapInventoryCountSessionRow((sessionRows ?? [])[0])
  if (!session) {
    return null
  }

  const locationRow = (itemRows ?? []).find((row) => `${row.session_id ?? ''}`.trim() === session.id)
  const storageLocation = `${locationRow?.storage_location ?? ''}`.trim() || '—'

  let operatorName = null
  if (session.startedBy) {
    const names = await getMemberDisplayNamesByAuthUserIds(
      normalizedWorkspaceId,
      [session.startedBy],
    )
    operatorName = names[session.startedBy] || null
  }

  return {
    sessionId: session.id,
    workspaceId: session.workspaceId,
    status: session.status,
    statusLabel: session.statusLabel,
    countType: session.countType,
    countTypeLabel: session.countTypeLabel,
    startedAt: session.startedAt,
    operatorName,
    storageLocation,
  }
}

/**
 * Cancel a counting_complete inventory count session via SECURITY DEFINER RPC.
 * Does not mutate stock, session items, or snapshots.
 */
export async function cancelInventoryCountSession({
  workspaceId,
  sessionId,
} = {}) {
  requireConfiguredSupabase()

  const p_workspace_id = requireId(workspaceId, 'Workspace')
  const p_session_id = requireId(sessionId, 'Session')

  const { data, error } = await supabase.rpc(CANCEL_COMPLETION_RPC, {
    p_workspace_id,
    p_session_id,
  })

  if (error) {
    console.error('[inventoryCountService] cancelInventoryCountSession error:', error)
    throw mapInventoryCountRpcError(error, 'Unable to cancel inventory count right now.')
  }

  const payload = firstRpcRow(data) ?? data
  const sessionIdResult = `${payload?.session_id ?? payload?.sessionId ?? ''}`.trim()
  const workspaceIdResult = `${payload?.workspace_id ?? payload?.workspaceId ?? ''}`.trim()
  const status = `${payload?.status ?? ''}`.trim()

  if (!sessionIdResult || !workspaceIdResult || status !== 'cancelled') {
    throw new Error('Cancel inventory count response was empty or invalid.')
  }

  return {
    id: sessionIdResult,
    workspaceId: workspaceIdResult,
    status,
    statusLabel: SESSION_STATUS_LABELS.cancelled,
    cancelledAt: payload.cancelled_at ?? payload.cancelledAt ?? null,
    updatedAt: payload.updated_at ?? payload.updatedAt ?? null,
    preserved: payload.preserved ?? null,
    mutations: payload.mutations ?? null,
  }
}

/**
 * Permanently delete an inventory count session via SECURITY DEFINER RPC.
 * Cascades session locations + items. Does not mutate stock quantities or movements.
 */
export async function deleteInventoryCountSession({
  workspaceId,
  sessionId,
} = {}) {
  requireConfiguredSupabase()

  const p_workspace_id = requireId(workspaceId, 'Workspace')
  const p_session_id = requireId(sessionId, 'Session')

  const { data, error } = await supabase.rpc(DELETE_SESSION_RPC, {
    p_workspace_id,
    p_session_id,
  })

  if (error) {
    console.error('[inventoryCountService] deleteInventoryCountSession error:', error)
    throw mapInventoryCountRpcError(error, 'Unable to delete inventory count right now.')
  }

  const payload = firstRpcRow(data) ?? data
  const sessionIdResult = `${payload?.session_id ?? payload?.sessionId ?? ''}`.trim()
  const workspaceIdResult = `${payload?.workspace_id ?? payload?.workspaceId ?? ''}`.trim()
  const deleted = Boolean(payload?.deleted)

  if (!sessionIdResult || !workspaceIdResult || !deleted) {
    throw new Error('Delete inventory count response was empty or invalid.')
  }

  return {
    id: sessionIdResult,
    workspaceId: workspaceIdResult,
    deleted: true,
    previousStatus: `${payload?.previous_status ?? payload?.previousStatus ?? ''}`.trim() || null,
    deletedAt: payload?.deleted_at ?? payload?.deletedAt ?? null,
    preserved: payload?.preserved ?? null,
    mutations: payload?.mutations ?? null,
  }
}

/**
 * Ops-only: preview or repair a session with zero current locations.
 * Does not mutate items, counted quantities, stock, or session status.
 */
export async function repairInventoryCountCurrentLocation({
  workspaceId,
  sessionId,
  preview = true,
} = {}) {
  requireConfiguredSupabase()

  const p_workspace_id = requireId(workspaceId, 'Workspace')
  const p_session_id = requireId(sessionId, 'Session')
  const p_preview = preview !== false

  const { data, error } = await supabase.rpc(REPAIR_CURRENT_LOCATION_RPC, {
    p_workspace_id,
    p_session_id,
    p_preview,
  })

  if (error) {
    console.error('[inventoryCountService] repairInventoryCountCurrentLocation error:', error)
    throw mapInventoryCountRpcError(error, 'Unable to repair inventory count current location right now.')
  }

  const payload = firstRpcRow(data) ?? data
  if (!payload || typeof payload !== 'object') {
    throw new Error('Repair inventory count response was empty or invalid.')
  }

  const blockersRaw = payload.blockers
  const blockers = Array.isArray(blockersRaw)
    ? blockersRaw.map((entry) => `${entry ?? ''}`.trim()).filter(Boolean)
    : []

  return {
    success: Boolean(payload.success),
    outcome: `${payload.outcome ?? ''}`.trim() || null,
    eligible: Boolean(payload.eligible),
    blockers,
    mutationPerformed: Boolean(payload.mutation_performed ?? payload.mutationPerformed),
    preview: Boolean(payload.preview ?? p_preview),
    sessionId: `${payload.session_id ?? payload.sessionId ?? ''}`.trim() || null,
    workspaceId: `${payload.workspace_id ?? payload.workspaceId ?? ''}`.trim() || null,
    sessionStatus: `${payload.session_status ?? payload.sessionStatus ?? ''}`.trim() || null,
    totalLocations: Number(payload.total_locations ?? payload.totalLocations) || 0,
    currentCount: Number(payload.current_count ?? payload.currentCount) || 0,
    completedCount: Number(payload.completed_count ?? payload.completedCount) || 0,
    notStartedCount: Number(payload.not_started_count ?? payload.notStartedCount) || 0,
    proposedLocationId: `${payload.proposed_location_id ?? payload.proposedLocationId ?? ''}`.trim() || null,
    proposedLocationKey: `${payload.proposed_location_key ?? payload.proposedLocationKey ?? ''}`.trim() || null,
    proposedPreviousStatus: `${payload.proposed_previous_status ?? payload.proposedPreviousStatus ?? ''}`.trim() || null,
    proposedNewStatus: `${payload.proposed_new_status ?? payload.proposedNewStatus ?? ''}`.trim() || null,
    repairedLocationId: `${payload.repaired_location_id ?? payload.repairedLocationId ?? ''}`.trim() || null,
    repairedLocationKey: `${payload.repaired_location_key ?? payload.repairedLocationKey ?? ''}`.trim() || null,
    previousStatus: `${payload.previous_status ?? payload.previousStatus ?? ''}`.trim() || null,
    newStatus: `${payload.new_status ?? payload.newStatus ?? ''}`.trim() || null,
    currentCountAfter: Number(payload.current_count_after ?? payload.currentCountAfter) || 0,
    mutations: payload.mutations ?? null,
  }
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
    .select(SESSION_ITEM_SELECT)
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

/**
 * Read-only posted count historical review payload.
 * Uses persisted post-audit fields only. Does not call finish preview or mutate stock.
 */
export async function getInventoryCountPostedReview({
  workspaceId,
  sessionId,
} = {}) {
  requireConfiguredSupabase()

  const normalizedWorkspaceId = requireId(workspaceId, 'Workspace')
  const normalizedSessionId = requireId(sessionId, 'Session')

  const [session, locations, items, corrections] = await Promise.all([
    getInventoryCountSession({
      workspaceId: normalizedWorkspaceId,
      sessionId: normalizedSessionId,
    }),
    getInventoryCountSessionLocations({
      workspaceId: normalizedWorkspaceId,
      sessionId: normalizedSessionId,
    }),
    getInventoryCountSessionItems({
      workspaceId: normalizedWorkspaceId,
      sessionId: normalizedSessionId,
    }),
    listInventoryCountCorrections({
      workspaceId: normalizedWorkspaceId,
      sessionId: normalizedSessionId,
    }),
  ])

  if (session.status !== 'posted') {
    throw new Error('Only posted inventory counts can be opened in historical review.')
  }

  const authUserIds = [
    session.startedBy,
    session.postedBy,
    ...corrections.map((correction) => correction.createdBy),
  ].filter(Boolean)
  const displayNames = authUserIds.length > 0
    ? await getMemberDisplayNamesByAuthUserIds(normalizedWorkspaceId, authUserIds)
    : {}

  const reviewItems = items.map((item) => ({
    ...item,
    resultAfterPost: reconstructInventoryCountResultAfterPost({
      liveQuantityAtPost: item.liveQuantityAtPost,
      varianceQuantity: item.varianceQuantity,
    }),
  }))

  const correctionsWithNames = corrections.map((correction) => ({
    ...correction,
    operatorName: correction.createdBy
      ? (displayNames[correction.createdBy] || null)
      : null,
  }))

  const correctionLineCount = correctionsWithNames.reduce(
    (sum, correction) => sum + (Number(correction.lineCount) || 0),
    0,
  )

  return {
    session: {
      ...session,
      operatorName: session.startedBy
        ? (displayNames[session.startedBy] || null)
        : null,
      postedByName: session.postedBy
        ? (displayNames[session.postedBy] || null)
        : null,
    },
    locations,
    items: reviewItems,
    summary: summarizeInventoryCountPostedReview(reviewItems),
    corrections: correctionsWithNames,
    correctionCount: correctionLineCount,
    hasCorrections: correctionLineCount > 0,
  }
}

export function mapInventoryCountCorrectionLineRow(row) {
  if (!row || typeof row !== 'object') return null

  const id = `${row.id ?? ''}`.trim()
  const correctionId = `${row.correction_id ?? row.correctionId ?? ''}`.trim()
  const sessionId = `${row.session_id ?? row.sessionId ?? ''}`.trim()
  const workspaceId = `${row.workspace_id ?? row.workspaceId ?? ''}`.trim()
  const sessionItemId = `${row.session_item_id ?? row.sessionItemId ?? ''}`.trim()
  if (!id || !correctionId || !sessionId || !workspaceId || !sessionItemId) {
    return null
  }

  return {
    id,
    correctionId,
    sessionId,
    workspaceId,
    sessionItemId,
    itemId: `${row.item_id ?? row.itemId ?? ''}`.trim() || null,
    itemName: `${row.item_name ?? row.itemName ?? ''}`.trim(),
    originalQuantity: mapNumericQuantity(row.original_quantity ?? row.originalQuantity),
    baselineQuantity: mapNumericQuantity(row.baseline_quantity ?? row.baselineQuantity),
    correctedQuantity: mapNumericQuantity(row.corrected_quantity ?? row.correctedQuantity),
    deltaQuantity: mapNumericQuantity(row.delta_quantity ?? row.deltaQuantity),
    movementId: `${row.movement_id ?? row.movementId ?? ''}`.trim() || null,
    createdBy: row.created_by ?? row.createdBy ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
  }
}

export function mapInventoryCountCorrectionRow(row, lines = []) {
  if (!row || typeof row !== 'object') return null

  const id = `${row.id ?? ''}`.trim()
  const sessionId = `${row.session_id ?? row.sessionId ?? ''}`.trim()
  const workspaceId = `${row.workspace_id ?? row.workspaceId ?? ''}`.trim()
  if (!id || !sessionId || !workspaceId) return null

  const mappedLines = (Array.isArray(lines) ? lines : [])
    .map(mapInventoryCountCorrectionLineRow)
    .filter(Boolean)

  return {
    id,
    sessionId,
    workspaceId,
    createdBy: row.created_by ?? row.createdBy ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    lineCount: Number(row.line_count ?? row.lineCount ?? mappedLines.length) || 0,
    movementCount: Number(row.movement_count ?? row.movementCount ?? mappedLines.length) || 0,
    lines: mappedLines,
  }
}

/**
 * Read-only list of append-only corrections for a posted inventory count.
 */
export async function listInventoryCountCorrections({
  workspaceId,
  sessionId,
} = {}) {
  requireConfiguredSupabase()

  const normalizedWorkspaceId = requireId(workspaceId, 'Workspace')
  const normalizedSessionId = requireId(sessionId, 'Session')

  const [correctionsResult, linesResult] = await Promise.all([
    supabase
      .from(CORRECTIONS_TABLE)
      .select('id, workspace_id, session_id, created_by, created_at, line_count, movement_count')
      .eq('workspace_id', normalizedWorkspaceId)
      .eq('session_id', normalizedSessionId)
      .order('created_at', { ascending: false }),
    supabase
      .from(CORRECTION_LINES_TABLE)
      .select('id, correction_id, workspace_id, session_id, session_item_id, item_id, item_name, original_quantity, baseline_quantity, corrected_quantity, delta_quantity, movement_id, created_by, created_at')
      .eq('workspace_id', normalizedWorkspaceId)
      .eq('session_id', normalizedSessionId)
      .order('created_at', { ascending: false }),
  ])

  if (correctionsResult.error) {
    if (isTableUnavailableError(correctionsResult.error)) {
      return []
    }
    console.error('[inventoryCountService] listInventoryCountCorrections error:', correctionsResult.error)
    throw new Error(
      correctionsResult.error.message || 'Unable to load inventory count corrections right now.',
    )
  }

  if (linesResult.error) {
    if (isTableUnavailableError(linesResult.error)) {
      return []
    }
    console.error('[inventoryCountService] listInventoryCountCorrections lines error:', linesResult.error)
    throw new Error(
      linesResult.error.message || 'Unable to load inventory count corrections right now.',
    )
  }

  const linesByCorrectionId = new Map()
  for (const row of linesResult.data ?? []) {
    const correctionId = `${row?.correction_id ?? ''}`.trim()
    if (!correctionId) continue
    const current = linesByCorrectionId.get(correctionId) || []
    current.push(row)
    linesByCorrectionId.set(correctionId, current)
  }

  return (correctionsResult.data ?? [])
    .map((row) => mapInventoryCountCorrectionRow(
      row,
      linesByCorrectionId.get(`${row?.id ?? ''}`.trim()) || [],
    ))
    .filter(Boolean)
}

/**
 * Apply append-only inventory count corrections via SECURITY DEFINER RPC.
 * Creates new adjustment movements + updates live stock. Never mutates posted session history.
 */
export async function applyInventoryCountCorrections({
  workspaceId,
  sessionId,
  corrections = [],
} = {}) {
  requireConfiguredSupabase()

  const p_workspace_id = requireId(workspaceId, 'Workspace')
  const p_session_id = requireId(sessionId, 'Session')

  const payload = (Array.isArray(corrections) ? corrections : [])
    .map((row) => {
      const sessionItemId = `${row?.sessionItemId ?? row?.session_item_id ?? row?.id ?? ''}`.trim()
      const correctedQuantity = mapNumericQuantity(
        row?.correctedQuantity ?? row?.corrected_quantity,
      )
      if (!sessionItemId || correctedQuantity === null) {
        return null
      }
      // Client preview filter only — RPC recalculates from counted + prior deltas.
      const baselineQuantity = mapNumericQuantity(
        row?.effectiveQuantity
        ?? row?.baselineQuantity
        ?? row?.oldQuantity
        ?? row?.originalCountedQuantity
        ?? row?.originalQuantity
        ?? row?.original_quantity,
      )
      if (baselineQuantity !== null && correctedQuantity - baselineQuantity === 0) {
        return null
      }
      return {
        session_item_id: sessionItemId,
        corrected_quantity: correctedQuantity,
      }
    })
    .filter(Boolean)

  if (payload.length === 0) {
    throw new Error('Add at least one non-zero correction before applying.')
  }

  const { data, error } = await supabase.rpc(APPLY_CORRECTIONS_RPC, {
    p_workspace_id,
    p_session_id,
    p_corrections: payload,
  })

  if (error) {
    console.error('[inventoryCountService] applyInventoryCountCorrections error:', error)
    throw mapInventoryCountRpcError(error, 'Unable to apply inventory count corrections right now.')
  }

  const result = firstRpcRow(data) ?? data
  const correctionId = `${result?.correction_id ?? result?.correctionId ?? ''}`.trim()
  if (!correctionId) {
    throw new Error('Apply corrections response was empty or invalid.')
  }

  return {
    correctionId,
    sessionId: `${result?.session_id ?? result?.sessionId ?? p_session_id}`.trim(),
    workspaceId: `${result?.workspace_id ?? result?.workspaceId ?? p_workspace_id}`.trim(),
    createdAt: result?.created_at ?? result?.createdAt ?? null,
    createdBy: result?.created_by ?? result?.createdBy ?? null,
    lineCount: Number(result?.line_count ?? result?.lineCount ?? 0) || 0,
    movementCount: Number(result?.movement_count ?? result?.movementCount ?? 0) || 0,
    lines: (Array.isArray(result?.lines) ? result.lines : []).map((line) => {
      if (!line || typeof line !== 'object') return line
      return {
        sessionItemId: `${line.session_item_id ?? line.sessionItemId ?? ''}`.trim() || null,
        itemId: `${line.item_id ?? line.itemId ?? ''}`.trim() || null,
        itemName: `${line.item_name ?? line.itemName ?? ''}`.trim(),
        originalQuantity: mapNumericQuantity(line.original_quantity ?? line.originalQuantity),
        baselineQuantity: mapNumericQuantity(line.baseline_quantity ?? line.baselineQuantity),
        effectiveBeforeQuantity: mapNumericQuantity(
          line.effective_before_quantity
          ?? line.effectiveBeforeQuantity
          ?? line.baseline_quantity
          ?? line.baselineQuantity,
        ),
        correctedQuantity: mapNumericQuantity(line.corrected_quantity ?? line.correctedQuantity),
        deltaQuantity: mapNumericQuantity(line.delta_quantity ?? line.deltaQuantity),
        effectiveAfterQuantity: mapNumericQuantity(
          line.effective_after_quantity ?? line.effectiveAfterQuantity,
        ),
        movementId: `${line.movement_id ?? line.movementId ?? ''}`.trim() || null,
      }
    }),
    preserved: result?.preserved ?? null,
    message: `${result?.message ?? 'Inventory count corrections applied successfully.'}`.trim()
      || 'Inventory count corrections applied successfully.',
  }
}

/**
 * Persist a counted quantity for one inventory count session line via SECURITY DEFINER RPC.
 * Database owns counted_at and line_status. Does not mutate stock quantities or movements.
 */
export async function updateInventoryCountItem({
  workspaceId,
  sessionId,
  sessionItemId,
  countedQuantity,
} = {}) {
  requireConfiguredSupabase()

  const p_workspace_id = requireId(workspaceId, 'Workspace')
  const p_session_id = requireId(sessionId, 'Session')
  const p_session_item_id = requireId(sessionItemId, 'Session item')

  let p_counted_quantity = null
  if (!(
    countedQuantity === null
    || countedQuantity === undefined
    || `${countedQuantity}`.trim() === ''
  )) {
    const numeric = Number(countedQuantity)
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new Error('Counted quantity must be a valid non-negative number.')
    }
    p_counted_quantity = numeric
  }

  const { data, error } = await supabase.rpc(UPDATE_SESSION_ITEM_RPC, {
    p_workspace_id,
    p_session_id,
    p_session_item_id,
    p_counted_quantity,
  })

  if (error) {
    console.error('[inventoryCountService] updateInventoryCountItem error:', error)
    throw mapInventoryCountRpcError(error, 'Unable to save counted quantity right now.')
  }

  const mapped = mapInventoryCountSessionItemRow(firstRpcRow(data))
  if (!mapped) {
    throw new Error('Inventory count item response was empty or invalid.')
  }

  return mapped
}

export function mapCompleteInventoryCountLocationResult(row) {
  if (!row || typeof row !== 'object') {
    return null
  }

  const sessionId = `${row.session_id ?? row.sessionId ?? ''}`.trim()
  const completedLocationId = `${row.completed_location_id ?? row.completedLocationId ?? ''}`.trim()
  if (!sessionId || !completedLocationId) {
    return null
  }

  const nextLocationId = `${row.next_location_id ?? row.nextLocationId ?? ''}`.trim() || null
  const sessionStatus = `${row.session_status ?? row.sessionStatus ?? ''}`.trim()
  if (!sessionStatus) {
    return null
  }

  return {
    sessionId,
    completedLocationId,
    nextLocationId,
    sessionStatus,
    allLocationsCompleted: Boolean(row.all_locations_completed ?? row.allLocationsCompleted),
  }
}

/**
 * Complete the current inventory count location and advance the session lifecycle.
 * Does not mutate stock quantities or movements and does not post.
 */
export async function completeInventoryCountLocation({
  workspaceId,
  sessionId,
  locationId,
} = {}) {
  requireConfiguredSupabase()

  const p_workspace_id = requireId(workspaceId, 'Workspace')
  const p_session_id = requireId(sessionId, 'Session')
  const p_location_id = requireId(locationId, 'Location')

  const { data, error } = await supabase.rpc(COMPLETE_LOCATION_RPC, {
    p_workspace_id,
    p_session_id,
    p_location_id,
  })

  if (error) {
    console.error('[inventoryCountService] completeInventoryCountLocation error:', error)
    throw mapInventoryCountRpcError(error, 'Unable to complete inventory count location right now.')
  }

  const mapped = mapCompleteInventoryCountLocationResult(firstRpcRow(data))
  if (!mapped) {
    throw new Error('Complete location response was empty or invalid.')
  }

  return mapped
}

export function mapInventoryCountSessionPauseStateResult(row) {
  if (!row || typeof row !== 'object') {
    return null
  }

  const id = `${row.id ?? ''}`.trim()
  const workspaceId = `${row.workspace_id ?? row.workspaceId ?? ''}`.trim()
  const status = `${row.status ?? ''}`.trim()
  if (!id || !workspaceId || !status) {
    return null
  }

  const pausedAtRaw = row.paused_at ?? row.pausedAt
  const updatedAtRaw = row.updated_at ?? row.updatedAt

  return {
    id,
    workspaceId,
    status,
    pausedAt: pausedAtRaw == null || pausedAtRaw === '' ? null : `${pausedAtRaw}`,
    updatedAt: updatedAtRaw == null || updatedAtRaw === '' ? null : `${updatedAtRaw}`,
  }
}

/**
 * Pause or resume an inventory count session via SECURITY DEFINER RPC.
 * Does not mutate locations, items, stock quantities, or movements.
 */
export async function setInventoryCountSessionPauseState({
  workspaceId,
  sessionId,
  pause,
} = {}) {
  requireConfiguredSupabase()

  const p_workspace_id = requireId(workspaceId, 'Workspace')
  const p_session_id = requireId(sessionId, 'Session')

  if (typeof pause !== 'boolean') {
    throw new Error('Pause state is required.')
  }

  const { data, error } = await supabase.rpc(SET_PAUSE_STATE_RPC, {
    p_workspace_id,
    p_session_id,
    p_pause: pause,
  })

  if (error) {
    console.error('[inventoryCountService] setInventoryCountSessionPauseState error:', error)
    throw mapInventoryCountRpcError(
      error,
      pause
        ? 'Unable to pause inventory count right now.'
        : 'Unable to resume inventory count right now.',
    )
  }

  const mapped = mapInventoryCountSessionPauseStateResult(firstRpcRow(data))
  if (!mapped) {
    throw new Error('Pause state response was empty or invalid.')
  }

  return mapped
}

function mapPreviewNumeric(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function mapPreviewInteger(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function mapInventoryCountFinishPreviewLine(row) {
  if (!row || typeof row !== 'object') {
    return null
  }

  const sessionItemId = `${row.session_item_id ?? row.sessionItemId ?? ''}`.trim()
  const itemName = `${row.item_name ?? row.itemName ?? ''}`.trim()
  const itemId = `${row.item_id ?? row.itemId ?? ''}`.trim()
  if (!sessionItemId || !itemName || !itemId) {
    return null
  }

  const expectedSnapshot = mapPreviewNumeric(row.expected_snapshot ?? row.expectedSnapshot)
  const movementDeltaSinceSnapshot = mapPreviewNumeric(
    row.movement_delta_since_snapshot ?? row.movementDeltaSinceSnapshot,
  )
  const expectedAtCount = mapPreviewNumeric(row.expected_at_count ?? row.expectedAtCount)
  const countedQuantity = mapPreviewNumeric(row.counted_quantity ?? row.countedQuantity)
  const varianceQuantity = mapPreviewNumeric(row.variance_quantity ?? row.varianceQuantity ?? row.variance)
  const currentLiveQuantity = mapPreviewNumeric(row.current_live_quantity ?? row.currentLiveQuantity)
  const resultingQuantityAfterPost = mapPreviewNumeric(
    row.resulting_quantity_after_post ?? row.resultingQuantityAfterPost,
  )
  const countedAt = row.counted_at ?? row.countedAt ?? null

  if (
    expectedSnapshot === null
    || movementDeltaSinceSnapshot === null
    || expectedAtCount === null
    || countedQuantity === null
    || varianceQuantity === null
    || currentLiveQuantity === null
    || resultingQuantityAfterPost === null
    || !countedAt
  ) {
    return null
  }

  return {
    sessionItemId,
    itemId,
    itemName,
    storageLocation: `${row.storage_location ?? row.storageLocation ?? ''}`.trim() || 'Other',
    unit: `${row.unit ?? ''}`.trim(),
    expectedSnapshot,
    movementDeltaSinceSnapshot,
    expectedAtCount,
    countedQuantity,
    countedAt: `${countedAt}`,
    varianceQuantity,
    currentLiveQuantity,
    resultingQuantityAfterPost,
  }
}

export function mapInventoryCountFinishPreviewSkippedLine(row) {
  if (!row || typeof row !== 'object') {
    return null
  }

  const sessionItemId = `${row.session_item_id ?? row.sessionItemId ?? ''}`.trim()
  const itemName = `${row.item_name ?? row.itemName ?? ''}`.trim()
  if (!sessionItemId || !itemName) {
    return null
  }

  return {
    sessionItemId,
    itemId: `${row.item_id ?? row.itemId ?? ''}`.trim() || null,
    itemName,
    storageLocation: `${row.storage_location ?? row.storageLocation ?? ''}`.trim() || 'Other',
    unit: `${row.unit ?? ''}`.trim(),
    lineStatus: `${row.line_status ?? row.lineStatus ?? 'skipped'}`.trim() || 'skipped',
    warning: `${row.warning ?? ''}`.trim()
      || 'Skipped lines are not posted and keep live quantity unchanged.',
  }
}

export function mapInventoryCountFinishPreviewBlockingIssue(row) {
  if (!row || typeof row !== 'object') {
    return null
  }

  const code = `${row.code ?? ''}`.trim()
  const message = `${row.message ?? ''}`.trim()
  if (!code || !message) {
    return null
  }

  return {
    code,
    sessionItemId: `${row.session_item_id ?? row.sessionItemId ?? ''}`.trim() || null,
    itemId: `${row.item_id ?? row.itemId ?? ''}`.trim() || null,
    itemName: `${row.item_name ?? row.itemName ?? ''}`.trim() || null,
    message,
  }
}

export function mapInventoryCountFinishPreviewResult(payload) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const sessionId = `${payload.session_id ?? payload.sessionId ?? ''}`.trim()
  const workspaceId = `${payload.workspace_id ?? payload.workspaceId ?? ''}`.trim()
  if (!sessionId || !workspaceId) {
    return null
  }

  const summaryRaw = payload.summary
  if (!summaryRaw || typeof summaryRaw !== 'object') {
    return null
  }

  const totalLines = mapPreviewInteger(summaryRaw.total_lines ?? summaryRaw.totalLines)
  const countedLines = mapPreviewInteger(summaryRaw.counted_lines ?? summaryRaw.countedLines)
  const skippedLines = mapPreviewInteger(summaryRaw.skipped_lines ?? summaryRaw.skippedLines)
  const changedItems = mapPreviewInteger(summaryRaw.changed_items ?? summaryRaw.changedItems)
  const unchangedItems = mapPreviewInteger(summaryRaw.unchanged_items ?? summaryRaw.unchangedItems)
  const positiveVariances = mapPreviewInteger(summaryRaw.positive_variances ?? summaryRaw.positiveVariances)
  const negativeVariances = mapPreviewInteger(summaryRaw.negative_variances ?? summaryRaw.negativeVariances)
  const zeroVariances = mapPreviewInteger(summaryRaw.zero_variances ?? summaryRaw.zeroVariances)
  const blockingIssueCount = mapPreviewInteger(
    summaryRaw.blocking_issue_count ?? summaryRaw.blockingIssueCount,
  )

  if ([
    totalLines,
    countedLines,
    skippedLines,
    changedItems,
    unchangedItems,
    positiveVariances,
    negativeVariances,
    zeroVariances,
    blockingIssueCount,
  ].some((value) => value === null)) {
    return null
  }

  const linesRaw = Array.isArray(payload.lines) ? payload.lines : null
  const skippedRaw = Array.isArray(payload.skipped) ? payload.skipped : []
  const blockingRaw = Array.isArray(payload.blocking_issues ?? payload.blockingIssues)
    ? (payload.blocking_issues ?? payload.blockingIssues)
    : []
  if (!linesRaw) {
    return null
  }

  const lines = linesRaw.map(mapInventoryCountFinishPreviewLine)
  if (lines.some((line) => line === null)) {
    return null
  }

  const skipped = skippedRaw.map(mapInventoryCountFinishPreviewSkippedLine)
  if (skipped.some((line) => line === null)) {
    return null
  }

  const blockingIssues = blockingRaw.map(mapInventoryCountFinishPreviewBlockingIssue)
  if (blockingIssues.some((issue) => issue === null)) {
    return null
  }

  const snapshotAt = payload.snapshot_at ?? payload.snapshotAt ?? null
  const previewGeneratedAt = payload.preview_generated_at ?? payload.previewGeneratedAt ?? null
  if (!snapshotAt || !previewGeneratedAt) {
    return null
  }

  const canPost = Boolean(
    payload.can_post
    ?? payload.canPost
    ?? summaryRaw.can_post
    ?? summaryRaw.canPost
    ?? false,
  )

  return {
    sessionId,
    workspaceId,
    sessionStatus: `${payload.session_status ?? payload.sessionStatus ?? payload.status ?? ''}`.trim()
      || 'counting_complete',
    snapshotAt: `${snapshotAt}`,
    previewGeneratedAt: `${previewGeneratedAt}`,
    canPost,
    summary: {
      totalLines,
      countedLines,
      skippedLines,
      changedItems,
      unchangedItems,
      positiveVariances,
      negativeVariances,
      zeroVariances,
      blockingIssueCount,
      canPost,
    },
    lines,
    skipped,
    blockingIssues,
  }
}

/**
 * Preview Finish Count reconciliation for a counting_complete session.
 * Read-only: does not post, mutate stock, or change session status.
 * All reconciliation math is owned by the database RPC.
 */
export async function previewInventoryCountFinish({
  workspaceId,
  sessionId,
} = {}) {
  requireConfiguredSupabase()

  const p_workspace_id = requireId(workspaceId, 'Workspace')
  const p_session_id = requireId(sessionId, 'Session')

  const { data, error } = await supabase.rpc(PREVIEW_FINISH_RPC, {
    p_workspace_id,
    p_session_id,
  })

  if (error) {
    console.error('[inventoryCountService] previewInventoryCountFinish error:', error)
    throw mapInventoryCountRpcError(error, 'Unable to preview inventory count finish right now.')
  }

  const mapped = mapInventoryCountFinishPreviewResult(firstRpcRow(data) ?? data)
  if (!mapped) {
    throw new Error('Finish count preview response was empty or invalid.')
  }

  return mapped
}

export function mapInventoryCountFinishPostResult(payload) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const sessionId = `${payload.session_id ?? payload.sessionId ?? ''}`.trim()
  const workspaceId = `${payload.workspace_id ?? payload.workspaceId ?? ''}`.trim()
  const status = `${payload.status ?? payload.session_status ?? payload.sessionStatus ?? ''}`.trim()
  if (!sessionId || !workspaceId || status !== 'posted') {
    return null
  }

  const mapCount = (value) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : 0
  }

  return {
    sessionId,
    workspaceId,
    status,
    postedAt: payload.posted_at ?? payload.postedAt ?? null,
    postedBy: payload.posted_by ?? payload.postedBy ?? null,
    canPost: Boolean(payload.can_post ?? payload.canPost ?? true),
    postingEnabled: Boolean(payload.posting_enabled ?? payload.postingEnabled ?? true),
    countedLineCount: mapCount(payload.counted_line_count ?? payload.countedLineCount),
    adjustedLineCount: mapCount(payload.adjusted_line_count ?? payload.adjustedLineCount),
    zeroVarianceLineCount: mapCount(payload.zero_variance_line_count ?? payload.zeroVarianceLineCount),
    movementCount: mapCount(payload.movement_count ?? payload.movementCount),
    totalPositiveVariance: mapCount(payload.total_positive_variance ?? payload.totalPositiveVariance),
    totalNegativeVariance: mapCount(payload.total_negative_variance ?? payload.totalNegativeVariance),
    reconciliationSummary: payload.reconciliation_summary ?? payload.reconciliationSummary ?? null,
    message: `${payload.message ?? 'Inventory count posted successfully.'}`.trim()
      || 'Inventory count posted successfully.',
  }
}

/**
 * Post a counting_complete inventory count session.
 * Mutates stock via the database RPC only. Frontend maps the response.
 */
export async function postInventoryCountFinish({
  workspaceId,
  sessionId,
} = {}) {
  requireConfiguredSupabase()

  const p_workspace_id = requireId(workspaceId, 'Workspace')
  const p_session_id = requireId(sessionId, 'Session')

  const { data, error } = await supabase.rpc(POST_FINISH_RPC, {
    p_workspace_id,
    p_session_id,
  })

  if (error) {
    console.error('[inventoryCountService] postInventoryCountFinish error:', error)
    throw mapInventoryCountRpcError(error, 'Unable to post inventory count right now.')
  }

  const mapped = mapInventoryCountFinishPostResult(firstRpcRow(data) ?? data)
  if (!mapped) {
    throw new Error('Finish count post response was empty or invalid.')
  }

  return mapped
}
