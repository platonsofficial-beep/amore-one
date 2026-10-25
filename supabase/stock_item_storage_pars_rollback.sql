-- =============================================================================
-- Per-shelf par ROLLBACK (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Run only to undo supabase/stock_item_storage_pars.sql
-- after that file has been applied. Do NOT auto-run from the app.
-- Idempotent. Wrapped in begin/commit.
--
-- Drops stock_item_storage_pars. Shelf pars are not restored.
-- stock_items.target_quantity, stock_items.minimum_quantity, location_key,
-- and quantity balances stay.
--
-- Rollback of this rollback:
--   Re-apply supabase/stock_item_storage_pars.sql.
--   That recreates an empty table. It does not restore dropped pars.
-- =============================================================================

begin;

drop trigger if exists stock_item_storage_pars_enforce
  on public.stock_item_storage_pars;

drop function if exists public.stock_item_storage_pars_enforce();

drop policy if exists stock_item_storage_pars_select_members
  on public.stock_item_storage_pars;
drop policy if exists stock_item_storage_pars_insert_managers
  on public.stock_item_storage_pars;
drop policy if exists stock_item_storage_pars_update_managers
  on public.stock_item_storage_pars;
drop policy if exists stock_item_storage_pars_delete_managers
  on public.stock_item_storage_pars;

drop table if exists public.stock_item_storage_pars;

commit;
