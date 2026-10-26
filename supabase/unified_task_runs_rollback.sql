-- Rollback for unified_task_runs.sql.
-- SQL NOT APPLIED. Run only with owner approval, after that migration.
--
-- Drops the copied run and step tables. Does not change operations_tasks,
-- checklist templates, checklist items, board tasks, or completion history.

begin;

drop table if exists public.operations_checklist_run_steps;
drop table if exists public.operations_checklist_runs;

commit;
