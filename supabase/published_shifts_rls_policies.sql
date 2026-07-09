-- RLS policies for schedule_publications and published_shifts.
-- Run in the Supabase SQL editor after:
--   workspace_members_rls_policies.sql (provides has_any_workspace_membership)
--   schedule_publications_schema.sql
--   published_shifts_schema.sql
--
-- Schema assumptions (production):
--   schedule_publications columns: id, week_start_date, status, published_at,
--     unpublished_at, created_at
--   Neither schedule_publications nor published_shifts has workspace_id.
--   There is no published_by column in production.
--
-- v1 single-workspace model:
--   Membership is resolved through workspace_members only. Helpers below check
--   whether the authenticated user belongs to (or manages) any workspace row.
--   This matches ONE v1 where one deployment serves one restaurant workspace.
--
-- Security model:
--   SELECT  — any workspace member (owner, GM, manager, staff)
--   INSERT/UPDATE/DELETE — owner, general_manager, or manager only
--     (same role set as draft shifts in shifts_rls_policies.sql)

-- Remove legacy objects that referenced schedule_publications.published_by.
drop trigger if exists trg_schedule_publications_set_published_by on public.schedule_publications;
drop function if exists public.set_schedule_publication_published_by();
drop function if exists public.is_own_schedule_publication(uuid);

create or replace function public.can_manage_any_workspace_schedule()
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
      and wm.role in ('owner', 'general_manager', 'manager')
  );
$$;

revoke all on function public.can_manage_any_workspace_schedule() from public;
grant execute on function public.can_manage_any_workspace_schedule() to authenticated;

-- ---------------------------------------------------------------------------
-- schedule_publications
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on table public.schedule_publications to authenticated;

alter table public.schedule_publications enable row level security;

drop policy if exists schedule_publications_dev_select_all on public.schedule_publications;
drop policy if exists schedule_publications_dev_insert_all on public.schedule_publications;
drop policy if exists schedule_publications_dev_update_all on public.schedule_publications;
drop policy if exists schedule_publications_dev_delete_all on public.schedule_publications;
drop policy if exists schedule_publications_select_members on public.schedule_publications;
drop policy if exists schedule_publications_insert_managers on public.schedule_publications;
drop policy if exists schedule_publications_update_managers on public.schedule_publications;
drop policy if exists schedule_publications_delete_managers on public.schedule_publications;

create policy schedule_publications_select_members
  on public.schedule_publications
  for select
  to authenticated
  using (public.has_any_workspace_membership());

create policy schedule_publications_insert_managers
  on public.schedule_publications
  for insert
  to authenticated
  with check (public.can_manage_any_workspace_schedule());

create policy schedule_publications_update_managers
  on public.schedule_publications
  for update
  to authenticated
  using (public.can_manage_any_workspace_schedule())
  with check (public.can_manage_any_workspace_schedule());

create policy schedule_publications_delete_managers
  on public.schedule_publications
  for delete
  to authenticated
  using (public.can_manage_any_workspace_schedule());

-- ---------------------------------------------------------------------------
-- published_shifts
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on table public.published_shifts to authenticated;

alter table public.published_shifts enable row level security;

drop policy if exists published_shifts_dev_select_all on public.published_shifts;
drop policy if exists published_shifts_dev_insert_all on public.published_shifts;
drop policy if exists published_shifts_dev_update_all on public.published_shifts;
drop policy if exists published_shifts_dev_delete_all on public.published_shifts;
drop policy if exists published_shifts_select_own on public.published_shifts;
drop policy if exists published_shifts_insert_own on public.published_shifts;
drop policy if exists published_shifts_update_own on public.published_shifts;
drop policy if exists published_shifts_delete_own on public.published_shifts;
drop policy if exists published_shifts_select_members on public.published_shifts;
drop policy if exists published_shifts_insert_managers on public.published_shifts;
drop policy if exists published_shifts_update_managers on public.published_shifts;
drop policy if exists published_shifts_delete_managers on public.published_shifts;

create policy published_shifts_select_members
  on public.published_shifts
  for select
  to authenticated
  using (public.has_any_workspace_membership());

create policy published_shifts_insert_managers
  on public.published_shifts
  for insert
  to authenticated
  with check (public.can_manage_any_workspace_schedule());

create policy published_shifts_update_managers
  on public.published_shifts
  for update
  to authenticated
  using (public.can_manage_any_workspace_schedule())
  with check (public.can_manage_any_workspace_schedule());

create policy published_shifts_delete_managers
  on public.published_shifts
  for delete
  to authenticated
  using (public.can_manage_any_workspace_schedule());
