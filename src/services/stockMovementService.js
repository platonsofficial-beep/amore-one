import { applyStockMovementQuantity } from '../lib/stockUtils'
import { supabase } from '../lib/supabaseClient'
import { getMemberDisplayNamesByAuthUserIds } from './membershipService'
import { getStockItems, updateStockItemQuantity } from './stockItemService'

const STOCK_MOVEMENTS_TABLE = 'stock_movements'
const VALID_MOVEMENT_TYPES = new Set(['receive', 'usage', 'adjustment', 'stock_count'])

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

export async function recordStockMovement({
  workspaceId,
  itemId,
  type,
  quantity,
  note = '',
  createdBy = null,
  currentQuantity = 0,
}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedItemId = `${itemId ?? ''}`.trim()
  const normalizedType = `${type ?? ''}`.trim()

  if (!normalizedWorkspaceId || !normalizedItemId) {
    throw new Error('Workspace and item are required for stock movements.')
  }

  if (!VALID_MOVEMENT_TYPES.has(normalizedType)) {
    throw new Error('Invalid stock movement type.')
  }

  const movementQuantity = Number(quantity)

  if (normalizedType === 'stock_count') {
    if (!Number.isFinite(movementQuantity) || movementQuantity < 0) {
      throw new Error('Count must be zero or greater.')
    }
  } else if (!Number.isFinite(movementQuantity) || movementQuantity === 0) {
    throw new Error('Quantity must be a non-zero number.')
  }

  const nextQuantity = applyStockMovementQuantity(currentQuantity, normalizedType, movementQuantity)

  const { data, error } = await supabase
    .from(STOCK_MOVEMENTS_TABLE)
    .insert([{
      workspace_id: normalizedWorkspaceId,
      item_id: normalizedItemId,
      type: normalizedType,
      quantity: movementQuantity,
      note: `${note ?? ''}`.trim(),
      created_by: createdBy,
    }])
    .select('*')
    .single()

  if (error) {
    console.error('[stockMovementService] recordStockMovement error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Stock movement tables are not ready yet. Run stock_movements_schema.sql in Supabase.')
    }
    throw new Error(error.message || 'Unable to record stock movement right now.')
  }

  await updateStockItemQuantity(normalizedItemId, normalizedWorkspaceId, nextQuantity)

  return mapStockMovement(data)
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

  const latestByItemId = await getLatestStockMovementsByItem(
    workspaceId,
    items.map((item) => item.id).filter(Boolean),
  )
  const latestCountsByItemId = await getLatestStockCountsByItem(
    workspaceId,
    items.map((item) => item.id).filter(Boolean),
  )

  return items.map((item) => ({
    ...item,
    lastMovement: latestByItemId[item.id] ?? null,
    lastCount: latestCountsByItemId[item.id] ?? null,
  }))
}
