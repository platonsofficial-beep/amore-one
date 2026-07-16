-- =============================================================================
-- P7.7.8 — Inventory Migration Session Activity Log foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor after inventory_migration_sessions.sql.
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Immutable append-only operator activity history for migration sessions.
--   This is NOT the session-step table. No migration-step events yet.
--
-- This script:
--   - Creates public.inventory_migration_activity
--   - Adds session / workspace / created_at indexes
--   - Enables RLS with SELECT-only manager policy
--
-- Does NOT:
--   - Create INSERT / UPDATE / DELETE policies
--   - Create write RPCs
--   - Execute migrations
--   - Alter inventory_migration_sessions or inventory_stock_item_map
--
-- Prerequisites:
--   1. public.inventory_migration_sessions exists (P7.7.4)
--   2. public.workspaces exists
--   3. public.can_manage_workspace_stock(uuid) exists
-- =============================================================================

-- Ensure Stock permission helpers exist (idempotent).
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
-- Table (immutable — no updated_at)
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_migration_activity (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null
    references public.inventory_migration_sessions(id) on delete cascade,

  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  activity_type text not null
    check (activity_type in (
      'session_started',
      'session_completed',
      'session_cancelled',
      'note'
    )),

  activity_text text not null default '',

  created_by uuid
    references auth.users(id) on delete set null,

  operator_display_name text not null default '',

  created_at timestamptz not null default now()
);

comment on table public.inventory_migration_activity is
  'P7.7.8 immutable append-only migration session activity log. No client writes in foundation.';

comment on column public.inventory_migration_activity.activity_type is
  'Operator-level event only. Migration-step types are deferred.';

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
create index if not exists inventory_migration_activity_session_idx
  on public.inventory_migration_activity (session_id);

create index if not exists inventory_migration_activity_workspace_idx
  on public.inventory_migration_activity (workspace_id);

create index if not exists inventory_migration_activity_created_at_idx
  on public.inventory_migration_activity (created_at desc);

-- -----------------------------------------------------------------------------
-- Privileges + RLS (SELECT only for stock managers)
-- -----------------------------------------------------------------------------
alter table public.inventory_migration_activity enable row level security;

revoke all on table public.inventory_migration_activity from public;
revoke all on table public.inventory_migration_activity from anon;
revoke all on table public.inventory_migration_activity from authenticated;
grant select on table public.inventory_migration_activity to authenticated;

drop policy if exists inventory_migration_activity_select_managers
  on public.inventory_migration_activity;
drop policy if exists inventory_migration_activity_insert_managers
  on public.inventory_migration_activity;
drop policy if exists inventory_migration_activity_update_managers
  on public.inventory_migration_activity;
drop policy if exists inventory_migration_activity_delete_managers
  on public.inventory_migration_activity;

create policy inventory_migration_activity_select_managers
  on public.inventory_migration_activity
  for select
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

-- Intentionally no INSERT / UPDATE / DELETE policies for authenticated or anon.
-- Writes arrive later via SECURITY DEFINER RPCs (not in this foundation sprint).

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- Table
-- select to_regclass('public.inventory_migration_activity') as activity_table;

-- Columns (expect no updated_at)
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'inventory_migration_activity'
-- order by ordinal_position;

-- CHECK
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.inventory_migration_activity'::regclass
--   and contype = 'c';

-- Indexes
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public' and tablename = 'inventory_migration_activity'
-- order by indexname;

-- Policies (expect exactly one SELECT policy)
-- select polname, polcmd::text
-- from pg_policy
-- where polrelid = 'public.inventory_migration_activity'::regclass
-- order by polname;

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop table if exists public.inventory_migration_activity;
