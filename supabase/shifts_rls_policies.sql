-- RLS policies for draft shifts.
-- Run after shifts_schema.sql and stock_rls_policies.sql.

grant select, insert, update, delete on table public.shifts to authenticated;

alter table public.shifts enable row level security;

drop policy if exists shifts_select_members on public.shifts;
create policy shifts_select_members
  on public.shifts
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists shifts_insert_managers on public.shifts;
create policy shifts_insert_managers
  on public.shifts
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists shifts_update_managers on public.shifts;
create policy shifts_update_managers
  on public.shifts
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists shifts_delete_managers on public.shifts;
create policy shifts_delete_managers
  on public.shifts
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));
