-- TEMP DEVELOPMENT ONLY — replace with workspace/auth policies before production.
-- Local prototype: no Supabase Auth. Permissive access for anon + authenticated.
-- Table: public.published_shifts only.

alter table public.published_shifts enable row level security;

drop policy if exists published_shifts_select_own on public.published_shifts;
drop policy if exists published_shifts_insert_own on public.published_shifts;
drop policy if exists published_shifts_update_own on public.published_shifts;
drop policy if exists published_shifts_delete_own on public.published_shifts;
drop policy if exists published_shifts_dev_select_all on public.published_shifts;
drop policy if exists published_shifts_dev_insert_all on public.published_shifts;
drop policy if exists published_shifts_dev_update_all on public.published_shifts;
drop policy if exists published_shifts_dev_delete_all on public.published_shifts;

-- TEMP DEVELOPMENT ONLY — replace with workspace/auth policies before production.
create policy published_shifts_dev_select_all
  on public.published_shifts
  for select
  to anon, authenticated
  using (true);

-- TEMP DEVELOPMENT ONLY — replace with workspace/auth policies before production.
create policy published_shifts_dev_insert_all
  on public.published_shifts
  for insert
  to anon, authenticated
  with check (true);

-- TEMP DEVELOPMENT ONLY — replace with workspace/auth policies before production.
create policy published_shifts_dev_update_all
  on public.published_shifts
  for update
  to anon, authenticated
  using (true)
  with check (true);

-- TEMP DEVELOPMENT ONLY — replace with workspace/auth policies before production.
create policy published_shifts_dev_delete_all
  on public.published_shifts
  for delete
  to anon, authenticated
  using (true);
