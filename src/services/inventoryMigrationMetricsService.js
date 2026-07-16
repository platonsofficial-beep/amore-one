import { supabase } from '../lib/supabaseClient'
import {
  aggregateInventoryMigrationMetrics,
  createEmptyInventoryMigrationMetrics,
} from '../lib/inventoryMigrationMetrics'

const MAP_TABLE = 'inventory_stock_item_map'

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

/**
 * Read-only: load migration-map rows for a workspace and aggregate dashboard metrics.
 * Never inserts, updates, or deletes.
 */
export async function getInventoryMigrationMetrics(workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    return {
      metrics: createEmptyInventoryMigrationMetrics(),
      error: null,
      unavailable: false,
    }
  }

  if (!supabase) {
    return {
      metrics: createEmptyInventoryMigrationMetrics(),
      error: 'Supabase is not configured.',
      unavailable: true,
    }
  }

  const { data, error } = await supabase
    .from(MAP_TABLE)
    .select('id, status, resolution_type')
    .eq('workspace_id', normalizedWorkspaceId)

  if (error) {
    console.warn('[inventoryMigrationMetricsService] getInventoryMigrationMetrics error:', error)
    return {
      metrics: createEmptyInventoryMigrationMetrics(),
      error: error.message || 'Unable to load migration metrics.',
      unavailable: isTableUnavailableError(error),
    }
  }

  return {
    metrics: aggregateInventoryMigrationMetrics(data ?? []),
    error: null,
    unavailable: false,
  }
}
