// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const PREVIEW_GROUP_KEYS = [
  'eligible_rows',
  'blocked_rows',
  'skipped_rows',
  'in_movements',
  'out_movements',
  'unchanged_rows',
  'total_planned_movement_quantity',
]

describe('inventory_migration_preview_rpc.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_migration_preview_rpc.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

  const functionBody = sql.slice(
    sql.indexOf('create or replace function public.run_inventory_migration_preview'),
    sql.indexOf('revoke all on function public.run_inventory_migration_preview'),
  )

  it('defines SECURITY DEFINER RPC with safe search_path and authenticated-only execute', () => {
    expect(sql).toContain('create or replace function public.run_inventory_migration_preview(')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain(
      'revoke all on function public.run_inventory_migration_preview(uuid, uuid) from public',
    )
    expect(sql).toContain(
      'revoke all on function public.run_inventory_migration_preview(uuid, uuid) from anon',
    )
    expect(sql).toContain(
      'grant execute on function public.run_inventory_migration_preview(uuid, uuid) to authenticated',
    )
    expect(sql.match(/create or replace function public\./gi)?.length).toBe(1)
  })

  it('requires auth, workspace, session, and stock-manager authorization', () => {
    expect(functionBody).toContain('auth.uid()')
    expect(functionBody).toContain('inventory_migration_preview_unauthenticated')
    expect(functionBody).toContain('inventory_migration_preview_workspace_required')
    expect(functionBody).toContain('inventory_migration_preview_session_required')
    expect(functionBody).toContain('inventory_migration_preview_workspace_not_found')
    expect(functionBody).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(functionBody).toContain('inventory_migration_preview_forbidden')
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
    expect(functionBody).toContain('inventory_migration_preview_session_not_found')
    expect(functionBody).toContain('inventory_migration_preview_session_not_running')
    expect(functionBody).toContain("step_name = 'preview'")
  })

  it('validates waiting step, foundation→preflight prerequisites, and single-running-step', () => {
    expect(functionBody).toContain('inventory_migration_preview_step_not_found')
    expect(functionBody).toContain('inventory_migration_preview_already_completed')
    expect(functionBody).toContain('inventory_migration_preview_invalid_step_state')
    expect(functionBody).toContain('inventory_migration_preview_prerequisite_incomplete')
    expect(functionBody).toContain('inventory_migration_preview_another_step_running')
    expect(functionBody).toContain("'foundation'")
    expect(functionBody).toContain("'persist'")
    expect(functionBody).toContain("'auto_link'")
    expect(functionBody).toContain("'auto_create'")
    expect(functionBody).toContain("'integrity_audit'")
    expect(functionBody).toContain("'preflight'")
    expect(functionBody).toContain("status is distinct from 'waiting'")
  })

  it('does not accept caller-controlled result status, evidence, or step name', () => {
    expect(functionBody).not.toMatch(/p_result_status/)
    expect(functionBody).not.toMatch(/p_result_summary/)
    expect(functionBody).not.toMatch(/p_step_name/)
    expect(functionBody).not.toMatch(/p_critical_finding_count/)
    expect(functionBody).not.toMatch(/p_force/)
    expect(functionBody).toContain("v_result_status := 'attention_required'")
    expect(functionBody).toContain("v_result_status := 'passed'")
  })

  it('retains workspace-scoped P7.4.8 preview groups with preview_version', () => {
    expect(functionBody).toContain("'preview_version', 1")
    for (const key of PREVIEW_GROUP_KEYS) {
      expect(functionBody).toContain(`'key', '${key}'`)
    }
    expect(functionBody).toContain("'candidate_rows'")
    expect(functionBody).toContain("'ready_rows'")
    expect(functionBody).toContain("'attention_rows'")
    expect(functionBody).toContain('m.workspace_id = p_workspace_id')
    expect(functionBody).toContain("m.status in ('created', 'linked')")
    expect(functionBody).toContain("migration_status = 'ELIGIBLE'")
    expect(functionBody).toContain("movement_direction = 'OUT'")
  })

  it('derives attention_required from blocked rows only', () => {
    expect(functionBody).toContain('v_blocked')
    expect(functionBody).toMatch(/if v_blocked > 0 then[\s\S]*attention_required[\s\S]*else[\s\S]*passed/)
    expect(functionBody).toContain("'requires_attention', false")
    expect(functionBody).toContain("'requires_attention', v_blocked > 0")
  })

  it('persists one step result, completes the step, and writes a note activity', () => {
    const resultInsertAt = functionBody.indexOf('insert into public.inventory_migration_step_results')
    const completeAt = functionBody.indexOf("status = 'completed'")
    const activityAt = functionBody.indexOf('insert into public.inventory_migration_activity')

    expect(completeAt).toBeGreaterThan(-1)
    expect(resultInsertAt).toBeGreaterThan(completeAt)
    expect(activityAt).toBeGreaterThan(resultInsertAt)
    expect(functionBody).toContain("'preview'")
    expect(functionBody).toContain("'note'")
    expect(functionBody).toContain('Preview completed:')
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

  it('does not mutate map, stock, movements, or unrelated stages', () => {
    expect(functionBody).not.toMatch(/insert into public\.inventory_stock_item_map/i)
    expect(functionBody).not.toMatch(/update public\.inventory_stock_item_map/i)
    expect(functionBody).not.toMatch(/insert into public\.stock_items/i)
    expect(functionBody).not.toMatch(/update public\.stock_items/i)
    expect(functionBody).not.toMatch(/insert into public\.stock_movements/i)
    expect(functionBody).not.toMatch(/update public\.stock_movements/i)
    expect(functionBody).not.toMatch(/update public\.inventory_migration_sessions/i)
    expect(functionBody).not.toContain('run_inventory_migration_integrity_audit')
    expect(functionBody).not.toContain('run_inventory_migration_preflight')
    expect(functionBody).not.toContain('inventory_movement_execute_phase1')
    expect(functionBody).not.toContain('inventory_movement_apply_phase2')
  })

  it('returns a structured outcome row without schema or policy changes', () => {
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
    expect(sql).not.toContain('dry_run')
  })
})
