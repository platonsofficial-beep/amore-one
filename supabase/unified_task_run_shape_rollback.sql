-- Run with explicit owner approval
-- =============================================================================
-- Rollback checklist run step shape (SQL NOT APPLIED)
-- =============================================================================
-- Removes only rows that need the new shape, then restores the copied-run
-- columns. Does not delete a run that still has a source operations task,
-- and does not delete a step whose source_task_id is set.
-- Does not change operations_tasks, templates, or completion history on
-- those source tasks.
--
-- Safe to run only after unified_task_run_shape.sql. If that transaction
-- raised before commit, nothing changed and this file does not need to run.
-- =============================================================================

begin;

delete from public.operations_checklist_run_steps
where source_task_id is null;

delete from public.operations_checklist_runs
where operations_task_id is not null;

delete from public.operations_checklist_runs as run
where not exists (
  select 1
  from public.operations_checklist_run_steps as step
  where step.run_id = run.id
);

do $$
begin
  if exists (
    select 1
    from public.operations_checklist_runs
    where template_id is null
       or operations_task_id is not null
  ) or exists (
    select 1
    from public.operations_checklist_run_steps
    where source_task_id is null
  ) then
    raise exception 'unified_task_run_shape_rollback_blocked';
  end if;
end $$;

alter table public.operations_checklist_runs
  drop constraint if exists operations_checklist_runs_owner_check;

drop index if exists public.operations_checklist_runs_operations_task_uidx;

alter table public.operations_checklist_runs
  drop constraint if exists operations_checklist_runs_operations_task_id_fkey;

alter table public.operations_checklist_runs
  drop column if exists operations_task_id;

alter table public.operations_checklist_runs
  alter column template_id set not null;

alter table public.operations_checklist_run_steps
  alter column source_task_id set not null;

commit;
