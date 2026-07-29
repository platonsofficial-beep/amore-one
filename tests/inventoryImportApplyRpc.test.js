/**
 * @vitest-environment node
 * P8.27.3 — Inventory Import Apply RPC SQL contract.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SQL = readFileSync(
  join(HERE, '../supabase/inventory_import_apply_rpc.sql'),
  'utf8',
)
const SCHEMA_SQL = readFileSync(
  join(HERE, '../supabase/inventory_import_schema.sql'),
  'utf8',
)
const READY_SQL = readFileSync(
  join(HERE, '../supabase/inventory_import_ready_rpc.sql'),
  'utf8',
)

const FUNCTION_BODY = SQL.slice(
  SQL.indexOf('create or replace function public.apply_inventory_import_session'),
  SQL.indexOf('comment on function public.apply_inventory_import_session'),
)

describe('apply_inventory_import_session SQL contract (P8.27.3)', () => {
  it('is SECURITY DEFINER with search_path, auth, manager permission, and grants', () => {
    expect(FUNCTION_BODY).toMatch(/security definer/i)
    expect(FUNCTION_BODY).toContain('set search_path = public')
    expect(FUNCTION_BODY).toContain('auth.uid()')
    expect(FUNCTION_BODY).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(FUNCTION_BODY).toContain('inventory_import_session_unauthenticated')
    expect(FUNCTION_BODY).toContain('inventory_import_session_forbidden')
    expect(SQL).toContain('grant execute on function public.apply_inventory_import_session(')
    expect(SQL).toContain('to authenticated')
    expect(SQL).toMatch(
      /revoke all on function public\.apply_inventory_import_session\(uuid, uuid, text\) from public/i,
    )
    expect(SQL).toMatch(
      /revoke all on function public\.apply_inventory_import_session\(uuid, uuid, text\) from anon/i,
    )
  })

  it('locks session and allows only ready → applying → completed', () => {
    expect(FUNCTION_BODY).toContain('for update')
    expect(FUNCTION_BODY).toContain('p_apply_idempotency_key')
    expect(FUNCTION_BODY).toContain('inventory_import_apply_idempotency_key_required')
    expect(FUNCTION_BODY).toContain("status = 'applying'")
    expect(FUNCTION_BODY).toContain("status = 'completed'")
    expect(FUNCTION_BODY).toContain("v_session.status is distinct from 'ready'")
    expect(FUNCTION_BODY).toContain("'draft', 'review', 'cancelled'")
    expect(FUNCTION_BODY).toContain('inventory_import_apply_already_completed')
    expect(FUNCTION_BODY).toContain('inventory_import_apply_in_progress')
    expect(FUNCTION_BODY).toContain('inventory_import_apply_not_ready')
  })

  it('supports idempotent replay of completed apply keys', () => {
    expect(FUNCTION_BODY).toContain("s.apply_idempotency_key = v_idempotency_key")
    expect(FUNCTION_BODY).toContain("s.status = 'completed'")
    expect(FUNCTION_BODY).toContain("'idempotency_result', 'replayed'")
    expect(FUNCTION_BODY).toContain("'idempotency_result', 'performed'")
  })

  it('applies create/link/skip, rejects update, and uses absolute stock_count for opening stock', () => {
    expect(FUNCTION_BODY).toContain("selected_action = 'create'")
    expect(FUNCTION_BODY).toContain("selected_action = 'link'")
    expect(FUNCTION_BODY).toContain("selected_action = 'skip'")
    expect(FUNCTION_BODY).toContain('inventory_import_apply_update_action_forbidden')
    expect(FUNCTION_BODY).toContain('insert into public.stock_items')
    expect(FUNCTION_BODY).toContain('current_quantity')
    expect(FUNCTION_BODY).toMatch(/current_quantity,\s*[\s\S]*0,/)
    expect(FUNCTION_BODY).toContain("'stock_count'")
    expect(FUNCTION_BODY).toContain('insert into public.stock_movements')
    expect(FUNCTION_BODY).toContain('INVENTORY_IMPORT|session=')
    expect(FUNCTION_BODY).toContain('LINK never mutates metadata')
    expect(FUNCTION_BODY).toContain("apply_state = 'applied'")
    expect(FUNCTION_BODY).toContain("apply_state = 'skipped'")
    expect(FUNCTION_BODY).toContain('applied_stock_item_id')
  })

  it('keeps Apply atomic and records audit/result without partial success path', () => {
    expect(FUNCTION_BODY).toContain('apply_result = v_result')
    expect(FUNCTION_BODY).toContain('created_count')
    expect(FUNCTION_BODY).toContain('linked_count')
    expect(FUNCTION_BODY).toContain('skipped_count')
    expect(FUNCTION_BODY).toContain('movement_count')
    expect(FUNCTION_BODY).toContain('failed_count')
    expect(FUNCTION_BODY).not.toContain('commit;')
    expect(FUNCTION_BODY).not.toContain('autonomous transaction')
    expect(SQL).not.toContain('alter table public.inventory_import_sessions')
    expect(SCHEMA_SQL).toContain('apply_idempotency_key')
    expect(READY_SQL).toContain('mark_inventory_import_session_ready')
  })
})
