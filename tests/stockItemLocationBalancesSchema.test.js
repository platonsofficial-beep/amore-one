// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const sqlPath = join(HERE, '../supabase/stock_item_location_balances_schema.sql')
const stockItemsSqlPath = join(HERE, '../supabase/stock_items_schema.sql')
const movementsSqlPath = join(HERE, '../supabase/stock_movements_schema.sql')
const storagesSqlPath = join(HERE, '../supabase/workspace_storages_schema.sql')
const countSchemaPath = join(HERE, '../supabase/inventory_count_schema.sql')
const importApplyPath = join(HERE, '../supabase/inventory_import_apply_rpc.sql')

const sql = readFileSync(sqlPath, 'utf8')
const stockItemsSql = readFileSync(stockItemsSqlPath, 'utf8')
const movementsSql = readFileSync(movementsSqlPath, 'utf8')
const storagesSql = readFileSync(storagesSqlPath, 'utf8')
const countSchemaSql = readFileSync(countSchemaPath, 'utf8')
const importApplySql = readFileSync(importApplyPath, 'utf8')

describe('stock_item_location_balances_schema.sql — P8.29.2 foundation contract', () => {
  it('creates table with required columns, types, and defaults', () => {
    expect(sql).toContain('create table if not exists public.stock_item_location_balances')
    expect(sql).toContain('id uuid primary key default gen_random_uuid()')
    expect(sql).toContain('workspace_id uuid not null')
    expect(sql).toContain('stock_item_id uuid not null')
    expect(sql).toContain('workspace_storage_id uuid not null')
    expect(sql).toContain('location_key text not null')
    expect(sql).toContain('quantity numeric(12, 3) not null default 0')
    expect(sql).toContain('quantity_version bigint not null default 1')
    expect(sql).toContain('created_at timestamptz not null default now()')
    expect(sql).toContain('updated_at timestamptz not null default now()')
    expect(sql).toContain('updated_by uuid')
  })

  it('documents foreign keys and delete rules', () => {
    expect(sql).toMatch(
      /workspace_id uuid not null\s+references public\.workspaces\(id\) on delete cascade/,
    )
    expect(sql).toMatch(
      /stock_item_id uuid not null\s+references public\.stock_items\(id\) on delete cascade/,
    )
    expect(sql).toMatch(
      /workspace_storage_id uuid not null\s+references public\.workspace_storages\(id\) on delete restrict/,
    )
    expect(sql).toMatch(
      /updated_by uuid\s+references auth\.users\(id\) on delete set null/,
    )
    expect(sql).toContain('on delete cascade')
    expect(sql).toContain('on delete restrict')
    expect(sql).toContain('on delete set null')
  })

  it('rejects blank/padded location_key and caps length at 80', () => {
    expect(sql).toContain('constraint stock_item_location_balances_location_key_chk')
    expect(sql).toContain('location_key = btrim(location_key)')
    expect(sql).toContain('length(location_key) > 0')
    expect(sql).toContain('char_length(location_key) <= 80')
  })

  it('enforces non-negative quantity, version >= 1, and allows zero', () => {
    expect(sql).toContain('constraint stock_item_location_balances_quantity_non_negative_chk')
    expect(sql).toContain('check (quantity >= 0)')
    expect(sql).toContain('constraint stock_item_location_balances_quantity_version_chk')
    expect(sql).toContain('check (quantity_version >= 1)')
    expect(sql).toContain('Zero rows are retained')
    expect(sql).toContain('default 0')
  })

  it('uniquely protects one balance per workspace/item/storage', () => {
    expect(sql).toContain(
      'constraint stock_item_location_balances_workspace_item_storage_uidx',
    )
    expect(sql).toContain('unique (workspace_id, stock_item_id, workspace_storage_id)')
  })

  it('documents cross-workspace FK limitation and defers RPC validation', () => {
    expect(sql).toContain('Cross-workspace integrity note')
    expect(sql).toContain('Simple FKs do not enforce')
    expect(sql).toContain('Authoritative validation belongs to SECURITY DEFINER mutation RPCs (P8.29.5)')
    expect(sql).not.toMatch(/alter\s+table\s+public\.stock_items/i)
    expect(sql).not.toMatch(/alter\s+table\s+public\.workspace_storages/i)
  })

  it('protects identity and location_key from mutation; quantity remains updateable', () => {
    expect(sql).toContain('prevent_stock_item_location_balances_identity_mutation')
    expect(sql).toContain('stock_item_location_balances_workspace_id_immutable')
    expect(sql).toContain('stock_item_location_balances_stock_item_id_immutable')
    expect(sql).toContain('stock_item_location_balances_workspace_storage_id_immutable')
    expect(sql).toContain('stock_item_location_balances_location_key_immutable')
    expect(sql).toContain(
      'before update on public.stock_item_location_balances',
    )
    expect(sql).not.toMatch(/rename.*location_key/i)
    expect(sql).not.toContain('rebind')
  })

  it('uses per-table updated_at trigger convention', () => {
    expect(sql).toContain('set_stock_item_location_balances_updated_at')
    expect(sql).toContain('stock_item_location_balances_set_updated_at')
    expect(sql).toContain('new.updated_at = now()')
  })

  it('indexes storage lookup, count/location lookup, and unique item/storage', () => {
    expect(sql).toContain('stock_item_location_balances_workspace_storage_idx')
    expect(sql).toContain('(workspace_id, workspace_storage_id)')
    expect(sql).toContain('stock_item_location_balances_workspace_location_item_idx')
    expect(sql).toContain('(workspace_id, location_key, stock_item_id)')
    expect(sql).toContain('unique (workspace_id, stock_item_id, workspace_storage_id)')
    expect(sql).toContain('No separate item index')
  })

  it('enables RLS with member SELECT only; no client write policies or grants', () => {
    expect(sql).toMatch(
      /alter table public\.stock_item_location_balances enable row level security/,
    )
    expect(sql).toContain(
      'revoke all on table public.stock_item_location_balances from public',
    )
    expect(sql).toContain(
      'revoke all on table public.stock_item_location_balances from anon',
    )
    expect(sql).toContain(
      'revoke all on table public.stock_item_location_balances from authenticated',
    )
    expect(sql).toContain(
      'grant select on table public.stock_item_location_balances to authenticated',
    )
    expect(sql).not.toMatch(
      /grant select,\s*insert/i,
    )
    expect(sql).not.toMatch(
      /grant\s+.*\b(insert|update|delete)\b.*stock_item_location_balances/i,
    )

    expect(sql).toContain('create policy stock_item_location_balances_select_members')
    expect(sql).toContain('using (public.is_workspace_member(workspace_id))')
    expect(sql).toContain('Intentionally no INSERT policy')
    expect(sql).toContain('Intentionally no UPDATE policy')
    expect(sql).toContain('Intentionally no DELETE policy')
    expect(sql).not.toContain('create policy stock_item_location_balances_insert')
    expect(sql).not.toContain('create policy stock_item_location_balances_update')
    expect(sql).not.toContain('create policy stock_item_location_balances_delete')
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i)
    expect(sql).not.toMatch(/to anon,/i)
  })

  it('includes is_workspace_member for self-contained apply', () => {
    expect(sql).toContain('create or replace function public.is_workspace_member')
    expect(sql).toContain('grant execute on function public.is_workspace_member(uuid) to authenticated')
  })

  it('does not soft-delete, archive, supplier, movement, or import fields', () => {
    expect(sql).not.toMatch(/\bactive\s+boolean/i)
    expect(sql).not.toMatch(/\barchived\b/i)
    expect(sql).not.toMatch(/\bsupplier/i)
    expect(sql).not.toMatch(/\btransfer_group/i)
    expect(sql).not.toMatch(/\bimport_session/i)
    expect(sql).not.toMatch(/\borigin_workflow/i)
  })

  it('does not backfill, sync aggregates, or create mutation RPCs', () => {
    expect(sql).not.toMatch(/insert\s+into\s+public\.stock_item_location_balances/i)
    expect(sql).not.toMatch(/from\s+public\.stock_items/i)
    expect(sql).not.toMatch(/current_quantity\s*=/i)
    expect(sql).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.(adjust|mutate|transfer|receive|upsert).*balance/i,
    )
    expect(sql).not.toContain('repair_stock_item_quantity_cache')
    expect(sql).toContain('Empty until P8.29.4 backfill')
  })

  it('does not mutate stock_items, movements, storages, Count, or Import schemas', () => {
    expect(sql).not.toMatch(/alter\s+table\s+public\.stock_items/i)
    expect(sql).not.toMatch(/alter\s+table\s+public\.stock_movements/i)
    expect(sql).not.toMatch(/alter\s+table\s+public\.workspace_storages/i)
    expect(sql).not.toContain('build_inventory_count_snapshot')
    expect(sql).not.toContain('inventory_count_session')
    expect(sql).not.toContain('inventory_import')

    expect(stockItemsSql).toContain('current_quantity numeric(12, 3) not null default 0')
    expect(stockItemsSql).toContain("storage_location text not null default 'Main Storage'")
    expect(movementsSql).toContain('create table if not exists public.stock_movements')
    expect(storagesSql).toContain('create table if not exists public.workspace_storages')
    expect(countSchemaSql).toContain('inventory_count_sessions')
    expect(importApplySql).toMatch(/inventory_import|apply/i)
  })
})
