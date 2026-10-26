/**
 * @vitest-environment node
 * Contract for the applied supplier function. That file already includes
 * costPrice. The separate cost-only scripts were not applied and are not
 * part of this branch.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const STEP2 = readFileSync(join(HERE, '../supabase/stock_location_quantity_step2.sql'), 'utf8')
const SQL = readFileSync(join(HERE, '../supabase/inventory_import_apply_suppliers.sql'), 'utf8')
const ROLLBACK = readFileSync(join(HERE, '../supabase/inventory_import_apply_suppliers_rollback.sql'), 'utf8')
const VERIFY = readFileSync(join(HERE, '../supabase/inventory_import_apply_suppliers_verify.sql'), 'utf8')

function extractApply(source) {
  const start = source.indexOf(
    'drop function if exists public.apply_inventory_import_session(uuid, uuid, text);',
  )
  const grant = 'grant execute on function public.apply_inventory_import_session(uuid, uuid, text) to authenticated;'
  const grantAt = source.indexOf(grant, start)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(grantAt).toBeGreaterThan(start)
  return source.slice(start, grantAt + grant.length).trim() + '\n'
}

function stripSuppliers(body) {
  let out = body.replace(
    `  v_supplier_id uuid;
  v_suppliers_id_is_uuid boolean := false;
  v_suppliers_have_workspace boolean := false;
  v_supplier_match_count integer := 0;
  v_supplier_cache jsonb := '{}'::jsonb;
  v_supplier_cache_key text;
  v_created_supplier_ids uuid[] := array[]::uuid[];
`,
    '  v_supplier_id uuid;\n',
  )
  out = out.replace(
    `  into v_has_supplier_id_column;

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'suppliers'
      and c.column_name = 'id'
      and c.udt_name = 'uuid'
  )
  into v_suppliers_id_is_uuid;

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'suppliers'
      and c.column_name = 'workspace_id'
  )
  into v_suppliers_have_workspace;

`,
    '  into v_has_supplier_id_column;\n\n',
  )
  const matchStart = out.indexOf('      -- Match or create a workspace supplier')
  const matchEnd = out.indexOf('      -- Create always starts at quantity 0;')
  expect(matchStart).toBeGreaterThan(0)
  expect(matchEnd).toBeGreaterThan(matchStart)
  out = `${out.slice(0, matchStart)}${out.slice(matchEnd)}`
  out = out.replace(
    `    'operator_user_id', v_auth_user_id,
    'created_supplier_ids', to_jsonb(v_created_supplier_ids)
`,
    `    'operator_user_id', v_auth_user_id
`,
  )
  return out
}

function stripCost(body) {
  const costBlockStart = body.indexOf('      v_cost := 0;')
  const costBlockEnd = body.indexOf('      v_supplier_id := null;')
  expect(costBlockStart).toBeGreaterThan(0)
  expect(costBlockEnd).toBeGreaterThan(costBlockStart)
  return (
    body.slice(0, costBlockStart) + body.slice(costBlockEnd)
  )
    .replace(
      '  v_target numeric(12, 3);\n  v_cost numeric(12, 2);\n',
      '  v_target numeric(12, 3);\n',
    )
    .replaceAll(
      `          v_target,
          v_cost,
          v_storage,`,
      `          v_target,
          0,
          v_storage,`,
    )
}

const LIVE = extractApply(STEP2)
const CHANGE = extractApply(SQL)

describe('apply_inventory_import_session supplier match-or-create', () => {
  it('keeps the costPrice behaviour and adds workspace supplier matching', () => {
    expect(CHANGE).toContain("normalized_payload->>'costPrice'")
    expect(CHANGE).toContain('inventory_import_apply_invalid_cost_price')
    expect(CHANGE).toContain('v_supplier_match_count = 1')
    expect(CHANGE).toContain('v_supplier_match_count = 0')
    expect(CHANGE).toContain('insert into public.suppliers')
    expect(CHANGE).toContain('gen_random_uuid()')
    expect(CHANGE).toContain('lower(btrim(sp.company_name))')
    expect(CHANGE).toContain('sp.workspace_id = p_workspace_id')
    expect(CHANGE).toContain("'created_supplier_ids', to_jsonb(v_created_supplier_ids)")
    expect(CHANGE).toContain('v_supplier_id is null')
    expect(CHANGE).toContain("normalized_payload->>'supplierId'")
    expect(CHANGE).toContain('LINK never mutates metadata')
    expect(SQL).toContain('NOT APPLIED')
    expect(SQL).toContain('APPLY ORDER')
  })

  it('is the live function plus costPrice plus the supplier block', () => {
    const withoutSuppliers = stripSuppliers(CHANGE)
    expect(withoutSuppliers).toContain("normalized_payload->>'costPrice'")
    expect(withoutSuppliers).not.toContain('created_supplier_ids')
    expect(stripCost(withoutSuppliers)).toBe(LIVE)
  })

  it('rolls back to the exact current live body, not the cost-only body', () => {
    const rolledBack = extractApply(ROLLBACK)
    expect(rolledBack).toBe(LIVE)
    expect(rolledBack).not.toContain('costPrice')
    expect(rolledBack).not.toContain('created_supplier_ids')
    expect(ROLLBACK).not.toMatch(/\bdrop table\b/i)
    expect(ROLLBACK).not.toMatch(/\bdelete from\b/i)
  })

  it('verifies with read-only selects', () => {
    expect(VERIFY).toMatch(/\bselect\b/i)
    expect(VERIFY).not.toMatch(/\b(insert|update|delete|drop|create|alter|grant|revoke)\b/i)
    expect(VERIFY).toContain('created_supplier_ids')
    expect(VERIFY).toContain('costPrice')
  })

  it('stays security definer for authenticated managers only', () => {
    expect(CHANGE).toContain('security definer')
    expect(CHANGE).toContain('set search_path = public')
    expect(CHANGE).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(CHANGE).toMatch(/revoke all on function public\.apply_inventory_import_session\(uuid, uuid, text\) from public/i)
    expect(CHANGE).toMatch(/revoke all on function public\.apply_inventory_import_session\(uuid, uuid, text\) from anon/i)
    expect(CHANGE).toContain('to authenticated;')
  })
})
