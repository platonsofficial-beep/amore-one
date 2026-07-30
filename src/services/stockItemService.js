import { supabase } from '../lib/supabaseClient'
import {
  normalizeStockCategory,
  normalizeStockItemType,
  normalizePackagingNote,
  normalizeProductBarcode,
  normalizeProductBrand,
  normalizeProductSize,
  resolveStockStorageLocation,
} from '../lib/stockCatalog'
import { normalizeSupplierId, resolveSupplierIdForWrite } from '../lib/stockSupplierUtils'
import { resolveStockItemStatus } from '../lib/stockUtils'
import { getSuppliers } from './supplierService'

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
    brand: normalizeProductBrand(record.brand ?? null),
    category: normalizeStockCategory(record.category ?? 'Other'),
    itemType: normalizeStockItemType(
      record.category ?? 'Other',
      record.item_type ?? record.itemType ?? 'Other',
    ),
    supplier: record.supplier ?? '',
    supplierId: normalizeSupplierId(record.supplier_id ?? record.supplierId ?? null),
    storageLocation: resolveStockStorageLocation({
      category: record.category,
      storageLocation: record.storage_location ?? record.storageLocation,
    }),
    unit: record.unit ?? '',
    size: normalizeProductSize(record.size ?? null),
    packagingNote: normalizePackagingNote(
      record.packaging_note ?? record.packagingNote ?? null,
    ),
    barcode: normalizeProductBarcode(record.barcode ?? null),
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

export function serializeStockItem(item, workspaceId, { supplierId = null } = {}) {
  const supplier = `${item.supplier ?? ''}`.trim()
  return {
    workspace_id: workspaceId,
    name: `${item.name ?? ''}`.trim(),
    brand: normalizeProductBrand(item.brand ?? null),
    category: `${item.category ?? 'Other'}`.trim() || 'Other',
    item_type: `${item.itemType ?? item.item_type ?? 'Other'}`.trim() || 'Other',
    supplier,
    supplier_id: supplierId,
    unit: `${item.unit ?? ''}`.trim(),
    size: normalizeProductSize(item.size ?? null),
    packaging_note: normalizePackagingNote(
      item.packagingNote ?? item.packaging_note ?? null,
    ),
    barcode: normalizeProductBarcode(item.barcode ?? null),
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

async function resolveStockItemSupplierId(workspaceId, item) {
  const supplier = `${item?.supplier ?? ''}`.trim()
  const explicitId = item?.supplierId ?? item?.supplier_id ?? null
  const fromExplicit = resolveSupplierIdForWrite({
    supplierName: supplier,
    supplierId: explicitId,
  })
  if (fromExplicit != null) return fromExplicit
  if (!supplier) return null

  try {
    const suppliers = await getSuppliers(workspaceId)
    return resolveSupplierIdForWrite({
      supplierName: supplier,
      suppliers,
    })
  } catch (error) {
    console.warn('[stockItemService] supplier_id resolve skipped:', error)
    return null
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

/**
 * P8.16.8 — Read-only workspace stock catalog for operational import matching.
 *
 * Selects only matcher-relevant fields. Does not write, match, or import.
 * `sku` is always null until a stock_items.sku column exists.
 */
export class WorkspaceStockCatalogError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'WorkspaceStockCatalogError'
    this.code = code
  }
}

/** Narrow select list — never expand without an explicit sprint. */
export const WORKSPACE_STOCK_CATALOG_COLUMNS = 'id, name, category, unit, active'

/**
 * @param {Record<string, unknown>|null|undefined} record
 * @returns {{
 *   id: unknown,
 *   name: string,
 *   category: string|null,
 *   unit: string,
 *   sku: null,
 *   active: boolean,
 * }}
 */
export function mapWorkspaceStockCatalogItem(record) {
  return {
    id: record?.id,
    name: typeof record?.name === 'string' ? record.name : `${record?.name ?? ''}`,
    category: record?.category == null
      ? null
      : typeof record.category === 'string'
        ? record.category
        : `${record.category}`,
    unit: typeof record?.unit === 'string' ? record.unit : `${record?.unit ?? ''}`,
    sku: null,
    active: record?.active ?? true,
  }
}

/**
 * Load workspace-scoped stock items for operational review (read-only).
 *
 * @param {string} workspaceId
 * @returns {Promise<Array<ReturnType<typeof mapWorkspaceStockCatalogItem>>>}
 */
export async function getWorkspaceStockCatalogItems(workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new WorkspaceStockCatalogError(
      'WORKSPACE_REQUIRED',
      'Workspace is required to load stock items.',
    )
  }

  const { data, error } = await supabase
    .from(STOCK_ITEMS_TABLE)
    .select(WORKSPACE_STOCK_CATALOG_COLUMNS)
    .eq('workspace_id', normalizedWorkspaceId)
    .order('name', { ascending: true })

  if (error) {
    console.warn('[stockItemService] getWorkspaceStockCatalogItems error:', error)
    throw new WorkspaceStockCatalogError(
      isTableUnavailableError(error) ? 'TABLE_UNAVAILABLE' : 'LOAD_FAILED',
      error.message || 'Unable to load workspace stock items.',
    )
  }

  return (data ?? []).map(mapWorkspaceStockCatalogItem)
}

export async function createStockItem(workspaceId, item) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to create a stock item.')
  }

  const supplierId = await resolveStockItemSupplierId(normalizedWorkspaceId, item)
  const payload = serializeStockItem(item, normalizedWorkspaceId, { supplierId })

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

  const supplierId = await resolveStockItemSupplierId(normalizedWorkspaceId, item)
  const { workspace_id: _workspaceId, ...payload } = serializeStockItem(item, normalizedWorkspaceId, {
    supplierId,
  })

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

/**
 * P8.16.14k — Narrow lifecycle update. Writes only `active` (updated_at via DB trigger).
 * Does not serialize catalog fields or resolve supplier_id.
 */
export async function updateStockItemActive(id, workspaceId, active) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to update stock item lifecycle.')
  }

  const { data, error } = await supabase
    .from(STOCK_ITEMS_TABLE)
    .update({ active: active === true })
    .eq('id', id)
    .eq('workspace_id', normalizedWorkspaceId)
    .select('*')
    .single()

  if (error) {
    console.error('[stockItemService] updateStockItemActive error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Stock tables are not ready yet. Run stock_items_schema.sql in Supabase.')
    }
    throw new Error(error.message || 'Unable to update stock item lifecycle right now.')
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
