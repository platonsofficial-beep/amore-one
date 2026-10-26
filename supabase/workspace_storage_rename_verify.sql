-- Verify storage display-name rename. Read-only. Raises on failure.
-- Run after workspace_storage_rename.sql commits.
-- Does not change data.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.workspace_storages'::regclass
      and conname = 'workspace_storages_name_equals_location_key_chk'
  ) then
    raise exception 'verify_failed_name_still_equals_location_key';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_storages'
      and policyname = 'workspace_storages_update_managers'
      and cmd = 'UPDATE'
  ) then
    raise exception 'verify_failed_manager_update_policy';
  end if;

  if to_regprocedure('public.prevent_workspace_storages_key_mutation()') is null then
    raise exception 'verify_failed_location_key_immutable';
  end if;

  if not exists (
    select 1
    from pg_proc
    where oid = 'public.prevent_workspace_storages_key_mutation()'::regprocedure
      and pg_get_functiondef(oid) ilike '%workspace_storages_location_key_immutable%'
  ) then
    raise exception 'verify_failed_location_key_immutable_body';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.workspace_storages'::regclass
      and conname = 'workspace_storages_workspace_name_normalized_uidx'
  ) then
    raise exception 'verify_failed_duplicate_name_unique';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.workspace_storages'::regclass
      and conname = 'workspace_storages_workspace_location_key_uidx'
  ) then
    raise exception 'verify_failed_location_key_unique';
  end if;
end $$;
