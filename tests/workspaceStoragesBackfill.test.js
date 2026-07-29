// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const sqlPath = join(HERE, '../supabase/workspace_storages_backfill.sql')
const sql = readFileSync(sqlPath, 'utf8')

function stripSqlComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
}

const executableSql = stripSqlComments(sql)

describe('workspace_storages_backfill.sql — P8.26.4 contract', () => {
  it('extracts distinct stock_items.storage_location per workspace', () => {
    expect(sql).toContain('from public.stock_items')
    expect(sql).toContain('si.storage_location')
    expect(sql).toMatch(/select distinct[\s\S]*si\.storage_location as location_key/)
    expect(sql).toContain('group by si.workspace_id, w.slug, si.storage_location')
  })

  it('ignores NULL and empty-after-trim keys', () => {
    expect(sql).toContain('si.storage_location is not null')
    expect(sql).toContain('length(btrim(si.storage_location)) > 0')
  })

  it('preserves exact operational keys without lowercase/merge/rename', () => {
    expect(sql).toContain('preserve exact')
    expect(sql).toContain('su.location_key as name')
    expect(sql).toContain('V1: name == location_key')
    expect(executableSql).not.toMatch(/lower\s*\(\s*si\.storage_location\s*\)\s+as location_key/i)
    expect(executableSql).not.toMatch(/update\s+public\.stock_items/i)
    expect(sql).not.toContain('rename_workspace_storage')
    expect(sql).not.toMatch(/set\s+location_key\s*=/i)
  })

  it('uses idempotent inserts with on conflict do nothing', () => {
    expect(sql).toMatch(/insert into public\.workspace_storages/i)
    expect(sql).toContain('on conflict (workspace_id, location_key) do nothing')
    expect(executableSql.match(/insert into public\.workspace_storages/gi)?.length).toBe(2)
  })

  it('does not mutate stock_items or Inventory Count tables', () => {
    expect(executableSql).not.toMatch(/update\s+public\.stock_items/i)
    expect(executableSql).not.toMatch(/delete\s+from\s+public\.stock_items/i)
    expect(executableSql).not.toMatch(/update\s+public\.inventory_count_/i)
    expect(executableSql).not.toMatch(/delete\s+from\s+public\.inventory_count_/i)
    expect(executableSql).not.toMatch(/insert\s+into\s+public\.inventory_count_/i)
    expect(sql).toContain('NEVER rewrites stock_items')
    expect(sql).toContain('Inventory Count tables')
  })

  it('includes case-collision and outer-whitespace verification selects', () => {
    expect(sql).toContain('Case-only collisions')
    expect(sql).toContain('count(distinct si.storage_location)')
    expect(sql).toContain('lower(btrim(si.storage_location)) as name_normalized')
    expect(sql).toContain('having count(distinct si.storage_location) > 1')
    expect(sql).toContain('Outer-whitespace variants')
    expect(sql).toContain(
      'si.storage_location is distinct from btrim(si.storage_location)',
    )
    expect(sql).toContain('Manual review required')
    expect(sql).toContain('do NOT auto-merge')
  })

  it('skips case-collision groups from automatic insert', () => {
    expect(sql).toContain('exact_key_count = 1')
    expect(sql).toContain('Collision groups are skipped')
  })

  it('seeds STOCK_LOCATIONS templates only for empty workspaces', () => {
    expect(sql).toContain('OPTIONAL DEFAULT SEED')
    expect(sql).toContain("'Main Storage'")
    expect(sql).toContain("'Bar'")
    expect(sql).toContain("'Kitchen'")
    expect(sql).toContain("'Other'")
    expect(sql).toMatch(
      /where not exists \(\s*select 1\s*from public\.workspace_storages ws\s*where ws\.workspace_id = w\.id\s*\)/i,
    )
  })

  it('contains no rename / archive / create RPC logic', () => {
    expect(sql).not.toContain('create_workspace_storage')
    expect(sql).not.toContain('archive_workspace_storage')
    expect(sql).not.toContain('rename_workspace_storage')
    expect(sql).not.toContain('delete_workspace_storage')
  })
})
