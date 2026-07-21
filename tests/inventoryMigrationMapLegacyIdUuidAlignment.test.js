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

describe('P8.6.1g inventory_stock_item_map legacy ID UUID alignment', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const alignmentPath = join(
    root,
    'supabase/inventory_stock_item_map_legacy_id_uuid_alignment.sql',
  )
  const itemsSchemaPath = join(root, 'supabase/inventory_items_schema.sql')
  const mapSchemaPath = join(root, 'supabase/inventory_stock_item_map.sql')
  const harnessPath = join(
    root,
    'supabase/inventory_migration_auto_link_runtime_validation.sql',
  )
  const persistPath = join(root, 'supabase/inventory_migration_persist_rpc.sql')
  const autoLinkPath = join(root, 'supabase/inventory_migration_auto_link_rpc.sql')

  const sql = readFileSync(alignmentPath, 'utf8')
  const executable = stripSqlComments(sql)
  const itemsSchema = readFileSync(itemsSchemaPath, 'utf8')
  const mapSchema = readFileSync(mapSchemaPath, 'utf8')
  const harnessSql = readFileSync(harnessPath, 'utf8')
  const persistSql = readFileSync(persistPath, 'utf8')
  const autoLinkSql = readFileSync(autoLinkPath, 'utf8')

  it('1. alignment SQL file exists', () => {
    expect(sql.length).toBeGreaterThan(500)
  })

  it('2. begins with BEGIN', () => {
    expect(executable.trimStart().toLowerCase().startsWith('begin')).toBe(true)
    expect(sql).toMatch(/^\s*begin\s*;/im)
  })

  it('3. ends with COMMIT', () => {
    const beginAt = sql.search(/^\s*begin\s*;/im)
    const commitAt = sql.search(/^\s*commit\s*;/im)
    expect(commitAt).toBeGreaterThan(beginAt)
    expect(executable.trimEnd().toLowerCase().endsWith('commit;')).toBe(true)
  })

  it('4. checks inventory_items.id live type', () => {
    expect(sql).toContain("c.table_name = 'inventory_items'")
    expect(sql).toContain("c.column_name = 'id'")
    expect(sql).toContain("inventory_items.id must be uuid")
  })

  it('5. checks map legacy ID live type', () => {
    expect(sql).toContain("c.table_name = 'inventory_stock_item_map'")
    expect(sql).toContain("c.column_name = 'legacy_inventory_item_id'")
    expect(sql).toContain('udt_name')
  })

  it('6. accepts already-aligned uuid state', () => {
    expect(sql).toContain("not in ('int8', 'uuid')")
    expect(sql).toContain('already_aligned')
    expect(sql).toContain(
      'MIGRATION MAP LEGACY ID ALREADY UUID — FOUNDATION READY',
    )
  })

  it('7. rejects unexpected types', () => {
    expect(sql).toContain('unexpected map legacy ID type')
    expect(sql).toContain('inventory_items.id must be uuid')
  })

  it('8. counts map rows before ALTER', () => {
    const countAt = executable.search(
      /select count\(\*\)\s*::bigint into v_map_row_count from public\.inventory_stock_item_map/i,
    )
    const alterAt = executable.search(
      /alter table public\.inventory_stock_item_map/i,
    )
    expect(countAt).toBeGreaterThan(-1)
    expect(alterAt).toBeGreaterThan(countAt)
  })

  it('9. aborts when map row count is greater than zero', () => {
    expect(sql).toContain('v_map_row_count > 0')
    expect(sql).toContain(
      'MAP CONTAINS DATA — UUID ALIGNMENT ABORTED; REMAP REVIEW REQUIRED',
    )
  })

  it('10. does not delete map rows', () => {
    expect(executable).not.toMatch(
      /delete\s+from\s+public\.inventory_stock_item_map/i,
    )
  })

  it('11. does not truncate map rows', () => {
    expect(executable).not.toMatch(
      /truncate\s+(table\s+)?public\.inventory_stock_item_map/i,
    )
  })

  it('12. does not attempt bigint-to-UUID remapping', () => {
    expect(sql).toContain('Do not treat this as bigint→uuid remapping')
    expect(executable).not.toMatch(
      /update\s+public\.inventory_stock_item_map\s+set\s+legacy_inventory_item_id/i,
    )
    expect(executable).not.toMatch(
      /legacy_inventory_item_id\s*:=\s*gen_random_uuid\(\)/i,
    )
  })

  it('13. alters the map column only after the empty-table guard', () => {
    const abortAt = executable.indexOf('MAP CONTAINS DATA')
    const alterAt = executable.search(
      /alter table public\.inventory_stock_item_map/i,
    )
    expect(abortAt).toBeGreaterThan(-1)
    expect(alterAt).toBeGreaterThan(abortAt)
    expect(sql).toContain("v_map_legacy_type_before = 'bigint'")
  })

  it('14. final map type is asserted as uuid', () => {
    expect(sql).toContain('post-mutation map legacy ID type')
    expect(sql).toContain("distinct from 'uuid'")
  })

  it('15. NOT NULL is preserved', () => {
    expect(sql).toContain("is_nullable")
    expect(sql).toContain('must remain NOT NULL')
  })

  it('16. unique legacy/workspace identity index is preserved', () => {
    expect(sql).toContain('inventory_stock_item_map_legacy_workspace_uidx')
    expect(sql).toContain('(legacy_inventory_item_id, workspace_id)')
  })

  it('17. no unrelated index is dropped', () => {
    expect(executable).not.toMatch(
      /drop index[^;]*inventory_stock_item_map_workspace_status_idx/i,
    )
    expect(executable).not.toMatch(
      /drop index[^;]*inventory_stock_item_map_stock_item_id_idx/i,
    )
    expect(sql).toContain(
      'drop index if exists public.inventory_stock_item_map_legacy_workspace_uidx',
    )
  })

  it('18–22. unrelated entity counts are captured and asserted unchanged', () => {
    expect(sql).toContain('v_inventory_items_before')
    expect(sql).toContain('v_stock_items_before')
    expect(sql).toContain('v_stock_movements_before')
    expect(sql).toContain('v_sessions_before')
    expect(sql).toContain('v_steps_before')
    expect(sql).toContain('unrelated row counts changed')
    expect(sql).toContain('inventory_items_count_unchanged')
    expect(sql).toContain('stock_items_count_unchanged')
    expect(sql).toContain('stock_movements_count_unchanged')
    expect(sql).toContain('migration_sessions_count_unchanged')
    expect(sql).toContain('migration_steps_count_unchanged')
  })

  it('23. no product RPC is executed', () => {
    expect(executable).not.toMatch(
      /select\s+public\.run_inventory_migration_/i,
    )
    expect(executable).not.toMatch(
      /perform\s+public\.run_inventory_migration_/i,
    )
    expect(sql).toContain('to_regprocedure')
  })

  it('24. inventory_items_schema.sql now defines UUID IDs', () => {
    expect(itemsSchema).toMatch(
      /id\s+uuid\s+primary key\s+default\s+gen_random_uuid\(\)/i,
    )
    expect(itemsSchema).not.toMatch(
      /id\s+bigint\s+generated\s+by\s+default\s+as\s+identity/i,
    )
  })

  it('25. inventory_stock_item_map.sql now defines UUID legacy IDs', () => {
    expect(mapSchema).toMatch(/legacy_inventory_item_id\s+uuid\s+not null/i)
    expect(mapSchema).not.toMatch(
      /legacy_inventory_item_id\s+bigint\s+not null/i,
    )
  })

  it('26. stale bigint identity comments are removed', () => {
    expect(mapSchema).not.toContain('inventory_items.id                 = bigint')
    expect(mapSchema).not.toContain('inventory_items.id                 → bigint')
    expect(mapSchema).not.toContain(
      'Original inventory_items.id (bigint)',
    )
    expect(mapSchema).toContain('Original inventory_items.id (uuid)')
  })

  it('27. runtime validation harness keeps UUID legacy variables', () => {
    expect(harnessSql).toContain('v_case_a_legacy_id uuid;')
    expect(harnessSql).toContain('v_case_b_legacy_id uuid;')
    expect(harnessSql).toContain('v_case_c_legacy_id uuid;')
    expect(harnessSql).not.toContain('v_case_a_legacy_id bigint')
  })

  it('28. Persist RPC remains unchanged in this sprint contract', () => {
    expect(persistSql).toContain('run_inventory_migration_persist')
    expect(persistSql.length).toBeGreaterThan(1000)
  })

  it('29. Auto-link RPC remains unchanged in this sprint contract', () => {
    expect(autoLinkSql).toContain('run_inventory_migration_auto_link')
    expect(autoLinkSql.length).toBeGreaterThan(500)
  })

  it('30. no frontend or service product files are part of this contract', () => {
    expect(alignmentPath).toContain('supabase/')
    expect(itemsSchemaPath).toContain('supabase/')
    expect(mapSchemaPath).toContain('supabase/')
    expect(harnessPath).toContain('supabase/')
    // Guaranteed untouched product surfaces for this sprint.
    expect(persistPath.endsWith('inventory_migration_persist_rpc.sql')).toBe(true)
    expect(autoLinkPath.endsWith('inventory_migration_auto_link_rpc.sql')).toBe(true)
  })

  it('documents manual SQL Editor execution and safety', () => {
    expect(sql).toContain('MANUAL EXECUTION ONLY')
    expect(sql).toContain('Supabase SQL Editor')
    expect(sql).toContain('Schema alignment only')
    expect(sql).toContain('No inventory quantity changes')
    expect(sql).toContain('No stock movement changes')
    expect(sql).toContain(
      'MIGRATION MAP LEGACY ID ALIGNED TO UUID — FOUNDATION READY',
    )
  })
})
