/**
 * @vitest-environment node
 * P8.27.1 — Inventory Import Session Staging RPC SQL contract.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SQL = readFileSync(
  join(HERE, '../supabase/inventory_import_session_staging_rpcs.sql'),
  'utf8',
)
const SCHEMA_SQL = readFileSync(
  join(HERE, '../supabase/inventory_import_schema.sql'),
  'utf8',
)

function functionBody(name) {
  const start = SQL.indexOf(`create or replace function public.${name}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const commentIdx = SQL.indexOf(`comment on function public.${name}`, start)
  const revokeIdx = SQL.indexOf(`revoke all on function public.${name}`, start)
  const end = Math.min(
    commentIdx === -1 ? SQL.length : commentIdx,
    revokeIdx === -1 ? SQL.length : revokeIdx,
  )
  return SQL.slice(start, end)
}

const CREATE_BODY = functionBody('create_inventory_import_session')
const STAGE_BODY = functionBody('stage_inventory_import_rows')
const CANCEL_BODY = functionBody('cancel_inventory_import_session')

describe('create_inventory_import_session SQL contract (P8.27.1)', () => {
  it('is SECURITY DEFINER with search_path and authenticated-only grants', () => {
    expect(CREATE_BODY).toMatch(/security definer/i)
    expect(CREATE_BODY).toContain('set search_path = public')
    expect(SQL).toContain('grant execute on function public.create_inventory_import_session(')
    expect(SQL).toContain('to authenticated')
    expect(SQL).toMatch(
      /revoke all on function public\.create_inventory_import_session\([\s\S]*?\) from public/i,
    )
    expect(SQL).toMatch(
      /revoke all on function public\.create_inventory_import_session\([\s\S]*?\) from anon/i,
    )
  })

  it('requires auth, workspace existence, and manager permission', () => {
    expect(CREATE_BODY).toContain('auth.uid()')
    expect(CREATE_BODY).toContain('inventory_import_session_unauthenticated')
    expect(CREATE_BODY).toContain('inventory_import_session_workspace_required')
    expect(CREATE_BODY).toContain('inventory_import_session_workspace_not_found')
    expect(CREATE_BODY).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(CREATE_BODY).toContain('inventory_import_session_forbidden')
    expect(CREATE_BODY).toContain('owner / general_manager / manager')
  })

  it('validates required metadata and creates draft (not ready)', () => {
    expect(CREATE_BODY).toContain('p_source_filename')
    expect(CREATE_BODY).toContain('inventory_import_session_source_filename_required')
    expect(CREATE_BODY).toContain('inventory_import_session_source_file_size_invalid')
    expect(CREATE_BODY).toContain("jsonb_typeof(p_mapping) <> 'object'")
    expect(CREATE_BODY).toContain("jsonb_typeof(p_confirmations) <> 'object'")
    expect(CREATE_BODY).toContain("jsonb_typeof(p_source_metadata) <> 'object'")
    expect(CREATE_BODY).toContain("status")
    expect(CREATE_BODY).toMatch(/'draft'/)
    expect(CREATE_BODY).not.toMatch(/status\s*=\s*'ready'/)
    expect(CREATE_BODY).toContain('created_by')
    expect(CREATE_BODY).toContain('updated_by')
    expect(CREATE_BODY).toContain('v_auth_user_id')
    expect(CREATE_BODY).not.toContain('apply_started_at')
    expect(CREATE_BODY).not.toContain('apply_result')
  })
})

describe('stage_inventory_import_rows SQL contract (P8.27.1)', () => {
  it('locks session by workspace with FOR UPDATE and editable-status guards', () => {
    expect(STAGE_BODY).toMatch(/security definer/i)
    expect(STAGE_BODY).toContain('set search_path = public')
    expect(STAGE_BODY).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(STAGE_BODY).toContain('for update')
    expect(STAGE_BODY).toContain('s.id = p_session_id')
    expect(STAGE_BODY).toContain('s.workspace_id = p_workspace_id')
    expect(STAGE_BODY).toContain('inventory_import_session_not_found')
    expect(STAGE_BODY).toContain('inventory_import_session_workspace_mismatch')
    expect(STAGE_BODY).toContain('inventory_import_session_not_editable')
    expect(STAGE_BODY).toContain("'ready', 'applying', 'completed', 'cancelled'")
    expect(STAGE_BODY).toContain("'draft', 'review', 'failed'")
  })

  it('validates JSON array rows and rejects unsafe row states', () => {
    expect(STAGE_BODY).toContain("jsonb_typeof(p_rows) <> 'array'")
    expect(STAGE_BODY).toContain('inventory_import_rows_payload_must_be_array')
    expect(STAGE_BODY).toContain('inventory_import_row_must_be_object')
    expect(STAGE_BODY).toContain('inventory_import_row_duplicate_source_row_number')
    expect(STAGE_BODY).toContain('inventory_import_row_validation_state_invalid')
    expect(STAGE_BODY).toContain('inventory_import_row_conflict_state_invalid')
    expect(STAGE_BODY).toContain('inventory_import_row_selected_action_invalid')
    expect(STAGE_BODY).toContain('inventory_import_row_update_action_forbidden')
    expect(STAGE_BODY).toContain('inventory_import_row_apply_state_invalid')
    expect(STAGE_BODY).toContain("v_apply_state <> 'pending'")
  })

  it('validates matched stock item workspace and replaces rows atomically', () => {
    expect(STAGE_BODY).toContain('from public.stock_items si')
    expect(STAGE_BODY).toContain('inventory_import_row_matched_item_missing')
    expect(STAGE_BODY).toContain('inventory_import_row_matched_item_workspace_mismatch')
    expect(STAGE_BODY).toMatch(
      /Validate the full payload before mutating any staged rows/i,
    )
    expect(STAGE_BODY).toContain('delete from public.inventory_import_rows')
    expect(STAGE_BODY).toContain('insert into public.inventory_import_rows')
    expect(STAGE_BODY.indexOf('Validate the full payload')).toBeLessThan(
      STAGE_BODY.indexOf('delete from public.inventory_import_rows'),
    )
    expect(STAGE_BODY.indexOf('delete from public.inventory_import_rows')).toBeLessThan(
      STAGE_BODY.indexOf('insert into public.inventory_import_rows'),
    )
  })

  it('derives counters server-side and sets status to review without stock writes', () => {
    expect(STAGE_BODY).toContain('total_rows = v_total')
    expect(STAGE_BODY).toContain('valid_rows = v_valid')
    expect(STAGE_BODY).toContain('warning_rows = v_warning')
    expect(STAGE_BODY).toContain('error_rows = v_error')
    expect(STAGE_BODY).toContain('manual_review_rows = v_manual_review')
    expect(STAGE_BODY).toContain('create_rows = v_create')
    expect(STAGE_BODY).toContain('link_rows = v_link')
    expect(STAGE_BODY).toContain('update_rows = v_update')
    expect(STAGE_BODY).toContain('skip_rows = v_skip')
    expect(STAGE_BODY).toContain("status = 'review'")
    expect(STAGE_BODY).not.toMatch(/insert into public\.stock_items/i)
    expect(STAGE_BODY).not.toMatch(/update public\.stock_items/i)
    expect(STAGE_BODY).not.toMatch(/insert into public\.stock_movements/i)
    expect(STAGE_BODY).not.toContain('mark_ready')
    expect(STAGE_BODY).not.toContain('apply_inventory')
  })
})

describe('cancel_inventory_import_session SQL contract (P8.27.1)', () => {
  it('enforces manager permission, workspace guard, and cancellation rules', () => {
    expect(CANCEL_BODY).toMatch(/security definer/i)
    expect(CANCEL_BODY).toContain('set search_path = public')
    expect(CANCEL_BODY).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(CANCEL_BODY).toContain('for update')
    expect(CANCEL_BODY).toContain('inventory_import_session_workspace_mismatch')
    expect(CANCEL_BODY).toContain("'draft', 'review', 'ready', 'failed'")
    expect(CANCEL_BODY).toContain("'applying', 'completed'")
    expect(CANCEL_BODY).toContain('inventory_import_session_not_cancellable')
    expect(CANCEL_BODY).toContain("status = 'cancelled'")
    expect(CANCEL_BODY).toContain('cancelled_at')
    expect(CANCEL_BODY).toContain("'idempotent', true")
    expect(CANCEL_BODY).toContain('Preserve staged rows / session evidence — no deletes')
    expect(CANCEL_BODY).not.toContain('delete from public.inventory_import_sessions')
    expect(CANCEL_BODY).not.toContain('delete from public.inventory_import_rows')
  })
})

describe('schema compatibility (unchanged)', () => {
  it('does not modify inventory_import_schema.sql in this sprint file', () => {
    expect(SQL).not.toContain('alter table public.inventory_import_sessions')
    expect(SQL).not.toContain('alter table public.inventory_import_rows')
    expect(SCHEMA_SQL).toContain('create table if not exists public.inventory_import_sessions')
  })
})
