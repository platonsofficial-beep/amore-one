// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const sqlPath = join(HERE, '../supabase/stock_item_location_balances_backfill.sql')
const balancesSchemaPath = join(HERE, '../supabase/stock_item_location_balances_schema.sql')
const stockItemsPath = join(HERE, '../supabase/stock_items_schema.sql')
const movementsPath = join(HERE, '../supabase/stock_movements_schema.sql')
const storagesBackfillPath = join(HERE, '../supabase/workspace_storages_backfill.sql')

const sql = readFileSync(sqlPath, 'utf8')
const balancesSchema = readFileSync(balancesSchemaPath, 'utf8')
const stockItemsSql = readFileSync(stockItemsPath, 'utf8')
const movementsSql = readFileSync(movementsPath, 'utf8')
const storagesBackfill = readFileSync(storagesBackfillPath, 'utf8')

function stripSqlComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
}

const executableSql = stripSqlComments(sql)

describe('stock_item_location_balances_backfill.sql — P8.29.4 contract', () => {
  it('creates exactly one balance per stock item from current_quantity + storage_location', () => {
    expect(sql).toContain('insert into public.stock_item_location_balances')
    expect(sql).toContain('from public.stock_items si')
    expect(sql).toContain('si.current_quantity as quantity')
    expect(sql).toContain('si.id as stock_item_id')
    expect(sql).toContain('Exactly one balance per item')
    expect(sql).toContain('1::bigint as quantity_version')
  })

  it('resolves storage via exact workspace_id + location_key match', () => {
    expect(sql).toContain('inner join public.workspace_storages ws')
    expect(sql).toContain('ws.workspace_id = si.workspace_id')
    expect(sql).toContain('ws.location_key = si.storage_location')
    expect(sql).toContain('ws.id as workspace_storage_id')
    expect(sql).toContain('ws.location_key')
    expect(sql).toContain('NEVER invent')
  })

  it('is idempotent with ON CONFLICT DO NOTHING', () => {
    expect(sql).toContain(
      'on conflict (workspace_id, stock_item_id, workspace_storage_id) do nothing',
    )
    expect(sql).toContain('idempotent')
    expect(sql).toContain('does not rewrite quantity on re-run')
  })

  it('fails loudly when workspace storage is missing', () => {
    expect(sql).toContain('v_missing_storage')
    expect(sql).toContain('no matching workspace_storages.location_key')
    expect(sql).toContain('Refusing to invent storages')
    expect(sql).toContain('Refusing to invent storages or create orphan balances')
    expect(executableSql).not.toMatch(/insert\s+into\s+public\.workspace_storages/i)
  })

  it('rejects missing workspace, invalid keys, and negative quantities before insert', () => {
    expect(sql).toContain('v_missing_workspace')
    expect(sql).toContain('reference a missing workspace')
    expect(sql).toContain('v_invalid_key')
    expect(sql).toContain('null/blank/padded/over-length storage_location')
    expect(sql).toContain('v_negative_qty')
    expect(sql).toContain('negative current_quantity')
    expect(sql).toContain('$p8294_precheck$')
  })

  it('protects against duplicate balance targets and incomplete coverage', () => {
    expect(sql).toContain('exactly one balance')
    expect(sql).toContain('v_items_without_one_balance')
    expect(sql).toContain('v_duplicate_item_balances')
    expect(sql).toContain('Duplicate balance target detected')
    expect(sql).toContain('having count(*) > 1')
  })

  it('includes aggregate verification: SUM(balances) == current_quantity', () => {
    expect(sql).toContain('SUM(location balances) == stock_items.current_quantity')
    expect(sql).toContain('v_aggregate_mismatches')
    expect(sql).toContain('coalesce(sum(b.quantity), 0)')
    expect(sql).toContain('SUM(balances) <> current_quantity')
    expect(sql).toContain('current_quantity was not updated')
    expect(sql).toContain('balance_sum')
    expect(sql).toContain('as drift')
  })

  it('does not mutate stock_items or create movements', () => {
    expect(executableSql).not.toMatch(/update\s+public\.stock_items/i)
    expect(executableSql).not.toMatch(/delete\s+from\s+public\.stock_items/i)
    expect(executableSql).not.toMatch(/insert\s+into\s+public\.stock_movements/i)
    expect(executableSql).not.toMatch(/update\s+public\.stock_movements/i)
    expect(sql).toContain('NEVER mutate stock_items.current_quantity')
    expect(sql).toContain('NEVER insert stock_movements')
  })

  it('does not cut over Count, Import, Dashboard, or services', () => {
    expect(executableSql).not.toMatch(/inventory_count_/i)
    expect(executableSql).not.toMatch(/inventory_import/i)
    expect(sql).toContain('Does NOT')
    expect(sql).toContain('cut over runtime')
    expect(sql).not.toContain('create or replace function')
  })

  it('runs backfill inside a transaction with precheck and verify blocks', () => {
    expect(sql).toMatch(/\bbegin;/i)
    expect(sql).toMatch(/\bcommit;/i)
    expect(sql).toContain('$p8294_precheck$')
    expect(sql).toContain('$p8294_verify$')
    expect(sql).toContain('Failure rolls back; no orphan balances')
  })

  it('leaves companion schemas and storage backfill conventions intact', () => {
    expect(balancesSchema).toContain('create table if not exists public.stock_item_location_balances')
    expect(balancesSchema).toContain(
      'unique (workspace_id, stock_item_id, workspace_storage_id)',
    )
    expect(stockItemsSql).toContain('current_quantity numeric(12, 3) not null default 0')
    expect(stockItemsSql).toContain("storage_location text not null default 'Main Storage'")
    expect(movementsSql).toContain('create table if not exists public.stock_movements')
    expect(storagesBackfill).toContain('insert into public.workspace_storages')
    expect(storagesBackfill).toContain('on conflict (workspace_id, location_key) do nothing')
  })
})
