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

describe('inventory_migration_map_live_schema_probe.sql read-only probe', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const probePath = join(root, 'supabase/inventory_migration_map_live_schema_probe.sql')
  const persistPath = join(root, 'supabase/inventory_migration_persist_rpc.sql')
  const autoLinkPath = join(root, 'supabase/inventory_migration_auto_link_rpc.sql')

  const sql = readFileSync(probePath, 'utf8')
  const executable = stripSqlComments(sql)
  const persistSql = readFileSync(persistPath, 'utf8')
  const autoLinkSql = readFileSync(autoLinkPath, 'utf8')

  const forbiddenPlaceholders = [
    'REPLACE_ME',
    'TARGET_WORKSPACE_UUID',
    'MANAGER_USER_UUID',
    'INSERT_UUID_HERE',
    'TODO UUID',
    'paste workspace',
    'paste manager',
  ]

  it('exists and is explicitly read-only / one-click', () => {
    expect(sql.length).toBeGreaterThan(500)
    expect(sql).toContain('READ-ONLY')
    expect(sql).toContain('safe to run against production for inspection')
    expect(sql).toContain('Copy the entire contents')
    expect(sql).toContain('Paste into Supabase SQL Editor')
  })

  it('contains no operator placeholders', () => {
    for (const token of forbiddenPlaceholders) {
      expect(sql).not.toContain(token)
    }
  })

  it('probes inventory_items.id and map legacy ID types', () => {
    expect(sql).toContain("c.table_name = 'inventory_items' and c.column_name = 'id'")
    expect(sql).toContain("'legacy_inventory_item_id'")
    expect(sql).toContain('information_schema.columns')
    expect(sql).toContain('udt_name')
  })

  it('probes bar_refill inventory ID safely via catalog', () => {
    expect(sql).toContain("c.table_name = 'bar_refill_items'")
    expect(sql).toContain("c.column_name = 'inventory_item_id'")
  })

  it('returns map total count and workspace/status/resolution grouping', () => {
    expect(sql).toContain('map_total_rows')
    expect(sql).toContain('count(*)::bigint as map_total_rows')
    expect(sql).toContain('group by workspace_id, status, resolution_type')
  })

  it('returns null/non-null stock_item and migrated counts', () => {
    expect(sql).toContain('stock_item_id_null')
    expect(sql).toContain('stock_item_id_present')
    expect(sql).toContain('migrated_at_null')
    expect(sql).toContain('migrated_at_present')
  })

  it('includes deterministic bounded samples', () => {
    expect(sql).toContain('order by created_at asc nulls last, id asc')
    expect(sql).toContain('limit 50')
    expect(sql).toContain('source_snapshot')
  })

  it('analyzes legacy key quality and source_snapshot signals', () => {
    expect(sql).toContain('distinct_legacy_keys')
    expect(sql).toContain('min_legacy_key')
    expect(sql).toContain('max_legacy_key')
    expect(sql).toContain('count(distinct workspace_id)')
    expect(sql).toContain('snapshot_has_id_key')
    expect(sql).toContain('snapshot_id_looks_like_uuid')
    expect(sql).toContain('snapshot_has_item_name')
    expect(sql).toContain('snapshot_has_category')
    expect(sql).toContain('snapshot_has_unit')
    expect(executable).not.toMatch(/legacy_inventory_item_id\s*::\s*uuid/i)
  })

  it('inspects indexes, constraints, triggers, policies, and views', () => {
    expect(sql).toContain('pg_get_indexdef')
    expect(sql).toContain('pg_constraint')
    expect(sql).toContain('pg_get_constraintdef')
    expect(sql).toContain('pg_trigger')
    expect(sql).toContain('pg_policies')
    expect(sql).toContain("c.relkind in ('v', 'm')")
  })

  it('inspects functions and surfaces Persist / Auto-link dependencies', () => {
    expect(sql).toContain('pg_proc')
    expect(sql).toContain('pg_get_functiondef')
    expect(sql).toContain('run_inventory_migration_persist')
    expect(sql).toContain('run_inventory_migration_auto_link')
    expect(sql).toContain('run_inventory_migration_phase1')
    expect(sql).toContain('run_inventory_migration_phase2')
    expect(sql).toContain('complete_inventory_migration_session')
  })

  it('classifies empty versus populated map without claiming ALTER safety', () => {
    expect(sql).toContain('can_use_simple_empty_table_alignment')
    expect(sql).toContain('requires_existing_row_remap_review')
    expect(sql).toContain(
      'MAP EMPTY — UUID ALIGNMENT CAN BE DESIGNED AS AN EMPTY-TABLE SCHEMA MIGRATION',
    )
    expect(sql).toContain(
      'MAP CONTAINS DATA — REVIEW AND REMAP STRATEGY REQUIRED BEFORE UUID ALIGNMENT',
    )
  })

  it('contains no write, schema-mutation, or transaction-control statements', () => {
    expect(executable).not.toMatch(/\binsert\b/i)
    expect(executable).not.toMatch(/\bupdate\b/i)
    expect(executable).not.toMatch(/\bdelete\b/i)
    expect(executable).not.toMatch(/\bmerge\b/i)
    expect(executable).not.toMatch(/\btruncate\b/i)
    expect(executable).not.toMatch(/\balter\b/i)
    expect(executable).not.toMatch(/\bdrop\b/i)
    expect(executable).not.toMatch(/\bcreate\b/i)
    expect(executable).not.toMatch(/\bgrant\b/i)
    expect(executable).not.toMatch(/\brevoke\b/i)
    expect(executable).not.toMatch(/\bcall\b/i)
    expect(executable).not.toMatch(/\bdo\b/i)
    expect(executable).not.toMatch(/\bperform\b/i)
    expect(executable).not.toMatch(/\bbegin\b/i)
    expect(executable).not.toMatch(/\bcommit\b/i)
    expect(executable).not.toMatch(/\brollback\b/i)
  })

  it('does not execute product RPCs', () => {
    expect(executable).not.toMatch(/select\s+\*\s+from\s+public\.run_inventory_migration_/i)
    expect(executable).not.toMatch(/from\s+public\.start_inventory_migration_session\s*\(/i)
    expect(executable).not.toMatch(/from\s+public\.run_inventory_migration_persist\s*\(/i)
    expect(executable).not.toMatch(/from\s+public\.run_inventory_migration_auto_link\s*\(/i)
  })

  it('leaves production Persist and Auto-link RPC files unchanged', () => {
    expect(persistSql).toContain('create or replace function public.run_inventory_migration_persist')
    expect(autoLinkSql).toContain('create or replace function public.run_inventory_migration_auto_link')
    expect(persistSql).not.toContain('P8.6.1f')
    expect(autoLinkSql).not.toContain('P8.6.1f')
  })
})
