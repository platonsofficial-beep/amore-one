/**
 * @vitest-environment node
 * Unapplied replacement of apply_inventory_import_session that reads costPrice.
 * The live body is supabase/stock_location_quantity_step2.sql.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const STEP2 = readFileSync(join(HERE, '../supabase/stock_location_quantity_step2.sql'), 'utf8')
const SQL = readFileSync(join(HERE, '../supabase/inventory_import_apply_cost.sql'), 'utf8')
const ROLLBACK = readFileSync(join(HERE, '../supabase/inventory_import_apply_cost_rollback.sql'), 'utf8')
const VERIFY = readFileSync(join(HERE, '../supabase/inventory_import_apply_cost_verify.sql'), 'utf8')

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

const LIVE = extractApply(STEP2)
const CHANGE = extractApply(SQL)

const COST_DECL_OLD = '  v_target numeric(12, 3);\n'
const COST_DECL_NEW = '  v_target numeric(12, 3);\n  v_cost numeric(12, 2);\n'
const COST_ANCHOR = `      if v_target is not null and v_target < 0 then
        raise exception 'inventory_import_apply_invalid_target_quantity'
          using hint = format('Row %s targetQuantity must be >= 0.', v_row.source_row_number);
      end if;`
const COST_VALUE_OLD = `          v_target,
          0,
          v_storage,`
const COST_VALUE_NEW = `          v_target,
          v_cost,
          v_storage,`

describe('apply_inventory_import_session costPrice replacement', () => {
  it('reads costPrice, rejects a negative or non-numeric price, and defaults to 0', () => {
    expect(CHANGE).toContain("v_row.normalized_payload->>'costPrice'")
    expect(CHANGE).toContain('inventory_import_apply_invalid_cost_price')
    expect(CHANGE).toContain('v_cost := 0;')
    expect(CHANGE).toContain('if v_cost < 0 then')
    expect(CHANGE).toContain('v_cost numeric(12, 2)')
    expect(CHANGE.split(COST_VALUE_NEW)).toHaveLength(3)
    expect(CHANGE).toContain("security definer")
    expect(CHANGE).toContain('set search_path = public')
    expect(CHANGE).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(CHANGE).toMatch(/revoke all on function public\.apply_inventory_import_session\(uuid, uuid, text\) from public/i)
    expect(CHANGE).toMatch(/revoke all on function public\.apply_inventory_import_session\(uuid, uuid, text\) from anon/i)
    expect(CHANGE).toContain('grant execute on function public.apply_inventory_import_session(uuid, uuid, text) to authenticated;')
    expect(SQL).toContain('NOT APPLIED')
    expect(SQL).not.toContain('run_inventory_migration_auto_create')
  })

  it('is otherwise identical to the live step2 function', () => {
    const costBlockStart = CHANGE.indexOf('      v_cost := 0;')
    const costBlockEnd = CHANGE.indexOf('      v_supplier_id := null;')
    expect(costBlockStart).toBeGreaterThan(0)
    expect(costBlockEnd).toBeGreaterThan(costBlockStart)
    const withoutCost = (
      CHANGE.slice(0, costBlockStart) + CHANGE.slice(costBlockEnd)
    )
      .replace(COST_DECL_NEW, COST_DECL_OLD)
      .replaceAll(COST_VALUE_NEW, COST_VALUE_OLD)
    expect(withoutCost).toBe(LIVE)
    expect(LIVE).toContain(COST_ANCHOR)
    expect(LIVE.split(COST_VALUE_OLD)).toHaveLength(3)
    expect(LIVE).not.toContain('costPrice')
  })

  it('rolls back to the exact current live body', () => {
    expect(extractApply(ROLLBACK)).toBe(LIVE)
    expect(ROLLBACK).not.toMatch(/\bdrop table\b/i)
    expect(ROLLBACK).not.toMatch(/\bdelete from\b/i)
    expect(ROLLBACK).not.toContain('run_inventory_migration_auto_create')
  })

  it('verifies with read-only selects', () => {
    expect(VERIFY).toMatch(/\bselect\b/i)
    expect(VERIFY).not.toMatch(/\b(insert|update|delete|drop|create|alter|grant|revoke)\b/i)
    expect(VERIFY).toContain('apply_inventory_import_session')
    expect(VERIFY).toContain('costPrice')
    expect(VERIFY).toContain('inventory_import_apply_invalid_cost_price')
  })
})
