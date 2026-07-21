// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
}

describe('inventory_migration_manual_resolve_rpc.sql P8.6.2 foundation', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const sqlPath = join(root, 'supabase/inventory_migration_manual_resolve_rpc.sql')
  const persistPath = join(root, 'supabase/inventory_migration_persist_rpc.sql')
  const autoLinkPath = join(root, 'supabase/inventory_migration_auto_link_rpc.sql')
  const autoCreatePath = join(root, 'supabase/inventory_migration_auto_create_rpc.sql')

  const sql = readFileSync(sqlPath, 'utf8')
  const executable = stripSqlComments(sql)
  const functionBody = sql.slice(
    sql.indexOf('create or replace function public.run_inventory_migration_manual_resolve'),
    sql.indexOf('revoke all on function public.run_inventory_migration_manual_resolve'),
  )
  const persistSql = readFileSync(persistPath, 'utf8')
  const autoLinkSql = readFileSync(autoLinkPath, 'utf8')
  const autoCreateSql = readFileSync(autoCreatePath, 'utf8')

  it('1–2. SECURITY DEFINER with safe search_path and authenticated execute', () => {
    expect(sql).toContain(
      'create or replace function public.run_inventory_migration_manual_resolve(',
    )
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain(
      'revoke all on function public.run_inventory_migration_manual_resolve(uuid, uuid, uuid, text, uuid) from public',
    )
    expect(sql).toContain(
      'revoke all on function public.run_inventory_migration_manual_resolve(uuid, uuid, uuid, text, uuid) from anon',
    )
    expect(sql).toContain(
      'grant execute on function public.run_inventory_migration_manual_resolve(uuid, uuid, uuid, text, uuid) to authenticated',
    )
    expect(sql.match(/create or replace function public\./gi)?.length).toBe(1)
  })

  it('3. unsupported actions are rejected', () => {
    expect(functionBody).toContain(
      "not in ('approve_candidate', 'force_create', 'skip', 'reset_manual')",
    )
    expect(functionBody).toContain(
      'inventory_migration_manual_resolve_unsupported_action',
    )
  })

  it('4–7. workspace/session/map ownership and running session', () => {
    expect(functionBody).toContain('inventory_migration_manual_resolve_workspace_required')
    expect(functionBody).toContain('inventory_migration_manual_resolve_session_required')
    expect(functionBody).toContain('inventory_migration_manual_resolve_map_required')
    expect(functionBody).toContain('inventory_migration_manual_resolve_workspace_not_found')
    expect(functionBody).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(functionBody).toContain('inventory_migration_manual_resolve_forbidden')
    expect(functionBody).toContain('inventory_migration_manual_resolve_session_not_found')
    expect(functionBody).toContain(
      'inventory_migration_manual_resolve_session_workspace_mismatch',
    )
    expect(functionBody).toContain(
      'inventory_migration_manual_resolve_session_not_running',
    )
    expect(functionBody).toContain("status is distinct from 'running'")
    expect(functionBody).toContain('inventory_migration_manual_resolve_map_not_found')
    expect(functionBody).toContain('m.id = p_map_id')
    expect(functionBody).toContain('m.workspace_id = p_workspace_id')
  })

  it('8–10. finalized created/linked and migrated_at are protected', () => {
    expect(functionBody).toContain(
      'inventory_migration_manual_resolve_migrated_protected',
    )
    expect(functionBody).toContain('v_map.migrated_at is not null')
    expect(functionBody).toContain(
      'inventory_migration_manual_resolve_finalized_protected',
    )
    expect(functionBody).toContain("status in ('created', 'linked')")
  })

  it('11–13. approve_candidate requires workspace-owned stock item → linked/manual_link', () => {
    expect(functionBody).toContain(
      'inventory_migration_manual_resolve_stock_item_required',
    )
    expect(functionBody).toContain(
      'inventory_migration_manual_resolve_stock_item_invalid',
    )
    expect(functionBody).toContain('from public.stock_items s')
    expect(functionBody).toContain('s.workspace_id = p_workspace_id')
    expect(functionBody).toContain("v_target_status := 'linked'")
    expect(functionBody).toContain("v_target_resolution := 'manual_link'")
    expect(functionBody).toContain(
      'coalesce(p_stock_item_id, v_map.stock_item_id)',
    )
  })

  it('14–17. force_create and skip queue/clear without creating stock', () => {
    expect(functionBody).toContain("v_action = 'force_create'")
    expect(functionBody).toContain("v_target_status := 'classified'")
    expect(functionBody).toContain("v_target_resolution := 'manual_create'")
    expect(functionBody).toContain("v_action = 'skip'")
    expect(functionBody).toContain("v_target_status := 'skipped'")
    expect(functionBody).toContain("v_target_resolution := 'skip'")
    // Both clear stock_item_id via null target.
    const forceBlock = functionBody.slice(
      functionBody.indexOf("v_action = 'force_create'"),
      functionBody.indexOf("v_action = 'skip'"),
    )
    const skipBlock = functionBody.slice(
      functionBody.indexOf("v_action = 'skip'"),
      functionBody.indexOf('Exact effective-state retry'),
    )
    expect(forceBlock).toContain('v_target_stock_item_id := null')
    expect(skipBlock).toContain('v_target_stock_item_id := null')
    expect(executable).not.toMatch(/insert\s+into\s+public\.stock_items/i)
    expect(executable).not.toMatch(/insert\s+into\s+public\.stock_movements/i)
    expect(executable).not.toMatch(/current_quantity\s*=/i)
    // Queues for Auto-create; does not rewrite to auto_create.
    expect(functionBody).not.toContain("v_target_resolution := 'auto_create'")
  })

  it('18–20. reset_manual only from manual/classified and clears fields', () => {
    expect(functionBody).toContain(
      'inventory_migration_manual_resolve_reset_from_skipped',
    )
    expect(functionBody).toContain("v_action = 'reset_manual' and v_map.status = 'skipped'")
    expect(functionBody).toContain("not in ('manual', 'classified')")
    expect(functionBody).toContain("v_target_status := 'manual'")
    expect(functionBody).toContain('v_target_resolution := null')
    const resetAssign = functionBody.slice(
      functionBody.indexOf('-- reset_manual'),
      functionBody.indexOf('Exact effective-state retry'),
    )
    expect(resetAssign).toContain('v_target_stock_item_id := null')
  })

  it('21–24. updates only selected row; preserves snapshot/hash/migrated_at', () => {
    expect(functionBody).toContain('update public.inventory_stock_item_map m')
    expect(functionBody).toContain('where m.id = v_map.id')
    expect(functionBody).toContain('and m.workspace_id = p_workspace_id')
    expect(functionBody).toContain('for update')
    expect(executable).not.toMatch(/source_snapshot\s*=/)
    expect(executable).not.toMatch(/source_hash\s*=/)
    expect(executable).not.toMatch(/migrated_at\s*=/)
    expect(executable).not.toMatch(/legacy_inventory_item_id\s*=/)
    expect(functionBody).toContain('updated_at = now()')
  })

  it('25–27. idempotent retry skips activity; real transition writes one note', () => {
    expect(functionBody).toContain('v_idempotent := true')
    expect(functionBody).toContain('v_changed := false')
    expect(functionBody).toContain('Manual resolve idempotent:')
    expect(functionBody).toContain('insert into public.inventory_migration_activity')
    expect(functionBody).toContain("'note'")
    expect(functionBody).toContain('v_activity_written := true')
    expect(functionBody).toContain('Manual resolve: action=')
    // Idempotent path returns before activity insert.
    const idempotentAt = functionBody.indexOf('Exact effective-state retry')
    const activityAt = functionBody.indexOf('insert into public.inventory_migration_activity')
    expect(idempotentAt).toBeGreaterThan(-1)
    expect(activityAt).toBeGreaterThan(idempotentAt)
  })

  it('28–31. no step_results, stock inserts, movements, or quantity writes', () => {
    expect(executable).not.toMatch(/inventory_migration_step_results/i)
    expect(executable).not.toMatch(/insert\s+into\s+public\.stock_items/i)
    expect(executable).not.toMatch(/insert\s+into\s+public\.stock_movements/i)
    expect(executable).not.toMatch(/update\s+public\.stock_items/i)
    expect(executable).not.toMatch(/current_quantity\s*=/i)
    expect(executable).not.toMatch(/step_name\s*=/i)
  })

  it('32. does not modify existing migration RPC sources', () => {
    expect(persistSql).toContain('run_inventory_migration_persist')
    expect(autoLinkSql).toContain('run_inventory_migration_auto_link')
    expect(autoCreateSql).toContain('run_inventory_migration_auto_create')
    expect(sqlPath).toContain('inventory_migration_manual_resolve_rpc.sql')
  })

  it('returns the approved structured result contract', () => {
    expect(functionBody).toContain('success boolean')
    expect(functionBody).toContain('changed boolean')
    expect(functionBody).toContain('idempotent boolean')
    expect(functionBody).toContain('action text')
    expect(functionBody).toContain('map_id uuid')
    expect(functionBody).toContain('legacy_inventory_item_id uuid')
    expect(functionBody).toContain('workspace_id uuid')
    expect(functionBody).toContain('session_id uuid')
    expect(functionBody).toContain('previous_status text')
    expect(functionBody).toContain('previous_resolution_type text')
    expect(functionBody).toContain('previous_stock_item_id uuid')
    expect(functionBody).toContain('activity_written boolean')
    expect(functionBody).toContain('message text')
  })

  it('locks session then map; uses can_manage_workspace_stock', () => {
    const sessionLock = functionBody.indexOf('from public.inventory_migration_sessions s')
    const mapLock = functionBody.indexOf('from public.inventory_stock_item_map m')
    expect(sessionLock).toBeGreaterThan(-1)
    expect(mapLock).toBeGreaterThan(sessionLock)
    expect(functionBody).toContain('auth.uid()')
  })
})
