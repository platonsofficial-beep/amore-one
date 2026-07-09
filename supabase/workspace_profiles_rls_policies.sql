-- RLS policies for workspace_profiles (authenticated users).
-- Prerequisite: public.workspace_profiles, workspace_members_rls_policies.sql (has_any_workspace_membership).
-- Singleton profile keyed by workspace_key = 'default' (v1 single-workspace model).

create or replace function public.can_manage_workspace_profile()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.auth_user_id = auth.uid()
      and wm.role in ('owner', 'general_manager')
  );
$$;

revoke all on function public.can_manage_workspace_profile() from public;
grant execute on function public.can_manage_workspace_profile() to authenticated;

grant select, insert, update, delete on table public.workspace_profiles to authenticated;

alter table public.workspace_profiles enable row level security;

drop policy if exists workspace_profiles_dev_select_all on public.workspace_profiles;
drop policy if exists workspace_profiles_dev_insert_all on public.workspace_profiles;
drop policy if exists workspace_profiles_dev_update_all on public.workspace_profiles;
drop policy if exists workspace_profiles_dev_delete_all on public.workspace_profiles;
drop policy if exists workspace_profiles_select_members on public.workspace_profiles;
drop policy if exists workspace_profiles_insert_managers on public.workspace_profiles;
drop policy if exists workspace_profiles_update_managers on public.workspace_profiles;
drop policy if exists workspace_profiles_delete_managers on public.workspace_profiles;

create policy workspace_profiles_select_members
  on public.workspace_profiles
  for select
  to authenticated
  using (public.has_any_workspace_membership());

create policy workspace_profiles_insert_managers
  on public.workspace_profiles
  for insert
  to authenticated
  with check (public.can_manage_workspace_profile());

create policy workspace_profiles_update_managers
  on public.workspace_profiles
  for update
  to authenticated
  using (public.can_manage_workspace_profile())
  with check (public.can_manage_workspace_profile());

create policy workspace_profiles_delete_managers
  on public.workspace_profiles
  for delete
  to authenticated
  using (public.can_manage_workspace_profile());
