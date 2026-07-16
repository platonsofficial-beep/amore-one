import { supabase } from '../lib/supabaseClient'
import {
  aggregateInventoryMigrationMetrics,
  createEmptyInventoryMigrationMetrics,
  mapAttentionQueueRows,
  mapManualReviewQueueRows,
} from '../lib/inventoryMigrationMetrics'

const MAP_TABLE = 'inventory_stock_item_map'
const CAN_MANAGE_STOCK_RPC = 'can_manage_workspace_stock'

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

function emptyDeniedResult(errorMessage) {
  return {
    metrics: createEmptyInventoryMigrationMetrics(),
    manualReviewRows: [],
    attentionRows: [],
    error: errorMessage,
    unavailable: false,
    tableReachable: false,
    metricsAvailable: false,
    fetchedAt: null,
  }
}

/**
 * Read-only: load migration-map rows for a workspace and aggregate dashboard metrics.
 * Never inserts, updates, or deletes.
 *
 * Authorization: requires can_manage_workspace_stock (owner / general_manager / manager)
 * for the target workspace. Host, staff, anonymous, and wrong-workspace are denied.
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

  const { data: canManage, error: authError } = await supabase.rpc(CAN_MANAGE_STOCK_RPC, {
    target_workspace_id: normalizedWorkspaceId,
  })

  if (authError) {
    console.warn('[inventoryMigrationMetricsService] authorization check error:', authError)
    return emptyDeniedResult(
      authError.message || 'Unable to verify migration read access for this workspace.',
    )
  }

  if (canManage !== true) {
    return emptyDeniedResult(
      'You do not have permission to view migration data for this workspace.',
    )
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
