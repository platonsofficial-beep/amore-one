import { supabase } from '../lib/supabaseClient'
import {
  aggregateInventoryMigrationMetrics,
  createEmptyInventoryMigrationMetrics,
  mapAttentionQueueRows,
  mapManualReviewQueueRows,
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
      manualReviewRows: [],
      attentionRows: [],
      error: null,
      unavailable: false,
      tableReachable: false,
      metricsAvailable: false,
      fetchedAt: null,
    }
  }

  if (!supabase) {
    return {
      metrics: createEmptyInventoryMigrationMetrics(),
      manualReviewRows: [],
      attentionRows: [],
      error: 'Supabase is not configured.',
      unavailable: true,
      tableReachable: false,
      metricsAvailable: false,
      fetchedAt: null,
    }
  }

  const { data, error } = await supabase
    .from(MAP_TABLE)
    .select('id, status, resolution_type, migrated_at, legacy_inventory_item_id, stock_item_id, source_snapshot, conflict_reason, created_at')
    .eq('workspace_id', normalizedWorkspaceId)

  if (error) {
    console.warn('[inventoryMigrationMetricsService] getInventoryMigrationMetrics error:', error)
    return {
      metrics: createEmptyInventoryMigrationMetrics(),
      manualReviewRows: [],
      attentionRows: [],
      error: error.message || 'Unable to load migration metrics.',
      unavailable: isTableUnavailableError(error),
      tableReachable: false,
      metricsAvailable: false,
      fetchedAt: null,
    }
  }

  const rows = data ?? []

  return {
    metrics: aggregateInventoryMigrationMetrics(rows),
    manualReviewRows: mapManualReviewQueueRows(rows),
    attentionRows: mapAttentionQueueRows(rows),
    error: null,
    unavailable: false,
    tableReachable: true,
    metricsAvailable: true,
    fetchedAt: new Date().toISOString(),
  }
}
