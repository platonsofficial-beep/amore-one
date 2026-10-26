/**
 * @vitest-environment node
 * Unapplied undo for a completed inventory import session.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SQL = readFileSync(join(HERE, '../supabase/inventory_import_undo_session.sql'), 'utf8')
const ROLLBACK = readFileSync(join(HERE, '../supabase/inventory_import_undo_session_rollback.sql'), 'utf8')
const VERIFY = readFileSync(join(HERE, '../supabase/inventory_import_undo_session_verify.sql'), 'utf8')

function functionBody(source, name) {
  const start = source.indexOf(`create or replace function public.${name}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const commentIdx = source.indexOf(`comment on function public.${name}`, start)
  expect(commentIdx).toBeGreaterThan(start)
  return source.slice(start, commentIdx)
}

const COLLECT = functionBody(SQL, 'inventory_import_collect_undo_refusals')
const ELIGIBILITY = functionBody(SQL, 'inventory_import_undo_eligibility')
const UNDO = functionBody(SQL, 'undo_inventory_import_session')

describe('inventory import undo session SQL', () => {
  it('keeps the read-only probes free of writes', () => {
    expect(COLLECT).not.toMatch(/\b(insert|update|delete|drop)\b/i)
    expect(ELIGIBILITY).not.toMatch(/\b(insert|update|delete|drop)\b/i)
    expect(ELIGIBILITY).toContain('inventory_import_collect_undo_refusals')
    expect(ELIGIBILITY).toContain("'allowed'")
    expect(COLLECT).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(COLLECT).toContain('set search_path = public')
    expect(COLLECT).toContain('security definer')
  })

  it('refuses later movements, overwritten links, and reused suppliers or products', () => {
    expect(COLLECT).toContain("m.origin_workflow = 'spreadsheet_import'")
    expect(COLLECT).toContain('m.origin_ref_id = p_session_id')
    expect(COLLECT).toContain('A product from this import was changed again after it was applied.')
    expect(COLLECT).toContain("r.selected_action = 'link'")
    expect(COLLECT).toContain("r.apply_result->>'location_count'")
    expect(COLLECT).toContain("r.apply_result->>'movement_id'")
    expect(COLLECT).toContain('This import replaced the quantity on an existing product.')
    expect(COLLECT).toContain('A supplier created by this import is used by another product or order.')
    expect(COLLECT).toContain('si.supplier_id = any (v_suppliers)')
    expect(COLLECT).toContain('so.supplier_id = any (v_suppliers)')
    expect(COLLECT).toContain('not (si.id = any (v_created))')
    expect(COLLECT).toContain('A product from this import is on an order.')
    expect(COLLECT).toContain('oi.stock_item_id = any (v_created)')
    expect(COLLECT).toContain('A product from this import is on an inventory count.')
    expect(COLLECT).toContain('ci.item_id = any (v_created)')
    expect(COLLECT).toContain("v_session.status is distinct from 'completed'")
  })

  it('undo removes created rows, stores evidence, and cancels the session', () => {
    expect(UNDO).toContain('for update')
    expect(UNDO).toContain('inventory_import_undo_refused')
    expect(UNDO).toContain('delete from public.stock_items')
    expect(UNDO).toContain('delete from public.suppliers')
    expect(UNDO).toContain("status = 'cancelled'")
    expect(UNDO).toContain("'deleted_stock_item_ids'")
    expect(UNDO).toContain("'deleted_supplier_ids'")
    expect(UNDO).toContain("'undo', v_undo")
    expect(UNDO).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(UNDO).toContain('inventory_import_session_unauthenticated')
    expect(UNDO).toContain('inventory_import_session_forbidden')
    expect(UNDO).toContain('set search_path = public')
    expect(SQL).not.toContain('apply_inventory_import_session')
    expect(SQL).toContain('NOT APPLIED')
  })

  it('grants eligibility and undo to authenticated only, and hides the collector', () => {
    expect(SQL).toMatch(/revoke all on function public\.inventory_import_undo_eligibility\(uuid, uuid\) from public/i)
    expect(SQL).toMatch(/revoke all on function public\.inventory_import_undo_eligibility\(uuid, uuid\) from anon/i)
    expect(SQL).toContain('grant execute on function public.inventory_import_undo_eligibility(uuid, uuid) to authenticated;')
    expect(SQL).toMatch(/revoke all on function public\.undo_inventory_import_session\(uuid, uuid\) from public/i)
    expect(SQL).toMatch(/revoke all on function public\.undo_inventory_import_session\(uuid, uuid\) from anon/i)
    expect(SQL).toContain('grant execute on function public.undo_inventory_import_session(uuid, uuid) to authenticated;')
    expect(SQL).toMatch(/revoke all on function public\.inventory_import_collect_undo_refusals\(uuid, uuid\) from public/i)
    expect(SQL).toMatch(/revoke all on function public\.inventory_import_collect_undo_refusals\(uuid, uuid\) from anon/i)
    expect(SQL).toMatch(/revoke all on function public\.inventory_import_collect_undo_refusals\(uuid, uuid\) from authenticated/i)
    expect(SQL).not.toContain('grant execute on function public.inventory_import_collect_undo_refusals')
  })

  it('rolls back only the three new functions', () => {
    expect(ROLLBACK).toContain('drop function if exists public.undo_inventory_import_session(uuid, uuid);')
    expect(ROLLBACK).toContain('drop function if exists public.inventory_import_undo_eligibility(uuid, uuid);')
    expect(ROLLBACK).toContain('drop function if exists public.inventory_import_collect_undo_refusals(uuid, uuid);')
    expect(ROLLBACK).not.toContain('apply_inventory_import_session')
    expect(ROLLBACK).not.toMatch(/\bdrop table\b/i)
    expect(ROLLBACK).not.toMatch(/\bdelete from\b/i)
  })

  it('verifies with read-only selects', () => {
    expect(VERIFY).toMatch(/\bselect\b/i)
    expect(VERIFY).not.toMatch(/\b(insert|update|delete|drop|create|alter|grant|revoke)\b/i)
    expect(VERIFY).toContain('inventory_import_undo_eligibility')
    expect(VERIFY).toContain('undo_inventory_import_session')
    expect(VERIFY).toContain('inventory_import_collect_undo_refusals')
  })
})
