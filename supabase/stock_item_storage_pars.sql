-- =============================================================================
-- Per-shelf par (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor. Do NOT auto-run from the app.
-- Idempotent. Wrapped in begin/commit.
--
-- Purpose:
--   One par per item per storage. A missing row means the item is not tracked
--   on that shelf. par_quantity 0 is a real par ("keep none"), not a blank.
--   Managers clear a par by deleting the row. Staff can read and cannot write.
--
-- This script:
--   - Creates public.stock_item_storage_pars
--   - Enforces item and storage belong to the same workspace
--   - RLS: members select; can_manage_workspace_stock insert, update, delete
--
-- Does NOT:
--   - Change stock_items.target_quantity or stock_items.minimum_quantity
--   - Change location_key or any quantity / balance writer
--   - Feed the dashboard "To order" figure
--
-- Clear convention:
--   DELETE, managers only. A null par_quantity is not allowed, so 0 cannot
--   mean "not tracked". Deleting the row is the blank.
--
-- Prerequisites (already applied; this file does not recreate them):
--   1. public.workspaces
--   2. public.stock_items
--   3. public.workspace_storages
--   4. public.is_workspace_member(uuid)
--   5. public.can_manage_workspace_stock(uuid)
--
-- How to verify:
--   After this file commits, run supabase/stock_item_storage_pars_verify.sql.
--   Part A is read-only. Part B is one transaction and ends with ROLLBACK.
--
-- Rollback:
--   Run supabase/stock_item_storage_pars_rollback.sql.
-- =============================================================================

begin;

create table if not exists public.stock_item_storage_pars (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  stock_item_id uuid not null
    references public.stock_items(id) on delete cascade,

  workspace_storage_id uuid not null
    references public.workspace_storages(id) on delete cascade,

  par_quantity numeric(12, 3) not null,

  updated_by uuid
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint stock_item_storage_pars_workspace_item_storage_uidx
    unique (workspace_id, stock_item_id, workspace_storage_id),

  constraint stock_item_storage_pars_par_quantity_chk
    check (par_quantity >= 0)
);

comment on table public.stock_item_storage_pars is
  'Per-shelf par. No row means not tracked on that shelf. Zero is a tracked par. Managers clear by DELETE. Does not replace stock_items.minimum_quantity or target_quantity.';

comment on column public.stock_item_storage_pars.par_quantity is
  'Shelf par, numeric(12,3), >= 0. Missing balance is treated as on hand 0 by the client. Short is max(0, par - on hand).';

create index if not exists stock_item_storage_pars_workspace_storage_idx
  on public.stock_item_storage_pars (workspace_id, workspace_storage_id);

-- -----------------------------------------------------------------------------
-- Same-workspace item and storage. Does not write quantity or global par.
-- -----------------------------------------------------------------------------
create or replace function public.stock_item_storage_pars_enforce()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.workspace_id is distinct from old.workspace_id then
    raise exception 'stock_item_storage_par_workspace_immutable';
  end if;

  if not exists (
    select 1
    from public.stock_items si
    where si.id = new.stock_item_id
      and si.workspace_id = new.workspace_id
  ) then
    raise exception 'stock_item_storage_par_item_workspace_mismatch';
  end if;

  if not exists (
    select 1
    from public.workspace_storages ws
    where ws.id = new.workspace_storage_id
      and ws.workspace_id = new.workspace_id
  ) then
    raise exception 'stock_item_storage_par_storage_workspace_mismatch';
  end if;

  new.updated_at = now();
  if auth.uid() is not null then
    new.updated_by = auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists stock_item_storage_pars_enforce
  on public.stock_item_storage_pars;

create trigger stock_item_storage_pars_enforce
  before insert or update on public.stock_item_storage_pars
  for each row
  execute function public.stock_item_storage_pars_enforce();

revoke all on function public.stock_item_storage_pars_enforce() from public;
revoke all on function public.stock_item_storage_pars_enforce() from anon;
revoke all on function public.stock_item_storage_pars_enforce() from authenticated;

-- -----------------------------------------------------------------------------
-- Privileges + RLS
-- -----------------------------------------------------------------------------
alter table public.stock_item_storage_pars enable row level security;

revoke all on table public.stock_item_storage_pars from public;
revoke all on table public.stock_item_storage_pars from anon;
revoke all on table public.stock_item_storage_pars from authenticated;

grant select, insert, update, delete on table public.stock_item_storage_pars to authenticated;

drop policy if exists stock_item_storage_pars_select_members
  on public.stock_item_storage_pars;
create policy stock_item_storage_pars_select_members
  on public.stock_item_storage_pars
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists stock_item_storage_pars_insert_managers
  on public.stock_item_storage_pars;
create policy stock_item_storage_pars_insert_managers
  on public.stock_item_storage_pars
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists stock_item_storage_pars_update_managers
  on public.stock_item_storage_pars;
create policy stock_item_storage_pars_update_managers
  on public.stock_item_storage_pars
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists stock_item_storage_pars_delete_managers
  on public.stock_item_storage_pars;
create policy stock_item_storage_pars_delete_managers
  on public.stock_item_storage_pars
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

commit;
