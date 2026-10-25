-- =============================================================================
-- Departments and supply storages ROLLBACK (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Run only to undo supabase/workspace_departments.sql
-- after that file has been applied. Do NOT auto-run from the app.
-- Idempotent. Wrapped in begin/commit.
--
-- Drops department assignment and the supply flag, then drops
-- workspace_departments. Department names and which storages were supply
-- storages are not restored. location_key and quantity data stay.
--
-- Rollback of this rollback:
--   Re-apply supabase/workspace_departments.sql.
--   That recreates the empty structure. It does not restore dropped
--   department rows or is_supply values.
-- =============================================================================

begin;

drop trigger if exists workspace_storages_enforce_department_workspace
  on public.workspace_storages;

drop function if exists public.workspace_storages_enforce_department_workspace();

drop index if exists public.workspace_storages_department_id_idx;
drop index if exists public.workspace_storages_workspace_supply_idx;

alter table public.workspace_storages
  drop column if exists department_id;

alter table public.workspace_storages
  drop column if exists is_supply;

drop trigger if exists workspace_departments_set_updated_at
  on public.workspace_departments;

drop trigger if exists workspace_departments_prevent_workspace_mutation
  on public.workspace_departments;

drop function if exists public.set_workspace_departments_updated_at();
drop function if exists public.prevent_workspace_departments_workspace_mutation();

drop policy if exists workspace_departments_select_members
  on public.workspace_departments;
drop policy if exists workspace_departments_insert_managers
  on public.workspace_departments;
drop policy if exists workspace_departments_update_managers
  on public.workspace_departments;

drop table if exists public.workspace_departments;

commit;
