// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('inventory_migration_start_session_rpc.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_migration_start_session_rpc.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

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
    expect(sql).toContain('returning *')
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
