/**
 * @vitest-environment node
 * P8.27.2 — Inventory Import Ready Eligibility RPC SQL contract.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SQL = readFileSync(
  join(HERE, '../supabase/inventory_import_ready_rpc.sql'),
  'utf8',
)
const SCHEMA_SQL = readFileSync(
  join(HERE, '../supabase/inventory_import_schema.sql'),
  'utf8',
)
const STAGING_SQL = readFileSync(
  join(HERE, '../supabase/inventory_import_session_staging_rpcs.sql'),
  'utf8',
)

const FUNCTION_BODY = SQL.slice(
  SQL.indexOf('create or replace function public.mark_inventory_import_session_ready'),
  SQL.indexOf('comment on function public.mark_inventory_import_session_ready'),
)

describe('mark_inventory_import_session_ready SQL contract (P8.27.2)', () => {
  it('is SECURITY DEFINER with search_path and authenticated-only grants', () => {
    expect(FUNCTION_BODY).toMatch(/security definer/i)
    expect(FUNCTION_BODY).toContain('set search_path = public')
    expect(FUNCTION_BODY).toContain('auth.uid()')
    expect(FUNCTION_BODY).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(SQL).toContain('grant execute on function public.mark_inventory_import_session_ready(')
    expect(SQL).toContain('to authenticated')
    expect(SQL).toMatch(
      /revoke all on function public\.mark_inventory_import_session_ready\(uuid, uuid\) from public/i,
    )
    expect(SQL).toMatch(
      /revoke all on function public\.mark_inventory_import_session_ready\(uuid, uuid\) from anon/i,
    )
  })

  it('locks session FOR UPDATE and enforces review → ready only', () => {
    expect(FUNCTION_BODY).toContain('for update')
    expect(FUNCTION_BODY).toContain('s.id = p_session_id')
    expect(FUNCTION_BODY).toContain('s.workspace_id = p_workspace_id')
    expect(FUNCTION_BODY).toContain('inventory_import_session_unauthenticated')
    expect(FUNCTION_BODY).toContain('inventory_import_session_forbidden')
    expect(FUNCTION_BODY).toContain('inventory_import_session_not_found')
    expect(FUNCTION_BODY).toContain('inventory_import_session_workspace_mismatch')
    expect(FUNCTION_BODY).toContain('inventory_import_session_not_readyable')
    expect(FUNCTION_BODY).toContain('inventory_import_session_already_ready')
    expect(FUNCTION_BODY).toContain("v_session.status = 'draft'")
    expect(FUNCTION_BODY).toContain("v_session.status = 'ready'")
    expect(FUNCTION_BODY).toContain("'applying', 'completed', 'cancelled'")
    expect(FUNCTION_BODY).toContain("v_session.status is distinct from 'review'")
    expect(FUNCTION_BODY).toContain("status = 'ready'")
    expect(FUNCTION_BODY).toContain('ready_at')
  })

  it('derives eligibility from staged rows and session confirmations', () => {
    expect(FUNCTION_BODY).toContain('inventory_import_ready_quantity_policy_unset')
    expect(FUNCTION_BODY).toContain("quantityPolicy")
    expect(FUNCTION_BODY).toContain("'no_change', 'opening_stock'")
    expect(FUNCTION_BODY).toContain('existingQuantityOverwriteConfirmed')
    expect(FUNCTION_BODY).toContain('from public.inventory_import_rows r')
    expect(FUNCTION_BODY).toContain('inventory_import_ready_duplicate_source_row_number')
    expect(FUNCTION_BODY).toContain('inventory_import_ready_duplicate_existing_target')
    expect(FUNCTION_BODY).toContain('inventory_import_ready_update_action_forbidden')
    expect(FUNCTION_BODY).toContain('inventory_import_ready_unresolved_row')
    expect(FUNCTION_BODY).toContain('inventory_import_ready_blocked_row')
    expect(FUNCTION_BODY).toContain('inventory_import_ready_validation_state_invalid')
    expect(FUNCTION_BODY).toContain('inventory_import_ready_conflict_state_invalid')
    expect(FUNCTION_BODY).toContain('inventory_import_ready_apply_state_invalid')
    expect(FUNCTION_BODY).toContain('inventory_import_ready_missing_create_name')
    expect(FUNCTION_BODY).toContain('inventory_import_ready_missing_create_unit')
    expect(FUNCTION_BODY).toContain('inventory_import_ready_missing_create_storage')
    expect(FUNCTION_BODY).toContain('inventory_import_ready_missing_link_target')
    expect(FUNCTION_BODY).toContain('inventory_import_ready_missing_opening_quantity')
    expect(FUNCTION_BODY).toContain('inventory_import_ready_invalid_opening_quantity')
    expect(FUNCTION_BODY).toContain('inventory_import_ready_overwrite_unconfirmed')
    expect(FUNCTION_BODY).toContain('locationKey')
    expect(FUNCTION_BODY).toContain('resolvedQuantity')
  })

  it('recomputes counters server-side and does not write stock tables', () => {
    expect(FUNCTION_BODY).toContain('total_rows = v_total')
    expect(FUNCTION_BODY).toContain('create_rows = v_create')
    expect(FUNCTION_BODY).toContain('link_rows = v_link')
    expect(FUNCTION_BODY).toContain('update_rows = v_update')
    expect(FUNCTION_BODY).toContain('skip_rows = v_skip')
    expect(FUNCTION_BODY).toContain('updated_by = v_auth_user_id')
    expect(FUNCTION_BODY).not.toMatch(/insert into public\.stock_items/i)
    expect(FUNCTION_BODY).not.toMatch(/update public\.stock_items/i)
    expect(FUNCTION_BODY).not.toMatch(/insert into public\.stock_movements/i)
    expect(FUNCTION_BODY).not.toContain('apply_inventory')
  })

  it('does not alter schema or staging RPCs', () => {
    expect(SQL).not.toContain('alter table public.inventory_import_sessions')
    expect(SCHEMA_SQL).toContain('create table if not exists public.inventory_import_sessions')
    expect(STAGING_SQL).toContain('create_inventory_import_session')
    expect(STAGING_SQL).not.toContain('mark_inventory_import_session_ready')
  })
})
