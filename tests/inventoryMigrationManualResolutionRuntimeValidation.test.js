// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('inventory_migration_manual_resolution_runtime_validation.sql P8.6.2b', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const harnessPath = join(
    root,
    'supabase/inventory_migration_manual_resolution_runtime_validation.sql',
  )
  const manualResolvePath = join(
    root,
    'supabase/inventory_migration_manual_resolve_rpc.sql',
  )
  const autoCreatePath = join(
    root,
    'supabase/inventory_migration_auto_create_rpc.sql',
  )

  const sql = readFileSync(harnessPath, 'utf8')
  const manualResolveSql = readFileSync(manualResolvePath, 'utf8')
  const autoCreateSql = readFileSync(autoCreatePath, 'utf8')

  const forbiddenPlaceholders = [
    'REPLACE_ME',
    'TARGET_WORKSPACE_UUID',
    'MANAGER_USER_UUID',
    'INSERT_UUID_HERE',
    'TODO UUID',
    'paste workspace',
    'paste manager',
  ]

  it('begins with BEGIN and ends with ROLLBACK; no COMMIT', () => {
    const beginAt = sql.search(/^\s*begin\s*;/im)
    const rollbackAt = sql.search(/^\s*rollback\s*;/im)
    expect(beginAt).toBeGreaterThan(-1)
    expect(rollbackAt).toBeGreaterThan(beginAt)
    expect(sql).not.toMatch(/\bcommit\s*;/i)
    expect(sql).toContain('must NEVER be changed to COMMIT')
    expect(sql).toContain('Guaranteed rollback — NEVER change this to COMMIT')
  })

  it('contains no operator UUID placeholders', () => {
    for (const token of forbiddenPlaceholders) {
      expect(sql).not.toContain(token)
    }
  })

  it('auto-resolves AMORE.NICOSIA and manager auth like P8.6.1c', () => {
    expect(sql).toContain("w.slug = 'amore-nicosia'")
    expect(sql).toContain("w.name = 'AMORE.NICOSIA'")
    expect(sql).toContain("set_config('request.jwt.claim.sub'")
    expect(sql).toContain('can_manage_workspace_stock(v_target_workspace_id)')
    expect(sql).toContain("wm.role in ('owner', 'general_manager', 'manager')")
  })

  it('calls deployed Manual Resolution and Auto-create RPCs', () => {
    expect(sql).toContain('run_inventory_migration_manual_resolve(')
    expect(sql).toContain('run_inventory_migration_auto_create(')
    expect(sql).toContain("'force_create'")
    expect(sql).toContain("'approve_candidate'")
    expect(sql).toContain("'manual_create'")
    expect(sql).toContain("'manual_link'")
  })

  it('covers force_create, idempotency, auto-create consumption, approve, finalized protection', () => {
    expect(sql).toContain('Case A force_create')
    expect(sql).toContain('Case A2')
    expect(sql).toContain('Case A3')
    expect(sql).toContain('Case A4')
    expect(sql).toContain('Case B approve')
    expect(sql).toContain('Case B2')
    expect(sql).toContain('Case B3')
    expect(sql).toContain('inventory_migration_manual_resolve_finalized_protected')
    expect(sql).toContain('inventory_migration_auto_create_already_completed')
    expect(sql).toContain('expected exactly one Case A stock item')
  })

  it('asserts movement, quantity, and no Phase 1/2 execution safety', () => {
    expect(sql).toContain('stock_movements changed')
    expect(sql).toContain('unrelated stock quantities changed')
    expect(sql).toContain("st.step_name = 'phase1'")
    expect(sql).toContain("st.step_name = 'phase2'")
    expect(sql).toContain('Phase 1/2 unexpectedly progressed')
    expect(sql).not.toContain('run_inventory_migration_phase1(')
    expect(sql).not.toContain('run_inventory_migration_phase2(')
  })

  it('emits evidence SELECTs and exact PASS message', () => {
    expect(sql).toContain("select '1_environment' as evidence")
    expect(sql).toContain("select '2_case_results' as evidence")
    expect(sql).toContain("select '3_rpc_results' as evidence")
    expect(sql).toContain("select '6_summary' as evidence")
    expect(sql).toContain('ALL P8.6.2B ASSERTIONS PASSED — TRANSACTION ROLLED BACK')
    expect(sql).toContain('case_a_force_create_passed')
    expect(sql).toContain('case_a_auto_create_passed')
    expect(sql).toContain('case_b_approve_passed')
    expect(sql).toContain('finalized_protection_passed')
    expect(sql).toContain('rollback_pending')
  })

  it('does not redefine production Manual Resolution or Auto-create RPCs', () => {
    expect(sql).not.toMatch(
      /create or replace function public\.run_inventory_migration_manual_resolve/i,
    )
    expect(sql).not.toMatch(
      /create or replace function public\.run_inventory_migration_auto_create/i,
    )
    expect(manualResolveSql).toContain('run_inventory_migration_manual_resolve')
    expect(autoCreateSql).toContain('run_inventory_migration_auto_create')
    expect(manualResolveSql).not.toContain('P862B_')
    expect(autoCreateSql).not.toContain('P862B_')
  })

  it('uses unique P862B marker and blocks existing running sessions', () => {
    expect(sql).toContain("v_run_marker := 'P862B_'")
    expect(sql).toContain('collision — marker')
    expect(sql).toContain('aborting (no cancel)')
    expect(sql).toContain("s.status = 'running'")
  })

  it('documents one-click paste-and-run workflow', () => {
    expect(sql).toContain('ONE-CLICK OPERATOR WORKFLOW')
    expect(sql).toContain('Paste the full file into Supabase SQL Editor')
  })
})
