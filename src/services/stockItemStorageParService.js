import { supabase } from '../lib/supabaseClient'
import {
  STORAGE_PAR_UNAVAILABLE_MESSAGE,
  isStockStorageParSchemaMissing,
  normalizeStorageParQuantity,
  parseStorageParInput,
} from '../lib/stockStoragePar'

const PARS_TABLE = 'stock_item_storage_pars'
const PAR_COLUMNS = 'id, workspace_id, stock_item_id, workspace_storage_id, par_quantity'

function requireId(value, message) {
  const normalized = `${value ?? ''}`.trim()
  if (!normalized) throw new Error(message)
  return normalized
}

function mapParWriteError(error, fallbackMessage) {
  if (isStockStorageParSchemaMissing(error)) {
    return new Error(STORAGE_PAR_UNAVAILABLE_MESSAGE)
  }
  const message = `${error?.message ?? ''}`
  const lower = message.toLowerCase()
  const code = `${error?.code ?? ''}`
  if (code === '23514' || lower.includes('par_quantity_chk') || lower.includes('check constraint')) {
    return new Error('Par must be zero or greater.')
  }
  if (lower.includes('stock_item_storage_par_item_workspace_mismatch')) {
    return new Error('That product belongs to a different venue.')
  }
  if (lower.includes('stock_item_storage_par_storage_workspace_mismatch')) {
    return new Error('That storage belongs to a different venue.')
  }
  if (lower.includes('stock_item_storage_par_workspace_immutable')) {
    return new Error('A shelf par cannot move to another venue.')
  }
  return new Error(message || fallbackMessage)
}

/**
 * @param {string} workspaceId
 * @param {string} stockItemId
 * @param {string} workspaceStorageId
 * @param {number} parQuantity
 */
export async function setStockItemStoragePar(workspaceId, stockItemId, workspaceStorageId, parQuantity) {
  const normalizedWorkspaceId = requireId(workspaceId, 'Workspace is required.')
  const normalizedItemId = requireId(stockItemId, 'Product is required.')
  const normalizedStorageId = requireId(workspaceStorageId, 'Storage is required.')
  const parsed = parseStorageParInput(parQuantity)
  if (!parsed.ok || parsed.clear) {
    throw new Error(parsed.ok ? 'Enter a par or clear it.' : parsed.error)
  }

  const { data, error } = await supabase
    .from(PARS_TABLE)
    .upsert({
      workspace_id: normalizedWorkspaceId,
      stock_item_id: normalizedItemId,
      workspace_storage_id: normalizedStorageId,
      par_quantity: parsed.value,
    }, {
      onConflict: 'workspace_id,stock_item_id,workspace_storage_id',
    })
    .select(PAR_COLUMNS)
    .single()

  if (error) {
    console.error('[stockItemStorageParService] setStockItemStoragePar error:', error)
    throw mapParWriteError(error, 'Unable to save the shelf par right now.')
  }

  const returnedPar = normalizeStorageParQuantity(data?.par_quantity)
  return {
    id: data?.id ?? null,
    workspaceId: normalizedWorkspaceId,
    stockItemId: normalizedItemId,
    workspaceStorageId: normalizedStorageId,
    parQuantity: returnedPar ?? parsed.value,
  }
}

/**
 * Delete the par row. The shelf is then not tracked. Zero is not a clear.
 *
 * @param {string} workspaceId
 * @param {string} stockItemId
 * @param {string} workspaceStorageId
 */
export async function clearStockItemStoragePar(workspaceId, stockItemId, workspaceStorageId) {
  const normalizedWorkspaceId = requireId(workspaceId, 'Workspace is required.')
  const normalizedItemId = requireId(stockItemId, 'Product is required.')
  const normalizedStorageId = requireId(workspaceStorageId, 'Storage is required.')

  const { error } = await supabase
    .from(PARS_TABLE)
    .delete()
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('stock_item_id', normalizedItemId)
    .eq('workspace_storage_id', normalizedStorageId)

  if (error) {
    console.error('[stockItemStorageParService] clearStockItemStoragePar error:', error)
    throw mapParWriteError(error, 'Unable to clear the shelf par right now.')
  }

  return {
    stockItemId: normalizedItemId,
    workspaceStorageId: normalizedStorageId,
    parQuantity: null,
  }
}
