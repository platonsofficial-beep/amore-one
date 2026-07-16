-- =============================================================================
-- P7.8.0 — Inventory Migration Session Steps foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor after inventory_migration_sessions.sql.
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Persistent evidence storage for migration stages within a session.
--   This is NOT execution. No step runner, no write RPCs in this sprint.
--
-- This script:
--   - Creates public.inventory_migration_session_steps
--   - Adds session / workspace / status / step_name indexes
--   - Adds unique (session_id, step_name)
--   - Enables RLS with SELECT-only manager policy
--
-- Does NOT:
--   - Create INSERT / UPDATE / DELETE policies
--   - Create write RPCs
--   - Execute migrations
--   - Alter inventory_migration_sessions, activity, or inventory_stock_item_map
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
-- Table (no updated_at — foundation rows are immutable except future RPC ownership)
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_migration_session_steps (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null
    references public.inventory_migration_sessions(id) on delete cascade,

  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  step_name text not null
    check (step_name in (
      'foundation',
      'persist',
      'auto_link',
      'auto_create',
      'integrity_audit',
      'preflight',
      'preview',
      'phase1',
      'phase2',
      'post_apply_audit'
    )),

  status text not null
    check (status in (
      'waiting',
      'running',
      'completed'
    )),

  started_at timestamptz null,

  completed_at timestamptz null,

  created_at timestamptz not null default now(),

  constraint inventory_migration_session_steps_session_step_uidx
    unique (session_id, step_name)
);

comment on table public.inventory_migration_session_steps is
  'P7.8.0 persistent migration session step evidence. No client writes in foundation.';

comment on column public.inventory_migration_session_steps.step_name is
  'Canonical migration stage key. Execution ownership is deferred.';

comment on column public.inventory_migration_session_steps.status is
  'waiting | running | completed. Writes arrive later via SECURITY DEFINER RPCs.';

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
create index if not exists inventory_migration_session_steps_session_idx
  on public.inventory_migration_session_steps (session_id);

create index if not exists inventory_migration_session_steps_workspace_idx
  on public.inventory_migration_session_steps (workspace_id);

create index if not exists inventory_migration_session_steps_status_idx
  on public.inventory_migration_session_steps (status);

create index if not exists inventory_migration_session_steps_step_name_idx
  on public.inventory_migration_session_steps (step_name);

-- -----------------------------------------------------------------------------
-- Privileges + RLS (SELECT only for stock managers)
-- -----------------------------------------------------------------------------
alter table public.inventory_migration_session_steps enable row level security;

revoke all on table public.inventory_migration_session_steps from public;
revoke all on table public.inventory_migration_session_steps from anon;
revoke all on table public.inventory_migration_session_steps from authenticated;
grant select on table public.inventory_migration_session_steps to authenticated;

drop policy if exists inventory_migration_session_steps_select_managers
  on public.inventory_migration_session_steps;
drop policy if exists inventory_migration_session_steps_insert_managers
  on public.inventory_migration_session_steps;
drop policy if exists inventory_migration_session_steps_update_managers
  on public.inventory_migration_session_steps;
drop policy if exists inventory_migration_session_steps_delete_managers
  on public.inventory_migration_session_steps;

create policy inventory_migration_session_steps_select_managers
  on public.inventory_migration_session_steps
  for select
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

-- Intentionally no INSERT / UPDATE / DELETE policies for authenticated or anon.
-- Writes arrive later via SECURITY DEFINER RPCs (not in this foundation sprint).

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- Table
-- select to_regclass('public.inventory_migration_session_steps') as steps_table;

-- Columns (expect no updated_at)
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'inventory_migration_session_steps'
-- order by ordinal_position;

-- CHECK + unique
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.inventory_migration_session_steps'::regclass
-- order by conname;

-- Indexes
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public' and tablename = 'inventory_migration_session_steps'
-- order by indexname;

-- Policies (expect exactly one SELECT policy)
-- select polname, polcmd::text
-- from pg_policy
-- where polrelid = 'public.inventory_migration_session_steps'::regclass
-- order by polname;

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop table if exists public.inventory_migration_session_steps;
