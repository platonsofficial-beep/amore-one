-- RLS policies for operations_tasks and operations_logs.
-- Run after operations_tasks_schema.sql and operations_logs_schema.sql.
-- Requires public.is_workspace_member and public.can_manage_workspace_stock from stock_rls_policies.sql.

create or replace function public.can_manage_workspace_operations(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_workspace_stock(target_workspace_id);
$$;

create or replace function public.current_member_employee_id(target_workspace_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select wm.employee_id
  from public.workspace_members wm
  where wm.workspace_id = target_workspace_id
    and wm.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_complete_operations_task(
  target_workspace_id uuid,
  task_assigned_to uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_workspace_member(target_workspace_id)
    and (
      task_assigned_to is null
      or task_assigned_to = public.current_member_employee_id(target_workspace_id)
    );
$$;

revoke all on function public.can_manage_workspace_operations(uuid) from public;
revoke all on function public.current_member_employee_id(uuid) from public;
revoke all on function public.can_complete_operations_task(uuid, uuid) from public;

grant execute on function public.can_manage_workspace_operations(uuid) to authenticated;
grant execute on function public.current_member_employee_id(uuid) to authenticated;
grant execute on function public.can_complete_operations_task(uuid, uuid) to authenticated;

grant select, insert, update, delete on table public.operations_tasks to authenticated;
grant select, insert, update, delete on table public.operations_logs to authenticated;

alter table public.operations_tasks enable row level security;
alter table public.operations_logs enable row level security;

-- operations_tasks

drop policy if exists operations_tasks_select_members on public.operations_tasks;
create policy operations_tasks_select_members
  on public.operations_tasks
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists operations_tasks_insert_managers on public.operations_tasks;
create policy operations_tasks_insert_managers
  on public.operations_tasks
  for insert
  to authenticated
  with check (public.can_manage_workspace_operations(workspace_id));

drop policy if exists operations_tasks_update_managers on public.operations_tasks;
create policy operations_tasks_update_managers
  on public.operations_tasks
  for update
  to authenticated
  using (public.can_manage_workspace_operations(workspace_id))
  with check (public.can_manage_workspace_operations(workspace_id));

drop policy if exists operations_tasks_update_staff_complete on public.operations_tasks;
create policy operations_tasks_update_staff_complete
  on public.operations_tasks
  for update
  to authenticated
  using (
    public.can_complete_operations_task(workspace_id, assigned_to)
    and not public.can_manage_workspace_operations(workspace_id)
  )
  with check (
    public.can_complete_operations_task(workspace_id, assigned_to)
    and not public.can_manage_workspace_operations(workspace_id)
  );

drop policy if exists operations_tasks_delete_managers on public.operations_tasks;
create policy operations_tasks_delete_managers
  on public.operations_tasks
  for delete
  to authenticated
  using (public.can_manage_workspace_operations(workspace_id));

-- operations_logs

drop policy if exists operations_logs_select_members on public.operations_logs;
create policy operations_logs_select_members
  on public.operations_logs
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists operations_logs_insert_managers on public.operations_logs;
create policy operations_logs_insert_managers
  on public.operations_logs
  for insert
  to authenticated
  with check (public.can_manage_workspace_operations(workspace_id));

drop policy if exists operations_logs_update_managers on public.operations_logs;
create policy operations_logs_update_managers
  on public.operations_logs
  for update
  to authenticated
  using (public.can_manage_workspace_operations(workspace_id))
  with check (public.can_manage_workspace_operations(workspace_id));

drop policy if exists operations_logs_delete_managers on public.operations_logs;
create policy operations_logs_delete_managers
  on public.operations_logs
  for delete
  to authenticated
  using (public.can_manage_workspace_operations(workspace_id));
