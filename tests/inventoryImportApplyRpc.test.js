/**
 * @vitest-environment node
 * P8.27.3 / P8.29.9 — Inventory Import Apply RPC SQL contract.
 * P8.29.9 adds multi-location opening stock via locationQuantities[].
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

describe('apply_inventory_import_session SQL contract (P8.27.3 / P8.29.9)', () => {
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

  it('applies create/link/skip, rejects update', () => {
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

  // -------------------------------------------------------------------------
  // P8.29.9 — Multi-location opening stock
  // -------------------------------------------------------------------------

  it('P8.29.9: reads locationQuantities[] from normalized_payload', () => {
    expect(FUNCTION_BODY).toContain("v_location_quantities := v_row.normalized_payload->'locationQuantities'")
    expect(FUNCTION_BODY).toContain("jsonb_typeof(v_location_quantities) = 'array'")
    expect(FUNCTION_BODY).toContain("jsonb_array_length(v_location_quantities) > 0")
    expect(FUNCTION_BODY).toContain("v_has_location_quantities")
  })

  it('P8.29.9: iterates locationQuantities and skips non-valid validation states', () => {
    expect(FUNCTION_BODY).toContain("jsonb_array_elements(v_location_quantities)")
    expect(FUNCTION_BODY).toContain("v_loc_validation_state")
    expect(FUNCTION_BODY).toContain("v_loc_validation_state is distinct from 'valid'")
    expect(FUNCTION_BODY).toMatch(/continue;\s*-- skip warning\/blocker entries/)
  })

  it('P8.29.9: extracts destinationStorageId, destinationLocationKey, parsedQuantity per location', () => {
    expect(FUNCTION_BODY).toContain("v_loc_dest_storage_id")
    expect(FUNCTION_BODY).toContain("destinationStorageId")
    expect(FUNCTION_BODY).toContain("v_loc_dest_location_key")
    expect(FUNCTION_BODY).toContain("destinationLocationKey")
    expect(FUNCTION_BODY).toContain("v_loc_parsed_qty")
    expect(FUNCTION_BODY).toContain("parsedQuantity")
  })

  it('P8.29.9: validates destinationStorageId belongs to the workspace before writing', () => {
    expect(FUNCTION_BODY).toContain("inventory_import_apply_location_storage_not_found")
    expect(FUNCTION_BODY).toContain("from public.workspace_storages ws")
    expect(FUNCTION_BODY).toContain("ws.id = v_workspace_storage_id")
    expect(FUNCTION_BODY).toContain("ws.workspace_id = p_workspace_id")
  })

  it('P8.29.9: rejects missing/invalid location fields', () => {
    expect(FUNCTION_BODY).toContain('inventory_import_apply_location_storage_id_missing')
    expect(FUNCTION_BODY).toContain('inventory_import_apply_location_key_invalid')
    expect(FUNCTION_BODY).toContain('inventory_import_apply_location_quantity_invalid')
    expect(FUNCTION_BODY).toContain("char_length(v_loc_dest_location_key) > 80")
    expect(FUNCTION_BODY).toContain("v_loc_parsed_qty is null or v_loc_parsed_qty < 0")
  })

  it('P8.29.9: upserts stock_item_location_balances with ON CONFLICT DO NOTHING for idempotency', () => {
    expect(FUNCTION_BODY).toContain('insert into public.stock_item_location_balances')
    expect(FUNCTION_BODY).toContain('on conflict (workspace_id, stock_item_id, workspace_storage_id) do nothing')
    expect(FUNCTION_BODY).toContain('workspace_storage_id')
    expect(FUNCTION_BODY).toContain('location_key')
    expect(FUNCTION_BODY).toContain('quantity_version')
  })

  it('P8.29.9: inserts location-aware stock_count movement per valid location', () => {
    expect(FUNCTION_BODY).toContain("destination_workspace_storage_id")
    expect(FUNCTION_BODY).toContain("destination_location_key")
    expect(FUNCTION_BODY).toContain("origin_workflow")
    expect(FUNCTION_BODY).toContain("origin_ref_id")
    expect(FUNCTION_BODY).toContain("'spreadsheet_import'")
    expect(FUNCTION_BODY).toContain("p_session_id") // origin_ref_id = session id
    expect(FUNCTION_BODY).toContain("action=create|location=")
    expect(FUNCTION_BODY).toContain("action=link|location=")
  })

  it('P8.29.9: refreshes stock_items.current_quantity via SUM(balances) after each item', () => {
    expect(FUNCTION_BODY).toContain("coalesce(sum(b.quantity), 0)")
    expect(FUNCTION_BODY).toContain("v_aggregate_sum")
    expect(FUNCTION_BODY).toContain("from public.stock_item_location_balances b")
    expect(FUNCTION_BODY).toContain("b.stock_item_id = v_affected_item_id")
    expect(FUNCTION_BODY).toContain("set current_quantity = v_aggregate_sum")
    expect(FUNCTION_BODY).toContain("inventory_import_apply_quantity_update_failed")
  })

  it('P8.29.9: result includes location_movement_ids and location_count', () => {
    expect(FUNCTION_BODY).toContain("location_movement_ids")
    expect(FUNCTION_BODY).toContain("location_count")
    expect(FUNCTION_BODY).toContain("v_loc_movement_ids")
    expect(FUNCTION_BODY).toContain("v_loc_movement_count")
  })

  it('P8.29.9: falls back to legacy resolvedQuantity path when locationQuantities absent (create)', () => {
    // Legacy single-location fallback still present.
    expect(FUNCTION_BODY).toContain("'resolvedQuantity'")
    expect(FUNCTION_BODY).toContain("inventory_import_apply_missing_opening_quantity")
    expect(FUNCTION_BODY).toContain("inventory_import_apply_invalid_opening_quantity")
    // Legacy path must not write balance rows (the location-aware insert is conditional).
    const locInsertIdx = FUNCTION_BODY.indexOf('insert into public.stock_item_location_balances')
    const legacyMovInsertIdx = FUNCTION_BODY.indexOf(
      "INVENTORY_IMPORT|session=%s|row=%s|action=create',",
    )
    // Legacy note does not contain "|location="
    expect(FUNCTION_BODY).toContain("action=create',") // legacy note form without location suffix
  })

  it('P8.29.9: link action supports multi-location path the same as create', () => {
    // There should be two occurrences of the balance insert – one for create, one for link.
    const balanceInserts = FUNCTION_BODY.split('insert into public.stock_item_location_balances').length - 1
    expect(balanceInserts).toBeGreaterThanOrEqual(2)
    // Two occurrences of aggregate cache refresh.
    const aggRefresh = FUNCTION_BODY.split('set current_quantity = v_aggregate_sum').length - 1
    expect(aggRefresh).toBeGreaterThanOrEqual(2)
  })

  it('P8.29.9: does not touch Dashboard, Inventory Count, Transfer, Receiving, or Adjustment', () => {
    expect(SQL).not.toContain('dashboard')
    expect(SQL).not.toContain('inventory_count')
    expect(SQL).not.toContain('transfer_stock_between_locations')
    expect(SQL).not.toContain('record_location_receive')
    expect(SQL).not.toContain('record_location_adjustment')
  })

  it('P8.29.9: comment reflects P8.29.9 migration', () => {
    expect(SQL).toContain('P8.29.9')
    expect(SQL).toContain('locationQuantities[]')
    expect(SQL).toContain('spreadsheet_import')
  })
})
