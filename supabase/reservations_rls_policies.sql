-- RLS policies for reservations.
-- Run after reservations_schema.sql and stock_rls_policies.sql.

grant select, insert, update, delete on table public.reservations to authenticated;

alter table public.reservations enable row level security;

drop policy if exists reservations_select_members on public.reservations;
create policy reservations_select_members
  on public.reservations
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists reservations_insert_managers on public.reservations;
create policy reservations_insert_managers
  on public.reservations
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists reservations_update_managers on public.reservations;
create policy reservations_update_managers
  on public.reservations
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists reservations_delete_managers on public.reservations;
create policy reservations_delete_managers
  on public.reservations
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));
