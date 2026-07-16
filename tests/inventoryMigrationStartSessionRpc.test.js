// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CANONICAL_BOOTSTRAP_STEPS = [
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

describe('inventory_migration_start_session_rpc.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_migration_start_session_rpc.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

  const functionBody = sql.slice(
    sql.indexOf('create or replace function public.start_inventory_migration_session'),
    sql.indexOf('revoke all on function public.start_inventory_migration_session'),
  )

  const stepsInsertMatch = functionBody.match(
    /insert into public\.inventory_migration_session_steps \([\s\S]*?values([\s\S]*?);/,
  )
  const stepsValuesBlock = stepsInsertMatch?.[1] ?? ''
  const stepNameMatches = [...stepsValuesBlock.matchAll(/'([a-z0-9_]+)'\s*,\s*'(running|waiting)'/g)]
  const bootstrappedStepNames = stepNameMatches.map((match) => match[1])

  it('defines SECURITY DEFINER RPC with locked search_path', () => {
    expect(sql).toContain('create or replace function public.start_inventory_migration_session')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('returns setof public.inventory_migration_sessions')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
  })

  it('requires auth and can_manage_workspace_stock authorization', () => {
    expect(sql).toContain('auth.uid()')
    expect(sql).toContain('inventory_migration_session_unauthenticated')
    expect(sql).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(sql).toContain('inventory_migration_session_forbidden')
    expect(sql).toContain('inventory_migration_session_workspace_required')
    expect(sql).toContain('inventory_migration_session_workspace_not_found')
  })

  it('documents allowed manager roles and denied host/staff/anonymous', () => {
    expect(sql).toContain('owner / general_manager / manager')
    expect(sql).toContain('host / staff')
    expect(sql).toContain('anonymous')
    expect(sql).toContain('inventory_migration_session_forbidden')
    expect(sql).toContain('inventory_migration_session_unauthenticated')
  })

  it('rejects a second running session and handles unique_violation', () => {
    expect(sql).toContain("status = 'running'")
    expect(sql).toContain('inventory_migration_session_already_running')
    expect(sql).toContain('unique_violation')
    expect(sql).toContain('inventory_migration_sessions_one_running_per_workspace')
  })

  it('inserts running session with auth.uid and workspace_members display_name', () => {
    expect(sql).toContain("status,")
    expect(sql).toContain("'running'")
    expect(sql).toContain('started_by')
    expect(sql).toContain('v_auth_user_id')
    expect(sql).toContain('operator_display_name')
    expect(sql).toContain('workspace_members')
    expect(sql).toContain('display_name')
    expect(sql).toContain('returning * into v_session')
  })

  it('appends one session_started activity after the session insert', () => {
    const sessionInsertAt = functionBody.indexOf('insert into public.inventory_migration_sessions')
    const activityInsertAt = functionBody.indexOf('insert into public.inventory_migration_activity')

    expect(sessionInsertAt).toBeGreaterThan(-1)
    expect(activityInsertAt).toBeGreaterThan(sessionInsertAt)
    expect(functionBody).toContain("'session_started'")
    expect(functionBody).toContain("'Migration session started.'")
    expect(functionBody).toContain('v_session.id')
    expect(functionBody).toContain('created_by')
    expect(functionBody.match(/insert into public\.inventory_migration_activity/g)?.length).toBe(1)
  })

  it('bootstraps exactly 10 canonical steps in order after activity', () => {
    const sessionInsertAt = functionBody.indexOf('insert into public.inventory_migration_sessions')
    const activityInsertAt = functionBody.indexOf('insert into public.inventory_migration_activity')
    const stepsInsertAt = functionBody.indexOf('insert into public.inventory_migration_session_steps')

    expect(sessionInsertAt).toBeGreaterThan(-1)
    expect(activityInsertAt).toBeGreaterThan(sessionInsertAt)
    expect(stepsInsertAt).toBeGreaterThan(activityInsertAt)
    expect(bootstrappedStepNames).toEqual(CANONICAL_BOOTSTRAP_STEPS)
    expect(bootstrappedStepNames).toHaveLength(10)
    expect(functionBody.match(/insert into public\.inventory_migration_session_steps/g)?.length).toBe(1)
    expect(functionBody).not.toContain('persist_classification')
    expect(functionBody).not.toContain('apply_phase_1')
    expect(functionBody).not.toContain('apply_phase_2')
    expect(sql).not.toMatch(/alter table public\.inventory_migration_session_steps/i)
    expect(sql).not.toMatch(/drop constraint/i)
  })

  it('sets foundation running with started_at and all others waiting without completed_at', () => {
    expect(stepsValuesBlock).toMatch(
      /\(v_session\.id,\s*p_workspace_id,\s*'foundation',\s*'running',\s*now\(\),\s*null\)/,
    )

    for (const stepName of CANONICAL_BOOTSTRAP_STEPS.slice(1)) {
      expect(stepsValuesBlock).toMatch(
        new RegExp(
          `\\(v_session\\.id,\\s*p_workspace_id,\\s*'${stepName}',\\s*'waiting',\\s*null,\\s*null\\)`,
        ),
      )
    }

    expect(stepsValuesBlock.match(/'running'/g)?.length).toBe(1)
    expect(stepsValuesBlock.match(/'waiting'/g)?.length).toBe(9)
    expect(stepsValuesBlock.match(/now\(\)/g)?.length).toBe(1)
    expect(functionBody).not.toMatch(/completed_at\s*=\s*now\(\)/)
    expect(functionBody).not.toMatch(/\bon conflict\b/i)
    expect(functionBody).not.toMatch(/^\s*upsert\b/im)
    expect(functionBody).not.toMatch(/update public\.inventory_migration_session_steps/i)
    expect(functionBody).not.toMatch(/delete from public\.inventory_migration_session_steps/i)
  })

  it('keeps session, activity, and step writes atomic (same function, no commit)', () => {
    expect(functionBody).toMatch(/Same transaction: activity failure rolls back the session insert/)
    expect(functionBody).toMatch(/Same transaction: step bootstrap failure rolls back session \+ activity/)
    expect(functionBody).not.toMatch(/\bcommit\b/i)
    expect(sql.match(/create or replace function public\./gi)?.length).toBe(1)
    expect(sql).not.toMatch(/create trigger/i)
    expect(sql).toContain('failed activity or step insert rolls back the session row')
    expect(sql).toContain('no orphan session / partial steps / activity-only')
  })

  it('grants execute to authenticated only and does not execute migrations', () => {
    expect(sql).toContain('revoke all on function public.start_inventory_migration_session(uuid) from public')
    expect(sql).toContain('grant execute on function public.start_inventory_migration_session(uuid) to authenticated')
    expect(sql).toContain('insert into public.inventory_migration_sessions')
    expect(sql).not.toMatch(/insert into public\.inventory_stock_item_map/i)
    expect(sql).not.toMatch(/insert into public\.stock_movements/i)
    expect(sql).not.toMatch(/update public\.stock_items/i)
    expect(sql).not.toContain('complete_inventory_migration_session')
    expect(sql).not.toContain('cancel_inventory_migration_session')
  })

  it('documents workspace isolation in verification notes', () => {
    expect(sql).toContain('wrong workspace')
    expect(sql).toContain('inventory_migration_session_forbidden')
  })
})
