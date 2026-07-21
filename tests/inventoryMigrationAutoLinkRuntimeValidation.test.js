// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('inventory_migration_auto_link_runtime_validation.sql harness contract', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const harnessPath = join(
    root,
    'supabase/inventory_migration_auto_link_runtime_validation.sql',
  )
  const persistPath = join(root, 'supabase/inventory_migration_persist_rpc.sql')
  const autoLinkPath = join(root, 'supabase/inventory_migration_auto_link_rpc.sql')

  const sql = readFileSync(harnessPath, 'utf8')
  const persistSql = readFileSync(persistPath, 'utf8')
  const autoLinkSql = readFileSync(autoLinkPath, 'utf8')

  it('begins a transaction and ends the harness with ROLLBACK', () => {
    // Match executable statements only (start-of-line, ignoring comment mentions).
    const beginAt = sql.search(/^\s*begin\s*;/im)
    const rollbackAt = sql.search(/^\s*rollback\s*;/im)
    expect(beginAt).toBeGreaterThan(-1)
    expect(rollbackAt).toBeGreaterThan(beginAt)
    expect(sql).toMatch(/^\s*rollback\s*;/im)
  })

  it('contains no COMMIT statement', () => {
    expect(sql).not.toMatch(/\bcommit\s*;/i)
    expect(sql).toContain('must NEVER be changed to COMMIT')
    expect(sql).toContain('Guaranteed rollback — NEVER change this to COMMIT')
  })

  it('requires explicit workspace and manager UUID inputs', () => {
    expect(sql).toContain('v_target_workspace_id uuid')
    expect(sql).toContain('v_manager_auth_user_id uuid')
    expect(sql).toContain('>>> REPLACE THESE TWO UUIDS BEFORE RUNNING <<<')
    expect(sql).toContain('Do not automatically choose the first workspace')
  })

  it('rejects null and nil placeholder UUIDs before fixtures', () => {
    expect(sql).toContain("v_nil uuid := '00000000-0000-0000-0000-000000000000'")
    expect(sql).toContain('null/nil placeholder rejected')
    expect(sql).toMatch(/v_target_workspace_id is null or v_target_workspace_id = v_nil/)
    expect(sql).toMatch(/v_manager_auth_user_id is null or v_manager_auth_user_id = v_nil/)
  })

  it('verifies workspace existence and manager authorization', () => {
    expect(sql).toContain('from public.workspaces w where w.id = v_target_workspace_id')
    expect(sql).toContain('from auth.users u where u.id = v_manager_auth_user_id')
    expect(sql).toContain('can_manage_workspace_stock(v_target_workspace_id)')
    expect(sql).toContain('is not true for manager')
  })

  it('asserts auth.uid context matches the selected manager', () => {
    expect(sql).toContain("set_config('request.jwt.claim.sub'")
    expect(sql).toContain("set_config(\n    'request.jwt.claims'")
    expect(sql).toContain('auth.uid()')
    expect(sql).toContain('did not equal selected manager')
  })

  it('uses a unique P861B run marker with collision guards', () => {
    expect(sql).toContain("v_run_marker := 'P861B_'")
    expect(sql).toContain('collision — marker')
    expect(sql).toContain('item_name like (v_run_marker || \'%\')')
  })

  it('calls the actual session Persist and Auto-link product RPCs', () => {
    expect(sql).toContain('start_inventory_migration_session(v_target_workspace_id)')
    expect(sql).toContain('transition_inventory_migration_step(')
    expect(sql).toContain("'foundation'")
    expect(sql).toContain("'completed'")
    expect(sql).toContain('run_inventory_migration_persist(')
    expect(sql).toContain('run_inventory_migration_auto_link(')
  })

  it('does not call Auto-create, Phase 1, or Phase 2 RPCs', () => {
    expect(sql).not.toContain('run_inventory_migration_auto_create(')
    expect(sql).not.toContain('run_inventory_migration_phase1(')
    expect(sql).not.toContain('run_inventory_migration_phase2(')
    expect(sql).toContain('Do NOT call auto_create / phase1 / phase2')
  })

  it('validates Case A persisted stock_item_id and linked status', () => {
    expect(sql).toContain("v_map_status is distinct from 'classified'")
    expect(sql).toContain("v_map_resolution is distinct from 'auto_link'")
    expect(sql).toContain('v_map_stock_id is distinct from v_case_a_stock_id')
    expect(sql).toContain("v_map_status is distinct from 'linked'")
    expect(sql).toContain('Case A Auto-link failed')
  })

  it('validates Case B and Case C keep null stock_item_id', () => {
    expect(sql).toContain("v_map_resolution is distinct from 'auto_create'")
    expect(sql).toContain('Case B Persist failed')
    expect(sql).toContain("v_map_status is distinct from 'manual'")
    expect(sql).toContain('Case C Persist failed')
    expect(sql).toContain('v_map_stock_id is not null')
  })

  it('compares quantities and movements before and after', () => {
    expect(sql).toContain('v_qty_a_before')
    expect(sql).toContain('v_qty_a_after')
    expect(sql).toContain('stock quantities changed during Persist/Auto-link')
    expect(sql).toContain('v_movements_before')
    expect(sql).toContain('v_movements_after')
    expect(sql).toContain('stock_movements changed')
    expect(sql).toContain('migrated_at is not null')
  })

  it('emits evidence SELECTs and post-rollback cleanup verification queries', () => {
    expect(sql).toContain("select '1_meta' as evidence")
    expect(sql).toContain("select '2_map_results' as evidence")
    expect(sql).toContain("select '3_session_steps' as evidence")
    expect(sql).toContain("select '4_step_results' as evidence")
    expect(sql).toContain("select '5_quantity_proof' as evidence")
    expect(sql).toContain("select '6_movement_proof' as evidence")
    expect(sql).toContain("select '7_summary' as evidence")
    expect(sql).toContain('ALL P8.6.1B ASSERTIONS PASSED — TRANSACTION WILL ROLLBACK')
    expect(sql).toContain('POST-RUN CLEANUP VERIFICATION')
    expect(sql).toContain('leftover_legacy')
    expect(sql).toContain('leftover_stock')
    expect(sql).toContain('leftover_map')
    expect(sql).toContain('leftover_movements')
  })

  it('does not redefine product Persist or Auto-link RPCs', () => {
    expect(sql).not.toMatch(/create or replace function public\.run_inventory_migration_persist/i)
    expect(sql).not.toMatch(/create or replace function public\.run_inventory_migration_auto_link/i)
    expect(persistSql).not.toContain('P861B_')
    expect(autoLinkSql).not.toContain('P861B_')
    expect(persistSql).toContain('create or replace function public.run_inventory_migration_persist')
    expect(autoLinkSql).toContain('create or replace function public.run_inventory_migration_auto_link')
  })
})
