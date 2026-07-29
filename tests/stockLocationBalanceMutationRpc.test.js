// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const sqlPath = join(HERE, '../supabase/stock_location_balance_mutation_rpcs.sql')
const movementExtPath = join(HERE, '../supabase/stock_movements_location_extension.sql')
const balancesPath = join(HERE, '../supabase/stock_item_location_balances_schema.sql')
const stockMovementServicePath = join(HERE, '../src/services/stockMovementService.js')
const countPostPath = join(HERE, '../supabase/inventory_count_post_finish_rpc.sql')
const importApplyPath = join(HERE, '../supabase/inventory_import_apply_rpc.sql')

const sql = readFileSync(sqlPath, 'utf8')
const movementExt = readFileSync(movementExtPath, 'utf8')
const balancesSchema = readFileSync(balancesPath, 'utf8')
const stockMovementService = readFileSync(stockMovementServicePath, 'utf8')
const countPostSql = readFileSync(countPostPath, 'utf8')
const importApplySql = readFileSync(importApplyPath, 'utf8')

const CORE_START = sql.indexOf(
  'create or replace function public.mutate_stock_item_location_balance_core',
)
const CORE_END = sql.indexOf(
  'comment on function public.mutate_stock_item_location_balance_core',
)
const CORE = sql.slice(CORE_START, CORE_END)

function functionBody(name) {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  const comment = sql.indexOf(`comment on function public.${name}(`)
  expect(start).toBeGreaterThan(-1)
  expect(comment).toBeGreaterThan(start)
  return sql.slice(start, comment)
}

describe('stock_location_balance_mutation_rpcs.sql — P8.29.5 contract', () => {
  it('defines shared core plus receive/usage/adjustment/stock_count RPCs', () => {
    expect(sql).toContain('mutate_stock_item_location_balance_core')
    expect(sql).toContain('create or replace function public.record_location_receive(')
    expect(sql).toContain('create or replace function public.record_location_usage(')
    expect(sql).toContain('create or replace function public.record_location_adjustment(')
    expect(sql).toContain('create or replace function public.record_location_stock_count(')
  })

  it('uses SECURITY DEFINER, search_path, and manager authorization', () => {
    expect(CORE).toMatch(/security definer/i)
    expect(CORE).toContain('set search_path = public')
    expect(CORE).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(CORE).toContain('is_workspace_member(p_workspace_id)')
    expect(CORE).toContain('stock_location_balance_forbidden')
    expect(CORE).toContain('stock_location_balance_unauthenticated')
  })

  it('grants execute on public RPCs only; revokes core from clients', () => {
    expect(sql).toContain(
      'grant execute on function public.record_location_receive(',
    )
    expect(sql).toContain(
      'grant execute on function public.record_location_usage(',
    )
    expect(sql).toContain(
      'grant execute on function public.record_location_adjustment(',
    )
    expect(sql).toContain(
      'grant execute on function public.record_location_stock_count(',
    )
    expect(sql).toContain('to authenticated')
    expect(sql).toMatch(
      /revoke all on function public\.mutate_stock_item_location_balance_core[\s\S]*from authenticated/,
    )
    expect(sql).not.toMatch(
      /grant execute on function public\.mutate_stock_item_location_balance_core/,
    )
  })

  it('wires each public RPC to the correct movement type via core', () => {
    expect(functionBody('record_location_receive')).toContain("'receive'")
    expect(functionBody('record_location_usage')).toContain("'usage'")
    expect(functionBody('record_location_adjustment')).toContain("'adjustment'")
    expect(functionBody('record_location_stock_count')).toContain("'stock_count'")
    expect(functionBody('record_location_receive')).toContain(
      'mutate_stock_item_location_balance_core',
    )
  })

  it('validates workspace, item, storage, and existing balance row', () => {
    expect(CORE).toContain('stock_location_balance_workspace_not_found')
    expect(CORE).toContain('stock_location_balance_item_not_found')
    expect(CORE).toContain('stock_location_balance_storage_not_found')
    expect(CORE).toContain('stock_location_balance_storage_inactive')
    expect(CORE).toContain('stock_location_balance_not_found')
    expect(CORE).toContain('from public.stock_item_location_balances b')
    expect(CORE).toContain('for update')
    expect(CORE).toContain('si.workspace_id = p_workspace_id')
    expect(CORE).toContain('ws.workspace_id = p_workspace_id')
  })

  it('enforces optimistic lock and increments quantity_version', () => {
    expect(CORE).toContain('p_expected_quantity_version')
    expect(CORE).toContain('stock_location_balance_version_mismatch')
    expect(CORE).toContain(
      'v_balance.quantity_version is distinct from p_expected_quantity_version',
    )
    expect(CORE).toContain('quantity_version = b.quantity_version + 1')
    expect(CORE).toContain('and b.quantity_version = p_expected_quantity_version')
    expect(CORE).toContain("'quantity_version', p_expected_quantity_version + 1")
  })

  it('rejects negative resulting balances and invalid quantities', () => {
    expect(CORE).toContain('stock_location_balance_negative_rejected')
    expect(CORE).toContain('if v_quantity_after < 0 then')
    expect(CORE).toContain('stock_location_balance_quantity_invalid')
    expect(CORE).toMatch(/receive[\s\S]*v_qty <= 0/)
    expect(CORE).toMatch(/usage[\s\S]*v_qty <= 0/)
    expect(CORE).toMatch(/adjustment[\s\S]*v_qty = 0/)
    expect(CORE).toMatch(/stock_count[\s\S]*v_qty < 0/)
  })

  it('inserts location-aware movement then updates balance then refreshes cache', () => {
    const movementIdx = CORE.indexOf('insert into public.stock_movements')
    const balanceIdx = CORE.indexOf('update public.stock_item_location_balances b')
    const cacheIdx = CORE.indexOf('update public.stock_items si')
    expect(movementIdx).toBeGreaterThan(-1)
    expect(balanceIdx).toBeGreaterThan(movementIdx)
    expect(cacheIdx).toBeGreaterThan(balanceIdx)

    expect(CORE).toContain('source_workspace_storage_id')
    expect(CORE).toContain('destination_workspace_storage_id')
    expect(CORE).toContain('source_location_key')
    expect(CORE).toContain('destination_location_key')
    expect(CORE).toContain('origin_workflow')
    expect(CORE).toContain('origin_ref_id')
    expect(CORE).toContain('coalesce(sum(b.quantity), 0)')
    expect(CORE).toContain('set current_quantity = v_aggregate_sum')
    expect(CORE).toContain('stock_location_balance_aggregate_drift')
    expect(CORE).toContain('if v_aggregate_sum < 0 then')
  })

  it('keeps receive/usage/adjustment/stock_count effects in one transaction function', () => {
    expect(CORE).toContain('language plpgsql')
    expect(CORE).toContain('returns jsonb')
    // Single function body = one DB transaction when called via RPC.
    expect(CORE).toContain('insert into public.stock_movements')
    expect(CORE).toContain('update public.stock_item_location_balances')
    expect(CORE).toContain('update public.stock_items')
  })

  it('does not implement transfer RPC', () => {
    expect(sql).not.toContain('record_location_transfer')
    expect(sql).toContain('Transfer types are intentionally rejected')
    expect(CORE).toContain('stock_location_balance_transfer_not_supported')
    expect(sql).toContain('Implement transfer RPC (P8.29.6)')
  })

  it('does not wire services, Count, Import, or existing movement writers', () => {
    expect(stockMovementService).not.toContain('record_location_receive')
    expect(stockMovementService).not.toContain('mutate_stock_item_location_balance_core')
    expect(countPostSql).not.toContain('record_location_')
    expect(importApplySql).not.toContain('record_location_')
    expect(sql).toContain('Wire services / UI / Count / Import / Dashboard')
  })

  it('depends on balance + movement location extension contracts', () => {
    expect(balancesSchema).toContain('quantity_version bigint not null default 1')
    expect(movementExt).toContain('origin_workflow')
    expect(movementExt).toContain('source_workspace_storage_id')
    expect(movementExt).toContain('destination_workspace_storage_id')
  })
})
