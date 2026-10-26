-- =============================================================================
-- Storage display-name rename (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor. Do NOT auto-run from the app.
-- Idempotent. One transaction.
--
-- Managers can already UPDATE workspace_storages
-- (policy workspace_storages_update_managers, can_manage_workspace_stock).
-- This script does not add or change RLS.
--
-- The live check workspace_storages_name_equals_location_key_chk forces
-- name = location_key, so a display-name rename is rejected until this drops.
-- location_key stays immutable (prevent_workspace_storages_key_mutation).
-- Duplicate display names stay blocked by
-- workspace_storages_workspace_name_normalized_uidx.
--
-- Does NOT:
--   - Update any row
--   - Change location_key, stock_items.storage_location, pars, balances, or counts
--   - Add an UPDATE policy (one already allows owner / general manager / manager)
--
-- Prerequisite: public.workspace_storages.
-- Verify: supabase/workspace_storage_rename_verify.sql
-- Rollback: supabase/workspace_storage_rename_rollback.sql
-- =============================================================================

begin;

alter table public.workspace_storages
  drop constraint if exists workspace_storages_name_equals_location_key_chk;

comment on column public.workspace_storages.name is
  'User-facing display name. May differ from location_key. location_key stays the operational key for stock_items.storage_location, pars, counts, receive, and balances.';

commit;
