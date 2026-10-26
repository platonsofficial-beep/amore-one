-- Run with explicit owner approval
-- =============================================================================
-- Rollback checklist run RLS (SQL NOT APPLIED)
-- =============================================================================
-- Returns the tables to the locked state from unified_task_runs.sql:
-- RLS enabled, no policies, no grants for anon or authenticated.
-- Does not drop the tables and does not delete runs or steps.
-- Does not change operations_tasks or the shared operations helper functions.
-- =============================================================================

begin;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'operations_checklist_runs'
  loop
    execute format(
      'drop policy if exists %I on public.operations_checklist_runs',
      policy_row.policyname
    );
  end loop;

  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'operations_checklist_run_steps'
  loop
    execute format(
      'drop policy if exists %I on public.operations_checklist_run_steps',
      policy_row.policyname
    );
  end loop;
end $$;

revoke all on table public.operations_checklist_runs from public, anon, authenticated;
revoke all on table public.operations_checklist_run_steps from public, anon, authenticated;

revoke all on function public.checklist_run_workspace_id(uuid) from public, anon, authenticated;
drop function if exists public.checklist_run_workspace_id(uuid);

alter table public.operations_checklist_runs enable row level security;
alter table public.operations_checklist_run_steps enable row level security;

commit;
