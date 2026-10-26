-- =============================================================================
-- Rollback for supabase/inventory_import_session_functions.sql (NOT APPLIED)
-- =============================================================================
-- Drops only the four session functions. Does not drop tables, delete rows,
-- or drop apply_inventory_import_session.
-- =============================================================================

drop function if exists public.mark_inventory_import_session_ready(uuid, uuid);
drop function if exists public.stage_inventory_import_rows(uuid, uuid, jsonb);
drop function if exists public.cancel_inventory_import_session(uuid, uuid);
drop function if exists public.create_inventory_import_session(
  uuid, text, text, bigint, text, text, integer, text, text, text, text, jsonb, jsonb, jsonb, text
);
