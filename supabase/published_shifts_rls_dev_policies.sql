-- TEMP DEVELOPMENT POLICY — replace with workspace/auth policies before production
-- Allows anon + authenticated full access to published_shifts for local prototype use.
-- Prerequisite: public.published_shifts exists with RLS enabled.
-- Run in the Supabase SQL editor.

alter table public.published_shifts enable row level security;

-- Remove production / prior restrictive policies
drop policy if exists published_shifts_select_own on public.published_shifts;
drop policy if exists published_shifts_insert_own on public.published_shifts;
drop policy if exists published_shifts_update_own on public.published_shifts;
drop policy if exists published_shifts_delete_own on public.published_shifts;

-- Remove prior dev policies (safe to re-run)
drop policy if exists published_shifts_dev_select_all on public.published_shifts;
drop policy if exists published_shifts_dev_insert_all on public.published_shifts;
drop policy if exists published_shifts_dev_update_all on public.published_shifts;
drop policy if exists published_shifts_dev_delete_all on public.published_shifts;

-- TEMP DEVELOPMENT POLICY — replace with workspace/auth policies before production
create policy published_shifts_dev_select_all
  on public.published_shifts
  for select
  to anon, authenticated
  using (true);

-- TEMP DEVELOPMENT POLICY — replace with workspace/auth policies before production
create policy published_shifts_dev_insert_all
  on public.published_shifts
  for insert
  to anon, authenticated
  with check (true);

-- TEMP DEVELOPMENT POLICY — replace with workspace/auth policies before production
create policy published_shifts_dev_update_all
  on public.published_shifts
  for update
  to anon, authenticated
  using (true)
  with check (true);

-- TEMP DEVELOPMENT POLICY — replace with workspace/auth policies before production
create policy published_shifts_dev_delete_all
  on public.published_shifts
  for delete
  to anon, authenticated
  using (true);
