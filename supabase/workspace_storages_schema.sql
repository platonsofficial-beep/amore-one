-- =============================================================================
-- P8.26.1 — Workspace Storages Schema & RLS Foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor.
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Canonical workspace-owned storage catalog for Stock V1.
--   Operational exact key remains stock_items.storage_location (unchanged here).
--   Inventory Count continues exact-string matching against that column.
--
-- Contract:
--   P8.26.0 — Workspace Storage Architecture Lock
--
-- This script:
--   - Creates public.workspace_storages
--   - Adds CHECKs, uniques, indexes, updated_at trigger, grants, RLS
--
-- Does NOT:
--   - Mutate stock_items / add a catalog FK on items
--   - Touch Inventory Count snapshot RPCs
--   - Create create/archive/rename RPCs
--   - Seed hard-coded location presets or backfill existing item keys
--   - Allow client DELETE (no delete policy; no delete grant)
--
-- Prerequisites:
--   1. public.workspaces exists
--   2. auth.users exists
--   3. public.workspace_members exists
--   4. public.is_workspace_member / can_manage_workspace_stock (ensured below)
-- =============================================================================

-- Ensure Stock permission helpers exist (idempotent; same bodies as stock_rls_policies).
create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.auth_user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_workspace_stock(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.auth_user_id = auth.uid()
      and wm.role in ('owner', 'general_manager', 'manager')
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.can_manage_workspace_stock(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_manage_workspace_stock(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Table: workspace_storages
-- -----------------------------------------------------------------------------
create table if not exists public.workspace_storages (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  -- Exact operational key written to stock_items.storage_location.
  -- Immutable after insert (enforced by trigger below).
  location_key text not null
    constraint workspace_storages_location_key_chk
      check (
        location_key = btrim(location_key)
        and length(location_key) > 0
        and char_length(location_key) <= 80
      ),

  -- V1: display name equals location_key (no dual-identity drift).
  name text not null
    constraint workspace_storages_name_chk
      check (
        name = btrim(name)
        and length(name) > 0
        and char_length(name) <= 80
      ),

  -- Duplicate prevention only (case-insensitive). Not used for Count matching.
  name_normalized text generated always as (lower(btrim(name))) stored not null,

  sort_order integer not null default 0,
  active boolean not null default true,

  created_by uuid
    references auth.users(id) on delete set null,
  updated_by uuid
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workspace_storages_name_equals_location_key_chk
    check (name = location_key),

  constraint workspace_storages_workspace_location_key_uidx
    unique (workspace_id, location_key),

  constraint workspace_storages_workspace_name_normalized_uidx
    unique (workspace_id, name_normalized)
);

comment on table public.workspace_storages is
  'P8.26.1 Workspace-owned storage catalog. location_key is the exact operational string for stock_items.storage_location and Inventory Count; no fuzzy matching.';

comment on column public.workspace_storages.location_key is
  'Immutable exact operational key. Must match stock_items.storage_location for Count discovery/snapshot.';

comment on column public.workspace_storages.name is
  'User-facing display name. V1 requires name = location_key.';

comment on column public.workspace_storages.name_normalized is
  'lower(btrim(name)) for case-insensitive uniqueness only. Never used for Inventory Count matching.';

comment on column public.workspace_storages.active is
  'true = selectable for new items/imports; false = archived. Archive preconditions are a future RPC concern.';

-- Listing / ordered display
create index if not exists workspace_storages_workspace_active_sort_name_idx
  on public.workspace_storages (workspace_id, active, sort_order, name);

create index if not exists workspace_storages_workspace_id_idx
  on public.workspace_storages (workspace_id);

-- -----------------------------------------------------------------------------
-- Immutability: location_key and workspace_id cannot change after insert
-- -----------------------------------------------------------------------------
create or replace function public.prevent_workspace_storages_key_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'workspace_storages_workspace_id_immutable';
  end if;
  if new.location_key is distinct from old.location_key then
    raise exception 'workspace_storages_location_key_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists workspace_storages_prevent_key_mutation
  on public.workspace_storages;

create trigger workspace_storages_prevent_key_mutation
  before update on public.workspace_storages
  for each row
  execute function public.prevent_workspace_storages_key_mutation();

-- -----------------------------------------------------------------------------
-- updated_at trigger (per-table function; repository convention)
-- -----------------------------------------------------------------------------
create or replace function public.set_workspace_storages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspace_storages_set_updated_at
  on public.workspace_storages;

create trigger workspace_storages_set_updated_at
  before update on public.workspace_storages
  for each row
  execute function public.set_workspace_storages_updated_at();

-- -----------------------------------------------------------------------------
-- Privileges + RLS
-- -----------------------------------------------------------------------------
alter table public.workspace_storages enable row level security;

revoke all on table public.workspace_storages from public;
revoke all on table public.workspace_storages from anon;
revoke all on table public.workspace_storages from authenticated;

-- V1: no client DELETE. Archive will flip active via UPDATE / future RPC.
grant select, insert, update on table public.workspace_storages to authenticated;

drop policy if exists workspace_storages_select_members
  on public.workspace_storages;
create policy workspace_storages_select_members
  on public.workspace_storages
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_storages_insert_managers
  on public.workspace_storages;
create policy workspace_storages_insert_managers
  on public.workspace_storages
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists workspace_storages_update_managers
  on public.workspace_storages;
create policy workspace_storages_update_managers
  on public.workspace_storages
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

-- Intentionally no DELETE policy: permanent delete is out of V1.

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================
-- select to_regclass('public.workspace_storages');
-- select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename = 'workspace_storages';
-- select policyname, cmd
--   from pg_policies
--   where tablename = 'workspace_storages'
--   order by policyname;
-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop trigger if exists workspace_storages_set_updated_at on public.workspace_storages;
-- drop trigger if exists workspace_storages_prevent_key_mutation on public.workspace_storages;
-- drop function if exists public.set_workspace_storages_updated_at();
-- drop function if exists public.prevent_workspace_storages_key_mutation();
-- drop table if exists public.workspace_storages;
