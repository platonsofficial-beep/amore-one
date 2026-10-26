import { supabase } from '../lib/supabaseClient'
import { getMemberDisplayNamesByAuthUserIds } from './membershipService'
import { getStockItems } from './stockItemService'
import { recordStockMutation } from './stockMutationService'

const STOCK_MOVEMENTS_TABLE = 'stock_movements'

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

function mapStockMovement(record) {
  return {
    id: record.id,
    workspaceId: record.workspace_id ?? record.workspaceId ?? '',
    itemId: record.item_id ?? record.itemId ?? '',
    type: record.type ?? '',
    quantity: Number(record.quantity ?? 0),
    note: record.note ?? '',
    createdBy: record.created_by ?? record.createdBy ?? null,
    createdAt: record.created_at ?? record.createdAt ?? null,
    sourceWorkspaceStorageId: record.source_workspace_storage_id ?? record.sourceWorkspaceStorageId ?? null,
    destinationWorkspaceStorageId: record.destination_workspace_storage_id ?? record.destinationWorkspaceStorageId ?? null,
    sourceLocationKey: record.source_location_key ?? record.sourceLocationKey ?? '',
    destinationLocationKey: record.destination_location_key ?? record.destinationLocationKey ?? '',
  }
}

export async function getStockMovements(workspaceId, { itemId, limit = 50 } = {}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) return []

  let query = supabase
    .from(STOCK_MOVEMENTS_TABLE)
    .select('*')
    .eq('workspace_id', normalizedWorkspaceId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(200, Number(limit) || 50)))

  if (itemId) {
    query = query.eq('item_id', itemId)
  }

  const { data, error } = await query

  if (error) {
    console.warn('[stockMovementService] getStockMovements error:', error)
    if (isTableUnavailableError(error)) return []
    return []
  }

  return (data ?? []).map(mapStockMovement)
}

/**
 * Movements strictly after `after` and strictly before `before`.
 * Read-only. Throws when the query fails so a report cannot look empty by mistake.
 * `truncated` is true when the row cap was hit.
 */
export async function getStockMovementsInPeriod(workspaceId, {
  after,
  before,
  limit = 2000,
} = {}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const afterIso = `${after ?? ''}`.trim()
  const beforeIso = `${before ?? ''}`.trim()
  if (!normalizedWorkspaceId || !afterIso || !beforeIso) {
    return { movements: [], truncated: false }
  }

  const capped = Math.max(1, Math.min(2000, Number(limit) || 2000))
  const { data, error } = await supabase
    .from(STOCK_MOVEMENTS_TABLE)
    .select('*')
    .eq('workspace_id', normalizedWorkspaceId)
    .gt('created_at', afterIso)
    .lt('created_at', beforeIso)
    .order('created_at', { ascending: true })
    .limit(capped)

  if (error) {
    console.warn('[stockMovementService] getStockMovementsInPeriod error:', error)
    if (isTableUnavailableError(error)) return { movements: [], truncated: false }
    throw new Error(error.message || 'Unable to load stock movements for this period.')
  }

  const movements = (data ?? []).map(mapStockMovement)
  return {
    movements,
    truncated: movements.length >= capped,
  }
}

/**
 * Public movement write entry.
 * P8.29.7 — delegates to stockMutationService routing (legacy by default).
 * Callers and return shape remain unchanged.
 */
export async function recordStockMovement(input) {
  return recordStockMutation(input)
}

export async function getLatestStockMovementsByItem(workspaceId, itemIds = []) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId || itemIds.length === 0) return {}

  const { data, error } = await supabase
    .from(STOCK_MOVEMENTS_TABLE)
    .select('*')
    .eq('workspace_id', normalizedWorkspaceId)
    .in('item_id', itemIds)
    .order('created_at', { ascending: false })
    .limit(Math.max(itemIds.length, Math.min(500, itemIds.length * 5)))

  if (error) {
    console.warn('[stockMovementService] getLatestStockMovementsByItem error:', error)
    if (isTableUnavailableError(error)) return {}
    return {}
  }

  const latestByItemId = {}

  ;(data ?? []).forEach((record) => {
    const movement = mapStockMovement(record)
    if (!latestByItemId[movement.itemId]) {
      latestByItemId[movement.itemId] = movement
    }
  })

  return latestByItemId
}

export async function getLatestStockCountsByItem(workspaceId, itemIds = []) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId || itemIds.length === 0) return {}

  const { data, error } = await supabase
    .from(STOCK_MOVEMENTS_TABLE)
    .select('*')
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('type', 'stock_count')
    .in('item_id', itemIds)
    .order('created_at', { ascending: false })
    .limit(Math.max(itemIds.length, Math.min(500, itemIds.length * 5)))

  if (error) {
    console.warn('[stockMovementService] getLatestStockCountsByItem error:', error)
    if (isTableUnavailableError(error)) return {}
    return {}
  }

  const latestCountByItemId = {}

  ;(data ?? []).forEach((record) => {
    const movement = mapStockMovement(record)
    if (!latestCountByItemId[movement.itemId]) {
      latestCountByItemId[movement.itemId] = movement
    }
  })

  return latestCountByItemId
}

export async function getStockMovementsWithAuthors(workspaceId, { itemId, limit = 50 } = {}) {
  const movements = await getStockMovements(workspaceId, { itemId, limit })
  const authorIds = movements.map((movement) => movement.createdBy).filter(Boolean)
  const authorNames = await getMemberDisplayNamesByAuthUserIds(workspaceId, authorIds)

  return movements.map((movement) => ({
    ...movement,
    createdByName: movement.createdBy
      ? (authorNames[movement.createdBy] ?? 'Unknown')
      : 'System',
  }))
}

export async function getStockItemsWithLastMovement(workspaceId, options = {}) {
  const items = await getStockItems(workspaceId, options)
  if (items.length === 0) return items

  const itemIds = items.map((item) => item.id).filter(Boolean)
  const [latestByItemId, latestCountsByItemId] = await Promise.all([
    getLatestStockMovementsByItem(workspaceId, itemIds),
    getLatestStockCountsByItem(workspaceId, itemIds),
  ])

  return items.map((item) => ({
    ...item,
    lastMovement: latestByItemId[item.id] ?? null,
    lastCount: latestCountsByItemId[item.id] ?? null,
  }))
}
