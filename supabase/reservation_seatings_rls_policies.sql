-- RLS policies for reservation_seatings.
-- Run after reservation_seatings_schema.sql and stock_rls_policies.sql.

grant select, insert, update, delete on table public.reservation_seatings to authenticated;

alter table public.reservation_seatings enable row level security;

drop policy if exists reservation_seatings_select_members on public.reservation_seatings;
create policy reservation_seatings_select_members
  on public.reservation_seatings
  for select
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (
      is_active = true
      or public.can_manage_workspace_stock(workspace_id)
    )
  );

drop policy if exists reservation_seatings_insert_managers on public.reservation_seatings;
create policy reservation_seatings_insert_managers
  on public.reservation_seatings
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists reservation_seatings_update_managers on public.reservation_seatings;
create policy reservation_seatings_update_managers
  on public.reservation_seatings
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists reservation_seatings_delete_managers on public.reservation_seatings;
create policy reservation_seatings_delete_managers
  on public.reservation_seatings
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

-- Allow hosts to create and update reservations (read/use seatings in host station).
create or replace function public.can_manage_workspace_reservations(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.auth_user_id = auth.uid()
      and wm.role in ('owner', 'general_manager', 'manager', 'host')
  );
$$;

revoke all on function public.can_manage_workspace_reservations(uuid) from public;
grant execute on function public.can_manage_workspace_reservations(uuid) to authenticated;

drop policy if exists reservations_insert_managers on public.reservations;
create policy reservations_insert_managers
  on public.reservations
  for insert
  to authenticated
  with check (public.can_manage_workspace_reservations(workspace_id));

drop policy if exists reservations_update_managers on public.reservations;
create policy reservations_update_managers
  on public.reservations
  for update
  to authenticated
  using (public.can_manage_workspace_reservations(workspace_id))
  with check (public.can_manage_workspace_reservations(workspace_id));

drop policy if exists reservations_delete_managers on public.reservations;
create policy reservations_delete_managers
  on public.reservations
  for delete
  to authenticated
  using (public.can_manage_workspace_reservations(workspace_id));
