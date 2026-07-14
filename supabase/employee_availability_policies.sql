-- RLS policies for employee_availability.
-- Run after employee_availability_schema.sql and stock_rls_policies.sql.

grant select, insert, update, delete on table public.employee_availability to authenticated;

alter table public.employee_availability enable row level security;

drop policy if exists employee_availability_select_members on public.employee_availability;
create policy employee_availability_select_members
  on public.employee_availability
  for select
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (
      public.can_manage_workspace_stock(workspace_id)
      or employee_id = (
        select wm.employee_id
        from public.workspace_members wm
        where wm.workspace_id = employee_availability.workspace_id
          and wm.auth_user_id = auth.uid()
        limit 1
      )
    )
  );

drop policy if exists employee_availability_insert_managers on public.employee_availability;
create policy employee_availability_insert_managers
  on public.employee_availability
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists employee_availability_insert_self on public.employee_availability;
create policy employee_availability_insert_self
  on public.employee_availability
  for insert
  to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and not public.can_manage_workspace_stock(workspace_id)
    and employee_id = (
      select wm.employee_id
      from public.workspace_members wm
      where wm.workspace_id = employee_availability.workspace_id
        and wm.auth_user_id = auth.uid()
      limit 1
    )
  );

drop policy if exists employee_availability_update_managers on public.employee_availability;
create policy employee_availability_update_managers
  on public.employee_availability
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists employee_availability_update_self on public.employee_availability;
create policy employee_availability_update_self
  on public.employee_availability
  for update
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and not public.can_manage_workspace_stock(workspace_id)
    and employee_id = (
      select wm.employee_id
      from public.workspace_members wm
      where wm.workspace_id = employee_availability.workspace_id
        and wm.auth_user_id = auth.uid()
      limit 1
    )
  )
  with check (
    public.is_workspace_member(workspace_id)
    and not public.can_manage_workspace_stock(workspace_id)
    and employee_id = (
      select wm.employee_id
      from public.workspace_members wm
      where wm.workspace_id = employee_availability.workspace_id
        and wm.auth_user_id = auth.uid()
      limit 1
    )
  );

drop policy if exists employee_availability_delete_managers on public.employee_availability;
create policy employee_availability_delete_managers
  on public.employee_availability
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));
