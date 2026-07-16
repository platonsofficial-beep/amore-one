// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('inventory_migration_auto_create_rpc.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_migration_auto_create_rpc.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

  const functionBody = sql.slice(
    sql.indexOf('create or replace function public.run_inventory_migration_auto_create'),
    sql.indexOf('revoke all on function public.run_inventory_migration_auto_create'),
  )

  const stockInsert = functionBody.slice(
    functionBody.indexOf('insert into public.stock_items ('),
    functionBody.indexOf('returning id into v_new_stock_id'),
  )

  const mapUpdate = functionBody.slice(
    functionBody.indexOf('update public.inventory_stock_item_map m'),
    functionBody.indexOf("if not found then\n        raise exception 'map row"),
  )

  it('defines SECURITY DEFINER RPC with safe search_path and authenticated-only execute', () => {
    expect(sql).toContain('create or replace function public.run_inventory_migration_auto_create(')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain(
      'revoke all on function public.run_inventory_migration_auto_create(uuid, uuid) from public',
    )
    expect(sql).toContain(
      'revoke all on function public.run_inventory_migration_auto_create(uuid, uuid) from anon',
    )
    expect(sql).toContain(
      'grant execute on function public.run_inventory_migration_auto_create(uuid, uuid) to authenticated',
    )
    expect(sql.match(/create or replace function public\./gi)?.length).toBe(1)
  })

  it('requires auth, workspace, session, and stock-manager authorization', () => {
    expect(functionBody).toContain('auth.uid()')
    expect(functionBody).toContain('inventory_migration_auto_create_unauthenticated')
    expect(functionBody).toContain('inventory_migration_auto_create_workspace_required')
    expect(functionBody).toContain('inventory_migration_auto_create_session_required')
    expect(functionBody).toContain('inventory_migration_auto_create_workspace_not_found')
    expect(functionBody).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(functionBody).toContain('inventory_migration_auto_create_forbidden')
  })

  it('locks session and steps; re-locks each map row before create', () => {
    expect(functionBody).toContain('Lock order 1: session')
    expect(functionBody).toContain('Lock order 2: all session steps')
    expect(functionBody).toContain('for update')
    expect(functionBody).toContain("step_name = 'auto_create'")
    expect(functionBody).toContain('where m.id = cand.map_id\n      for update')
  })

  it('requires foundation, persist, and auto_link completed', () => {
    expect(functionBody).toContain("unnest(array['foundation', 'persist', 'auto_link'])")
    expect(functionBody).toContain('inventory_migration_auto_create_prerequisite_incomplete')
    const predBlock = functionBody.slice(
      functionBody.indexOf("unnest(array['foundation', 'persist', 'auto_link'])"),
      functionBody.indexOf('inventory_migration_auto_create_prerequisite_incomplete'),
    )
    expect(predBlock).not.toContain('integrity_audit')
    expect(predBlock).not.toContain('preflight')
    expect(predBlock).not.toContain('preview')
  })

  it('does not accept caller-supplied stock data or evidence', () => {
    expect(functionBody).not.toMatch(/\bp_name\b/)
    expect(functionBody).not.toMatch(/\bp_stock_item_id\b/)
    expect(functionBody).not.toMatch(/\bp_result_status\b/)
    expect(functionBody).not.toMatch(/\bp_result_summary\b/)
    expect(functionBody).not.toMatch(/\bp_force\b/)
    expect(functionBody).toContain("v_result_status := 'attention_required'")
    expect(functionBody).toContain("v_result_status := 'passed'")
  })

  it('restricts eligibility to classified+auto_create with null stock_item_id and snapshot', () => {
    expect(functionBody).toContain("m.status = 'classified'")
    expect(functionBody).toContain("m.resolution_type = 'auto_create'")
    expect(functionBody).toContain('m.stock_item_id is null')
    expect(functionBody).toContain("m.source_snapshot <> '{}'::jsonb")
    expect(functionBody).toContain('m.workspace_id = p_workspace_id')
  })

  it('inserts stock_items from source_snapshot with repository field shape', () => {
    expect(stockInsert).toContain('workspace_id')
    expect(stockInsert).toContain('name')
    expect(stockInsert).toContain('category')
    expect(stockInsert).toContain('item_type')
    expect(stockInsert).toContain('supplier')
    expect(stockInsert).toContain('unit')
    expect(stockInsert).toContain('current_quantity')
    expect(stockInsert).toContain('minimum_quantity')
    expect(stockInsert).toContain('target_quantity')
    expect(stockInsert).toContain('order_quantity')
    expect(stockInsert).toContain('cost_price')
    expect(stockInsert).toContain('storage_location')
    expect(stockInsert).toContain('active')
    expect(stockInsert).toContain('locked.workspace_id')
    expect(stockInsert).not.toContain('supplier_id')
    expect(functionBody).toContain("->> 'item_name'")
    expect(functionBody).toContain('Payload ONLY from source_snapshot')
  })

  it('updates map with stock_item_id and created status only (no migrated_at)', () => {
    const setClause = mapUpdate.slice(mapUpdate.indexOf('set'), mapUpdate.indexOf('where'))
    expect(setClause).toContain('stock_item_id = v_new_stock_id')
    expect(setClause).toContain("status = 'created'")
    expect(setClause).not.toContain('migrated_at')
    expect(setClause).not.toContain('resolution_type')
    expect(setClause).not.toContain('source_snapshot')
    expect(mapUpdate).toContain("m.status = 'classified'")
    expect(mapUpdate).toContain("m.resolution_type = 'auto_create'")
    expect(mapUpdate).toContain('m.stock_item_id is null')
  })

  it('records versioned evidence and derives attention from remaining/errors', () => {
    expect(functionBody).toContain("'auto_create_version', 1")
    expect(functionBody).toContain("'key', 'created'")
    expect(functionBody).toContain("'key', 'invalid_snapshot'")
    expect(functionBody).toContain("'key', 'invalid_name'")
    expect(functionBody).toContain("'key', 'errors'")
    expect(functionBody).toMatch(/if v_attention_count > 0 then[\s\S]*attention_required[\s\S]*else[\s\S]*passed/)
    expect(functionBody).toContain('inventory_migration_auto_create_already_completed')
  })

  it('owns step transitions and writes result + activity', () => {
    expect(functionBody).not.toContain('transition_inventory_migration_step')
    expect(functionBody).toContain("status = 'running'")
    expect(functionBody).toContain("status = 'completed'")
    expect(functionBody).toContain("'auto_create'")
    expect(functionBody).toContain("'note'")
    expect(functionBody).toContain('Auto create completed:')
    expect(functionBody.match(/insert into public\.inventory_migration_step_results/g)?.length).toBe(1)
    expect(functionBody.match(/insert into public\.inventory_migration_activity/g)?.length).toBe(1)
  })

  it('does not run auto_link, movements, or update existing stock quantities', () => {
    expect(functionBody).not.toMatch(/update public\.stock_items/i)
    expect(functionBody).not.toMatch(/insert into public\.stock_movements/i)
    expect(functionBody).not.toMatch(/update public\.stock_movements/i)
    expect(functionBody).not.toContain('run_inventory_migration_auto_link')
    expect(functionBody).not.toContain('inventory_movement_execute_phase1')
    expect(functionBody).not.toContain('inventory_movement_apply_phase2')
    expect(functionBody).not.toMatch(/update public\.inventory_migration_sessions/i)
    expect(functionBody.match(/insert into public\.stock_items/g)?.length).toBe(1)
  })
})
