-- Run with explicit owner approval
-- =============================================================================
-- Verify checklist run step shape (SQL NOT APPLIED)
-- =============================================================================
-- Read-only. Raises if the new shape is missing. Does not write rows.
-- Does not require a fixed run or step count, so later checklist use still passes.
-- =============================================================================

begin;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'operations_checklist_run_steps'
      and column_name = 'source_task_id'
      and is_nullable = 'NO'
  ) then
    raise exception 'verify_failed_source_task_id_not_null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'operations_checklist_runs'
      and column_name = 'template_id'
      and is_nullable = 'NO'
  ) then
    raise exception 'verify_failed_template_id_not_null';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'operations_checklist_runs'
      and column_name = 'operations_task_id'
      and is_nullable = 'YES'
  ) then
    raise exception 'verify_failed_operations_task_id';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'operations_checklist_runs_operations_task_id_fkey'
      and conrelid = 'public.operations_checklist_runs'::regclass
  ) then
    raise exception 'verify_failed_operations_task_fkey';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'operations_checklist_runs_owner_check'
      and conrelid = 'public.operations_checklist_runs'::regclass
  ) then
    raise exception 'verify_failed_owner_check';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'operations_checklist_runs_operations_task_uidx'
  ) then
    raise exception 'verify_failed_operations_task_unique';
  end if;

  if exists (
    select 1
    from public.operations_checklist_runs
    where template_id is null
      and operations_task_id is null
  ) then
    raise exception 'verify_failed_run_without_owner';
  end if;
end $$;

commit;
