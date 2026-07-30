/**
 * P8.30.1 / P8.30.2 — Storage Center read-only summaries + products.
 *
 * Aggregates workspace_storages + stock_item_location_balances for the
 * Storages Stock destination. No mutations. No SQL/RPC changes.
 */

import { supabase } from '../lib/supabaseClient'
import {
  normalizeStockCategory,
  normalizeStockItemType,
  resolveStockStorageLocation,
} from '../lib/stockCatalog'
import { resolveStockItemStatus } from '../lib/stockUtils'
import { normalizeSupplierId } from '../lib/stockSupplierUtils'
import {
  WORKSPACE_STORAGE_LIST_COLUMNS,
  mapWorkspaceStorage,
} from './workspaceStorageService'

const WORKSPACE_STORAGES_TABLE = 'workspace_storages'
const STOCK_ITEM_LOCATION_BALANCES_TABLE = 'stock_item_location_balances'
const STOCK_ITEMS_TABLE = 'stock_items'

export const STOCK_STORAGE_CENTER_BALANCE_COLUMNS = [
  'stock_item_id',
  'workspace_storage_id',
  'location_key',
  'quantity',
].join(', ')

export const STOCK_STORAGE_CENTER_COST_COLUMNS = 'id, cost_price'

/** Columns needed for storage product rows + existing history drawer. */
export const STOCK_STORAGE_PRODUCT_ITEM_COLUMNS = [
  'id',
  'name',
  'category',
  'item_type',
  'unit',
  'active',
  'current_quantity',
  'minimum_quantity',
  'target_quantity',
  'order_quantity',
  'cost_price',
  'storage_location',
  'supplier',
  'supplier_id',
  'created_at',
  'updated_at',
].join(', ')

export const STOCK_STORAGE_PRODUCT_SORT_OPTIONS = Object.freeze([
  { id: 'name-asc', label: 'A–Z' },
  { id: 'name-desc', label: 'Z–A' },
  { id: 'qty-desc', label: 'Qty high → low' },
  { id: 'qty-asc', label: 'Qty low → high' },
  { id: 'category', label: 'Category' },
])

/**
 * Zero-balance policy (P8.30.1):
 * - productCount: distinct stock_item_id with any balance row (including 0)
 * - totalQuantity: sum of quantity values
 * - nonZeroBalanceCount: rows where quantity !== 0
 */

/**
 * @param {unknown} value
 * @returns {number}
 */
function asFiniteNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function asTrimmedString(value) {
  if (value == null) return ''
  return String(value).trim()
}

/**
 * Build per-storage summaries from already-fetched rows (pure, testable).
 *
 * @param {{
 *   storages?: unknown,
 *   balances?: unknown,
 *   costByItemId?: Map<string, number>|Record<string, number>|null,
 * }} [input]
 */
export function buildWorkspaceStorageSummaries({
  storages = [],
  balances = [],
  costByItemId = null,
} = {}) {
  const storageList = Array.isArray(storages) ? storages : []
  const balanceList = Array.isArray(balances) ? balances : []

  /** @type {Map<string, number>} */
  const costs = costByItemId instanceof Map
    ? costByItemId
    : new Map(
      Object.entries(costByItemId && typeof costByItemId === 'object' ? costByItemId : {})
        .map(([id, cost]) => [id, asFiniteNumber(cost)]),
    )

  /** @type {Map<string, {
   *   productIds: Set<string>,
   *   totalQuantity: number,
   *   nonZeroBalanceCount: number,
   *   balanceRowCount: number,
   *   inventoryValue: number,
   * }>} */
  const aggregates = new Map()

  for (const balance of balanceList) {
    const storageId = asTrimmedString(
      balance?.workspace_storage_id ?? balance?.workspaceStorageId,
    )
    if (!storageId) continue
    const itemId = asTrimmedString(balance?.stock_item_id ?? balance?.stockItemId)
    const quantity = asFiniteNumber(balance?.quantity)
    const current = aggregates.get(storageId) ?? {
      productIds: new Set(),
      totalQuantity: 0,
      nonZeroBalanceCount: 0,
      balanceRowCount: 0,
      inventoryValue: 0,
    }
    if (itemId) current.productIds.add(itemId)
    current.totalQuantity += quantity
    current.balanceRowCount += 1
    if (quantity !== 0) current.nonZeroBalanceCount += 1
    if (itemId && costs.has(itemId)) {
      current.inventoryValue += quantity * asFiniteNumber(costs.get(itemId))
    }
    aggregates.set(storageId, current)
  }

  const summaries = storageList.map((storage) => {
    const id = asTrimmedString(storage?.id)
    const aggregate = aggregates.get(id) ?? {
      productIds: new Set(),
      totalQuantity: 0,
      nonZeroBalanceCount: 0,
      balanceRowCount: 0,
      inventoryValue: 0,
    }
    const active = storage?.active !== false
    return Object.freeze({
      id,
      workspaceId: asTrimmedString(storage?.workspaceId ?? storage?.workspace_id),
      locationKey: asTrimmedString(storage?.locationKey ?? storage?.location_key),
      name: asTrimmedString(storage?.name) || asTrimmedString(storage?.locationKey),
      active,
      status: active ? 'active' : 'archived',
      sortOrder: Number(storage?.sortOrder ?? storage?.sort_order ?? 0) || 0,
      productCount: aggregate.productIds.size,
      totalQuantity: aggregate.totalQuantity,
      nonZeroBalanceCount: aggregate.nonZeroBalanceCount,
      balanceRowCount: aggregate.balanceRowCount,
      inventoryValue: aggregate.inventoryValue,
    })
  })

  const active = summaries
    .filter((entry) => entry.active)
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
      return left.name.localeCompare(right.name)
    })
  const archived = summaries
    .filter((entry) => !entry.active)
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
      return left.name.localeCompare(right.name)
    })

  const ordered = [...active, ...archived]
  const totalProductsWithBalances = new Set()
  let totalQuantity = 0
  for (const balance of balanceList) {
    const itemId = asTrimmedString(balance?.stock_item_id ?? balance?.stockItemId)
    if (itemId) totalProductsWithBalances.add(itemId)
    totalQuantity += asFiniteNumber(balance?.quantity)
  }

  return Object.freeze({
    storages: Object.freeze(ordered),
    activeStorages: Object.freeze(active),
    archivedStorages: Object.freeze(archived),
    summary: Object.freeze({
      activeStorageCount: active.length,
      archivedStorageCount: archived.length,
      totalProductsWithBalances: totalProductsWithBalances.size,
      totalQuantity,
    }),
  })
}

/**
 * Read-only Storage Center summaries for one workspace.
 *
 * @param {string} workspaceId
 */
export async function getWorkspaceStorageSummaries(workspaceId) {
  const normalizedWorkspaceId = asTrimmedString(workspaceId)
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to load storage summaries.')
  }

  const { data: storageRows, error: storageError } = await supabase
    .from(WORKSPACE_STORAGES_TABLE)
    .select(WORKSPACE_STORAGE_LIST_COLUMNS)
    .eq('workspace_id', normalizedWorkspaceId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (storageError) {
    console.error('[stockStorageCenterService] workspace_storages error:', storageError)
    throw new Error(storageError.message || 'Unable to load storages right now.')
  }

  const storages = (storageRows ?? []).map(mapWorkspaceStorage)

  const { data: balanceRows, error: balanceError } = await supabase
    .from(STOCK_ITEM_LOCATION_BALANCES_TABLE)
    .select(STOCK_STORAGE_CENTER_BALANCE_COLUMNS)
    .eq('workspace_id', normalizedWorkspaceId)

  if (balanceError) {
    console.error('[stockStorageCenterService] balances error:', balanceError)
    throw new Error(balanceError.message || 'Unable to load storage balances right now.')
  }

  /** @type {Map<string, number>} */
  const costByItemId = new Map()
  const itemIds = [...new Set(
    (balanceRows ?? [])
      .map((row) => asTrimmedString(row?.stock_item_id))
      .filter(Boolean),
  )]

  if (itemIds.length > 0) {
    const { data: itemRows, error: itemError } = await supabase
      .from(STOCK_ITEMS_TABLE)
      .select(STOCK_STORAGE_CENTER_COST_COLUMNS)
      .eq('workspace_id', normalizedWorkspaceId)
      .in('id', itemIds)

    if (itemError) {
      console.warn('[stockStorageCenterService] cost_price lookup skipped:', itemError)
    } else {
      for (const item of itemRows ?? []) {
        const id = asTrimmedString(item?.id)
        if (!id) continue
        costByItemId.set(id, asFiniteNumber(item?.cost_price))
      }
    }
  }

  return buildWorkspaceStorageSummaries({
    storages,
    balances: balanceRows ?? [],
    costByItemId,
  })
}

/**
 * Map a stock_items row into the shape StockProductHistoryDrawer already expects.
 * Quantity on `item` remains catalog current_quantity (drawer shows location splits).
 *
 * @param {Record<string, unknown>} record
 */
function mapStorageProductCatalogItem(record) {
  const currentQuantity = asFiniteNumber(record?.current_quantity ?? record?.currentQuantity)
  const minimumQuantity = asFiniteNumber(record?.minimum_quantity ?? record?.minimumQuantity)
  const orderQuantity = record?.order_quantity ?? record?.orderQuantity
  const targetQuantity = record?.target_quantity ?? record?.targetQuantity
  const costPrice = asFiniteNumber(record?.cost_price ?? record?.costPrice)

  const item = {
    id: record?.id,
    workspaceId: asTrimmedString(record?.workspace_id ?? record?.workspaceId),
    name: asTrimmedString(record?.name),
    category: normalizeStockCategory(record?.category ?? 'Other'),
    itemType: normalizeStockItemType(
      record?.category ?? 'Other',
      record?.item_type ?? record?.itemType ?? 'Other',
    ),
    supplier: asTrimmedString(record?.supplier),
    supplierId: normalizeSupplierId(record?.supplier_id ?? record?.supplierId ?? null),
    storageLocation: resolveStockStorageLocation({
      category: record?.category,
      storageLocation: record?.storage_location ?? record?.storageLocation,
    }),
    unit: asTrimmedString(record?.unit),
    currentQuantity,
    minimumQuantity,
    targetQuantity: targetQuantity === null || targetQuantity === undefined
      ? null
      : asFiniteNumber(targetQuantity),
    orderQuantity: orderQuantity === null || orderQuantity === undefined
      ? null
      : asFiniteNumber(orderQuantity),
    costPrice,
    active: record?.active !== false,
    createdAt: record?.created_at ?? record?.createdAt ?? null,
    updatedAt: record?.updated_at ?? record?.updatedAt ?? null,
  }

  return {
    ...item,
    status: resolveStockItemStatus(item),
  }
}

/**
 * Pure join of per-storage balances + catalog items.
 * Row quantity is THIS storage only — never catalog total.
 *
 * @param {{
 *   balances?: unknown,
 *   items?: unknown,
 * }} [input]
 */
export function buildStorageProductRows({ balances = [], items = [] } = {}) {
  const balanceList = Array.isArray(balances) ? balances : []
  /** @type {Map<string, ReturnType<typeof mapStorageProductCatalogItem>>} */
  const itemsById = new Map()
  for (const record of Array.isArray(items) ? items : []) {
    const id = asTrimmedString(record?.id)
    if (!id) continue
    itemsById.set(id, mapStorageProductCatalogItem(record))
  }

  /** @type {Array<{
   *   stockItemId: string,
   *   name: string,
   *   category: string,
   *   unit: string,
   *   active: boolean,
   *   quantity: number,
   *   costPrice: number,
   *   lineValue: number,
   *   item: ReturnType<typeof mapStorageProductCatalogItem>,
   * }>} */
  const rows = []

  for (const balance of balanceList) {
    const stockItemId = asTrimmedString(balance?.stock_item_id ?? balance?.stockItemId)
    if (!stockItemId) continue
    const quantity = asFiniteNumber(balance?.quantity)
    const catalogItem = itemsById.get(stockItemId)
    const item = catalogItem ?? {
      id: stockItemId,
      workspaceId: '',
      name: 'Unknown product',
      category: 'Other',
      itemType: 'Other',
      supplier: '',
      supplierId: null,
      storageLocation: '—',
      unit: '',
      currentQuantity: 0,
      minimumQuantity: 0,
      targetQuantity: null,
      orderQuantity: null,
      costPrice: 0,
      active: true,
      createdAt: null,
      updatedAt: null,
      status: 'ok',
    }
    const costPrice = asFiniteNumber(item.costPrice)
    rows.push(Object.freeze({
      stockItemId,
      name: item.name || 'Unknown product',
      category: item.category || 'Other',
      unit: item.unit || '',
      active: item.active !== false,
      quantity,
      costPrice,
      lineValue: quantity * costPrice,
      item: Object.freeze(item),
    }))
  }

  return Object.freeze(rows)
}

/**
 * @param {unknown} rows
 * @param {string} [searchTerm]
 */
export function filterStorageProductRows(rows = [], searchTerm = '') {
  const needle = `${searchTerm ?? ''}`.trim().toLowerCase()
  const list = Array.isArray(rows) ? rows : []
  if (!needle) return list

  return list.filter((row) => {
    const haystack = `${row?.name ?? ''} ${row?.category ?? ''} ${row?.unit ?? ''} ${row?.item?.itemType ?? ''} ${row?.item?.supplier ?? ''}`
      .toLowerCase()
    return haystack.includes(needle)
  })
}

/**
 * @param {unknown} rows
 * @param {string} [sortKey]
 */
export function sortStorageProductRows(rows = [], sortKey = 'name-asc') {
  const list = [...(Array.isArray(rows) ? rows : [])]
  const compareName = (left, right) => (
    `${left?.name ?? ''}`.localeCompare(`${right?.name ?? ''}`, undefined, { sensitivity: 'base' })
  )

  list.sort((left, right) => {
    if (sortKey === 'name-desc') return compareName(right, left)
    if (sortKey === 'qty-desc') {
      const delta = asFiniteNumber(right?.quantity) - asFiniteNumber(left?.quantity)
      return delta !== 0 ? delta : compareName(left, right)
    }
    if (sortKey === 'qty-asc') {
      const delta = asFiniteNumber(left?.quantity) - asFiniteNumber(right?.quantity)
      return delta !== 0 ? delta : compareName(left, right)
    }
    if (sortKey === 'category') {
      const categoryDelta = `${left?.category ?? ''}`.localeCompare(
        `${right?.category ?? ''}`,
        undefined,
        { sensitivity: 'base' },
      )
      return categoryDelta !== 0 ? categoryDelta : compareName(left, right)
    }
    return compareName(left, right)
  })

  return list
}

/**
 * Read-only products for one workspace storage (balances in THIS storage only).
 *
 * @param {string} workspaceId
 * @param {string} storageId
 */
export async function getWorkspaceStorageProducts(workspaceId, storageId) {
  const normalizedWorkspaceId = asTrimmedString(workspaceId)
  const normalizedStorageId = asTrimmedString(storageId)
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to load storage products.')
  }
  if (!normalizedStorageId) {
    throw new Error('Storage is required to load storage products.')
  }

  const { data: balanceRows, error: balanceError } = await supabase
    .from(STOCK_ITEM_LOCATION_BALANCES_TABLE)
    .select(STOCK_STORAGE_CENTER_BALANCE_COLUMNS)
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('workspace_storage_id', normalizedStorageId)

  if (balanceError) {
    console.error('[stockStorageCenterService] storage products balances error:', balanceError)
    throw new Error(balanceError.message || 'Unable to load storage products right now.')
  }

  const balances = balanceRows ?? []
  const itemIds = [...new Set(
    balances
      .map((row) => asTrimmedString(row?.stock_item_id))
      .filter(Boolean),
  )]

  let items = []
  if (itemIds.length > 0) {
    const { data: itemRows, error: itemError } = await supabase
      .from(STOCK_ITEMS_TABLE)
      .select(STOCK_STORAGE_PRODUCT_ITEM_COLUMNS)
      .eq('workspace_id', normalizedWorkspaceId)
      .in('id', itemIds)

    if (itemError) {
      console.error('[stockStorageCenterService] storage products items error:', itemError)
      throw new Error(itemError.message || 'Unable to load storage products right now.')
    }
    items = itemRows ?? []
  }

  const products = buildStorageProductRows({ balances, items })
  let totalQuantity = 0
  let inventoryValue = 0
  let nonZeroBalanceCount = 0
  for (const row of products) {
    totalQuantity += row.quantity
    inventoryValue += row.lineValue
    if (row.quantity !== 0) nonZeroBalanceCount += 1
  }

  return Object.freeze({
    storageId: normalizedStorageId,
    products: Object.freeze(products),
    summary: Object.freeze({
      productCount: products.length,
      totalQuantity,
      nonZeroBalanceCount,
      inventoryValue,
    }),
  })
}
