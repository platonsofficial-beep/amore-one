-- =============================================================================
-- Departments and supply storages (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor. Do NOT auto-run from the app.
-- Idempotent. Wrapped in begin/commit.
--
-- Purpose:
--   Venue departments (Bar, Kitchen, …) and a per-storage supply flag.
--   A venue can have MANY supply storages (soft drinks, wines, spirits).
--   There is no one-per-workspace limit.
--   A supply storage may belong to a department (the bar's own supply store)
--   or stay venue-wide (department_id null).
--   A storage that is not a supply storage is a shelf. It can be assigned to
--   a department or left unassigned.
--
-- This script:
--   - Creates public.workspace_departments
--   - Adds workspace_storages.department_id (nullable, same-workspace)
--   - Adds workspace_storages.is_supply boolean not null default false
--   - Adds a non-unique partial index for supply lookups
--   - RLS matches workspace_storages: members select, stock managers
--     insert/update, no client delete
--
-- Does NOT:
--   - Add replenish_from or any "buys from supplier" flag
--   - Change location_key, name = location_key, or the key immutability trigger
--   - Change quantity, par, balance, order, or transfer logic
--   - Add a uniqueness constraint on is_supply
--   - Seed departments or mark existing storages as supply
--
-- Existing rows:
--   department_id stays null (Unassigned). is_supply stays false.
--
-- Later (not this file):
--   Refill source is resolved per item from the supply storages that hold
--   that item. If several do, the user picks. An explicit buying flag for
--   non-supply shelves is a separate step.
--
-- Prerequisites (already applied; this file does not recreate them):
--   1. public.workspaces
--   2. public.workspace_storages
--   3. public.is_workspace_member(uuid)
--   4. public.can_manage_workspace_stock(uuid)
--
-- How to verify:
--   After this file commits, run supabase/workspace_departments_verify.sql.
--   Part A is read-only. Part B is one transaction and ends with ROLLBACK.
--
-- Rollback:
--   Run supabase/workspace_departments_rollback.sql.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Table: workspace_departments
-- -----------------------------------------------------------------------------
create table if not exists public.workspace_departments (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  name text not null
    constraint workspace_departments_name_chk
      check (
        name = btrim(name)
        and length(name) > 0
        and char_length(name) <= 80
      ),

  name_normalized text generated always as (lower(btrim(name))) stored not null,

  sort_order integer not null default 0,
  active boolean not null default true,

  created_by uuid
    references auth.users(id) on delete set null,
  updated_by uuid
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workspace_departments_workspace_name_normalized_uidx
    unique (workspace_id, name_normalized)
);

comment on table public.workspace_departments is
  'Venue departments for grouping storages. Archive sets active=false. No client delete. Not the team/task department column.';

comment on column public.workspace_departments.name_normalized is
  'lower(btrim(name)) for case-insensitive uniqueness, including archived rows. Archiving does not free the name.';

comment on column public.workspace_departments.active is
  'false = archived. Storages keep department_id so restoring the department restores grouping.';

create index if not exists workspace_departments_workspace_active_sort_name_idx
  on public.workspace_departments (workspace_id, active, sort_order, name);

-- -----------------------------------------------------------------------------
-- workspace_storages.department_id + is_supply
-- -----------------------------------------------------------------------------
alter table public.workspace_storages
  add column if not exists department_id uuid;

alter table public.workspace_storages
  add column if not exists is_supply boolean;

alter table public.workspace_storages
  alter column is_supply set default false;

update public.workspace_storages
set is_supply = false
where is_supply is null;

alter table public.workspace_storages
  alter column is_supply set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
    where c.conrelid = 'public.workspace_storages'::regclass
      and c.contype = 'f'
      and a.attname = 'department_id'
  ) then
    alter table public.workspace_storages
      add constraint workspace_storages_department_id_fkey
      foreign key (department_id)
      references public.workspace_departments(id)
      on delete set null;
  end if;
end
$$;

comment on column public.workspace_storages.department_id is
  'Optional department. Null means Unassigned. Must be a department in the same workspace. Does not change location_key.';

comment on column public.workspace_storages.is_supply is
  'True = supply storage (Αποθήκη τροφοδοσίας). Many per venue. May also have a department_id, or null for a venue-wide supply store. False = shelf. Not unique.';

create index if not exists workspace_storages_department_id_idx
  on public.workspace_storages (department_id)
  where department_id is not null;

create index if not exists workspace_storages_workspace_supply_idx
  on public.workspace_storages (workspace_id)
  where is_supply;

-- -----------------------------------------------------------------------------
-- Same-workspace department. Does not touch location_key or is_supply uniqueness.
-- -----------------------------------------------------------------------------
create or replace function public.workspace_storages_enforce_department_workspace()
returns trigger
language plpgsql
as $$
begin
  if new.department_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.workspace_departments d
    where d.id = new.department_id
      and d.workspace_id = new.workspace_id
  ) then
    raise exception 'workspace_storage_department_workspace_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists workspace_storages_enforce_department_workspace
  on public.workspace_storages;

create trigger workspace_storages_enforce_department_workspace
  before insert or update on public.workspace_storages
  for each row
  execute function public.workspace_storages_enforce_department_workspace();

revoke all on function public.workspace_storages_enforce_department_workspace() from public;
revoke all on function public.workspace_storages_enforce_department_workspace() from anon;
revoke all on function public.workspace_storages_enforce_department_workspace() from authenticated;

-- -----------------------------------------------------------------------------
-- Department updated_at + immutable workspace_id
-- -----------------------------------------------------------------------------
create or replace function public.set_workspace_departments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspace_departments_set_updated_at
  on public.workspace_departments;

create trigger workspace_departments_set_updated_at
  before update on public.workspace_departments
  for each row
  execute function public.set_workspace_departments_updated_at();

create or replace function public.prevent_workspace_departments_workspace_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'workspace_departments_workspace_id_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists workspace_departments_prevent_workspace_mutation
  on public.workspace_departments;

create trigger workspace_departments_prevent_workspace_mutation
  before update on public.workspace_departments
  for each row
  execute function public.prevent_workspace_departments_workspace_mutation();

revoke all on function public.set_workspace_departments_updated_at() from public;
revoke all on function public.set_workspace_departments_updated_at() from anon;
revoke all on function public.set_workspace_departments_updated_at() from authenticated;
revoke all on function public.prevent_workspace_departments_workspace_mutation() from public;
revoke all on function public.prevent_workspace_departments_workspace_mutation() from anon;
revoke all on function public.prevent_workspace_departments_workspace_mutation() from authenticated;

-- -----------------------------------------------------------------------------
-- Privileges + RLS (same shape as workspace_storages)
-- -----------------------------------------------------------------------------
alter table public.workspace_departments enable row level security;

revoke all on table public.workspace_departments from public;
revoke all on table public.workspace_departments from anon;
revoke all on table public.workspace_departments from authenticated;

grant select, insert, update on table public.workspace_departments to authenticated;

drop policy if exists workspace_departments_select_members
  on public.workspace_departments;
create policy workspace_departments_select_members
  on public.workspace_departments
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_departments_insert_managers
  on public.workspace_departments;
create policy workspace_departments_insert_managers
  on public.workspace_departments
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists workspace_departments_update_managers
  on public.workspace_departments;
create policy workspace_departments_update_managers
  on public.workspace_departments
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

-- Intentionally no DELETE policy and no delete grant.

commit;
