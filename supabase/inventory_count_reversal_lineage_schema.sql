-- =============================================================================
-- P8.22.5 / P8.22.5a — Inventory Count Reversal Lineage & Idempotency Schema
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (P8.3.0)
--   2. inventory_count_rls_policies.sql (P8.3.0)
--   3. stock_movements_schema.sql
--   4. inventory_count_reversals_schema.sql (P8.22.3)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   1. At-most-one reversal audit header per inventory count session
--   2. Durable reversal-line lineage: header ↔ original movement ↔
--      compensating movement ↔ stock item ↔ quantities
--
-- P8.22.5a FK retention lock:
--   stock_movements.item_id is ON DELETE CASCADE. Permanent item delete
--   (delete_stock_item_permanently) removes the item and cascades movements.
--   IC session_items / correction_lines already use ON DELETE SET NULL so
--   permanent delete is not blocked by posted/correction audit.
--   Reversal lines MUST match that contract: do not RESTRICT item/movement
--   deletes (would make reversed-count items undeletable).
--
-- Does NOT:
--   - Implement reverse_inventory_count_* RPC
--   - Insert rows / create stock_movements
--   - Mutate stock_items quantities
--   - Change session metadata columns (reversed_at / reversed_by / reversal_reason)
--   - Wire UI or client services
--   - Add triggers
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Unique reversal header per session (idempotency / at-most-once)
-- -----------------------------------------------------------------------------
-- Smallest additive guarantee consistent with inventory_count_sessions
-- post_idempotency_key unique-index convention. No rows expected yet.
create unique index if not exists inventory_count_reversals_session_uidx
  on public.inventory_count_reversals (session_id);

comment on index public.inventory_count_reversals_session_uidx is
  'P8.22.5 At most one inventory_count_reversals header per session.';

-- -----------------------------------------------------------------------------
-- 2) Reversal line lineage (append-only)
-- -----------------------------------------------------------------------------
-- FK delete policy (P8.22.5a — retention + permanent-delete compatibility):
--   reversal_id  → CASCADE  : lines owned by header (same as correction_lines)
--   workspace_id → CASCADE  : workspace teardown (IC audit convention)
--   session_id   → CASCADE  : session-owned audit; posted sessions cannot be
--                             deleted via delete_inventory_count_session (P8.22.1)
--   item_id      → SET NULL : nullable historical ref; matches session_items /
--                             correction_lines; preserves permanent-delete path
--   original_movement_id → SET NULL : nullable; movements CASCADE on item delete
--   reversal_movement_id → SET NULL : nullable; same permanent-delete contract
--
-- After item/movement wipe, the reversal line remains meaningful via:
--   - original_quantity / reversal_quantity (immutable numeric lineage)
--   - session_id → inventory_count_session_items product snapshots
--     (item_name, unit, category, storage_location)
-- Future RPC should still require non-null item/movement ids at insert time.
-- =============================================================================

create table if not exists public.inventory_count_reversal_lines (
  id uuid primary key default gen_random_uuid(),

  reversal_id uuid not null
    references public.inventory_count_reversals(id) on delete cascade,

  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  session_id uuid not null
    references public.inventory_count_sessions(id) on delete cascade,

  item_id uuid
    references public.stock_items(id) on delete set null,

  original_movement_id uuid
    references public.stock_movements(id) on delete set null,

  reversal_movement_id uuid
    references public.stock_movements(id) on delete set null,

  original_quantity numeric(12, 3) not null,
  reversal_quantity numeric(12, 3) not null,

  created_at timestamptz not null default now(),

  constraint inventory_count_reversal_lines_movement_ids_distinct_chk
    check (
      original_movement_id is null
      or reversal_movement_id is null
      or original_movement_id is distinct from reversal_movement_id
    ),

  constraint inventory_count_reversal_lines_quantity_inverse_chk
    check (reversal_quantity = -original_quantity)
);

comment on table public.inventory_count_reversal_lines is
  'P8.22.5/P8.22.5a Append-only lineage: one row per original IC movement compensated by a reversal movement. Item/movement FKs nullable SET NULL for permanent-delete compatibility.';

comment on column public.inventory_count_reversal_lines.item_id is
  'P8.22.5a Live stock item ref; ON DELETE SET NULL so permanent item delete remains possible. Product identity after wipe via session_items snapshots.';

comment on column public.inventory_count_reversal_lines.original_movement_id is
  'Source post or correction stock_movements.id. ON DELETE SET NULL (movements cascade when item is permanently deleted).';

comment on column public.inventory_count_reversal_lines.reversal_movement_id is
  'Compensating stock_movements.id. ON DELETE SET NULL for permanent-delete compatibility.';

comment on column public.inventory_count_reversal_lines.original_quantity is
  'Quantity copied from the original movement at reversal time; survives movement wipe.';

comment on column public.inventory_count_reversal_lines.reversal_quantity is
  'Must equal -original_quantity (enforced by CHECK); survives movement wipe.';

-- One original movement reversed at most once (NULLs allowed after SET NULL)
create unique index if not exists inventory_count_reversal_lines_original_movement_uidx
  on public.inventory_count_reversal_lines (original_movement_id);

-- One reversal movement linked to at most one reversal line
create unique index if not exists inventory_count_reversal_lines_reversal_movement_uidx
  on public.inventory_count_reversal_lines (reversal_movement_id);

create index if not exists inventory_count_reversal_lines_reversal_idx
  on public.inventory_count_reversal_lines (reversal_id);

create index if not exists inventory_count_reversal_lines_session_idx
  on public.inventory_count_reversal_lines (session_id, created_at desc);

create index if not exists inventory_count_reversal_lines_workspace_idx
  on public.inventory_count_reversal_lines (workspace_id, created_at desc);

create index if not exists inventory_count_reversal_lines_item_idx
  on public.inventory_count_reversal_lines (item_id);

-- -----------------------------------------------------------------------------
-- 3) Append-only access (read members; writes via future SECURITY DEFINER RPC)
-- -----------------------------------------------------------------------------
grant select on table public.inventory_count_reversal_lines to authenticated;

alter table public.inventory_count_reversal_lines enable row level security;

drop policy if exists inventory_count_reversal_lines_select_members
  on public.inventory_count_reversal_lines;
create policy inventory_count_reversal_lines_select_members
  on public.inventory_count_reversal_lines
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- Inserts/updates/deletes only via a future SECURITY DEFINER reversal RPC
-- (no direct client write policies).

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop policy if exists inventory_count_reversal_lines_select_members
--   on public.inventory_count_reversal_lines;
-- drop index if exists public.inventory_count_reversal_lines_item_idx;
-- drop index if exists public.inventory_count_reversal_lines_workspace_idx;
-- drop index if exists public.inventory_count_reversal_lines_session_idx;
-- drop index if exists public.inventory_count_reversal_lines_reversal_idx;
-- drop index if exists public.inventory_count_reversal_lines_reversal_movement_uidx;
-- drop index if exists public.inventory_count_reversal_lines_original_movement_uidx;
-- drop table if exists public.inventory_count_reversal_lines;
-- drop index if exists public.inventory_count_reversals_session_uidx;
