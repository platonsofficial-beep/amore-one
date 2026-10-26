-- =============================================================================
-- Buying storages (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor. Do NOT auto-run from the app.
-- Idempotent. One transaction.
--
-- A buying storage is replenished by a supplier order even when it is not a
-- supply storage. Supply storages stay order sources without this flag.
-- What-to-order sums par minus on-hand on supply storages and buying storages.
--
-- This script:
--   - Adds workspace_storages.is_buying boolean not null default false
--   - Adds a non-unique partial index for buying lookups
--
-- Does NOT:
--   - Change is_supply, department_id, location_key, or quantities
--   - Insert, delete, or archive storages
--   - Change RLS or grants (the column follows workspace_storages)
--   - Mark any existing storage as buying
--
-- Existing rows: is_buying becomes false. Nulls on a re-run are set false
-- before the column is required.
--
-- Prerequisite: public.workspace_storages.
-- Verify: supabase/workspace_storage_buying_verify.sql
-- Rollback: supabase/workspace_storage_buying_rollback.sql
-- =============================================================================

begin;

alter table public.workspace_storages
  add column if not exists is_buying boolean;

alter table public.workspace_storages
  alter column is_buying set default false;

update public.workspace_storages
set is_buying = false
where is_buying is null;

alter table public.workspace_storages
  alter column is_buying set not null;

comment on column public.workspace_storages.is_buying is
  'True = this storage is an order source even when is_supply is false. False = not a buying storage. Supply storages are order sources either way. Not unique.';

create index if not exists workspace_storages_workspace_buying_idx
  on public.workspace_storages (workspace_id)
  where is_buying;

commit;
