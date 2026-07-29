// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const extensionPath = join(HERE, '../supabase/stock_movements_location_extension.sql')
const basePath = join(HERE, '../supabase/stock_movements_schema.sql')
const stockCountTypePath = join(HERE, '../supabase/stock_movements_stock_count.sql')
const balancesPath = join(HERE, '../supabase/stock_item_location_balances_schema.sql')
const stockItemsPath = join(HERE, '../supabase/stock_items_schema.sql')
const countPostPath = join(HERE, '../supabase/inventory_count_post_finish_rpc.sql')
const importApplyPath = join(HERE, '../supabase/inventory_import_apply_rpc.sql')
const rlsPath = join(HERE, '../supabase/stock_rls_policies.sql')

const sql = readFileSync(extensionPath, 'utf8')
const baseSql = readFileSync(basePath, 'utf8')
const stockCountTypeSql = readFileSync(stockCountTypePath, 'utf8')
const balancesSql = readFileSync(balancesPath, 'utf8')
const stockItemsSql = readFileSync(stockItemsPath, 'utf8')
const countPostSql = readFileSync(countPostPath, 'utf8')
const importApplySql = readFileSync(importApplyPath, 'utf8')
const rlsSql = readFileSync(rlsPath, 'utf8')

describe('stock_movements_location_extension.sql — P8.29.3 schema contract', () => {
  it('adds required nullable location / transfer / origin columns', () => {
    expect(sql).toContain('add column if not exists source_workspace_storage_id uuid')
    expect(sql).toContain('add column if not exists destination_workspace_storage_id uuid')
    expect(sql).toContain('add column if not exists source_location_key text')
    expect(sql).toContain('add column if not exists destination_location_key text')
    expect(sql).toContain('add column if not exists transfer_group_id uuid')
    expect(sql).toContain('add column if not exists origin_workflow text')
    expect(sql).toContain('add column if not exists origin_ref_id uuid')
  })

  it('FKs storage ids to workspace_storages with ON DELETE RESTRICT', () => {
    expect(sql).toMatch(
      /source_workspace_storage_id uuid\s+references public\.workspace_storages\(id\) on delete restrict/,
    )
    expect(sql).toMatch(
      /destination_workspace_storage_id uuid\s+references public\.workspace_storages\(id\) on delete restrict/,
    )
    expect(sql).not.toMatch(
      /workspace_storages\(id\) on delete cascade/i,
    )
  })

  it('keeps existing movement types and adds transfer_out / transfer_in', () => {
    expect(sql).toContain('drop constraint if exists stock_movements_type_check')
    expect(sql).toContain('add constraint stock_movements_type_check')
    expect(sql).toContain("'receive'")
    expect(sql).toContain("'usage'")
    expect(sql).toContain("'adjustment'")
    expect(sql).toContain("'stock_count'")
    expect(sql).toContain("'transfer_out'")
    expect(sql).toContain("'transfer_in'")
  })

  it('constrains origin_workflow with CHECK including null', () => {
    expect(sql).toContain('constraint stock_movements_origin_workflow_chk')
    expect(sql).toContain('origin_workflow is null')
    expect(sql).toContain("'manual'")
    expect(sql).toContain("'order_receive'")
    expect(sql).toContain("'inventory_count_post'")
    expect(sql).toContain("'inventory_count_correction'")
    expect(sql).toContain("'inventory_count_reversal'")
    expect(sql).toContain("'spreadsheet_import'")
    expect(sql).toContain("'transfer'")
    expect(sql).toContain("'migration'")
    expect(sql).toContain("'repair'")
    expect(sql).not.toMatch(/create\s+type\s+/i)
  })

  it('constrains location keys when present: trimmed, non-empty, <=80', () => {
    expect(sql).toContain('constraint stock_movements_source_location_key_chk')
    expect(sql).toContain('constraint stock_movements_destination_location_key_chk')
    expect(sql).toContain('source_location_key is null')
    expect(sql).toContain('destination_location_key is null')
    expect(sql).toContain('source_location_key = btrim(source_location_key)')
    expect(sql).toContain('destination_location_key = btrim(destination_location_key)')
    expect(sql).toContain('length(source_location_key) > 0')
    expect(sql).toContain('length(destination_location_key) > 0')
    expect(sql).toContain('char_length(source_location_key) <= 80')
    expect(sql).toContain('char_length(destination_location_key) <= 80')
  })

  it('indexes workspace+source, workspace+destination, and transfer_group_id', () => {
    expect(sql).toContain('stock_movements_workspace_source_storage_idx')
    expect(sql).toContain('(workspace_id, source_workspace_storage_id)')
    expect(sql).toContain('stock_movements_workspace_destination_storage_idx')
    expect(sql).toContain('(workspace_id, destination_workspace_storage_id)')
    expect(sql).toContain('stock_movements_transfer_group_idx')
    expect(sql).toContain('(transfer_group_id)')
  })

  it('does not enforce transfer_group_id for transfer types yet', () => {
    expect(sql).toContain('Required by future transfer RPC only')
    expect(sql).not.toMatch(
      /check\s*\(\s*transfer_group_id\s+is\s+not\s+null/i,
    )
    expect(sql).not.toMatch(
      /type\s+in\s*\(\s*'transfer_out'[\s\S]*transfer_group_id/i,
    )
  })

  it('does not populate fields or change writers / RLS', () => {
    expect(sql).not.toMatch(/update\s+public\.stock_movements\s+set/i)
    expect(sql).not.toMatch(/insert\s+into\s+public\.stock_movements/i)
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function/i)
    expect(sql).not.toMatch(/create\s+policy/i)
    expect(sql).not.toMatch(/grant\s+/i)
    expect(sql).toContain('Does NOT')
    expect(sql).toContain('Change RLS or grants')
  })

  it('leaves base movement columns and companion schemas structurally intact', () => {
    expect(baseSql).toContain('create table if not exists public.stock_movements')
    expect(baseSql).toContain('workspace_id uuid not null')
    expect(baseSql).toContain('item_id uuid not null')
    expect(baseSql).toContain('type text not null')
    expect(baseSql).toContain('quantity numeric(12, 3) not null')
    expect(baseSql).toContain('note text not null default')
    expect(baseSql).toContain('created_by uuid')
    expect(baseSql).toContain('created_at timestamptz not null default now()')
    expect(baseSql).not.toContain('source_workspace_storage_id')
    expect(baseSql).not.toContain('transfer_group_id')

    expect(stockCountTypeSql).toContain("'stock_count'")
    expect(balancesSql).toContain('create table if not exists public.stock_item_location_balances')
    expect(stockItemsSql).toContain('current_quantity numeric(12, 3) not null default 0')
    expect(countPostSql).toContain('insert into public.stock_movements')
    expect(importApplySql).toContain('insert into public.stock_movements')
    expect(rlsSql).toContain('grant select, insert on table public.stock_movements')
  })

  it('does not mutate balances, stock_items, Count, or Import in this file', () => {
    expect(sql).not.toMatch(/alter\s+table\s+public\.stock_item_location_balances/i)
    expect(sql).not.toMatch(/alter\s+table\s+public\.stock_items/i)
    expect(sql).not.toMatch(/alter\s+table\s+public\.inventory_count/i)
    expect(sql).not.toContain('inventory_import')
    expect(sql).not.toContain('build_inventory_count_snapshot')
  })
})
