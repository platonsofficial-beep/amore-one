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
  normalizePackagingNote,
  normalizeProductBarcode,
  normalizeProductBrand,
  normalizeProductSize,
  resolveStockStorageLocation,
} from '../lib/stockCatalog'
import { buildStockProductSearchHaystack } from '../lib/stockProductMetadataDisplay'
import { resolveStockItemStatus } from '../lib/stockUtils'
import { normalizeSupplierId } from '../lib/stockSupplierUtils'
import {
  isBuyingStorageColumnMissing,
  isWorkspaceDepartmentSchemaMissing,
} from '../lib/stockDepartmentGroups'
import {
  countBelowParByStorage,
  isStockStorageParSchemaMissing,
  normalizeStorageParQuantity,
  storageParShort,
} from '../lib/stockStoragePar'
import {
  WORKSPACE_STORAGE_LIST_COLUMNS,
  mapWorkspaceStorage,
} from './workspaceStorageService'

const WORKSPACE_STORAGES_TABLE = 'workspace_storages'
const STOCK_ITEM_LOCATION_BALANCES_TABLE = 'stock_item_location_balances'
const STOCK_ITEM_STORAGE_PARS_TABLE = 'stock_item_storage_pars'
const STOCK_ITEMS_TABLE = 'stock_items'

export const STOCK_STORAGE_PAR_COLUMNS = 'stock_item_id, workspace_storage_id, par_quantity'

export const STOCK_STORAGE_CENTER_BALANCE_COLUMNS = [
  'stock_item_id',
  'workspace_storage_id',
  'location_key',
  'quantity',
  'quantity_version',
].join(', ')

export const STOCK_STORAGE_CENTER_COST_COLUMNS = 'id, cost_price'

/** Storage Center select. Falls back to WORKSPACE_STORAGE_LIST_COLUMNS when unset. */
export const WORKSPACE_STORAGE_DEPARTMENT_COLUMNS =
  `${WORKSPACE_STORAGE_LIST_COLUMNS}, department_id, is_supply`

/** Adds is_buying. Falls back to the department select when that column is absent. */
export const WORKSPACE_STORAGE_BUYING_COLUMNS =
  `${WORKSPACE_STORAGE_DEPARTMENT_COLUMNS}, is_buying`

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
  'brand',
  'size',
  'barcode',
  'packaging_note',
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
 *   pars?: unknown,
 * }} [input]
 */
export function buildWorkspaceStorageSummaries({
  storages = [],
  balances = [],
  costByItemId = null,
  pars = null,
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

  const parsTracked = Array.isArray(pars)
  const belowParByStorage = parsTracked
    ? countBelowParByStorage({ balances: balanceList, pars })
    : null

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
    const departmentId = asTrimmedString(storage?.departmentId ?? storage?.department_id) || null
    return Object.freeze({
      id,
      workspaceId: asTrimmedString(storage?.workspaceId ?? storage?.workspace_id),
      locationKey: asTrimmedString(storage?.locationKey ?? storage?.location_key),
      name: asTrimmedString(storage?.name) || asTrimmedString(storage?.locationKey),
      active,
      status: active ? 'active' : 'archived',
      sortOrder: Number(storage?.sortOrder ?? storage?.sort_order ?? 0) || 0,
      departmentId,
      isSupply: storage?.isSupply === true || storage?.is_supply === true,
      isBuying: storage?.isBuying === true || storage?.is_buying === true,
      productCount: aggregate.productIds.size,
      belowParCount: belowParByStorage ? (belowParByStorage.get(id) ?? 0) : null,
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

  const loadStorageRows = (columns) => supabase
    .from(WORKSPACE_STORAGES_TABLE)
    .select(columns)
    .eq('workspace_id', normalizedWorkspaceId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  let departmentsAvailable = true
  let buyingAvailable = true
  let storageResult = await loadStorageRows(WORKSPACE_STORAGE_BUYING_COLUMNS)
  if (storageResult.error && isBuyingStorageColumnMissing(storageResult.error)) {
    buyingAvailable = false
    storageResult = await loadStorageRows(WORKSPACE_STORAGE_DEPARTMENT_COLUMNS)
  }
  if (storageResult.error && isWorkspaceDepartmentSchemaMissing(storageResult.error)) {
    departmentsAvailable = false
    buyingAvailable = false
    storageResult = await loadStorageRows(WORKSPACE_STORAGE_LIST_COLUMNS)
  }

  const storageRows = storageResult.data
  const storageError = storageResult.error

  if (storageError) {
    console.error('[stockStorageCenterService] workspace_storages error:', storageError)
    throw new Error(storageError.message || 'Unable to load storages right now.')
  }

  const storages = (storageRows ?? []).map(mapWorkspaceStorage)

  const [balanceResult, parResult] = await Promise.all([
    supabase
      .from(STOCK_ITEM_LOCATION_BALANCES_TABLE)
      .select(STOCK_STORAGE_CENTER_BALANCE_COLUMNS)
      .eq('workspace_id', normalizedWorkspaceId),
    supabase
      .from(STOCK_ITEM_STORAGE_PARS_TABLE)
      .select(STOCK_STORAGE_PAR_COLUMNS)
      .eq('workspace_id', normalizedWorkspaceId),
  ])

  const { data: balanceRows, error: balanceError } = balanceResult
  const { data: parData, error: parError } = parResult

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

  let parsAvailable = true
  let parRows = []

  if (parError && isStockStorageParSchemaMissing(parError)) {
    parsAvailable = false
  } else if (parError) {
    console.error('[stockStorageCenterService] storage pars error:', parError)
    throw new Error(parError.message || 'Unable to load shelf pars right now.')
  } else {
    parRows = parData ?? []
  }

  return Object.freeze({
    ...buildWorkspaceStorageSummaries({
      storages,
      balances: balanceRows ?? [],
      costByItemId,
      pars: parsAvailable ? parRows : null,
    }),
    departmentsAvailable,
    buyingAvailable,
    parsAvailable,
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
    brand: normalizeProductBrand(record?.brand ?? null),
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
    size: normalizeProductSize(record?.size ?? null),
    packagingNote: normalizePackagingNote(
      record?.packaging_note ?? record?.packagingNote ?? null,
    ),
    barcode: normalizeProductBarcode(record?.barcode ?? null),
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
 *   pars?: unknown,
 * }} [input]
 */
export function buildStorageProductRows({ balances = [], items = [], pars = [] } = {}) {
  const balanceList = Array.isArray(balances) ? balances : []
  /** @type {Map<string, ReturnType<typeof mapStorageProductCatalogItem>>} */
  const itemsById = new Map()
  for (const record of Array.isArray(items) ? items : []) {
    const id = asTrimmedString(record?.id)
    if (!id) continue
    itemsById.set(id, mapStorageProductCatalogItem(record))
  }

  /** @type {Map<string, number>} */
  const parByItemId = new Map()
  for (const par of Array.isArray(pars) ? pars : []) {
    const stockItemId = asTrimmedString(par?.stock_item_id ?? par?.stockItemId)
    const parQuantity = normalizeStorageParQuantity(par?.par_quantity ?? par?.parQuantity)
    if (!stockItemId || parQuantity == null) continue
    parByItemId.set(stockItemId, parQuantity)
  }

  const rows = []
  const seenItemIds = new Set()

  const pushRow = (stockItemId, quantity, quantityVersion) => {
    if (!stockItemId || seenItemIds.has(stockItemId)) return
    seenItemIds.add(stockItemId)
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
    const parQuantity = parByItemId.has(stockItemId) ? parByItemId.get(stockItemId) : null
    rows.push(Object.freeze({
      stockItemId,
      name: item.name || 'Unknown product',
      brand: item.brand ?? null,
      size: item.size ?? null,
      barcode: item.barcode ?? null,
      packagingNote: item.packagingNote ?? null,
      category: item.category || 'Other',
      unit: item.unit || '',
      active: item.active !== false,
      quantity,
      quantityVersion,
      parQuantity,
      shortQuantity: storageParShort(parQuantity, quantity),
      costPrice,
      lineValue: quantity * costPrice,
      item: Object.freeze(item),
    }))
  }

  for (const balance of balanceList) {
    const stockItemId = asTrimmedString(balance?.stock_item_id ?? balance?.stockItemId)
    if (!stockItemId) continue
    const quantity = asFiniteNumber(balance?.quantity)
    const quantityVersion = Math.max(
      1,
      Math.floor(asFiniteNumber(balance?.quantity_version ?? balance?.quantityVersion) || 1),
    )
    pushRow(stockItemId, quantity, quantityVersion)
  }

  for (const [stockItemId] of parByItemId) {
    if (seenItemIds.has(stockItemId)) continue
    pushRow(stockItemId, 0, 0)
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
    const haystack = buildStockProductSearchHaystack({
      name: row?.name,
      brand: row?.brand ?? row?.item?.brand,
      size: row?.size ?? row?.item?.size,
      barcode: row?.barcode ?? row?.item?.barcode,
      supplier: row?.item?.supplier,
      category: row?.category,
      unit: row?.unit,
    }, {
      itemType: row?.item?.itemType,
      location: '',
    })
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

  const [balanceResult, parResult] = await Promise.all([
    supabase
      .from(STOCK_ITEM_LOCATION_BALANCES_TABLE)
      .select(STOCK_STORAGE_CENTER_BALANCE_COLUMNS)
      .eq('workspace_id', normalizedWorkspaceId)
      .eq('workspace_storage_id', normalizedStorageId),
    supabase
      .from(STOCK_ITEM_STORAGE_PARS_TABLE)
      .select(STOCK_STORAGE_PAR_COLUMNS)
      .eq('workspace_id', normalizedWorkspaceId)
      .eq('workspace_storage_id', normalizedStorageId),
  ])

  const { data: balanceRows, error: balanceError } = balanceResult
  const { data: parData, error: parError } = parResult

  if (balanceError) {
    console.error('[stockStorageCenterService] storage products balances error:', balanceError)
    throw new Error(balanceError.message || 'Unable to load storage products right now.')
  }

  const balances = balanceRows ?? []

  let parsAvailable = true
  let parRows = []

  if (parError && isStockStorageParSchemaMissing(parError)) {
    parsAvailable = false
  } else if (parError) {
    console.error('[stockStorageCenterService] storage product pars error:', parError)
    throw new Error(parError.message || 'Unable to load shelf pars right now.')
  } else {
    parRows = parData ?? []
  }

  const itemIds = [...new Set([
    ...balances.map((row) => asTrimmedString(row?.stock_item_id)),
    ...parRows.map((row) => asTrimmedString(row?.stock_item_id)),
  ].filter(Boolean))]

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

  const products = buildStorageProductRows({
    balances,
    items,
    pars: parsAvailable ? parRows : [],
  })
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
    parsAvailable,
    products: Object.freeze(products),
    summary: Object.freeze({
      productCount: products.length,
      totalQuantity,
      nonZeroBalanceCount,
      inventoryValue,
    }),
  })
}
