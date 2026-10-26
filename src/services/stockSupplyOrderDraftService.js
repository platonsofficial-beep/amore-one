import { supabase } from '../lib/supabaseClient'
import {
  BUYING_STORAGE_UNAVAILABLE_MESSAGE,
  isBuyingStorageColumnMissing,
  isWorkspaceDepartmentSchemaMissing,
} from '../lib/stockDepartmentGroups'
import { isStockStorageParSchemaMissing, STORAGE_PAR_UNAVAILABLE_MESSAGE } from '../lib/stockStoragePar'
import {
  buildSupplyOrderDraftGroups,
  formatSupplyOrderDraftNotice,
  planSupplyOrderDraftWrites,
} from '../lib/stockSupplyOrderDraft'
import {
  STOCK_STORAGE_CENTER_BALANCE_COLUMNS,
  STOCK_STORAGE_PAR_COLUMNS,
  WORKSPACE_STORAGE_BUYING_COLUMNS,
  WORKSPACE_STORAGE_DEPARTMENT_COLUMNS,
} from './stockStorageCenterService'
import { createStockOrder, updateStockOrderDraft } from './stockOrderService'
import {
  WORKSPACE_STORAGE_LIST_COLUMNS,
  mapWorkspaceStorage,
} from './workspaceStorageService'

const WORKSPACE_STORAGES_TABLE = 'workspace_storages'
const BALANCES_TABLE = 'stock_item_location_balances'
const PARS_TABLE = 'stock_item_storage_pars'

function requireWorkspaceId(workspaceId) {
  const normalized = `${workspaceId ?? ''}`.trim()
  if (!normalized) throw new Error('Workspace is required to prepare order drafts.')
  return normalized
}

/**
 * Load storages, balances, and pars for what-to-order.
 * A missing is_buying column falls back to supply storages only.
 * A missing pars table reports parsReady false and does not throw.
 *
 * @param {string} workspaceId
 */
export async function loadSupplyOrderSource(workspaceId) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)

  const loadStorages = (columns) => supabase
    .from(WORKSPACE_STORAGES_TABLE)
    .select(columns)
    .eq('workspace_id', normalizedWorkspaceId)

  let buyingAvailable = true
  let storageResult = await loadStorages(WORKSPACE_STORAGE_BUYING_COLUMNS)
  if (storageResult.error && isBuyingStorageColumnMissing(storageResult.error)) {
    buyingAvailable = false
    storageResult = await loadStorages(WORKSPACE_STORAGE_DEPARTMENT_COLUMNS)
  }
  if (storageResult.error && isWorkspaceDepartmentSchemaMissing(storageResult.error)) {
    buyingAvailable = false
    storageResult = await loadStorages(WORKSPACE_STORAGE_LIST_COLUMNS)
  }
  if (storageResult.error) {
    throw new Error(storageResult.error.message || 'Unable to load storages right now.')
  }

  const [balanceResult, parResult] = await Promise.all([
    supabase
      .from(BALANCES_TABLE)
      .select(STOCK_STORAGE_CENTER_BALANCE_COLUMNS)
      .eq('workspace_id', normalizedWorkspaceId),
    supabase
      .from(PARS_TABLE)
      .select(STOCK_STORAGE_PAR_COLUMNS)
      .eq('workspace_id', normalizedWorkspaceId),
  ])

  if (balanceResult.error) {
    throw new Error(balanceResult.error.message || 'Unable to load storage quantities right now.')
  }

  if (parResult.error && isStockStorageParSchemaMissing(parResult.error)) {
    return {
      storages: (storageResult.data ?? []).map(mapWorkspaceStorage),
      balances: balanceResult.data ?? [],
      pars: [],
      parsReady: false,
      buyingAvailable,
    }
  }
  if (parResult.error) {
    throw new Error(parResult.error.message || 'Unable to load shelf pars right now.')
  }

  return {
    storages: (storageResult.data ?? []).map(mapWorkspaceStorage),
    balances: balanceResult.data ?? [],
    pars: parResult.data ?? [],
    parsReady: true,
    buyingAvailable,
  }
}

/**
 * One click: create or refresh one open draft per supplier from supply and
 * buying storage pars. Does not write when pars are not in the database yet.
 *
 * @param {string} workspaceId
 * @param {{
 *   items?: unknown,
 *   suppliers?: unknown,
 *   existingOrders?: unknown,
 *   createdBy?: string|null,
 *   loadSource?: typeof loadSupplyOrderSource,
 *   createOrder?: typeof createStockOrder,
 *   updateDraft?: typeof updateStockOrderDraft,
 * }} [options]
 */
export async function prepareSupplyOrderDrafts(workspaceId, {
  items = [],
  suppliers = [],
  existingOrders = [],
  createdBy = null,
  loadSource = loadSupplyOrderSource,
  createOrder = createStockOrder,
  updateDraft = updateStockOrderDraft,
} = {}) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const source = await loadSource(normalizedWorkspaceId)

  if (!source?.parsReady) {
    return {
      unavailable: true,
      parsReady: false,
      buyingAvailable: source?.buyingAvailable !== false,
      created: [],
      updated: [],
      message: STORAGE_PAR_UNAVAILABLE_MESSAGE,
    }
  }

  const groups = buildSupplyOrderDraftGroups({
    items,
    suppliers,
    storages: source.storages ?? [],
    balances: source.balances ?? [],
    pars: source.pars ?? [],
  })
  const plan = planSupplyOrderDraftWrites(groups, existingOrders)
  const created = []
  const updated = []

  for (const step of plan) {
    if (step.action === 'update') {
      const order = await updateDraft(normalizedWorkspaceId, step.orderId, {
        supplier: step.group.supplier,
        notes: step.notes,
        expectedDeliveryDate: step.expectedDeliveryDate,
        items: step.group.items,
      })
      updated.push(order)
      continue
    }

    const order = await createOrder(normalizedWorkspaceId, {
      supplier: step.group.supplier,
      supplierId: step.group.supplierId ?? null,
      notes: '',
      status: 'draft',
      items: step.group.items,
    }, { createdBy })
    created.push(order)
  }

  return {
    unavailable: false,
    parsReady: true,
    buyingAvailable: source.buyingAvailable !== false,
    created,
    updated,
    message: formatSupplyOrderDraftNotice({ created, updated }),
  }
}

export { BUYING_STORAGE_UNAVAILABLE_MESSAGE }
