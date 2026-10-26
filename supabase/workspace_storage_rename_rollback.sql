-- Rollback storage display-name rename.
-- Restores name = location_key. Refuses when any display name has already drifted.
-- Does not change location_key or stock rows.

begin;

do $$
begin
  if exists (
    select 1
    from public.workspace_storages
    where name is distinct from location_key
  ) then
    raise exception 'workspace_storage_rename_rollback_blocked_drifted_names';
  end if;
end $$;

alter table public.workspace_storages
  drop constraint if exists workspace_storages_name_equals_location_key_chk;

alter table public.workspace_storages
  add constraint workspace_storages_name_equals_location_key_chk
  check (name = location_key);

comment on column public.workspace_storages.name is
  'User-facing display name. V1 requires name = location_key.';

commit;
