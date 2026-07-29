// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const snapshotSql = readFileSync(join(HERE, '../supabase/inventory_count_build_snapshot_rpc.sql'), 'utf8')
const reconcileSql = readFileSync(join(HERE, '../supabase/inventory_count_reconcile_finish.sql'), 'utf8')
const postSql = readFileSync(join(HERE, '../supabase/inventory_count_post_finish_rpc.sql'), 'utf8')
const correctionSql = readFileSync(join(HERE, '../supabase/inventory_count_apply_corrections_rpc.sql'), 'utf8')
const reverseSql = readFileSync(join(HERE, '../supabase/inventory_count_reverse_session_rpc.sql'), 'utf8')
const importApplySql = readFileSync(join(HERE, '../supabase/inventory_import_apply_rpc.sql'), 'utf8')
const mutationService = readFileSync(join(HERE, '../src/services/stockMutationService.js'), 'utf8')

describe('P8.29.8 — Inventory Count location balance engine', () => {
  it('snapshots expected_snapshot from location balances filtered by session location_key', () => {
    expect(snapshotSql).toContain('from public.stock_item_location_balances b')
    expect(snapshotSql).toContain('b.location_key')
    expect(snapshotSql).toContain('coalesce(b.quantity, 0)')
    expect(snapshotSql).toContain('b.location_key in (')
    expect(snapshotSql).toMatch(/include_zero_stock[\s\S]*b\.quantity/)
    expect(snapshotSql).not.toContain('coalesce(si.current_quantity, 0)')
  })

  it('reconciles live quantity and deltas per location (zero variance math unchanged)', () => {
    expect(reconcileSql).toContain('stock_item_location_balances bal')
    expect(reconcileSql).toContain("'current_live_quantity', coalesce(bal.quantity, 0)")
    expect(reconcileSql).toContain("'expected_at_count', (i.expected_snapshot + coalesce(deltas.net_delta, 0))")
    expect(reconcileSql).toContain("'variance_quantity', (i.counted_quantity - (i.expected_snapshot + coalesce(deltas.net_delta, 0)))")
    expect(reconcileSql).toContain('destination_location_key = i.storage_location')
    expect(reconcileSql).toContain('source_location_key = i.storage_location')
  })

  it('posts variance as location-aware adjustment and refreshes aggregate cache', () => {
    expect(postSql).toContain('update public.stock_item_location_balances b')
    expect(postSql).toContain('quantity = v_resulting_quantity_after_post')
    expect(postSql).toContain('set current_quantity = v_aggregate_sum')
    expect(postSql).toContain('coalesce(sum(b.quantity), 0)')
    expect(postSql).toContain("'inventory_count_post'")
    expect(postSql).toContain('if v_variance_quantity <> 0 then')
    expect(postSql).toContain('inventory_count_post_negative_balance_rejected')
    expect(postSql).toContain('v_seen_line_keys')
  })

  it('allows multi-location same product via item+location duplicate key', () => {
    expect(postSql).toContain('v_item_id::text || chr(1) || v_storage_location')
    expect(postSql).toContain('order by i.item_id, i.storage_location')
    expect(snapshotSql).toContain('stock_item_location_balances b')
  })

  it('corrections operate on same location balance with append-only origin', () => {
    expect(correctionSql).toContain('i.storage_location')
    expect(correctionSql).toContain('update public.stock_item_location_balances b')
    expect(correctionSql).toContain("'inventory_count_correction'")
    expect(correctionSql).toContain('set current_quantity = v_aggregate_sum')
    expect(correctionSql).toContain('v_seen_session_item_ids')
    expect(correctionSql).not.toMatch(/update public\.inventory_count_session_items[\s\S]*expected_snapshot\s*=/)
  })

  it('reversal restores location balance and leaves session posted history', () => {
    expect(reverseSql).toContain('update public.stock_item_location_balances b')
    expect(reverseSql).toContain("'inventory_count_reversal'")
    expect(reverseSql).toContain('set current_quantity = v_aggregate_sum')
    expect(reverseSql).toContain("v_reversal_quantity := -v_orig.quantity")
    expect(reverseSql).toContain("'status', 'posted'")
    expect(reverseSql).toContain('reversed_at = v_now')
  })

  it('does not flip service capability flag (P8.29.8 scope)', () => {
    // P8.29.9 intentionally extends Import Apply with stock_item_location_balances —
    // that assertion is removed here. Only the service flag guard remains.
    expect(mutationService).toContain('let supportsLocationBalances = false')
  })
})
