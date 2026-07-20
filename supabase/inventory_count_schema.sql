-- =============================================================================
-- P8.3.0 — Inventory Count Session database foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor.
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Persistent workspace-scoped schema for Inventory Count Sessions,
--   session locations, and frozen session item lines.
--
-- This script:
--   - Creates public.inventory_count_sessions
--   - Creates public.inventory_count_session_locations
--   - Creates public.inventory_count_session_items
--   - Adds indexes, unique constraints, and updated_at triggers
--
-- Does NOT:
--   - Create RPCs
--   - Create services
--   - Snapshot or create sessions
--   - Mutate stock_items / stock_movements
--   - Wire UI
--
-- Prerequisites:
--   1. public.workspaces exists
--   2. auth.users exists
--   3. public.stock_items exists
--   4. public.stock_movements exists
--   5. Then run inventory_count_rls_policies.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table 1: inventory_count_sessions
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_count_sessions (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  status text not null default 'in_progress'
    check (status in (
      'in_progress',
      'paused',
      'counting_complete',
      'posted',
      'cancelled'
    )),

  count_type text not null
    check (count_type in (
      'new',
      'quick',
      'partial',
      'scheduled',
      'emergency'
    )),

  visibility text not null default 'blind'
    check (visibility in ('blind', 'open')),

  include_zero_stock boolean not null default true,
  include_inactive boolean not null default false,

  note text not null default '',

  started_by uuid
    references auth.users(id) on delete set null,

  started_at timestamptz not null default now(),
  paused_at timestamptz,
  completed_at timestamptz,
  posted_at timestamptz,
  cancelled_at timestamptz,

  post_idempotency_key text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.inventory_count_sessions is
  'P8.3.0 Inventory Count session envelope. Snapshot + counting lines live in child tables.';

comment on column public.inventory_count_sessions.post_idempotency_key is
  'Optional unique key for idempotent posting RPCs (null until post).';

comment on column public.inventory_count_sessions.started_by is
  'auth.users id; ON DELETE SET NULL so the session remains after user removal.';

-- -----------------------------------------------------------------------------
-- Table 2: inventory_count_session_locations
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_count_session_locations (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null
    references public.inventory_count_sessions(id) on delete cascade,

  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  location_key text not null,
  sort_order integer not null default 0,

  status text not null default 'not_started'
    check (status in ('not_started', 'current', 'completed')),

  created_at timestamptz not null default now(),

  constraint inventory_count_session_locations_session_location_key
    unique (session_id, location_key)
);

comment on table public.inventory_count_session_locations is
  'P8.3.0 Selected storage locations for an inventory count session.';

comment on column public.inventory_count_session_locations.location_key is
  'Canonical storage_location string for the workspace (not a location entity FK).';

-- -----------------------------------------------------------------------------
-- Table 3: inventory_count_session_items
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_count_session_items (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null
    references public.inventory_count_sessions(id) on delete cascade,

  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  item_id uuid
    references public.stock_items(id) on delete set null,

  -- Snapshot metadata (copied at session start)
  item_name text not null default '',
  category text not null default 'Other',
  item_type text not null default 'Other',
  unit text not null default '',
  storage_location text not null default 'Main Storage',

  -- Snapshot quantity frozen at session start
  expected_snapshot numeric(12, 3) not null default 0,

  -- Counting
  counted_quantity numeric(12, 3),
  counted_at timestamptz,

  -- Posting audit fields (null until post)
  expected_at_count numeric(12, 3),
  variance_quantity numeric(12, 3),
  live_quantity_at_post numeric(12, 3),
  posted_movement_id uuid
    references public.stock_movements(id) on delete set null,

  line_status text not null default 'pending'
    check (line_status in ('pending', 'counted', 'skipped')),

  note text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.inventory_count_session_items is
  'P8.3.0 Frozen inventory count lines with counting and posting audit fields.';

comment on column public.inventory_count_session_items.item_id is
  'Nullable after stock item deletion; snapshot columns preserve auditability.';

comment on column public.inventory_count_session_items.expected_snapshot is
  'current_quantity frozen when the session starts.';

comment on column public.inventory_count_session_items.expected_at_count is
  'Snapshot + reconciled movements up to counted_at; stored at post for audit.';

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
create index if not exists inventory_count_sessions_workspace_idx
  on public.inventory_count_sessions (workspace_id);

create index if not exists inventory_count_sessions_workspace_status_idx
  on public.inventory_count_sessions (workspace_id, status);

create index if not exists inventory_count_sessions_started_at_idx
  on public.inventory_count_sessions (started_at desc);

create unique index if not exists inventory_count_sessions_post_idempotency_key_uidx
  on public.inventory_count_sessions (post_idempotency_key)
  where post_idempotency_key is not null;

create index if not exists inventory_count_session_locations_workspace_idx
  on public.inventory_count_session_locations (workspace_id);

create index if not exists inventory_count_session_locations_session_idx
  on public.inventory_count_session_locations (session_id, sort_order);

create index if not exists inventory_count_session_locations_session_status_idx
  on public.inventory_count_session_locations (session_id, status);

-- At most one current location per session.
create unique index if not exists inventory_count_session_locations_one_current_per_session
  on public.inventory_count_session_locations (session_id)
  where status = 'current';

create index if not exists inventory_count_session_items_workspace_idx
  on public.inventory_count_session_items (workspace_id);

create index if not exists inventory_count_session_items_session_idx
  on public.inventory_count_session_items (session_id);

create index if not exists inventory_count_session_items_session_status_idx
  on public.inventory_count_session_items (session_id, line_status);

create index if not exists inventory_count_session_items_item_idx
  on public.inventory_count_session_items (item_id);

create index if not exists inventory_count_session_items_posted_movement_idx
  on public.inventory_count_session_items (posted_movement_id)
  where posted_movement_id is not null;

-- One snapshot line per stock item per session (null item_id allowed after deletion).
create unique index if not exists inventory_count_session_items_session_item_uidx
  on public.inventory_count_session_items (session_id, item_id)
  where item_id is not null;

-- -----------------------------------------------------------------------------
-- updated_at triggers (repository-standard per-table functions)
-- -----------------------------------------------------------------------------
create or replace function public.set_inventory_count_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inventory_count_sessions_set_updated_at
  on public.inventory_count_sessions;

create trigger inventory_count_sessions_set_updated_at
  before update on public.inventory_count_sessions
  for each row
  execute function public.set_inventory_count_sessions_updated_at();

create or replace function public.set_inventory_count_session_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inventory_count_session_items_set_updated_at
  on public.inventory_count_session_items;

create trigger inventory_count_session_items_set_updated_at
  before update on public.inventory_count_session_items
  for each row
  execute function public.set_inventory_count_session_items_updated_at();

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- select to_regclass('public.inventory_count_sessions');
-- select to_regclass('public.inventory_count_session_locations');
-- select to_regclass('public.inventory_count_session_items');

-- select indexname from pg_indexes
-- where schemaname = 'public'
--   and tablename like 'inventory_count%'
-- order by tablename, indexname;
