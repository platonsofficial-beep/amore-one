// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('inventory_migration_phase2_rpc.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_migration_phase2_rpc.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

  const functionBody = sql.slice(
    sql.indexOf('create or replace function public.run_inventory_migration_phase2'),
    sql.indexOf('revoke all on function public.run_inventory_migration_phase2'),
  )

  const quantityApply = functionBody.slice(
    functionBody.indexOf('-- P7.4.10b Phase 2 quantity apply'),
    functionBody.indexOf("v_result_status := 'attention_required'"),
  )

  it('defines SECURITY DEFINER RPC with safe search_path and authenticated-only execute', () => {
    expect(sql).toContain('create or replace function public.run_inventory_migration_phase2(')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('p_confirm_maintenance_window boolean')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain(
      'revoke all on function public.run_inventory_migration_phase2(uuid, uuid, boolean) from public',
    )
    expect(sql).toContain(
      'revoke all on function public.run_inventory_migration_phase2(uuid, uuid, boolean) from anon',
    )
    expect(sql).toContain(
      'grant execute on function public.run_inventory_migration_phase2(uuid, uuid, boolean) to authenticated',
    )
    expect(sql.match(/create or replace function public\./gi)?.length).toBe(1)
  })

  it('requires auth, workspace, session, stock-manager auth, and maintenance confirmation', () => {
    expect(functionBody).toContain('auth.uid()')
    expect(functionBody).toContain('inventory_migration_phase2_unauthenticated')
    expect(functionBody).toContain('inventory_migration_phase2_workspace_required')
    expect(functionBody).toContain('inventory_migration_phase2_session_required')
    expect(functionBody).toContain('inventory_migration_phase2_workspace_not_found')
    expect(functionBody).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(functionBody).toContain('inventory_migration_phase2_forbidden')
    expect(functionBody).toContain('inventory_migration_phase2_maintenance_window_required')
    expect(functionBody).toContain('p_confirm_maintenance_window is distinct from true')
  })

  it('locks session, canonical steps, map → movement → stock', () => {
    expect(functionBody).toContain('Lock order 1: session')
    expect(functionBody).toContain('Lock order 2: all session steps')
    expect(functionBody).toContain("step_name = 'phase2'")
    expect(functionBody).toContain('where m.id = cand.map_id\n      for update')
    expect(functionBody).toContain('where sm.note = v_note\n      for update')
    expect(functionBody).toContain('where s.id = locked.stock_item_id\n      for update')
  })

  it('requires foundation through phase1 completed', () => {
    expect(functionBody).toContain("'foundation'")
    expect(functionBody).toContain("'persist'")
    expect(functionBody).toContain("'auto_link'")
    expect(functionBody).toContain("'auto_create'")
    expect(functionBody).toContain("'integrity_audit'")
    expect(functionBody).toContain("'preflight'")
    expect(functionBody).toContain("'preview'")
    expect(functionBody).toContain("'phase1'")
    expect(functionBody).toContain('inventory_migration_phase2_prerequisite_incomplete')
    const predBlock = functionBody.slice(
      functionBody.indexOf('from unnest(array['),
      functionBody.indexOf('inventory_migration_phase2_prerequisite_incomplete'),
    )
    expect(predBlock).toContain("'phase1'")
    expect(predBlock).not.toContain("'phase2'")
    expect(predBlock).not.toContain("'post_apply_audit'")
  })

  describe('P7.9.5 attention gate: phase1 → phase2', () => {
    const prereqEndAt = functionBody.indexOf(
      "raise exception 'inventory_migration_phase2_prerequisite_incomplete'",
    )
    const ackMarkerAt = functionBody.indexOf(
      'P7.9.5: phase1 attention_required requires acknowledgement for phase2',
    )
    const runningAt = functionBody.indexOf('-- waiting → running')
    const ackGate = functionBody.slice(ackMarkerAt, runningAt)
    const attentionBranchStart = ackGate.indexOf(
      "if v_prior_result_status = 'attention_required' then",
    )
    const attentionBranch = ackGate.slice(
      attentionBranchStart,
      ackGate.indexOf('end if;', attentionBranchStart),
    )

    it('runs after prerequisite completion and before waiting → running', () => {
      expect(prereqEndAt).toBeGreaterThan(-1)
      expect(ackMarkerAt).toBeGreaterThan(prereqEndAt)
      expect(runningAt).toBeGreaterThan(ackMarkerAt)
      expect(ackGate).toContain("r.step_name = 'phase1'")
    })

    it('Case 1: prior result passed never requires acknowledgement and proceeds past the gate', () => {
      expect(ackGate).toContain("if v_prior_result_status = 'attention_required' then")
      expect(ackGate).not.toContain("v_prior_result_status = 'passed'")
      expect(ackGate).not.toMatch(
        /if v_prior_result_status = 'passed'[\s\S]*attention_acknowledgement_required/,
      )
      expect(attentionBranch).toContain('inventory_migration_stage_attention_acknowledgements')
      expect(attentionBranch).toContain(
        'inventory_migration_phase2_attention_acknowledgement_required',
      )
      const beforeBranch = ackGate.slice(0, attentionBranchStart)
      expect(beforeBranch).not.toContain('attention_acknowledgement_required')
      expect(beforeBranch).not.toContain('inventory_migration_stage_attention_acknowledgements')
    })

    it('Case 2: attention_required with matching acknowledgement proceeds (raise only when missing)', () => {
      expect(attentionBranch).toContain('a.prior_result_id = v_prior_result_id')
      expect(attentionBranch).toContain("a.next_step_name = 'phase2'")
      expect(attentionBranch).toContain('a.session_id = p_session_id')
      expect(attentionBranch).toContain('a.workspace_id = p_workspace_id')
      expect(attentionBranch).toMatch(
        /select exists \([\s\S]*into v_ack_exists[\s\S]*if not v_ack_exists then[\s\S]*inventory_migration_phase2_attention_acknowledgement_required/,
      )
      expect(attentionBranch).not.toMatch(
        /if v_ack_exists then[\s\S]*attention_acknowledgement_required/,
      )
    })

    it('Case 3: attention_required without acknowledgement raises acknowledgement_required', () => {
      expect(attentionBranch).toContain('if not v_ack_exists')
      expect(attentionBranch).toContain(
        "raise exception 'inventory_migration_phase2_attention_acknowledgement_required'",
      )
    })

    it('Case 4: missing prior phase1 result raises prior_result_missing', () => {
      expect(ackGate).toContain('if v_prior_result_id is null then')
      expect(ackGate).toContain(
        "raise exception 'inventory_migration_phase2_prior_result_missing'",
      )
      const missingAt = ackGate.indexOf('inventory_migration_phase2_prior_result_missing')
      expect(missingAt).toBeGreaterThan(-1)
      expect(attentionBranchStart).toBeGreaterThan(missingAt)
    })

    it('looks up acknowledgement by prior_result_id and next_step_name only; never creates ack or mutates results', () => {
      expect(attentionBranch).toContain('a.prior_result_id = v_prior_result_id')
      expect(attentionBranch).toContain("a.next_step_name = 'phase2'")
      expect(attentionBranch).not.toContain("a.next_step_name = 'preflight'")
      expect(attentionBranch).not.toContain("a.next_step_name = 'phase1'")
      expect(functionBody).not.toContain('acknowledge_inventory_migration_stage_attention')
      expect(functionBody).not.toMatch(
        /insert into public\.inventory_migration_stage_attention_acknowledgements/i,
      )
      expect(functionBody).not.toMatch(/update public\.inventory_migration_step_results/i)
      expect(functionBody).not.toMatch(
        /update public\.inventory_migration_stage_attention_acknowledgements/i,
      )
    })
  })

  it('does not accept force/overwrite, result status, or target rows', () => {
    expect(functionBody).not.toMatch(/\bp_force\b/)
    expect(functionBody).not.toMatch(/\bp_overwrite\b/)
    expect(functionBody).not.toMatch(/\bp_result_status\b/)
    expect(functionBody).not.toMatch(/\bp_stock_item_id\b/)
    expect(functionBody).not.toMatch(/\bp_quantity\b/)
    expect(functionBody).not.toMatch(/\bp_movement_id\b/)
    expect(functionBody).toContain("v_result_status := 'attention_required'")
    expect(functionBody).toContain("v_result_status := 'passed'")
  })

  it('scopes eligible rows to workspace created/linked with migrated_at null', () => {
    expect(quantityApply).toContain('m.workspace_id = p_workspace_id')
    expect(quantityApply).toContain("m.status in ('created', 'linked')")
    expect(quantityApply).toContain('m.stock_item_id is not null')
    expect(quantityApply).toContain('m.migrated_at is null')
    expect(quantityApply).toContain("v_note := 'INITIAL_IMPORT|map_id=' || locked.id::text")
  })

  it('updates stock quantity and map migrated_at only; no Phase 1 movement creation', () => {
    expect(quantityApply).toMatch(/update public\.stock_items s[\s\S]*current_quantity = v_new_qty/)
    expect(quantityApply).toMatch(
      /update public\.inventory_stock_item_map m[\s\S]*migrated_at = now\(\)/,
    )
    expect(functionBody).not.toMatch(/insert into public\.stock_movements/i)
    expect(functionBody).not.toMatch(/delete from public\.stock_movements/i)
    expect(functionBody).not.toMatch(/update public\.stock_movements/i)
    expect(functionBody).not.toContain("status = 'created'")
    expect(functionBody).not.toContain("status = 'linked'")
    expect(functionBody).not.toContain('run_inventory_migration_phase1')
    expect(functionBody).not.toContain('run_inventory_migration_post_apply')
    expect(functionBody).not.toContain('inventory_movement_execute_phase1')
  })

  it('blocks negative usage results and validates movement identity', () => {
    expect(quantityApply).toContain('v_negative_result_blocked')
    expect(quantityApply).toContain('v_missing_movement')
    expect(quantityApply).toContain('v_duplicate_movement')
    expect(quantityApply).toContain('v_workspace_mismatch')
    expect(quantityApply).toContain('v_inactive_stock')
    expect(quantityApply).toContain("v_mov.type = 'receive'")
    expect(quantityApply).toContain('v_already_applied')
  })

  it('derives attention_required from blocked rows and versions evidence', () => {
    expect(functionBody).toContain("'phase2_version', 1")
    expect(functionBody).toContain("'applied_receive'")
    expect(functionBody).toContain("'applied_usage'")
    expect(functionBody).toContain("'already_applied'")
    expect(functionBody).toContain("'blocked_rows'")
    expect(functionBody).toContain('maintenance_window_confirmed')
    expect(functionBody).toMatch(
      /if v_attention_count > 0 then[\s\S]*attention_required[\s\S]*else[\s\S]*passed/,
    )
    expect(functionBody).toContain('inventory_migration_phase2_already_completed')
  })

  it('owns step transitions and writes result + activity', () => {
    expect(functionBody).not.toContain('transition_inventory_migration_step')
    expect(functionBody).toContain("status = 'running'")
    expect(functionBody).toContain("status = 'completed'")
    expect(functionBody).toContain("'phase2'")
    expect(functionBody).toContain("'note'")
    expect(functionBody).toContain('Phase 2 completed:')
    expect(functionBody.match(/insert into public\.inventory_migration_step_results/g)?.length).toBe(1)
    expect(functionBody.match(/insert into public\.inventory_migration_activity/g)?.length).toBe(1)
  })

  it('returns structured summary without schema or frontend changes', () => {
    expect(functionBody).toContain('result_id uuid')
    expect(functionBody).toContain('result_status text')
    expect(functionBody).toContain('critical_finding_count bigint')
    expect(functionBody).toContain('attention_finding_count bigint')
    expect(functionBody).toContain('total_findings bigint')
    expect(functionBody).toContain('executed_at timestamptz')
    expect(sql).not.toMatch(/alter table public\.stock_items/i)
    expect(sql).not.toMatch(/alter table public\.inventory_migration_session_steps/i)
    expect(sql).not.toMatch(/alter table public\.inventory_stock_item_map/i)
    expect(sql).not.toMatch(/\bfrom ['"]@\//)
    expect(sql).not.toMatch(/react|tsx|jsx/i)
  })
})
