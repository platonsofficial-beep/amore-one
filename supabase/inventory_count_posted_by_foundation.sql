-- =============================================================================
-- P8.5.2a — Inventory Count posted_by Audit Foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (P8.3.0)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Additive production audit column for the future posting RPC:
--     public.inventory_count_sessions.posted_by
--
-- Convention (matches inventory_count_sessions.started_by and stock audit fields):
--   uuid nullable
--   references auth.users(id) on delete set null
--   no default
--   populated only by future post_inventory_count_finish
--
-- Does NOT:
--   - Populate fabricated posting users for existing sessions
--   - Index posted_by (started_by is not indexed)
--   - Mutate stock_items / stock_movements
--   - Implement posting
--   - Change the Posting RPC foundation
-- =============================================================================

alter table public.inventory_count_sessions
  add column if not exists posted_by uuid
    references auth.users(id) on delete set null;

comment on column public.inventory_count_sessions.posted_by is
  'P8.5.2a auth.users id of the manager who posted the count; null until post. ON DELETE SET NULL so the session remains after user removal.';

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- alter table public.inventory_count_sessions drop column if exists posted_by;
