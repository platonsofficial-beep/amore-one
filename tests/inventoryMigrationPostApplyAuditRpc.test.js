// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const AUDIT_CATEGORY_IDS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R',
]

describe('inventory_migration_post_apply_audit_rpc.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_migration_post_apply_audit_rpc.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

  const functionBody = sql.slice(
    sql.indexOf('create or replace function public.run_inventory_migration_post_apply_audit'),
    sql.indexOf('revoke all on function public.run_inventory_migration_post_apply_audit'),
  )

  const auditBody = functionBody.slice(
    functionBody.indexOf('-- P7.4.11 Post-apply audit'),
    functionBody.indexOf("v_result_status := 'attention_required'"),
  )

  it('defines SECURITY DEFINER RPC with safe search_path and authenticated-only execute', () => {
    expect(sql).toContain('create or replace function public.run_inventory_migration_post_apply_audit(')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain(
      'revoke all on function public.run_inventory_migration_post_apply_audit(uuid, uuid) from public',
    )
    expect(sql).toContain(
      'revoke all on function public.run_inventory_migration_post_apply_audit(uuid, uuid) from anon',
    )
    expect(sql).toContain(
      'grant execute on function public.run_inventory_migration_post_apply_audit(uuid, uuid) to authenticated',
    )
    expect(sql.match(/create or replace function public\./gi)?.length).toBe(1)
  })

  it('requires auth, workspace, session, and stock-manager authorization', () => {
    expect(functionBody).toContain('auth.uid()')
    expect(functionBody).toContain('inventory_migration_post_apply_audit_unauthenticated')
    expect(functionBody).toContain('inventory_migration_post_apply_audit_workspace_required')
    expect(functionBody).toContain('inventory_migration_post_apply_audit_session_required')
    expect(functionBody).toContain('inventory_migration_post_apply_audit_workspace_not_found')
    expect(functionBody).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(functionBody).toContain('inventory_migration_post_apply_audit_forbidden')
  })

  it('locks running session and canonical post_apply_audit step', () => {
    expect(functionBody).toContain('Lock order 1: session')
    expect(functionBody).toContain('Lock order 2: all session steps')
    expect(functionBody).toContain("step_name = 'post_apply_audit'")
    expect(functionBody).toContain('inventory_migration_post_apply_audit_session_not_found')
    expect(functionBody).toContain('inventory_migration_post_apply_audit_session_not_running')
    expect(functionBody).toContain('inventory_migration_post_apply_audit_step_not_found')
    expect(functionBody).toContain('inventory_migration_post_apply_audit_already_completed')
  })

  it('requires foundation through phase2 completed', () => {
    expect(functionBody).toContain('inventory_migration_post_apply_audit_prerequisite_incomplete')
    const predBlock = functionBody.slice(
      functionBody.indexOf('from unnest(array['),
      functionBody.indexOf('inventory_migration_post_apply_audit_prerequisite_incomplete'),
    )
    expect(predBlock).toContain("'foundation'")
    expect(predBlock).toContain("'persist'")
    expect(predBlock).toContain("'auto_link'")
    expect(predBlock).toContain("'auto_create'")
    expect(predBlock).toContain("'integrity_audit'")
    expect(predBlock).toContain("'preflight'")
    expect(predBlock).toContain("'preview'")
    expect(predBlock).toContain("'phase1'")
    expect(predBlock).toContain("'phase2'")
    expect(predBlock).not.toContain("'post_apply_audit'")
  })

  it('does not accept caller-controlled evidence, status, or force flags', () => {
    expect(functionBody).not.toMatch(/\bp_result_status\b/)
    expect(functionBody).not.toMatch(/\bp_result_summary\b/)
    expect(functionBody).not.toMatch(/\bp_force\b/)
    expect(functionBody).not.toMatch(/\bp_overwrite\b/)
    expect(functionBody).not.toMatch(/\bp_step_name\b/)
    expect(functionBody).toContain("v_result_status := 'attention_required'")
    expect(functionBody).toContain("v_result_status := 'passed'")
  })

  it('preserves workspace-scoped P7.4.11 categories A–R with versioned evidence', () => {
    expect(functionBody).toContain("'post_apply_audit_version', 1")
    expect(functionBody).toContain("'category_count', 18")
    for (const id of AUDIT_CATEGORY_IDS) {
      expect(functionBody).toContain(`'id', '${id}'`)
    }
    expect(auditBody).toContain('m.workspace_id = p_workspace_id')
    expect(auditBody).toContain('v_a_stuck_unapplied')
    expect(auditBody).toContain('v_q_bad_coverage')
    expect(auditBody).toContain('v_completion_pct')
    expect(functionBody).toContain("'unapplied_created_linked'")
    expect(functionBody).toContain("'migrated_without_exactly_one_INITIAL_IMPORT'")
  })

  it('derives attention using P7.4.11 verdict rule (A/G alone do not fail)', () => {
    expect(auditBody).toContain('v_a_stuck_unapplied > 0')
    expect(auditBody).toContain('v_c_migrated_null_stock > 0')
    expect(auditBody).toContain('v_q_bad_coverage > 0')
    expect(auditBody).toMatch(/v_attention := \([\s\S]*v_a_stuck_unapplied > 0/)
    expect(functionBody).toContain('those alone do not fail')
    expect(functionBody).toMatch(/if v_attention then[\s\S]*attention_required[\s\S]*else[\s\S]*passed/)
  })

  it('is read-only for map, stock items, and movements', () => {
    expect(functionBody).not.toMatch(/insert into public\.inventory_stock_item_map/i)
    expect(functionBody).not.toMatch(/update public\.inventory_stock_item_map/i)
    expect(functionBody).not.toMatch(/insert into public\.stock_items/i)
    expect(functionBody).not.toMatch(/update public\.stock_items/i)
    expect(functionBody).not.toMatch(/insert into public\.stock_movements/i)
    expect(functionBody).not.toMatch(/update public\.stock_movements/i)
    expect(functionBody).not.toMatch(/delete from public\.stock_/i)
    expect(functionBody).not.toContain('run_inventory_migration_phase1')
    expect(functionBody).not.toContain('run_inventory_migration_phase2')
    expect(functionBody).not.toContain('inventory_movement_apply_phase2')
  })

  it('owns step transitions and writes result + activity', () => {
    expect(functionBody).not.toContain('transition_inventory_migration_step')
    expect(functionBody).toContain("status = 'running'")
    expect(functionBody).toContain("status = 'completed'")
    expect(functionBody).toContain("'post_apply_audit'")
    expect(functionBody).toContain("'note'")
    expect(functionBody).toContain('Post-apply audit completed:')
    expect(functionBody.match(/insert into public\.inventory_migration_step_results/g)?.length).toBe(1)
    expect(functionBody.match(/insert into public\.inventory_migration_activity/g)?.length).toBe(1)
    expect(functionBody).toContain('inventory_migration_post_apply_audit_already_completed')
  })

  it('returns structured summary without schema or frontend changes', () => {
    expect(functionBody).toContain('result_id uuid')
    expect(functionBody).toContain('result_status text')
    expect(functionBody).toContain('critical_finding_count bigint')
    expect(functionBody).toContain('attention_finding_count bigint')
    expect(functionBody).toContain('total_findings bigint')
    expect(functionBody).toContain('executed_at timestamptz')
    expect(sql).not.toMatch(/alter table public\.inventory_migration_step_results/i)
    expect(sql).not.toMatch(/alter table public\.inventory_migration_session_steps/i)
    expect(sql).not.toMatch(/alter table public\.inventory_migration_activity/i)
    expect(sql).not.toMatch(/create policy/i)
    expect(sql).not.toMatch(/react|tsx|jsx/i)
  })
})
