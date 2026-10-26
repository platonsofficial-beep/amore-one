import { supabase } from '../lib/supabaseClient'
import { countWorkspaceItemsBelowPar } from '../lib/stockLiveCard'
import { isStockStorageParSchemaMissing } from '../lib/stockStoragePar'
import {
  STOCK_STORAGE_CENTER_BALANCE_COLUMNS,
  STOCK_STORAGE_PAR_COLUMNS,
} from './stockStorageCenterService'

const BALANCES_TABLE = 'stock_item_location_balances'
const PARS_TABLE = 'stock_item_storage_pars'
const INVENTORY_COUNT_SESSIONS_TABLE = 'inventory_count_sessions'

function isInventoryCountSessionSchemaMissing(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  if (!message.includes('inventory_count_sessions')) return false
  return code === '42P01'
    || code === 'PGRST204'
    || code === 'PGRST205'
    || message.includes('schema cache')
    || message.includes('does not exist')
    || message.includes('could not find')
}

function readLatestPostedInventoryCountAt(result) {
  if (result?.error) {
    if (isInventoryCountSessionSchemaMissing(result.error)) return null
    throw new Error(result.error.message || 'Unable to load inventory counts right now.')
  }
  const row = Array.isArray(result?.data) ? result.data[0] : null
  const postedAt = row?.posted_at ?? row?.postedAt ?? row?.completed_at ?? row?.completedAt ?? null
  return postedAt ? `${postedAt}` : null
}

function requireWorkspaceId(workspaceId) {
  const normalized = `${workspaceId ?? ''}`.trim()
  if (!normalized) throw new Error('Workspace is required to load the stock snapshot.')
  return normalized
}

/**
 * Below-par count for the Today and Stock live card.
 * A missing pars table reports parsReady false and does not throw.
 *
 * @param {string} workspaceId
 */
export async function loadStockLiveSnapshot(workspaceId) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)

  const [parResult, balanceResult, sessionResult] = await Promise.all([
    supabase
      .from(PARS_TABLE)
      .select(STOCK_STORAGE_PAR_COLUMNS)
      .eq('workspace_id', normalizedWorkspaceId),
    supabase
      .from(BALANCES_TABLE)
      .select(STOCK_STORAGE_CENTER_BALANCE_COLUMNS)
      .eq('workspace_id', normalizedWorkspaceId),
    supabase
      .from(INVENTORY_COUNT_SESSIONS_TABLE)
      .select('posted_at, completed_at')
      .eq('workspace_id', normalizedWorkspaceId)
      .eq('status', 'posted')
      .order('posted_at', { ascending: false, nullsFirst: false })
      .limit(1),
  ])

  const lastInventoryCountAt = readLatestPostedInventoryCountAt(sessionResult)

  if (parResult.error && isStockStorageParSchemaMissing(parResult.error)) {
    return { belowParCount: 0, parsReady: false, lastInventoryCountAt }
  }
  if (parResult.error) {
    throw new Error(parResult.error.message || 'Unable to load shelf pars right now.')
  }
  if (balanceResult.error) {
    throw new Error(balanceResult.error.message || 'Unable to load storage quantities right now.')
  }

  return {
    belowParCount: countWorkspaceItemsBelowPar({
      balances: balanceResult.data ?? [],
      pars: parResult.data ?? [],
    }),
    parsReady: true,
    lastInventoryCountAt,
  }
}
