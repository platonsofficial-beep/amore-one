-- Read-only checks after unified_task_runs.sql.
-- Do not update, insert, or delete. SQL NOT APPLIED until the owner approves the migration.

select
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('operations_checklist_runs', 'operations_checklist_run_steps')
order by table_name;

select
  (select count(*) from public.operations_tasks) as operations_tasks_total,
  (select count(*)
   from public.operations_tasks
   where checklist_template_id is not null
     and due_date is not null) as source_checklist_steps,
  (select count(*) from public.operations_checklist_runs) as copied_runs,
  (select count(*) from public.operations_checklist_run_steps) as copied_steps;

select
  count(*) as source_groups
from (
  select workspace_id, checklist_template_id, due_date
  from public.operations_tasks
  where checklist_template_id is not null
    and due_date is not null
  group by workspace_id, checklist_template_id, due_date
) groups;
