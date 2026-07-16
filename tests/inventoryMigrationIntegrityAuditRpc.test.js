// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const AUDIT_CATEGORY_IDS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R',
]

describe('inventory_migration_integrity_audit_rpc.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_migration_integrity_audit_rpc.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

  const functionBody = sql.slice(
    sql.indexOf('create or replace function public.run_inventory_migration_integrity_audit'),
    sql.indexOf('revoke all on function public.run_inventory_migration_integrity_audit'),
  )

  it('defines SECURITY DEFINER RPC with safe search_path and authenticated-only execute', () => {
    expect(sql).toContain('create or replace function public.run_inventory_migration_integrity_audit(')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain(
      'revoke all on function public.run_inventory_migration_integrity_audit(uuid, uuid) from public',
    )
    expect(sql).toContain(
      'revoke all on function public.run_inventory_migration_integrity_audit(uuid, uuid) from anon',
    )
    expect(sql).toContain(
      'grant execute on function public.run_inventory_migration_integrity_audit(uuid, uuid) to authenticated',
    )
    expect(sql.match(/create or replace function public\./gi)?.length).toBe(1)
  })

  it('requires auth, workspace, session, and stock-manager authorization', () => {
    expect(functionBody).toContain('auth.uid()')
    expect(functionBody).toContain('inventory_migration_integrity_audit_unauthenticated')
    expect(functionBody).toContain('inventory_migration_integrity_audit_workspace_required')
    expect(functionBody).toContain('inventory_migration_integrity_audit_session_required')
    expect(functionBody).toContain('inventory_migration_integrity_audit_workspace_not_found')
    expect(functionBody).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(functionBody).toContain('inventory_migration_integrity_audit_forbidden')
  })

  it('locks the running session and all steps before mutating', () => {
    const sessionLockAt = functionBody.indexOf('from public.inventory_migration_sessions s')
    const sessionForUpdateAt = functionBody.indexOf('for update', sessionLockAt)
    const stepsLockAt = functionBody.indexOf('Lock order 2: all session steps')
    const runningUpdateAt = functionBody.indexOf("status = 'running',\n    started_at = now()")

    expect(sessionLockAt).toBeGreaterThan(-1)
    expect(sessionForUpdateAt).toBeGreaterThan(sessionLockAt)
    expect(stepsLockAt).toBeGreaterThan(sessionForUpdateAt)
    expect(runningUpdateAt).toBeGreaterThan(stepsLockAt)
    expect(functionBody).toContain('inventory_migration_integrity_audit_session_not_found')
    expect(functionBody).toContain('inventory_migration_integrity_audit_session_not_running')
    expect(functionBody).toContain("step_name = 'integrity_audit'")
  })

  it('validates waiting step, prerequisites, and single-running-step before audit', () => {
    expect(functionBody).toContain('inventory_migration_integrity_audit_step_not_found')
    expect(functionBody).toContain('inventory_migration_integrity_audit_already_completed')
    expect(functionBody).toContain('inventory_migration_integrity_audit_invalid_step_state')
    expect(functionBody).toContain('inventory_migration_integrity_audit_prerequisite_incomplete')
    expect(functionBody).toContain('inventory_migration_integrity_audit_another_step_running')
    expect(functionBody).toContain("'foundation'")
    expect(functionBody).toContain("'persist'")
    expect(functionBody).toContain("'auto_link'")
    expect(functionBody).toContain("'auto_create'")
    expect(functionBody).toContain("status is distinct from 'waiting'")
  })

  it('does not accept caller-controlled result status or evidence payloads', () => {
    expect(functionBody).not.toMatch(/p_result_status/)
    expect(functionBody).not.toMatch(/p_result_summary/)
    expect(functionBody).not.toMatch(/p_step_name/)
    expect(functionBody).not.toMatch(/p_critical_finding_count/)
    expect(functionBody).toContain("v_result_status := 'attention_required'")
    expect(functionBody).toContain("v_result_status := 'passed'")
  })

  it('retains workspace-scoped categories A–R with audit_version and deterministic order', () => {
    expect(functionBody).toContain("'audit_version', 1")
    expect(functionBody).toContain("'category_count', 18")
    for (const id of AUDIT_CATEGORY_IDS) {
      expect(functionBody).toContain(`'id', '${id}'`)
    }
    expect(functionBody).toContain("'duplicate_map_key_extra_rows'")
    expect(functionBody).toContain("'coverage_gap'")
    expect(functionBody).toContain("'stock_coverage_created_plus_linked'")
    expect(functionBody).toContain('m.workspace_id = p_workspace_id')
    expect(functionBody).toContain('Legacy catalog is global')
  })

  it('derives attention_required from attention-relevant findings only', () => {
    expect(functionBody).toContain('v_classified_auto_create')
    expect(functionBody).toContain('v_coverage_gap')
    expect(functionBody).toContain("severity', 'informational'")
    expect(functionBody).toContain("'key', 'manual_rows'")
    expect(functionBody).toContain("'key', 'skipped_rows'")
    expect(functionBody).toMatch(/if v_attention_count > 0 then[\s\S]*attention_required[\s\S]*else[\s\S]*passed/)
  })

  it('persists one step result, completes the step, and writes a note activity', () => {
    const resultInsertAt = functionBody.indexOf('insert into public.inventory_migration_step_results')
    const completeAt = functionBody.indexOf("status = 'completed'")
    const activityAt = functionBody.indexOf('insert into public.inventory_migration_activity')

    expect(completeAt).toBeGreaterThan(-1)
    expect(resultInsertAt).toBeGreaterThan(completeAt)
    expect(activityAt).toBeGreaterThan(resultInsertAt)
    expect(functionBody).toContain("'integrity_audit'")
    expect(functionBody).toContain("'note'")
    expect(functionBody).toContain('Integrity audit completed:')
    expect(functionBody.match(/insert into public\.inventory_migration_step_results/g)?.length).toBe(1)
    expect(functionBody.match(/insert into public\.inventory_migration_activity/g)?.length).toBe(1)
  })

  it('owns step transitions without calling the generic transition RPC', () => {
    expect(functionBody).not.toContain('transition_inventory_migration_step')
    expect(functionBody).toContain("status = 'running'")
    expect(functionBody).toContain("status = 'completed'")
    expect(functionBody).toContain('started_at = now()')
    expect(functionBody).toContain('completed_at = v_executed_at')
  })

  it('does not mutate map, stock items, or movements', () => {
    expect(functionBody).not.toMatch(/insert into public\.inventory_stock_item_map/i)
    expect(functionBody).not.toMatch(/update public\.inventory_stock_item_map/i)
    expect(functionBody).not.toMatch(/insert into public\.stock_items/i)
    expect(functionBody).not.toMatch(/update public\.stock_items/i)
    expect(functionBody).not.toMatch(/insert into public\.stock_movements/i)
    expect(functionBody).not.toMatch(/update public\.stock_movements/i)
    expect(functionBody).not.toMatch(/update public\.inventory_migration_sessions/i)
  })

  it('returns a structured outcome row without client write policies', () => {
    expect(functionBody).toContain('result_id uuid')
    expect(functionBody).toContain('result_status text')
    expect(functionBody).toContain('critical_finding_count bigint')
    expect(functionBody).toContain('attention_finding_count bigint')
    expect(functionBody).toContain('total_findings bigint')
    expect(functionBody).toContain('executed_at timestamptz')
    expect(sql).not.toMatch(/create policy/i)
    expect(sql).not.toMatch(/alter table public\.inventory_migration_step_results/i)
    expect(sql).not.toMatch(/alter table public\.inventory_migration_session_steps/i)
    expect(sql).not.toMatch(/alter table public\.inventory_migration_activity/i)
  })
})
