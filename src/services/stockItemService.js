import { supabase } from '../lib/supabaseClient'
import {
  normalizeStockCategory,
  normalizeStockItemType,
  resolveStockStorageLocation,
} from '../lib/stockCatalog'
import { resolveStockItemStatus } from '../lib/stockUtils'

const STOCK_ITEMS_TABLE = 'stock_items'

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

function mapStockItem(record) {
  const currentQuantity = Number(record.current_quantity ?? record.currentQuantity ?? 0)
  const minimumQuantity = Number(record.minimum_quantity ?? record.minimumQuantity ?? 0)
  const orderQuantity = record.order_quantity ?? record.orderQuantity
  const targetQuantity = record.target_quantity ?? record.targetQuantity
  const costPrice = Number(record.cost_price ?? record.costPrice ?? 0)

  const item = {
    id: record.id,
    workspaceId: record.workspace_id ?? record.workspaceId ?? '',
    name: record.name ?? '',
    category: normalizeStockCategory(record.category ?? 'Other'),
    itemType: normalizeStockItemType(
      record.category ?? 'Other',
      record.item_type ?? record.itemType ?? 'Other',
    ),
    supplier: record.supplier ?? '',
    storageLocation: resolveStockStorageLocation({
      category: record.category,
      storageLocation: record.storage_location ?? record.storageLocation,
    }),
    unit: record.unit ?? '',
    currentQuantity,
    minimumQuantity,
    targetQuantity: targetQuantity === null || targetQuantity === undefined
      ? null
      : Number(targetQuantity),
    orderQuantity: orderQuantity === null || orderQuantity === undefined
      ? null
      : Number(orderQuantity),
    costPrice,
    active: record.active ?? true,
    createdAt: record.created_at ?? record.createdAt ?? null,
    updatedAt: record.updated_at ?? record.updatedAt ?? null,
  }

  return {
    ...item,
    status: resolveStockItemStatus(item),
  }
}

function serializeStockItem(item, workspaceId) {
  return {
    workspace_id: workspaceId,
    name: `${item.name ?? ''}`.trim(),
    category: `${item.category ?? 'Other'}`.trim() || 'Other',
    item_type: `${item.itemType ?? item.item_type ?? 'Other'}`.trim() || 'Other',
    supplier: `${item.supplier ?? ''}`.trim(),
    unit: `${item.unit ?? ''}`.trim(),
    current_quantity: Math.max(0, Number(item.currentQuantity ?? item.current_quantity ?? 0) || 0),
    minimum_quantity: Math.max(0, Number(item.minimumQuantity ?? item.minimum_quantity ?? 0) || 0),
    target_quantity: item.targetQuantity === null || item.targetQuantity === undefined || item.targetQuantity === ''
      ? null
      : Math.max(0, Number(item.targetQuantity ?? item.target_quantity) || 0),
    order_quantity: item.orderQuantity === null || item.orderQuantity === undefined || item.orderQuantity === ''
      ? null
      : Math.max(0, Number(item.orderQuantity ?? item.order_quantity) || 0),
    cost_price: Math.max(0, Number(item.costPrice ?? item.cost_price ?? 0) || 0),
    storage_location: `${item.storageLocation ?? item.storage_location ?? 'Main Storage'}`.trim() || 'Main Storage',
    active: item.active ?? true,
  }
}

export async function getStockItems(workspaceId, { includeInactive = true } = {}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) return []

  let query = supabase
    .from(STOCK_ITEMS_TABLE)
    .select('*')
    .eq('workspace_id', normalizedWorkspaceId)
    .order('name', { ascending: true })

  if (!includeInactive) {
    query = query.eq('active', true)
  }

  const { data, error } = await query

  if (error) {
    console.warn('[stockItemService] getStockItems error:', error)
    if (isTableUnavailableError(error)) return []
    return []
  }

  return (data ?? []).map(mapStockItem)
}

export async function createStockItem(workspaceId, item) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to create a stock item.')
  }

  const payload = serializeStockItem(item, normalizedWorkspaceId)

  const { data, error } = await supabase
    .from(STOCK_ITEMS_TABLE)
    .insert([payload])
    .select('*')
    .single()

  if (error) {
    console.error('[stockItemService] createStockItem error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Stock tables are not ready yet. Run stock_items_schema.sql in Supabase.')
    }
    throw new Error(error.message || 'Unable to create stock item right now.')
  }

  return mapStockItem(data)
}

export async function updateStockItem(id, item, workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to update a stock item.')
  }

  const { workspace_id: _workspaceId, ...payload } = serializeStockItem(item, normalizedWorkspaceId)

  const { data, error } = await supabase
    .from(STOCK_ITEMS_TABLE)
    .update(payload)
    .eq('id', id)
    .eq('workspace_id', normalizedWorkspaceId)
    .select('*')
    .single()

  if (error) {
    console.error('[stockItemService] updateStockItem error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Stock tables are not ready yet. Run stock_items_schema.sql in Supabase.')
    }
    throw new Error(error.message || 'Unable to update stock item right now.')
  }

  return mapStockItem(data)
}

export async function updateStockItemQuantity(id, workspaceId, nextQuantity) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to update stock quantity.')
  }

  const { data, error } = await supabase
    .from(STOCK_ITEMS_TABLE)
    .update({ current_quantity: Math.max(0, Number(nextQuantity) || 0) })
    .eq('id', id)
    .eq('workspace_id', normalizedWorkspaceId)
    .select('*')
    .single()

  if (error) {
    console.error('[stockItemService] updateStockItemQuantity error:', error)
    throw new Error(error.message || 'Unable to update stock quantity right now.')
  }

  return mapStockItem(data)
}

export async function deleteStockItem(id, workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to delete a stock item.')
  }

  const { error } = await supabase
    .from(STOCK_ITEMS_TABLE)
    .delete()
    .eq('id', id)
    .eq('workspace_id', normalizedWorkspaceId)

  if (error) {
    console.error('[stockItemService] deleteStockItem error:', error)
    throw new Error(error.message || 'Unable to delete stock item right now.')
  }
}
