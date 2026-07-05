-- Run in Supabase SQL editor after tasks_schema.sql if the table already exists.
-- Adds floor_manager to the tasks.department check constraint.

alter table public.tasks
  drop constraint if exists tasks_department_check;

alter table public.tasks
  add constraint tasks_department_check check (
    department in (
      'service',
      'bar',
      'bar_manager',
      'floor_manager',
      'fb',
      'logistics',
      'customers',
      'custom'
    )
  );
