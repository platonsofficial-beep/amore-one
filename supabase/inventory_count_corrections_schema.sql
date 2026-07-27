-- =============================================================================
-- P8.20.6 — Inventory Count Corrections Audit Schema
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (P8.3.0)
--   2. inventory_count_rls_policies.sql (P8.3.0)
--   3. stock_movements_schema.sql
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Append-only correction audit tables linked to a posted inventory count.
--   Does NOT mutate inventory_count_sessions / session_items historical fields.
-- =============================================================================

create table if not exists public.inventory_count_corrections (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  session_id uuid not null
    references public.inventory_count_sessions(id) on delete cascade,

  created_by uuid
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),

  line_count integer not null default 0
    check (line_count >= 0),

  movement_count integer not null default 0
    check (movement_count >= 0)
);

comment on table public.inventory_count_corrections is
  'P8.20.6 Append-only correction batch applied against a posted inventory count session.';

create table if not exists public.inventory_count_correction_lines (
  id uuid primary key default gen_random_uuid(),

  correction_id uuid not null
    references public.inventory_count_corrections(id) on delete cascade,

  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  session_id uuid not null
    references public.inventory_count_sessions(id) on delete cascade,

  session_item_id uuid not null
    references public.inventory_count_session_items(id) on delete cascade,

  item_id uuid
    references public.stock_items(id) on delete set null,

  item_name text not null default '',

  original_quantity numeric(12, 3) not null,
  corrected_quantity numeric(12, 3) not null,
  delta_quantity numeric(12, 3) not null,

  movement_id uuid
    references public.stock_movements(id) on delete set null,

  created_by uuid
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now()
);

comment on table public.inventory_count_correction_lines is
  'P8.20.6 Append-only correction line audit. Original posted session item values remain unchanged.';

-- =============================================================================
-- P8.20.8 — Additive effective baseline (non-breaking)
-- =============================================================================
-- baseline_quantity = effective quantity immediately before this correction.
-- original_quantity remains the immutable posted counted quantity.
-- Pre-P8.20.8 rows keep baseline_quantity NULL; reconstruct via:
--   counted_quantity + sum(prior delta_quantity) for the session item.
-- =============================================================================

alter table public.inventory_count_correction_lines
  add column if not exists baseline_quantity numeric(12, 3);

comment on column public.inventory_count_correction_lines.original_quantity is
  'Immutable posted counted quantity (inventory_count_session_items.counted_quantity).';

comment on column public.inventory_count_correction_lines.baseline_quantity is
  'P8.20.8 Effective quantity immediately before this correction (counted + prior deltas). Null on older rows.';

comment on column public.inventory_count_correction_lines.delta_quantity is
  'Applied delta = corrected_quantity − baseline (effective before). For pre-P8.20.8 rows, baseline was posted counted.';

create index if not exists inventory_count_corrections_session_idx
  on public.inventory_count_corrections (session_id, created_at desc);

create index if not exists inventory_count_corrections_workspace_idx
  on public.inventory_count_corrections (workspace_id, created_at desc);

create index if not exists inventory_count_correction_lines_session_idx
  on public.inventory_count_correction_lines (session_id, created_at desc);

create index if not exists inventory_count_correction_lines_correction_idx
  on public.inventory_count_correction_lines (correction_id);

create index if not exists inventory_count_correction_lines_session_item_idx
  on public.inventory_count_correction_lines (session_item_id);

grant select on table public.inventory_count_corrections to authenticated;
grant select on table public.inventory_count_correction_lines to authenticated;

alter table public.inventory_count_corrections enable row level security;
alter table public.inventory_count_correction_lines enable row level security;

drop policy if exists inventory_count_corrections_select_members
  on public.inventory_count_corrections;
create policy inventory_count_corrections_select_members
  on public.inventory_count_corrections
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists inventory_count_correction_lines_select_members
  on public.inventory_count_correction_lines;
create policy inventory_count_correction_lines_select_members
  on public.inventory_count_correction_lines
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- Inserts/updates only via SECURITY DEFINER apply RPC (no direct client writes).
