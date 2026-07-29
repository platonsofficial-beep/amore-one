/**
 * P8.29.12 — Stock location balance read service.
 *
 * Read-only. Fetches stock_item_location_balances for item detail panels.
 * Does not mutate balances, aggregates, or movements.
 */

import { supabase } from '../lib/supabaseClient'
import { buildStockLocationBalanceDisplayList } from '../lib/stockLocationBalanceDisplay'
import { listWorkspaceStorages } from './workspaceStorageService'

const STOCK_ITEM_LOCATION_BALANCES_TABLE = 'stock_item_location_balances'

export const STOCK_LOCATION_BALANCE_LIST_COLUMNS = [
  'id',
  'workspace_id',
  'stock_item_id',
  'workspace_storage_id',
  'location_key',
  'quantity',
  'quantity_version',
].join(', ')

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

/**
 * Enrich raw balance rows with workspace storage catalog fields.
 *
 * @param {Array<Record<string, unknown>>} balanceRows
 * @param {Array<{ id?: unknown, locationKey?: string, name?: string, active?: boolean, sortOrder?: number }>} storages
 */
export function enrichStockLocationBalancesWithStorages(balanceRows, storages) {
  const list = Array.isArray(balanceRows) ? balanceRows : []
  const catalog = Array.isArray(storages) ? storages : []
  /** @type {Map<string, object>} */
  const byId = new Map()
  for (const storage of catalog) {
    const id = `${storage?.id ?? ''}`.trim()
    if (id) byId.set(id, storage)
  }

  return list.map((row) => {
    const storageId = `${row?.workspace_storage_id ?? row?.workspaceStorageId ?? ''}`.trim()
    const storage = byId.get(storageId) ?? null
    return {
      ...row,
      workspace_storages: storage
        ? {
          id: storage.id,
          location_key: storage.locationKey,
          name: storage.name,
          active: storage.active !== false,
          sort_order: storage.sortOrder,
        }
        : null,
    }
  })
}

/**
 * Load visible location balances for one stock item (detail/read panels only).
 *
 * @param {string} workspaceId
 * @param {string} stockItemId
 * @returns {Promise<Array<ReturnType<import('../lib/stockLocationBalanceDisplay').mapStockLocationBalanceDisplay>>>}
 */
export async function getStockItemLocationBalances(workspaceId, stockItemId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedItemId = `${stockItemId ?? ''}`.trim()
  if (!normalizedWorkspaceId || !normalizedItemId) return []

  const { data, error } = await supabase
    .from(STOCK_ITEM_LOCATION_BALANCES_TABLE)
    .select(STOCK_LOCATION_BALANCE_LIST_COLUMNS)
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('stock_item_id', normalizedItemId)

  if (error) {
    console.warn('[stockLocationBalanceService] getStockItemLocationBalances error:', error)
    if (isTableUnavailableError(error)) return []
    return []
  }

  let storages = []
  try {
    storages = await listWorkspaceStorages(normalizedWorkspaceId)
  } catch (storageError) {
    console.warn('[stockLocationBalanceService] listWorkspaceStorages skipped:', storageError)
    storages = []
  }

  const enriched = enrichStockLocationBalancesWithStorages(data ?? [], storages)
  return buildStockLocationBalanceDisplayList(enriched)
}
