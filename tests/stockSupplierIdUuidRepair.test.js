// @vitest-environment node
/**
 * P8.26.6c — Stock Supplier UUID schema repair SQL contract.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const repairPath = join(HERE, '../supabase/stock_supplier_id_uuid_repair.sql')
const historicalPath = join(HERE, '../supabase/stock_supplier_id_columns.sql')
const backfillPath = join(HERE, '../supabase/stock_supplier_id_backfill.sql')
const suppliersSchemaPath = join(HERE, '../supabase/suppliers_schema.sql')

const repair = readFileSync(repairPath, 'utf8')
const historical = readFileSync(historicalPath, 'utf8')
const backfill = readFileSync(backfillPath, 'utf8')
const suppliersSchema = readFileSync(suppliersSchemaPath, 'utf8')

function executableSql(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
}

const executable = executableSql(repair)

describe('stock_supplier_id_uuid_repair.sql — P8.26.6c contract', () => {
  it('repair file exists and historical BIGINT migration remains unchanged', () => {
    expect(repair.length).toBeGreaterThan(500)
    expect(historical).toContain('supplier_id bigint')
    expect(historical).toContain('references public.suppliers(id) on delete set null')
    expect(historical).toContain('stock_items_supplier_id_idx')
    expect(historical).toContain('stock_orders_supplier_id_idx')
  })

  it('requires public.suppliers.id to be uuid and never mutates suppliers PK', () => {
    expect(executable).toMatch(/suppliers\.id must be uuid/i)
    expect(executable).toMatch(/c\.table_name = 'suppliers'[\s\S]*c\.column_name = 'id'/)
    expect(executable).toMatch(/v_suppliers_id_type is distinct from 'uuid'/)
    expect(executable).not.toMatch(/alter table public\.suppliers/i)
    expect(executable).not.toMatch(/alter table[\s\S]*suppliers[\s\S]*alter column\s+id/i)
    expect(executable).toMatch(/Refusing to alter suppliers\.id/)
    // Historical suppliers schema may still document bigint — repair does not change it
    expect(suppliersSchema).toMatch(/id\s+bigint\s+generated/i)
  })

  it('covers stock_items and stock_orders', () => {
    expect(executable).toContain("'stock_items'")
    expect(executable).toContain("'stock_orders'")
    expect(executable).toMatch(/foreach v_table in array array\['stock_items', 'stock_orders'\]/)
  })

  it('creates uuid supplier_id when absent (State A)', () => {
    expect(executable).toMatch(/if v_col_type is null then/)
    expect(executable).toMatch(/add column supplier_id uuid/)
  })

  it('replaces empty BIGINT via drop + recreate, not ALTER TYPE cast (State B)', () => {
    expect(executable).toMatch(/v_col_type in \('bigint', 'integer', 'smallint'\)/)
    expect(executable).toMatch(/where supplier_id is not null/)
    expect(executable).toMatch(/drop column supplier_id/)
    expect(executable).toMatch(/add column supplier_id uuid/)
    expect(executable).not.toMatch(/alter\s+column\s+supplier_id\s+type/i)
    expect(executable).not.toMatch(/using\s+.*::\s*uuid/i)
  })

  it('aborts clearly when BIGINT column has non-null data (State C)', () => {
    expect(executable).toMatch(/Incompatible BIGINT data exists/)
    expect(executable).toMatch(/manual review is required/i)
    expect(executable).toMatch(/no automatic cast was performed/i)
    expect(executable).toMatch(/non-null value\(s\)/)
  })

  it('preserves existing uuid columns and ensures FK + indexes (States D/E/F)', () => {
    expect(executable).toMatch(/elsif v_col_type = 'uuid' then/)
    expect(executable).toMatch(/references public\.suppliers\(id\)/)
    expect(executable).toMatch(/on delete set null/i)
    expect(executable).toContain("ft.relname = 'suppliers'")
    expect(executable).toContain("a.attname = 'supplier_id'")
    expect(executable).toMatch(/create index if not exists %I on public\.%I \(supplier_id\)/)
    expect(executable).toMatch(
      /create index if not exists %I on public\.%I \(workspace_id, supplier_id\)/,
    )
    expect(executable).toContain('_supplier_id_idx')
    expect(executable).toContain('_workspace_supplier_id_idx')
    expect(executable).toMatch(/drop constraint if exists/i)
    expect(executable).toMatch(/v_fk_exists/)
  })

  it('is transactional and idempotent-guarded', () => {
    expect(repair).toMatch(/^begin;/m)
    expect(repair).toMatch(/^commit;/m)
    expect(executable).toMatch(/create index if not exists/)
    expect(executable).toMatch(/if not coalesce\(v_fk_exists, false\)/)
  })

  it('does not embed or invoke backfill', () => {
    expect(executable).not.toMatch(/stock_supplier_id_backfill/i)
    expect(executable).not.toMatch(/update\s+public\.stock_items\s+set\s+supplier_id/i)
    expect(executable).not.toMatch(/update\s+public\.stock_orders\s+set\s+supplier_id/i)
    expect(repair).toMatch(/No backfill/i)
    expect(backfill).toContain('stock_items')
  })

  it('documents PostgREST schema cache reload', () => {
    expect(repair).toContain("notify pgrst, 'reload schema'")
  })
})
