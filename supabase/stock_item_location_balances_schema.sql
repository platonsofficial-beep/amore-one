-- =============================================================================
-- P8.29.2 — Location Balance Schema & RLS Foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor.
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Authoritative per-location quantity store foundation for multi-location Stock.
--   Table remains empty until P8.29.4 backfill. No runtime cutover in this sprint.
--
-- Contract:
--   P8.29.1 — Multi-Location Product Contract Lock
--
-- This script:
--   - Creates public.stock_item_location_balances
--   - Adds CHECKs, unique, indexes, immutability + updated_at triggers, grants, RLS
--
-- Does NOT:
--   - Backfill rows or mutate stock_items.current_quantity / storage_location
--   - Extend stock_movements
--   - Create balance mutation / transfer / aggregate-sync RPCs or triggers
--   - Touch Inventory Count or Spreadsheet Import
--   - Allow client INSERT / UPDATE / DELETE (no write policies; SELECT grant only)
--
-- Prerequisites:
--   1. public.workspaces exists
--   2. public.stock_items exists
--   3. public.workspace_storages exists
--   4. auth.users exists
--   5. public.workspace_members exists
--   6. public.is_workspace_member (ensured below)
--
-- Cross-workspace integrity note:
--   Simple FKs do not enforce that balance.workspace_id matches
--   stock_items.workspace_id and workspace_storages.workspace_id.
--   Composite FKs would require unique rewrites on parent tables — deferred.
--   Authoritative validation belongs to SECURITY DEFINER mutation RPCs (P8.29.5).
-- =============================================================================

-- Ensure Stock permission helper exists (idempotent; same body as stock_rls_policies).
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

revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Table: stock_item_location_balances
-- -----------------------------------------------------------------------------
create table if not exists public.stock_item_location_balances (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  stock_item_id uuid not null
    references public.stock_items(id) on delete cascade,

  -- Product V1 forbids hard-delete of storages; RESTRICT fails loudly if attempted
  -- while balances exist. Permanent storage delete remains unsupported.
  workspace_storage_id uuid not null
    references public.workspace_storages(id) on delete restrict,

  -- Exact operational key snapshot from workspace_storages.location_key at bind time.
  -- Immutable after insert (enforced by trigger below). Not fuzzy-normalized.
  location_key text not null
    constraint stock_item_location_balances_location_key_chk
      check (
        location_key = btrim(location_key)
        and length(location_key) > 0
        and char_length(location_key) <= 80
      ),

  quantity numeric(12, 3) not null default 0
    constraint stock_item_location_balances_quantity_non_negative_chk
      check (quantity >= 0),

  quantity_version bigint not null default 1
    constraint stock_item_location_balances_quantity_version_chk
      check (quantity_version >= 1),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  updated_by uuid
    references auth.users(id) on delete set null,

  constraint stock_item_location_balances_workspace_item_storage_uidx
    unique (workspace_id, stock_item_id, workspace_storage_id)
);

comment on table public.stock_item_location_balances is
  'P8.29.2 Per-location stock balances. Authoritative quantity per (item, storage). Empty until P8.29.4 backfill; mutations via future SECURITY DEFINER RPCs only.';

comment on column public.stock_item_location_balances.location_key is
  'Immutable exact operational key snapshot of workspace_storages.location_key. Not case-folded; not fuzzy-normalized.';

comment on column public.stock_item_location_balances.quantity is
  'Authoritative non-negative quantity at this location. Zero rows are retained; no auto-delete at zero.';

comment on column public.stock_item_location_balances.quantity_version is
  'Optimistic concurrency token for future balance mutation RPCs. Starts at 1.';

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
-- Unique constraint already provides (workspace_id, stock_item_id, workspace_storage_id)
-- and supports item lookup prefix (workspace_id, stock_item_id). No separate item index.

create index if not exists stock_item_location_balances_workspace_storage_idx
  on public.stock_item_location_balances (workspace_id, workspace_storage_id);

create index if not exists stock_item_location_balances_workspace_location_item_idx
  on public.stock_item_location_balances (workspace_id, location_key, stock_item_id);

-- -----------------------------------------------------------------------------
-- Immutability: identity + location_key cannot change after insert
-- -----------------------------------------------------------------------------
create or replace function public.prevent_stock_item_location_balances_identity_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'stock_item_location_balances_workspace_id_immutable';
  end if;
  if new.stock_item_id is distinct from old.stock_item_id then
    raise exception 'stock_item_location_balances_stock_item_id_immutable';
  end if;
  if new.workspace_storage_id is distinct from old.workspace_storage_id then
    raise exception 'stock_item_location_balances_workspace_storage_id_immutable';
  end if;
  if new.location_key is distinct from old.location_key then
    raise exception 'stock_item_location_balances_location_key_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists stock_item_location_balances_prevent_identity_mutation
  on public.stock_item_location_balances;

create trigger stock_item_location_balances_prevent_identity_mutation
  before update on public.stock_item_location_balances
  for each row
  execute function public.prevent_stock_item_location_balances_identity_mutation();

-- -----------------------------------------------------------------------------
-- updated_at trigger (per-table function; repository convention)
-- -----------------------------------------------------------------------------
create or replace function public.set_stock_item_location_balances_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stock_item_location_balances_set_updated_at
  on public.stock_item_location_balances;

create trigger stock_item_location_balances_set_updated_at
  before update on public.stock_item_location_balances
  for each row
  execute function public.set_stock_item_location_balances_updated_at();

-- -----------------------------------------------------------------------------
-- Privileges + RLS
-- -----------------------------------------------------------------------------
alter table public.stock_item_location_balances enable row level security;

revoke all on table public.stock_item_location_balances from public;
revoke all on table public.stock_item_location_balances from anon;
revoke all on table public.stock_item_location_balances from authenticated;

-- SELECT only. Quantity writes will be SECURITY DEFINER RPCs (P8.29.5+).
-- No INSERT / UPDATE / DELETE grants or policies for authenticated clients.
grant select on table public.stock_item_location_balances to authenticated;

drop policy if exists stock_item_location_balances_select_members
  on public.stock_item_location_balances;
create policy stock_item_location_balances_select_members
  on public.stock_item_location_balances
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- Intentionally no INSERT policy: client cannot create balance rows.
-- Intentionally no UPDATE policy: client cannot mutate balances.
-- Intentionally no DELETE policy: permanent item delete will cascade via FK;
--   client cannot delete balance rows directly.

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================
-- select to_regclass('public.stock_item_location_balances');
-- select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename = 'stock_item_location_balances';
-- select policyname, cmd
--   from pg_policies
--   where tablename = 'stock_item_location_balances'
--   order by policyname;
-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop trigger if exists stock_item_location_balances_set_updated_at
--   on public.stock_item_location_balances;
-- drop trigger if exists stock_item_location_balances_prevent_identity_mutation
--   on public.stock_item_location_balances;
-- drop function if exists public.set_stock_item_location_balances_updated_at();
-- drop function if exists public.prevent_stock_item_location_balances_identity_mutation();
-- drop table if exists public.stock_item_location_balances;
