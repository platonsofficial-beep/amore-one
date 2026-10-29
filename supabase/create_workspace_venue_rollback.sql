-- Rollback for create_workspace_venue.sql. Restores pre-2026-10-29 state
-- (original definitions in backup-20261029/). Does not delete venues created meanwhile.
drop function if exists public.create_workspace_venue(text, text, text, text, text, text);
drop policy if exists workspaces_select_members on public.workspaces;
grant insert, update, delete, truncate on public.workspaces to anon, authenticated;

drop policy if exists workspace_profiles_select_members on public.workspace_profiles;
create policy workspace_profiles_select_members on public.workspace_profiles
  for select to authenticated using (public.has_any_workspace_membership());
drop policy if exists workspace_profiles_insert_managers on public.workspace_profiles;
create policy workspace_profiles_insert_managers on public.workspace_profiles
  for insert to authenticated with check (public.can_manage_workspace_profile());
drop policy if exists workspace_profiles_update_managers on public.workspace_profiles;
create policy workspace_profiles_update_managers on public.workspace_profiles
  for update to authenticated using (public.can_manage_workspace_profile())
  with check (public.can_manage_workspace_profile());
drop policy if exists workspace_profiles_delete_managers on public.workspace_profiles;
create policy workspace_profiles_delete_managers on public.workspace_profiles
  for delete to authenticated using (public.can_manage_workspace_profile());

drop index if exists public.workspace_profiles_workspace_id_unique;
drop function if exists public.has_any_workspace_membership(uuid);
drop function if exists public.can_manage_workspace_profile(uuid);
