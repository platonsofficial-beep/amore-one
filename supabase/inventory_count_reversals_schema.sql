-- =============================================================================
-- P8.22.3 — Inventory Count Reversal Audit Contract
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (P8.3.0)
--   2. inventory_count_rls_policies.sql (P8.3.0)
--   3. inventory_count_reversal_foundation.sql (P8.22.2) — recommended ordering only
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Append-only audit table describing future inventory count reversals.
--   Exists independently of stock movement / reversing-entry implementation.
--
-- Does NOT:
--   - Insert any rows
--   - Create triggers or RPCs
--   - Reverse stock or create stock_movements
--   - Change posting, corrections, delete, or session status behavior
--   - Wire UI or client services
-- =============================================================================

create table if not exists public.inventory_count_reversals (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  session_id uuid not null
    references public.inventory_count_sessions(id) on delete cascade,

  reason text not null,

  note text not null default '',

  created_by uuid
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now()
);

comment on table public.inventory_count_reversals is
  'P8.22.3 Append-only reversal audit record for a posted inventory count session. No rows populated by this schema sprint.';

comment on column public.inventory_count_reversals.reason is
  'Operator reason for the reversal; required when a future reversal RPC inserts a row.';

comment on column public.inventory_count_reversals.note is
  'Optional operator note; empty string when unused.';

comment on column public.inventory_count_reversals.created_by is
  'auth.users id of the manager who reversed; ON DELETE SET NULL so the audit row remains after user removal.';

create index if not exists inventory_count_reversals_session_idx
  on public.inventory_count_reversals (session_id, created_at desc);

create index if not exists inventory_count_reversals_workspace_idx
  on public.inventory_count_reversals (workspace_id, created_at desc);

grant select on table public.inventory_count_reversals to authenticated;

alter table public.inventory_count_reversals enable row level security;

drop policy if exists inventory_count_reversals_select_members
  on public.inventory_count_reversals;
create policy inventory_count_reversals_select_members
  on public.inventory_count_reversals
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- Inserts/updates only via a future SECURITY DEFINER reversal RPC (no direct client writes).

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop policy if exists inventory_count_reversals_select_members on public.inventory_count_reversals;
-- drop index if exists public.inventory_count_reversals_workspace_idx;
-- drop index if exists public.inventory_count_reversals_session_idx;
-- drop table if exists public.inventory_count_reversals;
