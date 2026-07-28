-- =============================================================================
-- P8.22.2 — Inventory Count Reversal Foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (P8.3.0)
--   2. inventory_count_posted_by_foundation.sql (P8.5.2a) — recommended ordering only
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Additive nullable reversal metadata on inventory_count_sessions for a future
--   append-only reversal flow:
--     reversed_at
--     reversed_by
--     reversal_reason
--
-- Convention (matches posted_at / posted_by / started_by):
--   nullable columns
--   reversed_by references auth.users(id) on delete set null
--   no defaults
--   not populated by this migration
--   no backfill of existing posted sessions
--
-- Does NOT:
--   - Add a reversed session status
--   - Implement reversal RPC / UI
--   - Generate reversing stock_movements
--   - Mutate stock_items / stock_movements
--   - Change posting, corrections, or delete behavior
-- =============================================================================

alter table public.inventory_count_sessions
  add column if not exists reversed_at timestamptz;

alter table public.inventory_count_sessions
  add column if not exists reversed_by uuid
    references auth.users(id) on delete set null;

alter table public.inventory_count_sessions
  add column if not exists reversal_reason text;

comment on column public.inventory_count_sessions.reversed_at is
  'P8.22.2 Timestamp when the posted count was reversed; null until reversal. Not populated by this foundation migration.';

comment on column public.inventory_count_sessions.reversed_by is
  'P8.22.2 auth.users id of the manager who reversed the count; null until reversal. ON DELETE SET NULL so the session remains after user removal.';

comment on column public.inventory_count_sessions.reversal_reason is
  'P8.22.2 Required operator reason at future reversal time; null until reversal. Not populated by this foundation migration.';

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- alter table public.inventory_count_sessions drop column if exists reversal_reason;
-- alter table public.inventory_count_sessions drop column if exists reversed_by;
-- alter table public.inventory_count_sessions drop column if exists reversed_at;
