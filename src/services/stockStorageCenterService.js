/**
 * P8.30.1 — Storage Center read-only summaries.
 *
 * Aggregates workspace_storages + stock_item_location_balances for the
 * Storages Stock destination. No mutations. No SQL/RPC changes.
 */

import { supabase } from '../lib/supabaseClient'
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
