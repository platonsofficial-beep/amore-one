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

describe('inventory_stock_dry_run_classifier.sql P8.6.1i supplier contract', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const sqlPath = join(root, 'supabase/inventory_stock_dry_run_classifier.sql')
  const stockItemsSchema = readFileSync(
    join(root, 'supabase/stock_items_schema.sql'),
    'utf8',
  )
  const supplierFkSchema = readFileSync(
    join(root, 'supabase/stock_supplier_id_columns.sql'),
    'utf8',
  )
  const autoLinkPath = join(root, 'supabase/inventory_migration_auto_link_rpc.sql')
  const harnessPath = join(
    root,
    'supabase/inventory_migration_auto_link_runtime_validation.sql',
  )

  const sql = readFileSync(sqlPath, 'utf8')
  const executable = stripSqlComments(sql)
  const autoLinkSql = readFileSync(autoLinkPath, 'utf8')
  const harnessSql = readFileSync(harnessPath, 'utf8')

  it('does not read missing stock_items.supplier_id', () => {
    expect(sql).toContain("coalesce(s.supplier, '') as stock_supplier")
    expect(executable).not.toMatch(/s\.supplier_id\s+as\s+stock_supplier_id/)
    expect(executable).not.toMatch(/\bstock_items\.supplier_id\b/)
    expect(executable).not.toMatch(/\bas stock_supplier_id\b/)
    expect(executable).not.toMatch(/\bas candidate_supplier_id\b/)
  })

  it('keeps resolved_supplier_id from public.suppliers in the dry-run output', () => {
    expect(sql).toContain('us.supplier_id as resolved_supplier_id')
    expect(sql).toContain('from public.suppliers s')
    expect(sql).toContain('lower(trim(s.company_name))')
    expect(sql).toMatch(/select[\s\S]*resolved_supplier_id[\s\S]*from final_rows/i)
  })

  it('preserves classification and candidate matching behaviour', () => {
    expect(sql).toContain('v.mapped_unit_key = l.mapped_unit_key')
    expect(sql).toContain('v.mapped_category_key = l.mapped_category_key')
    expect(sql).toContain('as candidate_stock_item_id')
    expect(sql).toContain("then 'auto_link'")
    expect(sql).toContain("then 'auto_create'")
    expect(sql).toContain('when c.supplier_ambiguous then \'manual\'')
    expect(sql).toContain("'ambiguous_supplier'")
  })

  it('does not change stock_items schema or deploy supplier FK', () => {
    expect(stockItemsSchema).toContain('supplier text not null default \'\'')
    expect(stockItemsSchema).not.toMatch(/supplier_id\s+bigint/)
    // FK script remains a separate optional preparation file; dry-run does not add it.
    expect(sql).not.toMatch(/alter table public\.stock_items/i)
    expect(sql).not.toContain('add column if not exists supplier_id')
    expect(supplierFkSchema).toContain('add column if not exists supplier_id')
  })

  it('leaves Auto-link RPC and runtime harness unchanged in this sprint', () => {
    expect(autoLinkSql).toContain('run_inventory_migration_auto_link')
    expect(harnessSql).toContain('run_inventory_migration_persist')
    expect(sqlPath).toContain('inventory_stock_dry_run_classifier.sql')
  })
})
