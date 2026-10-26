-- Run with explicit owner approval
-- =============================================================================
-- Checklist run RLS (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor. Do NOT auto-run from the app.
-- Idempotent. One transaction.
--
-- Opens public.operations_checklist_runs and public.operations_checklist_run_steps
-- with the same workspace rules as public.operations_tasks:
--   SELECT                         workspace members
--   INSERT / DELETE                managers (can_manage_workspace_operations)
--   UPDATE                         managers
--   UPDATE steps, staff completion members who can complete that step
--                                  (assignee is null, or assignee is the member)
--                                  and who are not managers
--
-- Runs have no assignee. Staff complete steps. The app derives the run status
-- from those steps, so staff do not need UPDATE on the parent run.
--
-- Steps have no workspace_id. checklist_run_workspace_id() resolves the parent
-- run the same way checklist item policies resolve a template. It is security
-- definer, search_path is pinned to public, and EXECUTE is granted only to
-- authenticated. anon and public cannot execute it.
--
-- Grants are authenticated only. anon and public stay revoked. RLS stays on.
-- This script does not insert, update, or delete runs or steps.
--
-- Prerequisites: unified_task_runs.sql already applied,
-- public.is_workspace_member(uuid), public.can_manage_workspace_operations(uuid),
-- public.can_complete_operations_task(uuid, uuid).
-- =============================================================================

begin;

create or replace function public.checklist_run_workspace_id(target_run_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.workspace_id
  from public.operations_checklist_runs r
  where r.id = target_run_id
  limit 1;
$$;

revoke all on function public.checklist_run_workspace_id(uuid) from public;
revoke all on function public.checklist_run_workspace_id(uuid) from anon;
revoke all on function public.checklist_run_workspace_id(uuid) from authenticated;
grant execute on function public.checklist_run_workspace_id(uuid) to authenticated;

grant select, insert, update, delete on table public.operations_checklist_runs to authenticated;
grant select, insert, update, delete on table public.operations_checklist_run_steps to authenticated;

revoke all on table public.operations_checklist_runs from anon;
revoke all on table public.operations_checklist_run_steps from anon;
revoke all on table public.operations_checklist_runs from public;
revoke all on table public.operations_checklist_run_steps from public;

alter table public.operations_checklist_runs enable row level security;
alter table public.operations_checklist_run_steps enable row level security;

-- operations_checklist_runs

drop policy if exists operations_checklist_runs_select_members on public.operations_checklist_runs;
create policy operations_checklist_runs_select_members
  on public.operations_checklist_runs
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists operations_checklist_runs_insert_managers on public.operations_checklist_runs;
create policy operations_checklist_runs_insert_managers
  on public.operations_checklist_runs
  for insert
  to authenticated
  with check (public.can_manage_workspace_operations(workspace_id));

drop policy if exists operations_checklist_runs_update_managers on public.operations_checklist_runs;
create policy operations_checklist_runs_update_managers
  on public.operations_checklist_runs
  for update
  to authenticated
  using (public.can_manage_workspace_operations(workspace_id))
  with check (public.can_manage_workspace_operations(workspace_id));

drop policy if exists operations_checklist_runs_delete_managers on public.operations_checklist_runs;
create policy operations_checklist_runs_delete_managers
  on public.operations_checklist_runs
  for delete
  to authenticated
  using (public.can_manage_workspace_operations(workspace_id));

-- operations_checklist_run_steps

drop policy if exists operations_checklist_run_steps_select_members on public.operations_checklist_run_steps;
create policy operations_checklist_run_steps_select_members
  on public.operations_checklist_run_steps
  for select
  to authenticated
  using (public.is_workspace_member(public.checklist_run_workspace_id(run_id)));

drop policy if exists operations_checklist_run_steps_insert_managers on public.operations_checklist_run_steps;
create policy operations_checklist_run_steps_insert_managers
  on public.operations_checklist_run_steps
  for insert
  to authenticated
  with check (public.can_manage_workspace_operations(public.checklist_run_workspace_id(run_id)));

drop policy if exists operations_checklist_run_steps_update_managers on public.operations_checklist_run_steps;
create policy operations_checklist_run_steps_update_managers
  on public.operations_checklist_run_steps
  for update
  to authenticated
  using (public.can_manage_workspace_operations(public.checklist_run_workspace_id(run_id)))
  with check (public.can_manage_workspace_operations(public.checklist_run_workspace_id(run_id)));

drop policy if exists operations_checklist_run_steps_update_staff_complete on public.operations_checklist_run_steps;
create policy operations_checklist_run_steps_update_staff_complete
  on public.operations_checklist_run_steps
  for update
  to authenticated
  using (
    public.can_complete_operations_task(public.checklist_run_workspace_id(run_id), assigned_to)
    and not public.can_manage_workspace_operations(public.checklist_run_workspace_id(run_id))
  )
  with check (
    public.can_complete_operations_task(public.checklist_run_workspace_id(run_id), assigned_to)
    and not public.can_manage_workspace_operations(public.checklist_run_workspace_id(run_id))
  );

drop policy if exists operations_checklist_run_steps_delete_managers on public.operations_checklist_run_steps;
create policy operations_checklist_run_steps_delete_managers
  on public.operations_checklist_run_steps
  for delete
  to authenticated
  using (public.can_manage_workspace_operations(public.checklist_run_workspace_id(run_id)));

commit;
