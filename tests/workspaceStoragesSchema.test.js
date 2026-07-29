// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const sqlPath = join(HERE, '../supabase/workspace_storages_schema.sql')
const stockItemsSqlPath = join(HERE, '../supabase/stock_items_schema.sql')
const sql = readFileSync(sqlPath, 'utf8')
const stockItemsSql = readFileSync(stockItemsSqlPath, 'utf8')

describe('workspace_storages_schema.sql — P8.26.1 foundation contract', () => {
  it('creates workspace_storages with required columns and workspace FK cascade', () => {
    expect(sql).toContain('create table if not exists public.workspace_storages')
    expect(sql).toContain('id uuid primary key default gen_random_uuid()')
    expect(sql).toMatch(
      /workspace_id uuid not null\s+references public\.workspaces\(id\) on delete cascade/,
    )
    expect(sql).toContain('location_key text not null')
    expect(sql).toContain('name text not null')
    expect(sql).toContain(
      'name_normalized text generated always as (lower(btrim(name))) stored not null',
    )
    expect(sql).toContain('sort_order integer not null default 0')
    expect(sql).toContain('active boolean not null default true')
    expect(sql).toContain('created_by uuid')
    expect(sql).toContain('updated_by uuid')
    expect(sql).toContain('created_at timestamptz not null default now()')
    expect(sql).toContain('updated_at timestamptz not null default now()')
    expect(sql).toMatch(
      /created_by uuid\s+references auth\.users\(id\) on delete set null/,
    )
    expect(sql).toMatch(
      /updated_by uuid\s+references auth\.users\(id\) on delete set null/,
    )
  })

  it('rejects blank and outer-padded keys/names and caps length at 80', () => {
    expect(sql).toContain('constraint workspace_storages_location_key_chk')
    expect(sql).toContain('location_key = btrim(location_key)')
    expect(sql).toContain('length(location_key) > 0')
    expect(sql).toContain('char_length(location_key) <= 80')

    expect(sql).toContain('constraint workspace_storages_name_chk')
    expect(sql).toContain('name = btrim(name)')
    expect(sql).toContain('length(name) > 0')
    expect(sql).toContain('char_length(name) <= 80')
  })

  it('locks V1 name = location_key and case-insensitive uniqueness', () => {
    expect(sql).toContain('constraint workspace_storages_name_equals_location_key_chk')
    expect(sql).toContain('check (name = location_key)')
    expect(sql).toContain('unique (workspace_id, location_key)')
    expect(sql).toContain('unique (workspace_id, name_normalized)')
    expect(sql).toContain('lower(btrim(name))')
    expect(sql).toContain('case-insensitive uniqueness')
  })

  it('indexes workspace listing by active, sort_order, and name', () => {
    expect(sql).toContain('workspace_storages_workspace_active_sort_name_idx')
    expect(sql).toContain('(workspace_id, active, sort_order, name)')
  })

  it('protects location_key and workspace_id from mutation', () => {
    expect(sql).toContain('prevent_workspace_storages_key_mutation')
    expect(sql).toContain('workspace_storages_location_key_immutable')
    expect(sql).toContain('workspace_storages_workspace_id_immutable')
    expect(sql).toContain('before update on public.workspace_storages')
  })

  it('uses per-table updated_at trigger convention', () => {
    expect(sql).toContain('set_workspace_storages_updated_at')
    expect(sql).toContain('workspace_storages_set_updated_at')
    expect(sql).toContain('new.updated_at = now()')
  })

  it('enables RLS with member SELECT and manager INSERT/UPDATE only', () => {
    expect(sql).toMatch(
      /alter table public\.workspace_storages enable row level security/,
    )
    expect(sql).toContain('revoke all on table public.workspace_storages from public')
    expect(sql).toContain('revoke all on table public.workspace_storages from anon')
    expect(sql).toContain('revoke all on table public.workspace_storages from authenticated')
    expect(sql).toContain(
      'grant select, insert, update on table public.workspace_storages to authenticated',
    )
    expect(sql).not.toMatch(
      /grant select, insert, update, delete on table public\.workspace_storages/i,
    )

    expect(sql).toContain('create policy workspace_storages_select_members')
    expect(sql).toContain('using (public.is_workspace_member(workspace_id))')
    expect(sql).toContain('create policy workspace_storages_insert_managers')
    expect(sql).toContain('with check (public.can_manage_workspace_stock(workspace_id))')
    expect(sql).toContain('create policy workspace_storages_update_managers')
    expect(sql).toMatch(
      /create policy workspace_storages_update_managers[\s\S]*using \(public\.can_manage_workspace_stock\(workspace_id\)\)[\s\S]*with check \(public\.can_manage_workspace_stock\(workspace_id\)\)/,
    )

    expect(sql).not.toContain('create policy workspace_storages_delete')
    expect(sql).toContain('Intentionally no DELETE policy')
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i)
    expect(sql).not.toMatch(/to anon,/i)
  })

  it('includes stock permission helpers for self-contained apply', () => {
    expect(sql).toContain('create or replace function public.is_workspace_member')
    expect(sql).toContain('create or replace function public.can_manage_workspace_stock')
    expect(sql).toContain("'owner', 'general_manager', 'manager'")
  })

  it('does not mutate stock_items or add a catalog FK on items', () => {
    expect(sql).not.toMatch(/alter\s+table\s+public\.stock_items/i)
    expect(sql).not.toMatch(/\bstorage_id\b/)
    expect(stockItemsSql).not.toMatch(/\bstorage_id\b/)
    expect(stockItemsSql).toContain("storage_location text not null default 'Main Storage'")
  })

  it('does not create create/archive/rename RPCs or seed/backfill', () => {
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.create_workspace_storage/i)
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.archive_workspace_storage/i)
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.rename_workspace_storage/i)
    expect(sql).not.toMatch(/\bSTOCK_LOCATIONS\b/)
    expect(sql).not.toMatch(/insert\s+into\s+public\.workspace_storages/i)
    expect(sql).not.toMatch(/from\s+public\.stock_items/i)
    expect(sql).not.toContain('build_inventory_count_snapshot')
    expect(sql).not.toContain('inventory_count_session_locations')
  })
})
