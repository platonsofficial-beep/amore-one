-- Run with explicit owner approval
-- =============================================================================
-- Checklist run step shape (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor. Do NOT auto-run from the app.
-- Idempotent. One transaction.
--
-- Lets a checklist run store steps that are not copies of operations_tasks,
-- and lets one simple operations task own a run of steps:
--   operations_checklist_run_steps.source_task_id  nullable
--   operations_checklist_runs.template_id          nullable
--   operations_checklist_runs.operations_task_id   nullable FK to operations_tasks
--   a run must have a template_id or an operations_task_id
--
-- Existing copied runs keep their template_id. Existing copied steps keep
-- their source_task_id. This script does not insert, update, or delete rows.
-- It does not change grants or policies. Apply unified_task_runs_rls.sql
-- before the app can read these tables.
--
-- Postgres unique (workspace_id, template_id, due_date) allows more than one
-- row with a null template_id, so several simple-task runs can coexist.
-- operations_task_id is unique when it is set.
-- =============================================================================

begin;

alter table public.operations_checklist_run_steps
  alter column source_task_id drop not null;

alter table public.operations_checklist_runs
  alter column template_id drop not null;

alter table public.operations_checklist_runs
  add column if not exists operations_task_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'operations_checklist_runs_operations_task_id_fkey'
      and conrelid = 'public.operations_checklist_runs'::regclass
  ) then
    alter table public.operations_checklist_runs
      add constraint operations_checklist_runs_operations_task_id_fkey
      foreign key (operations_task_id)
      references public.operations_tasks(id)
      on delete cascade;
  end if;
end $$;

create unique index if not exists operations_checklist_runs_operations_task_uidx
  on public.operations_checklist_runs (operations_task_id)
  where operations_task_id is not null;

alter table public.operations_checklist_runs
  drop constraint if exists operations_checklist_runs_owner_check;

alter table public.operations_checklist_runs
  add constraint operations_checklist_runs_owner_check
  check (template_id is not null or operations_task_id is not null);

commit;
