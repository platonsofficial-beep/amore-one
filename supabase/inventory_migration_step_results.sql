-- =============================================================================
-- P7.8.5 — Inventory Migration Step Results persistence foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_migration_sessions.sql (P7.7.4)
--   2. inventory_migration_session_steps.sql (P7.8.0)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Durable structured evidence for one completed migration step per session.
--   This is NOT execution. No stage RPCs, no step transitions, no activity writes.
--
-- This script:
--   - Creates public.inventory_migration_step_results
--   - Adds uniqueness, indexes, and SELECT-only RLS
--
-- Does NOT:
--   - Create INSERT / UPDATE / DELETE policies
--   - Create write RPCs
--   - Alter sessions / steps / activity / map schemas
--   - Execute migrations
--
-- Relationship integrity note:
--   Steps already unique on (session_id, step_name). This table references that
--   composite key plus step_id. Exact four-way (session/workspace/step_id/name)
--   identity still depends on stage-owned RPCs copying values from one locked
--   step row — do not redesign session/step schemas in this foundation sprint.
--
-- Prerequisites:
--   1. public.inventory_migration_sessions exists
--   2. public.inventory_migration_session_steps exists
--   3. public.workspaces exists
--   4. public.can_manage_workspace_stock(uuid) exists
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
create table if not exists public.inventory_migration_step_results (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null
    references public.inventory_migration_sessions(id) on delete cascade,

  step_id uuid not null
    references public.inventory_migration_session_steps(id) on delete cascade,

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

  result_status text not null
    check (result_status in (
      'passed',
      'attention_required'
    )),

  result_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result_summary) = 'object'),

  critical_finding_count bigint not null default 0
    check (critical_finding_count >= 0),

  attention_finding_count bigint not null default 0
    check (attention_finding_count >= 0),

  executed_by uuid
    references auth.users(id) on delete set null,

  operator_display_name text not null default '',

  executed_at timestamptz not null default now(),

  created_at timestamptz not null default now(),

  constraint inventory_migration_step_results_session_step_uidx
    unique (session_id, step_name),

  constraint inventory_migration_step_results_step_id_uidx
    unique (step_id),

  constraint inventory_migration_step_results_session_step_fkey
    foreign key (session_id, step_name)
    references public.inventory_migration_session_steps (session_id, step_name)
    on delete cascade
);

comment on table public.inventory_migration_step_results is
  'P7.8.5 immutable structured evidence for one migration step per session. No client writes in foundation.';

comment on column public.inventory_migration_step_results.result_status is
  'passed | attention_required. Lifecycle waiting/running/completed lives on session_steps.';

comment on column public.inventory_migration_step_results.result_summary is
  'Stage-specific structured counters/findings object. No secrets or raw SQL.';

-- -----------------------------------------------------------------------------
-- Indexes (skip session_id / step_id — covered by unique constraints)
-- -----------------------------------------------------------------------------
create index if not exists inventory_migration_step_results_workspace_idx
  on public.inventory_migration_step_results (workspace_id);

create index if not exists inventory_migration_step_results_step_name_idx
  on public.inventory_migration_step_results (step_name);

create index if not exists inventory_migration_step_results_result_status_idx
  on public.inventory_migration_step_results (result_status);

create index if not exists inventory_migration_step_results_executed_at_idx
  on public.inventory_migration_step_results (executed_at desc);

-- -----------------------------------------------------------------------------
-- Privileges + RLS (SELECT only for stock managers)
-- -----------------------------------------------------------------------------
alter table public.inventory_migration_step_results enable row level security;

revoke all on table public.inventory_migration_step_results from public;
revoke all on table public.inventory_migration_step_results from anon;
revoke all on table public.inventory_migration_step_results from authenticated;
grant select on table public.inventory_migration_step_results to authenticated;

drop policy if exists inventory_migration_step_results_select_managers
  on public.inventory_migration_step_results;
drop policy if exists inventory_migration_step_results_insert_managers
  on public.inventory_migration_step_results;
drop policy if exists inventory_migration_step_results_update_managers
  on public.inventory_migration_step_results;
drop policy if exists inventory_migration_step_results_delete_managers
  on public.inventory_migration_step_results;

create policy inventory_migration_step_results_select_managers
  on public.inventory_migration_step_results
  for select
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

-- Intentionally no INSERT / UPDATE / DELETE policies for authenticated or anon.
-- Writes arrive later via SECURITY DEFINER stage-owned RPCs.

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- select to_regclass('public.inventory_migration_step_results') as step_results_table;

-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'inventory_migration_step_results'
-- order by ordinal_position;

-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.inventory_migration_step_results'::regclass
-- order by conname;

-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public' and tablename = 'inventory_migration_step_results'
-- order by indexname;

-- select polname, polcmd::text
-- from pg_policy
-- where polrelid = 'public.inventory_migration_step_results'::regclass
-- order by polname;

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop table if exists public.inventory_migration_step_results;
