-- =============================================================================
-- P7.7.4 — Inventory Migration Session persistence foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor.
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Durable workspace-scoped migration session envelope for the Inventory
--   Migration Dashboard Session Card.
--
-- This script:
--   - Creates public.inventory_migration_sessions
--   - Adds indexes + one-running-per-workspace partial unique index
--   - Adds updated_at trigger (repository convention)
--   - Enables RLS with SELECT-only manager policy
--
-- Does NOT:
--   - Create start/complete/cancel RPCs
--   - Grant client INSERT/UPDATE/DELETE
--   - Execute migrations
--   - Create activity/step tables
--   - Alter inventory_stock_item_map
--
-- Prerequisites:
--   1. public.workspaces exists
--   2. auth.users exists
--   3. public.workspace_members exists (for can_manage_workspace_stock)
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
-- Table
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_migration_sessions (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  status text not null
    check (status in ('running', 'completed', 'cancelled')),

  started_by uuid
    references auth.users(id) on delete set null,

  operator_display_name text not null default '',

  started_at timestamptz not null default now(),
  finished_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.inventory_migration_sessions is
  'P7.7.4 workspace-scoped inventory migration session envelope. No client writes in foundation.';

comment on column public.inventory_migration_sessions.operator_display_name is
  'Immutable-ish display snapshot for the Session Card operator field.';

comment on column public.inventory_migration_sessions.started_by is
  'Stable auth.users id; ON DELETE SET NULL so the session remains after user removal.';

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
create index if not exists inventory_migration_sessions_workspace_idx
  on public.inventory_migration_sessions (workspace_id);

create index if not exists inventory_migration_sessions_status_idx
  on public.inventory_migration_sessions (status);

create index if not exists inventory_migration_sessions_started_at_idx
  on public.inventory_migration_sessions (started_at desc);

-- One active (running) session per workspace; history kept via completed/cancelled rows.
-- Pattern: floor_plans_one_active_per_workspace / workspace_invites_one_active_per_employee_idx
create unique index if not exists inventory_migration_sessions_one_running_per_workspace
  on public.inventory_migration_sessions (workspace_id)
  where status = 'running';

-- -----------------------------------------------------------------------------
-- updated_at trigger (repository-standard per-table function)
-- -----------------------------------------------------------------------------
create or replace function public.set_inventory_migration_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inventory_migration_sessions_set_updated_at
  on public.inventory_migration_sessions;

create trigger inventory_migration_sessions_set_updated_at
  before update on public.inventory_migration_sessions
  for each row
  execute function public.set_inventory_migration_sessions_updated_at();

-- -----------------------------------------------------------------------------
-- Privileges + RLS (SELECT only for stock managers)
-- -----------------------------------------------------------------------------
alter table public.inventory_migration_sessions enable row level security;

revoke all on table public.inventory_migration_sessions from public;
revoke all on table public.inventory_migration_sessions from anon;
revoke all on table public.inventory_migration_sessions from authenticated;
grant select on table public.inventory_migration_sessions to authenticated;

drop policy if exists inventory_migration_sessions_select_managers
  on public.inventory_migration_sessions;
drop policy if exists inventory_migration_sessions_insert_managers
  on public.inventory_migration_sessions;
drop policy if exists inventory_migration_sessions_update_managers
  on public.inventory_migration_sessions;
drop policy if exists inventory_migration_sessions_delete_managers
  on public.inventory_migration_sessions;

create policy inventory_migration_sessions_select_managers
  on public.inventory_migration_sessions
  for select
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

-- Intentionally no INSERT / UPDATE / DELETE policies for authenticated or anon.
-- Writes arrive later via SECURITY DEFINER RPCs (not in this foundation sprint).

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- Table
-- select to_regclass('public.inventory_migration_sessions') as sessions_table;

-- Columns
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'inventory_migration_sessions'
-- order by ordinal_position;

-- CHECK (expect status in running/completed/cancelled)
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.inventory_migration_sessions'::regclass
--   and contype = 'c';

-- Indexes (expect workspace, status, started_at, one_running partial unique)
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public' and tablename = 'inventory_migration_sessions'
-- order by indexname;

-- Trigger
-- select tgname from pg_trigger
-- where tgrelid = 'public.inventory_migration_sessions'::regclass
--   and not tgisinternal;

-- Policies (expect exactly one SELECT policy)
-- select polname, polcmd::text
-- from pg_policy
-- where polrelid = 'public.inventory_migration_sessions'::regclass
-- order by polname;

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop trigger if exists inventory_migration_sessions_set_updated_at
--   on public.inventory_migration_sessions;
-- drop function if exists public.set_inventory_migration_sessions_updated_at();
-- drop table if exists public.inventory_migration_sessions;
