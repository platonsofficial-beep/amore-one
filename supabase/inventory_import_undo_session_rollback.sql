-- =============================================================================
-- Rollback: remove the inventory import undo functions
-- =============================================================================
-- Do NOT run this from the app.
-- Drops only the three functions added by inventory_import_undo_session.sql.
-- Does not replace or drop the live apply function.
-- Does not drop tables or remove products, suppliers, or import sessions.
-- A session already marked cancelled stays cancelled.
-- =============================================================================

drop function if exists public.undo_inventory_import_session(uuid, uuid);
drop function if exists public.inventory_import_undo_eligibility(uuid, uuid);
drop function if exists public.inventory_import_collect_undo_refusals(uuid, uuid);
