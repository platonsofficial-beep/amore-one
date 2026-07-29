// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const sqlPath = join(HERE, '../supabase/stock_transfer_rpc.sql')
const mutationRpcPath = join(HERE, '../supabase/stock_location_balance_mutation_rpcs.sql')
const stockMovementServicePath = join(HERE, '../src/services/stockMovementService.js')
const countPostPath = join(HERE, '../supabase/inventory_count_post_finish_rpc.sql')
const importApplyPath = join(HERE, '../supabase/inventory_import_apply_rpc.sql')

const sql = readFileSync(sqlPath, 'utf8')
const mutationRpc = readFileSync(mutationRpcPath, 'utf8')
const stockMovementService = readFileSync(stockMovementServicePath, 'utf8')
const countPostSql = readFileSync(countPostPath, 'utf8')
const importApplySql = readFileSync(importApplyPath, 'utf8')

const FN_START = sql.indexOf(
  'create or replace function public.transfer_stock_between_locations(',
)
const FN_END = sql.indexOf(
  'comment on function public.transfer_stock_between_locations(',
)
const BODY = sql.slice(FN_START, FN_END)

describe('stock_transfer_rpc.sql — P8.29.6 contract', () => {
  it('defines SECURITY DEFINER transfer_stock_between_locations with required params', () => {
    expect(sql).toContain('create or replace function public.transfer_stock_between_locations(')
    expect(BODY).toContain('p_workspace_id uuid')
    expect(BODY).toContain('p_stock_item_id uuid')
    expect(BODY).toContain('p_source_workspace_storage_id uuid')
    expect(BODY).toContain('p_destination_workspace_storage_id uuid')
    expect(BODY).toContain('p_quantity numeric')
    expect(BODY).toContain('p_expected_source_quantity_version bigint')
    expect(BODY).toContain('p_expected_destination_quantity_version bigint')
    expect(BODY).toContain('p_note text default')
    expect(BODY).toContain('p_origin_ref_id uuid default null')
    expect(BODY).toMatch(/security definer/i)
    expect(BODY).toContain('set search_path = public')
    expect(BODY).toContain('returns jsonb')
    expect(sql).toContain(
      'grant execute on function public.transfer_stock_between_locations(',
    )
    expect(sql).toContain('to authenticated')
  })

  it('rejects same storage, zero, negative, and unauthorized access', () => {
    expect(BODY).toContain('stock_transfer_same_storage')
    expect(BODY).toContain(
      'p_source_workspace_storage_id = p_destination_workspace_storage_id',
    )
    expect(BODY).toContain('stock_transfer_quantity_zero')
    expect(BODY).toContain('if v_qty = 0 then')
    expect(BODY).toContain('stock_transfer_quantity_negative')
    expect(BODY).toContain('if v_qty < 0 then')
    expect(BODY).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(BODY).toContain('stock_transfer_forbidden')
    expect(BODY).toContain('stock_transfer_storage_inactive')
  })

  it('rejects missing balances, insufficient stock, and cross-workspace mismatch', () => {
    expect(BODY).toContain('stock_transfer_source_balance_not_found')
    expect(BODY).toContain('stock_transfer_destination_balance_not_found')
    expect(BODY).toContain('stock_transfer_insufficient_source')
    expect(BODY).toContain('if v_source_before < v_qty then')
    expect(BODY).toContain('si.workspace_id = p_workspace_id')
    expect(BODY).toContain('ws.workspace_id = p_workspace_id')
    expect(BODY).toContain('stock_transfer_item_not_found')
    expect(BODY).toContain('stock_transfer_storage_not_found')
  })

  it('enforces optimistic locks on source and destination versions', () => {
    expect(BODY).toContain('stock_transfer_source_version_mismatch')
    expect(BODY).toContain('stock_transfer_destination_version_mismatch')
    expect(BODY).toContain(
      'is distinct from p_expected_source_quantity_version',
    )
    expect(BODY).toContain(
      'is distinct from p_expected_destination_quantity_version',
    )
    expect(BODY).toContain(
      'and b.quantity_version = p_expected_source_quantity_version',
    )
    expect(BODY).toContain(
      'and b.quantity_version = p_expected_destination_quantity_version',
    )
  })

  it('creates exactly two movements with shared transfer_group and transfer origin', () => {
    expect(BODY).toContain("v_transfer_group_id uuid := gen_random_uuid()")
    expect(BODY).toContain("v_created_at timestamptz := clock_timestamp()")
    expect(BODY).toContain("'transfer_out'")
    expect(BODY).toContain("'transfer_in'")
    expect(BODY).toContain("'transfer'")
    expect(BODY).toContain('origin_workflow')
    expect(BODY).toContain('transfer_group_id')
    expect(BODY).toContain('v_created_at')
    expect(BODY).toContain('v_auth_user_id')
    expect(BODY.match(/insert into public\.stock_movements/g)?.length).toBe(2)
    expect(BODY).toContain("'transfer_out_movement_id'")
    expect(BODY).toContain("'transfer_in_movement_id'")
    expect(BODY).toContain("'transfer_group_id', v_transfer_group_id")
  })

  it('updates both balances, increments both versions, refreshes unchanged aggregate', () => {
    expect(BODY).toContain('v_source_after := v_source_before - v_qty')
    expect(BODY).toContain('v_dest_after := v_dest_before + v_qty')
    expect(BODY).toContain('quantity_version = b.quantity_version + 1')
    expect(BODY.match(/quantity_version = b\.quantity_version \+ 1/g)?.length).toBe(2)
    expect(BODY).toContain('set current_quantity = v_aggregate_after')
    expect(BODY).toContain('coalesce(sum(b.quantity), 0)')
    expect(BODY).toContain('stock_transfer_aggregate_changed')
    expect(BODY).toContain(
      'v_aggregate_after is distinct from v_aggregate_before',
    )
    expect(BODY).toContain("'source_quantity_version', p_expected_source_quantity_version + 1")
    expect(BODY).toContain(
      "'destination_quantity_version', p_expected_destination_quantity_version + 1",
    )
  })

  it('keeps transfer mutations in one transactional function body', () => {
    const outIdx = BODY.indexOf("'transfer_out'")
    const inIdx = BODY.indexOf("'transfer_in'")
    const sourceUpdateIdx = BODY.indexOf('quantity = v_source_after')
    const destUpdateIdx = BODY.indexOf('quantity = v_dest_after')
    const cacheIdx = BODY.indexOf('set current_quantity = v_aggregate_after')
    expect(outIdx).toBeGreaterThan(-1)
    expect(inIdx).toBeGreaterThan(outIdx)
    expect(sourceUpdateIdx).toBeGreaterThan(inIdx)
    expect(destUpdateIdx).toBeGreaterThan(sourceUpdateIdx)
    expect(cacheIdx).toBeGreaterThan(destUpdateIdx)
    expect(BODY).toContain('language plpgsql')
  })

  it('does not wire services, Count, Import, or change mutation writers', () => {
    expect(stockMovementService).not.toContain('transfer_stock_between_locations')
    expect(countPostSql).not.toContain('transfer_stock_between_locations')
    expect(importApplySql).not.toContain('transfer_stock_between_locations')
    expect(mutationRpc).toContain('record_location_receive')
    expect(mutationRpc).toContain('stock_location_balance_transfer_not_supported')
    expect(sql).toContain('Wire services / UI / Count / Import / Dashboard')
    expect(sql).not.toContain('create or replace function public.record_location_')
  })
})
