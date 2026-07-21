// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('inventory_migration_auto_link_runtime_validation.sql P8.6.1c one-click harness', () => {
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

  const forbiddenPlaceholders = [
    'REPLACE_ME',
    'TARGET_WORKSPACE_UUID',
    'MANAGER_USER_UUID',
    'INSERT_UUID_HERE',
    'TODO UUID',
    'paste workspace id',
    'paste manager id',
    '>>> REPLACE THESE TWO UUIDS',
    'v_target_workspace_id uuid := null',
    'v_manager_auth_user_id uuid := null',
  ]

  it('begins with BEGIN and ends the executable harness with ROLLBACK', () => {
    const beginAt = sql.search(/^\s*begin\s*;/im)
    const rollbackAt = sql.search(/^\s*rollback\s*;/im)
    expect(beginAt).toBeGreaterThan(-1)
    expect(rollbackAt).toBeGreaterThan(beginAt)
    expect(sql).toMatch(/^\s*rollback\s*;/im)
  })

  it('contains no COMMIT and no operator UUID placeholders', () => {
    expect(sql).not.toMatch(/\bcommit\s*;/i)
    expect(sql).toContain('must NEVER be changed to COMMIT')
    expect(sql).toContain('Guaranteed rollback — NEVER change this to COMMIT')
    for (const token of forbiddenPlaceholders) {
      expect(sql).not.toContain(token)
    }
  })

  it('auto-resolves AMORE.NICOSIA with exact-one match safety', () => {
    expect(sql).toContain("w.slug = 'amore-nicosia'")
    expect(sql).toContain("w.name = 'AMORE.NICOSIA'")
    expect(sql).toContain('v_workspace_match_count')
    expect(sql).toContain('expected exactly one')
    expect(sql).toContain('no workspace matched authoritative identity')
    // Must not pick an arbitrary first workspace without identity filter.
    expect(sql).not.toMatch(/from public\.workspaces\s+w\s+order by[\s\S]*limit 1/i)
  })

  it('auto-selects manager with owner → general_manager → manager precedence', () => {
    expect(sql).toContain("wm.role in ('owner', 'general_manager', 'manager')")
    expect(sql).toContain("when 'owner' then 1")
    expect(sql).toContain("when 'general_manager' then 2")
    expect(sql).toContain("when 'manager' then 3")
    expect(sql).toContain('wm.created_at asc nulls last')
    expect(sql).toContain('wm.auth_user_id asc')
    expect(sql).toContain('join auth.users u on u.id = wm.auth_user_id')
    expect(sql).toContain('no eligible owner/general_manager/manager')
  })

  it('asserts auth.uid and can_manage_workspace_stock before product RPCs', () => {
    expect(sql).toContain("set_config('request.jwt.claim.sub'")
    expect(sql).toContain("'request.jwt.claims'")
    expect(sql).toContain('auth.uid()')
    expect(sql).toContain('did not equal selected manager')
    expect(sql).toContain('can_manage_workspace_stock(v_target_workspace_id)')
    expect(sql).toContain('is not true for manager')
  })

  it('blocks when a running migration session already exists', () => {
    expect(sql).toContain("s.status = 'running'")
    expect(sql).toContain('v_running_session_id')
    expect(sql).toContain('started_at=%')
    expect(sql).toContain('started_by=%')
    expect(sql).toContain('aborting (no cancel)')
  })

  it('uses unique P861C marker with collision guards', () => {
    expect(sql).toContain("v_run_marker := 'P861C_'")
    expect(sql).toContain('collision — marker')
    expect(sql).toContain("item_name like (v_run_marker || '%')")
  })

  it('calls actual start/foundation/persist/auto-link RPCs only', () => {
    expect(sql).toContain('start_inventory_migration_session(v_target_workspace_id)')
    expect(sql).toContain('transition_inventory_migration_step(')
    expect(sql).toContain("'foundation'")
    expect(sql).toContain("'completed'")
    expect(sql).toContain('run_inventory_migration_persist(')
    expect(sql).toContain('run_inventory_migration_auto_link(')
    expect(sql).not.toContain('run_inventory_migration_auto_create(')
    expect(sql).not.toContain('run_inventory_migration_phase1(')
    expect(sql).not.toContain('run_inventory_migration_phase2(')
    expect(sql).not.toContain('run_inventory_migration_post_apply_audit(')
    expect(sql).not.toContain('complete_inventory_migration_session(')
  })

  it('validates Cases A/B/C identity outcomes', () => {
    expect(sql).toContain("v_map_status is distinct from 'classified'")
    expect(sql).toContain("v_map_resolution is distinct from 'auto_link'")
    expect(sql).toContain('v_map_stock_id is distinct from v_case_a_stock_id')
    expect(sql).toContain("v_map_status is distinct from 'linked'")
    expect(sql).toContain('Case A Auto-link failed')
    expect(sql).toContain("v_map_resolution is distinct from 'auto_create'")
    expect(sql).toContain('Case B Persist failed')
    expect(sql).toContain("v_map_status is distinct from 'manual'")
    expect(sql).toContain('Case C Persist failed')
  })

  it('proves non-mutation of quantities, movements, migrated_at, and apply stages', () => {
    expect(sql).toContain('v_qty_a_before')
    expect(sql).toContain('v_qty_a_after')
    expect(sql).toContain('stock quantities changed during Persist/Auto-link')
    expect(sql).toContain('v_movements_before')
    expect(sql).toContain('v_movements_after')
    expect(sql).toContain('stock_movements changed')
    expect(sql).toContain('migrated_at is not null')
    expect(sql).toContain("st.step_name = 'auto_create'")
    expect(sql).toContain("st.step_name = 'phase1'")
    expect(sql).toContain("st.step_name = 'phase2'")
    expect(sql).toContain("st.step_name = 'post_apply_audit'")
    expect(sql).toContain('no_apply_stages_executed')
  })

  it('emits required evidence SELECTs and P8.6.1C PASS message', () => {
    expect(sql).toContain("select '1_environment' as evidence")
    expect(sql).toContain("select '2_case_results' as evidence")
    expect(sql).toContain("select '3_session_steps' as evidence")
    expect(sql).toContain("select '4_step_results' as evidence")
    expect(sql).toContain("select '5_quantity_proof' as evidence")
    expect(sql).toContain("select '6_movement_proof' as evidence")
    expect(sql).toContain("select '7_summary' as evidence")
    expect(sql).toContain('ALL P8.6.1C ASSERTIONS PASSED — TRANSACTION ROLLED BACK')
    expect(sql).toContain('case_a_passed')
    expect(sql).toContain('case_b_passed')
    expect(sql).toContain('case_c_passed')
    expect(sql).toContain('quantities_unchanged')
    expect(sql).toContain('movements_unchanged')
  })

  it('keeps post-run verification SELECT-only and commented out', () => {
    expect(sql).toContain('POST-RUN CLEANUP VERIFICATION')
    expect(sql).toContain('-- select count(*) as leftover_legacy')
    expect(sql).toContain('-- select count(*) as leftover_stock')
    expect(sql).toContain('-- select count(*) as leftover_map')
    expect(sql).toContain('-- select count(*) as leftover_movements')
    expect(sql).not.toMatch(/^[^-\n]*\b(delete|update)\s+public\.(inventory_items|stock_items)/im)
  })

  it('does not redefine product Persist or Auto-link RPCs', () => {
    expect(sql).not.toMatch(/create or replace function public\.run_inventory_migration_persist/i)
    expect(sql).not.toMatch(/create or replace function public\.run_inventory_migration_auto_link/i)
    expect(persistSql).not.toContain('P861C_')
    expect(autoLinkSql).not.toContain('P861C_')
    expect(persistSql).toContain('create or replace function public.run_inventory_migration_persist')
    expect(autoLinkSql).toContain('create or replace function public.run_inventory_migration_auto_link')
  })

  it('documents one-click paste-and-run workflow', () => {
    expect(sql).toContain('ONE-CLICK OPERATOR WORKFLOW')
    expect(sql).toContain('Paste the full file into Supabase SQL Editor')
    expect(sql).toContain('No UUID lookup. No manual editing. No credential handling.')
  })
})
