// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('inventory_migration_finish_session_rpc.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_migration_finish_session_rpc.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

  const completeBody = sql.slice(
    sql.indexOf('create or replace function public.complete_inventory_migration_session'),
    sql.indexOf('create or replace function public.cancel_inventory_migration_session'),
  )
  const cancelBody = sql.slice(
    sql.indexOf('create or replace function public.cancel_inventory_migration_session'),
    sql.indexOf('revoke all on function public.complete_inventory_migration_session'),
  )

  it('defines both SECURITY DEFINER RPCs with locked search_path', () => {
    expect(sql).toContain('create or replace function public.complete_inventory_migration_session')
    expect(sql).toContain('create or replace function public.cancel_inventory_migration_session')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('returns setof public.inventory_migration_sessions')
    expect(sql.match(/security definer/g)?.length).toBeGreaterThanOrEqual(2)
    expect(sql.match(/set search_path = public/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('requires auth, workspace, session args, and stock-manager authorization', () => {
    expect(sql).toContain('auth.uid()')
    expect(sql).toContain('inventory_migration_session_unauthenticated')
    expect(sql).toContain('inventory_migration_session_workspace_required')
    expect(sql).toContain('inventory_migration_session_session_required')
    expect(sql).toContain('inventory_migration_session_workspace_not_found')
    expect(sql).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(sql).toContain('inventory_migration_session_forbidden')
    expect(sql).toContain('owner / general_manager / manager')
    expect(sql).toContain('host / staff')
    expect(sql).toContain('anonymous')
  })

  it('locks the session row with FOR UPDATE before transition checks', () => {
    expect(completeBody).toContain('for update')
    expect(cancelBody).toContain('for update')
    expect(completeBody).toContain('inventory_migration_session_not_found')
    expect(cancelBody).toContain('inventory_migration_session_not_found')
    expect(completeBody).toContain('inventory_migration_session_not_running')
    expect(cancelBody).toContain('inventory_migration_session_not_running')
  })

  it('completes only running sessions and sets finished_at', () => {
    expect(completeBody).toContain("status is distinct from 'running'")
    expect(completeBody).toContain("status = 'completed'")
    expect(completeBody).toContain('finished_at = now()')
    expect(completeBody).toContain('returning *')
    expect(completeBody).not.toContain('started_by =')
    expect(completeBody).not.toContain('operator_display_name =')
    expect(completeBody).not.toContain('started_at =')
  })

  it('cancels only running sessions and sets finished_at', () => {
    expect(cancelBody).toContain("status is distinct from 'running'")
    expect(cancelBody).toContain("status = 'cancelled'")
    expect(cancelBody).toContain('finished_at = now()')
    expect(cancelBody).toContain('returning *')
    expect(cancelBody).not.toContain('started_by =')
    expect(cancelBody).not.toContain('operator_display_name =')
    expect(cancelBody).not.toContain('started_at =')
  })

  it('grants execute to authenticated only and revokes public/anon', () => {
    expect(sql).toContain('revoke all on function public.complete_inventory_migration_session(uuid, uuid) from public')
    expect(sql).toContain('revoke all on function public.complete_inventory_migration_session(uuid, uuid) from anon')
    expect(sql).toContain('grant execute on function public.complete_inventory_migration_session(uuid, uuid) to authenticated')
    expect(sql).toContain('revoke all on function public.cancel_inventory_migration_session(uuid, uuid) from public')
    expect(sql).toContain('revoke all on function public.cancel_inventory_migration_session(uuid, uuid) from anon')
    expect(sql).toContain('grant execute on function public.cancel_inventory_migration_session(uuid, uuid) to authenticated')
  })

  it('does not write migration map, stock, movements, or insert sessions', () => {
    expect(sql).not.toMatch(/insert into public\.inventory_migration_sessions/i)
    expect(sql).not.toMatch(/insert into public\.inventory_stock_item_map/i)
    expect(sql).not.toMatch(/update public\.inventory_stock_item_map/i)
    expect(sql).not.toMatch(/insert into public\.stock_movements/i)
    expect(sql).not.toMatch(/update public\.stock_items/i)
    expect(sql).not.toMatch(/create policy[\s\S]*for update/i)
  })

  it('documents concurrency and terminal-state immutability', () => {
    expect(sql).toContain('FOR UPDATE')
    expect(sql).toContain('complete then complete again')
    expect(sql).toContain('cancel then cancel again')
    expect(sql).toContain('complete then cancel')
    expect(sql).toContain('cancel then complete')
    expect(sql).toContain('inventory_migration_session_not_running')
    expect(sql).toContain('wrong workspace')
  })
})
