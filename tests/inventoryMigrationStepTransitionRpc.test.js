// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CANONICAL_STEPS = [
  'foundation',
  'persist',
  'auto_link',
  'auto_create',
  'integrity_audit',
  'preflight',
  'preview',
  'phase1',
  'phase2',
  'post_apply_audit',
]

describe('inventory_migration_step_transition_rpc.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_migration_step_transition_rpc.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

  const functionBody = sql.slice(
    sql.indexOf('create or replace function public.transition_inventory_migration_step'),
    sql.indexOf('revoke all on function public.transition_inventory_migration_step'),
  )

  it('defines exact SECURITY DEFINER signature with fixed search_path', () => {
    expect(sql).toContain('create or replace function public.transition_inventory_migration_step(')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('p_step_name text')
    expect(sql).toContain('p_target_status text')
    expect(sql).toContain('returns setof public.inventory_migration_session_steps')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
    expect(sql.match(/create or replace function public\./gi)?.length).toBe(1)
  })

  it('grants execute to authenticated only and revokes public/anon', () => {
    expect(sql).toContain(
      'revoke all on function public.transition_inventory_migration_step(uuid, uuid, text, text) from public',
    )
    expect(sql).toContain(
      'revoke all on function public.transition_inventory_migration_step(uuid, uuid, text, text) from anon',
    )
    expect(sql).toContain(
      'grant execute on function public.transition_inventory_migration_step(uuid, uuid, text, text) to authenticated',
    )
    expect(sql).not.toMatch(/create policy[\s\S]*inventory_migration_session_steps[\s\S]*for update/i)
    expect(sql).not.toMatch(/grant update on table public\.inventory_migration_session_steps/i)
  })

  it('requires auth, args, workspace existence, and stock-manager authorization', () => {
    expect(functionBody).toContain('auth.uid()')
    expect(functionBody).toContain('inventory_migration_step_unauthenticated')
    expect(functionBody).toContain('inventory_migration_step_workspace_required')
    expect(functionBody).toContain('inventory_migration_step_session_required')
    expect(functionBody).toContain('inventory_migration_step_name_required')
    expect(functionBody).toContain('inventory_migration_step_target_status_required')
    expect(functionBody).toContain('inventory_migration_step_workspace_not_found')
    expect(functionBody).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(functionBody).toContain('inventory_migration_step_forbidden')
    expect(sql).toContain('owner / general_manager / manager')
    expect(sql).toContain('host / staff')
    expect(sql).toContain('anonymous')
    expect(sql).toContain('wrong workspace')
  })

  it('locks the running session FOR UPDATE before step work', () => {
    const sessionLockAt = functionBody.indexOf('from public.inventory_migration_sessions s')
    const sessionForUpdateAt = functionBody.indexOf('for update', sessionLockAt)
    const stepsLockAt = functionBody.indexOf('from public.inventory_migration_session_steps st')

    expect(sessionLockAt).toBeGreaterThan(-1)
    expect(sessionForUpdateAt).toBeGreaterThan(sessionLockAt)
    expect(stepsLockAt).toBeGreaterThan(sessionForUpdateAt)
    expect(functionBody).toContain('inventory_migration_step_session_not_found')
    expect(functionBody).toContain("status is distinct from 'running'")
    expect(functionBody).toContain('inventory_migration_step_session_not_running')
  })

  it('locks all session steps in canonical order before validating transitions', () => {
    expect(functionBody).toContain('Lock order 2: all session steps in canonical order')
    expect(functionBody).toContain("when 'foundation' then 1")
    expect(functionBody).toContain("when 'persist' then 2")
    expect(functionBody).toContain("when 'auto_link' then 3")
    expect(functionBody).toContain("when 'auto_create' then 4")
    expect(functionBody).toContain("when 'integrity_audit' then 5")
    expect(functionBody).toContain("when 'preflight' then 6")
    expect(functionBody).toContain("when 'preview' then 7")
    expect(functionBody).toContain("when 'phase1' then 8")
    expect(functionBody).toContain("when 'phase2' then 9")
    expect(functionBody).toContain("when 'post_apply_audit' then 10")
    expect(functionBody).toContain('for update')
    expect(functionBody).toContain('inventory_migration_step_not_found')
  })

  it('encodes the exact deployed canonical step order', () => {
    for (const step of CANONICAL_STEPS) {
      expect(functionBody).toContain(`'${step}'`)
    }
    expect(functionBody).not.toContain('persist_classification')
    expect(functionBody).not.toContain('apply_phase_1')
    expect(functionBody).not.toContain('apply_phase_2')
    expect(functionBody).toContain('inventory_migration_step_invalid_name')
  })

  it('allows only waiting→running and running→completed', () => {
    expect(functionBody).toContain("v_target_status not in ('running', 'completed')")
    expect(functionBody).toContain('inventory_migration_step_invalid_target_status')
    expect(functionBody).toContain("v_target_status = 'running'")
    expect(functionBody).toContain("v_step.status is distinct from 'waiting'")
    expect(functionBody).toContain("v_target_status = 'completed'")
    expect(functionBody).toContain("v_step.status is distinct from 'running'")
    expect(functionBody).toContain('inventory_migration_step_invalid_transition')
    expect(functionBody).not.toMatch(/status = 'waiting'/)
  })

  it('enforces predecessor completion before waiting→running', () => {
    expect(functionBody).toContain('inventory_migration_step_prerequisite_incomplete')
    expect(functionBody).toContain('v_canonical_steps[1:v_step_index - 1]')
    expect(functionBody).toContain("st.status = 'completed'")
    expect(sql).toContain('foundation may run first')
    expect(sql).toMatch(/persist may run only after foundation/i)
    expect(sql).toMatch(/phase2 may run only after every prior step/i)
  })

  it('blocks another running step before waiting→running update', () => {
    const otherRunningCheckAt = functionBody.indexOf('inventory_migration_step_another_step_running')
    const runningUpdateAt = functionBody.indexOf("status = 'running',\n      started_at = now()")

    expect(otherRunningCheckAt).toBeGreaterThan(-1)
    expect(runningUpdateAt).toBeGreaterThan(otherRunningCheckAt)
    expect(functionBody).toContain("st.status = 'running'")
    expect(functionBody).toContain('st.step_name is distinct from v_step_name')
    expect(sql).toContain('Session FOR UPDATE serializes concurrent transitions')
  })

  it('sets timestamps correctly for each allowed transition', () => {
    const waitingToRunning = functionBody.slice(
      functionBody.indexOf("v_target_status = 'running'"),
      functionBody.indexOf("v_target_status = 'completed'"),
    )
    const runningToCompleted = functionBody.slice(
      functionBody.indexOf("v_target_status = 'completed'"),
    )

    expect(waitingToRunning).toMatch(/status = 'running',\s*started_at = now\(\)/)
    expect(waitingToRunning).not.toMatch(/completed_at\s*=/)
    expect(runningToCompleted).toMatch(/status = 'completed',\s*completed_at = now\(\)/)
    expect(runningToCompleted).not.toMatch(/started_at\s*=/)
    expect(functionBody).toContain('Preserve started_at')
    expect(functionBody).toContain('v_step.started_at is not null or v_step.completed_at is not null')
    expect(functionBody).toContain('v_step.started_at is null or v_step.completed_at is not null')
  })

  it('updates only the target step row and isolates from other domains', () => {
    expect(functionBody.match(/update public\.inventory_migration_session_steps/gi)?.length).toBe(2)
    expect(functionBody).not.toMatch(/update public\.inventory_migration_sessions/i)
    expect(functionBody).not.toMatch(/insert into public\.inventory_migration_activity/i)
    expect(functionBody).not.toMatch(/insert into public\.inventory_stock_item_map/i)
    expect(functionBody).not.toMatch(/update public\.inventory_stock_item_map/i)
    expect(functionBody).not.toMatch(/insert into public\.stock_movements/i)
    expect(functionBody).not.toMatch(/update public\.stock_items/i)
    expect(sql).not.toMatch(/alter table public\.inventory_migration_session_steps/i)
    expect(sql).not.toMatch(/create index/i)
    expect(sql).not.toMatch(/create table/i)
  })

  it('documents the stable error contract', () => {
    const errors = [
      'inventory_migration_step_unauthenticated',
      'inventory_migration_step_workspace_required',
      'inventory_migration_step_session_required',
      'inventory_migration_step_name_required',
      'inventory_migration_step_target_status_required',
      'inventory_migration_step_workspace_not_found',
      'inventory_migration_step_forbidden',
      'inventory_migration_step_session_not_found',
      'inventory_migration_step_session_not_running',
      'inventory_migration_step_invalid_name',
      'inventory_migration_step_invalid_target_status',
      'inventory_migration_step_not_found',
      'inventory_migration_step_invalid_transition',
      'inventory_migration_step_prerequisite_incomplete',
      'inventory_migration_step_another_step_running',
    ]

    for (const error of errors) {
      expect(functionBody).toContain(error)
    }
  })
})
