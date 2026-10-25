import { supabase } from '../lib/supabaseClient'
import { isWorkspaceDepartmentSchemaMissing } from '../lib/stockDepartmentGroups'
import { transferStockBetweenLocations } from './stockMutationService'
import { refillLinesToTake } from '../lib/stockSupplyRefill'

const STORAGES_TABLE = 'workspace_storages'
const BALANCES_TABLE = 'stock_item_location_balances'
const ITEMS_TABLE = 'stock_items'

const STORAGE_COLUMNS = 'id, workspace_id, location_key, name, active, sort_order, is_supply'
const BALANCE_COLUMNS = 'stock_item_id, workspace_storage_id, quantity, quantity_version'
const ITEM_COLUMNS = 'id, name, unit, brand, size'

function requireWorkspaceId(workspaceId) {
  const normalized = `${workspaceId ?? ''}`.trim()
  if (!normalized) throw new Error('Workspace is required.')
  return normalized
}

/**
 * Supply storages and their on-hand balances. Does not read cost.
 *
 * @param {string} workspaceId
 */
export async function loadSupplyRefillCatalog(workspaceId) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const storageResult = await supabase
    .from(STORAGES_TABLE)
    .select(STORAGE_COLUMNS)
    .eq('workspace_id', normalizedWorkspaceId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (storageResult.error && isWorkspaceDepartmentSchemaMissing(storageResult.error)) {
    return {
      supplyReady: false,
      storages: [],
      balances: [],
      itemsById: new Map(),
    }
  }
  if (storageResult.error) {
    console.error('[stockSupplyRefillService] storages error:', storageResult.error)
    throw new Error(storageResult.error.message || 'Unable to load supply storages right now.')
  }

  const storages = (storageResult.data ?? []).map((row) => ({
    id: `${row?.id ?? ''}`.trim(),
    name: `${row?.name ?? ''}`.trim(),
    locationKey: `${row?.location_key ?? ''}`.trim(),
    active: row?.active !== false,
    isSupply: row?.is_supply === true,
    sortOrder: Number(row?.sort_order ?? 0) || 0,
  })).filter((storage) => storage.id)

  const supplyIds = storages.filter((storage) => storage.isSupply && storage.active).map((storage) => storage.id)
  if (supplyIds.length === 0) {
    return {
      supplyReady: true,
      storages,
      balances: [],
      itemsById: new Map(),
    }
  }

  const balanceResult = await supabase
    .from(BALANCES_TABLE)
    .select(BALANCE_COLUMNS)
    .eq('workspace_id', normalizedWorkspaceId)
    .in('workspace_storage_id', supplyIds)

  if (balanceResult.error) {
    console.error('[stockSupplyRefillService] balances error:', balanceResult.error)
    throw new Error(balanceResult.error.message || 'Unable to load supply balances right now.')
  }

  const balances = (balanceResult.data ?? []).map((row) => ({
    stockItemId: `${row?.stock_item_id ?? ''}`.trim(),
    storageId: `${row?.workspace_storage_id ?? ''}`.trim(),
    quantity: Number(row?.quantity) || 0,
    quantityVersion: Number(row?.quantity_version) || 1,
  })).filter((row) => row.stockItemId && row.storageId)

  const itemIds = [...new Set(balances.map((row) => row.stockItemId))]
  /** @type {Map<string, { name: string, unit: string }>} */
  const itemsById = new Map()
  if (itemIds.length > 0) {
    const itemResult = await supabase
      .from(ITEMS_TABLE)
      .select(ITEM_COLUMNS)
      .eq('workspace_id', normalizedWorkspaceId)
      .in('id', itemIds)
    if (itemResult.error) {
      console.error('[stockSupplyRefillService] items error:', itemResult.error)
      throw new Error(itemResult.error.message || 'Unable to load supply products right now.')
    }
    for (const item of itemResult.data ?? []) {
      const id = `${item?.id ?? ''}`.trim()
      if (!id) continue
      itemsById.set(id, {
        name: `${item?.name ?? ''}`.trim(),
        unit: `${item?.unit ?? ''}`.trim(),
        brand: `${item?.brand ?? ''}`.trim(),
      })
    }
  }

  return {
    supplyReady: true,
    storages,
    balances,
    itemsById,
  }
}

/**
 * Move each selected line through transfer_stock_between_locations.
 * A failed line does not roll back lines that already moved.
 *
 * @param {{
 *   workspaceId: string,
 *   destinationStorageId: string,
 *   lines: object[],
 *   note?: string,
 *   transfer?: typeof transferStockBetweenLocations,
 * }} input
 */
export async function takeRefillLines({
  workspaceId,
  destinationStorageId,
  lines,
  note = '',
  transfer = transferStockBetweenLocations,
}) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const destinationId = `${destinationStorageId ?? ''}`.trim()
  if (!destinationId) throw new Error('Destination storage is required.')

  const queue = refillLinesToTake(lines)
  /** @type {Array<{ stockItemId: string, ok: boolean, error: string }>} */
  const results = []

  for (const line of queue) {
    try {
      await transfer({
        workspaceId: normalizedWorkspaceId,
        stockItemId: line.stockItemId,
        sourceWorkspaceStorageId: line.sourceStorageId,
        destinationWorkspaceStorageId: destinationId,
        quantity: line.quantity,
        expectedSourceQuantityVersion: line.sourceQuantityVersion,
        expectedDestinationQuantityVersion: line.destinationQuantityVersion,
        note,
      })
      results.push({ stockItemId: line.stockItemId, ok: true, error: '' })
    } catch (error) {
      results.push({
        stockItemId: line.stockItemId,
        ok: false,
        error: error?.message || 'Unable to transfer stock right now.',
      })
    }
  }

  return results
}
