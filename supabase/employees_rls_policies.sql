-- RLS policies for employees and employee_positions.
-- Run after employees_schema.sql and stock_rls_policies.sql.

grant select, insert, update, delete on table public.employees to authenticated;
grant select, insert, update, delete on table public.employee_positions to authenticated;

alter table public.employees enable row level security;
alter table public.employee_positions enable row level security;

drop policy if exists employees_select_members on public.employees;
create policy employees_select_members
  on public.employees
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists employees_insert_managers on public.employees;
create policy employees_insert_managers
  on public.employees
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists employees_update_managers on public.employees;
create policy employees_update_managers
  on public.employees
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists employees_delete_managers on public.employees;
create policy employees_delete_managers
  on public.employees
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

drop policy if exists employee_positions_select_members on public.employee_positions;
create policy employee_positions_select_members
  on public.employee_positions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.employees e
      where e.id = employee_positions.employee_id
        and public.is_workspace_member(e.workspace_id)
    )
  );

drop policy if exists employee_positions_insert_managers on public.employee_positions;
create policy employee_positions_insert_managers
  on public.employee_positions
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.employees e
      where e.id = employee_positions.employee_id
        and public.can_manage_workspace_stock(e.workspace_id)
    )
  );

drop policy if exists employee_positions_update_managers on public.employee_positions;
create policy employee_positions_update_managers
  on public.employee_positions
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.employees e
      where e.id = employee_positions.employee_id
        and public.can_manage_workspace_stock(e.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.employees e
      where e.id = employee_positions.employee_id
        and public.can_manage_workspace_stock(e.workspace_id)
    )
  );

drop policy if exists employee_positions_delete_managers on public.employee_positions;
create policy employee_positions_delete_managers
  on public.employee_positions
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.employees e
      where e.id = employee_positions.employee_id
        and public.can_manage_workspace_stock(e.workspace_id)
    )
  );
