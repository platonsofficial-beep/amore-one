// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const PREFLIGHT_CHECK_IDS = [
  'A1', 'A2', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
]

describe('inventory_migration_preflight_rpc.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_migration_preflight_rpc.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

  const functionBody = sql.slice(
    sql.indexOf('create or replace function public.run_inventory_migration_preflight'),
    sql.indexOf('revoke all on function public.run_inventory_migration_preflight'),
  )

  it('defines SECURITY DEFINER RPC with safe search_path and authenticated-only execute', () => {
    expect(sql).toContain('create or replace function public.run_inventory_migration_preflight(')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain(
      'revoke all on function public.run_inventory_migration_preflight(uuid, uuid) from public',
    )
    expect(sql).toContain(
      'revoke all on function public.run_inventory_migration_preflight(uuid, uuid) from anon',
    )
    expect(sql).toContain(
      'grant execute on function public.run_inventory_migration_preflight(uuid, uuid) to authenticated',
    )
    expect(sql.match(/create or replace function public\./gi)?.length).toBe(1)
  })

  it('requires auth, workspace, session, and stock-manager authorization', () => {
    expect(functionBody).toContain('auth.uid()')
    expect(functionBody).toContain('inventory_migration_preflight_unauthenticated')
    expect(functionBody).toContain('inventory_migration_preflight_workspace_required')
    expect(functionBody).toContain('inventory_migration_preflight_session_required')
    expect(functionBody).toContain('inventory_migration_preflight_workspace_not_found')
    expect(functionBody).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(functionBody).toContain('inventory_migration_preflight_forbidden')
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
    expect(functionBody).toContain('inventory_migration_preflight_session_not_found')
    expect(functionBody).toContain('inventory_migration_preflight_session_not_running')
    expect(functionBody).toContain("step_name = 'preflight'")
  })

  it('validates waiting step, foundation→integrity_audit prerequisites, and single-running-step', () => {
    expect(functionBody).toContain('inventory_migration_preflight_step_not_found')
    expect(functionBody).toContain('inventory_migration_preflight_already_completed')
    expect(functionBody).toContain('inventory_migration_preflight_invalid_step_state')
    expect(functionBody).toContain('inventory_migration_preflight_prerequisite_incomplete')
    expect(functionBody).toContain('inventory_migration_preflight_another_step_running')
    expect(functionBody).toContain("'foundation'")
    expect(functionBody).toContain("'persist'")
    expect(functionBody).toContain("'auto_link'")
    expect(functionBody).toContain("'auto_create'")
    expect(functionBody).toContain("'integrity_audit'")
    expect(functionBody).toContain("status is distinct from 'waiting'")
  })

  describe('P7.9.5 attention gate: integrity_audit → preflight', () => {
    const prereqEndAt = functionBody.indexOf(
      "raise exception 'inventory_migration_preflight_prerequisite_incomplete'",
    )
    const ackMarkerAt = functionBody.indexOf(
      'P7.9.5: integrity_audit attention_required requires acknowledgement for preflight',
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
      expect(ackGate).toContain("r.step_name = 'integrity_audit'")
    })

    it('Case 1: prior result passed never requires acknowledgement and proceeds past the gate', () => {
      expect(ackGate).toContain("if v_prior_result_status = 'attention_required' then")
      expect(ackGate).not.toContain("v_prior_result_status = 'passed'")
      expect(ackGate).not.toMatch(
        /if v_prior_result_status = 'passed'[\s\S]*attention_acknowledgement_required/,
      )
      expect(attentionBranch).toContain('inventory_migration_stage_attention_acknowledgements')
      expect(attentionBranch).toContain(
        'inventory_migration_preflight_attention_acknowledgement_required',
      )
      const beforeBranch = ackGate.slice(0, attentionBranchStart)
      expect(beforeBranch).not.toContain('attention_acknowledgement_required')
      expect(beforeBranch).not.toContain('inventory_migration_stage_attention_acknowledgements')
    })

    it('Case 2: attention_required with matching acknowledgement proceeds (raise only when missing)', () => {
      expect(attentionBranch).toContain('a.prior_result_id = v_prior_result_id')
      expect(attentionBranch).toContain("a.next_step_name = 'preflight'")
      expect(attentionBranch).toContain('a.session_id = p_session_id')
      expect(attentionBranch).toContain('a.workspace_id = p_workspace_id')
      expect(attentionBranch).toMatch(
        /select exists \([\s\S]*into v_ack_exists[\s\S]*if not v_ack_exists then[\s\S]*inventory_migration_preflight_attention_acknowledgement_required/,
      )
      expect(attentionBranch).not.toMatch(
        /if v_ack_exists then[\s\S]*attention_acknowledgement_required/,
      )
    })

    it('Case 3: attention_required without acknowledgement raises acknowledgement_required', () => {
      expect(attentionBranch).toContain('if not v_ack_exists')
      expect(attentionBranch).toContain(
        "raise exception 'inventory_migration_preflight_attention_acknowledgement_required'",
      )
    })

    it('Case 4: missing prior integrity_audit result raises prior_result_missing', () => {
      expect(ackGate).toContain('if v_prior_result_id is null then')
      expect(ackGate).toContain(
        "raise exception 'inventory_migration_preflight_prior_result_missing'",
      )
      const missingAt = ackGate.indexOf('inventory_migration_preflight_prior_result_missing')
      expect(missingAt).toBeGreaterThan(-1)
      expect(attentionBranchStart).toBeGreaterThan(missingAt)
    })

    it('looks up acknowledgement by prior_result_id and next_step_name only; never creates ack or mutates results', () => {
      expect(attentionBranch).toContain('a.prior_result_id = v_prior_result_id')
      expect(attentionBranch).toContain("a.next_step_name = 'preflight'")
      expect(attentionBranch).not.toContain("a.next_step_name = 'phase1'")
      expect(attentionBranch).not.toContain("a.next_step_name = 'phase2'")
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

  it('does not accept caller-controlled result status, evidence, or step name', () => {
    expect(functionBody).not.toMatch(/p_result_status/)
    expect(functionBody).not.toMatch(/p_result_summary/)
    expect(functionBody).not.toMatch(/p_step_name/)
    expect(functionBody).not.toMatch(/p_critical_finding_count/)
    expect(functionBody).not.toMatch(/p_force/)
    expect(functionBody).toContain("v_result_status := 'attention_required'")
    expect(functionBody).toContain("v_result_status := 'passed'")
  })

  it('retains workspace-scoped P7.4.7 checks A1–O with preflight_version and ordering', () => {
    expect(functionBody).toContain("'preflight_version', 1")
    expect(functionBody).toContain("'check_count', 16")
    for (const id of PREFLIGHT_CHECK_IDS) {
      expect(functionBody).toContain(`'id', '${id}'`)
    }
    expect(functionBody).toContain("'missing_or_null_stock_item_id'")
    expect(functionBody).toContain("'cannot_safely_migrate_quantity'")
    expect(functionBody).toContain("'fully_eligible'")
    expect(functionBody).toContain("'severity', 'blocking'")
    expect(functionBody).toContain("'severity', 'informational'")
    expect(functionBody).toContain('m.workspace_id = p_workspace_id')
    expect(functionBody).toContain("m.status in ('created', 'linked')")
  })

  it('derives attention_required from ineligible rows and still completes the step', () => {
    expect(functionBody).toContain('v_ineligible')
    expect(functionBody).toMatch(/if v_ineligible > 0 then[\s\S]*attention_required[\s\S]*else[\s\S]*passed/)
    expect(functionBody).toContain("status = 'completed'")
    expect(functionBody).toContain('blocking_findings')
  })

  it('persists one step result, completes the step, and writes a note activity', () => {
    const resultInsertAt = functionBody.indexOf('insert into public.inventory_migration_step_results')
    const completeAt = functionBody.indexOf("status = 'completed'")
    const activityAt = functionBody.indexOf('insert into public.inventory_migration_activity')

    expect(completeAt).toBeGreaterThan(-1)
    expect(resultInsertAt).toBeGreaterThan(completeAt)
    expect(activityAt).toBeGreaterThan(resultInsertAt)
    expect(functionBody).toContain("'preflight'")
    expect(functionBody).toContain("'note'")
    expect(functionBody).toContain('Preflight completed:')
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

  it('does not mutate map, stock items, movements, or session status', () => {
    expect(functionBody).not.toMatch(/insert into public\.inventory_stock_item_map/i)
    expect(functionBody).not.toMatch(/update public\.inventory_stock_item_map/i)
    expect(functionBody).not.toMatch(/insert into public\.stock_items/i)
    expect(functionBody).not.toMatch(/update public\.stock_items/i)
    expect(functionBody).not.toMatch(/insert into public\.stock_movements/i)
    expect(functionBody).not.toMatch(/update public\.stock_movements/i)
    expect(functionBody).not.toMatch(/update public\.inventory_migration_sessions/i)
    expect(functionBody).not.toContain('run_inventory_migration_integrity_audit')
    expect(functionBody).not.toContain('inventory_movement_preview')
    expect(functionBody).not.toContain('inventory_movement_execute_phase1')
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
