-- TEMP DEVELOPMENT ONLY — replace with workspace/auth policies before production.
-- Local prototype: no Supabase Auth. Permissive access for anon + authenticated.
-- Table: public.workspace_profiles only.

alter table public.workspace_profiles enable row level security;

drop policy if exists workspace_profiles_dev_select_all on public.workspace_profiles;
drop policy if exists workspace_profiles_dev_insert_all on public.workspace_profiles;
drop policy if exists workspace_profiles_dev_update_all on public.workspace_profiles;
drop policy if exists workspace_profiles_dev_delete_all on public.workspace_profiles;

-- TEMP DEVELOPMENT ONLY — replace with workspace/auth policies before production.
create policy workspace_profiles_dev_select_all
  on public.workspace_profiles
  for select
  to anon, authenticated
  using (true);

-- TEMP DEVELOPMENT ONLY — replace with workspace/auth policies before production.
create policy workspace_profiles_dev_insert_all
  on public.workspace_profiles
  for insert
  to anon, authenticated
  with check (true);

-- TEMP DEVELOPMENT ONLY — replace with workspace/auth policies before production.
create policy workspace_profiles_dev_update_all
  on public.workspace_profiles
  for update
  to anon, authenticated
  using (true)
  with check (true);

-- TEMP DEVELOPMENT ONLY — replace with workspace/auth policies before production.
create policy workspace_profiles_dev_delete_all
  on public.workspace_profiles
  for delete
  to anon, authenticated
  using (true);
