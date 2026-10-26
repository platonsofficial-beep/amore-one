-- Run with explicit owner approval
-- =============================================================================
-- Verify checklist run RLS (SQL NOT APPLIED)
-- =============================================================================
-- Read-only. Raises if a policy is missing, a policy is USING (true), anon or
-- public can use a policy, authenticated is missing select/insert/update/delete,
-- or anon can read or write the tables. Does not write rows.
-- =============================================================================

begin;

do $$
declare
  policy_row record;
  command_name text;
  expected_policy text;
  expected_policies text[] := array[
    'operations_checklist_runs_select_members',
    'operations_checklist_runs_insert_managers',
    'operations_checklist_runs_update_managers',
    'operations_checklist_runs_delete_managers',
    'operations_checklist_run_steps_select_members',
    'operations_checklist_run_steps_insert_managers',
    'operations_checklist_run_steps_update_managers',
    'operations_checklist_run_steps_update_staff_complete',
    'operations_checklist_run_steps_delete_managers'
  ];
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'operations_checklist_runs'
      and c.relrowsecurity
  ) or not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'operations_checklist_run_steps'
      and c.relrowsecurity
  ) then
    raise exception 'verify_failed_rls_disabled';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'checklist_run_workspace_id'
      and p.prosecdef
  ) then
    raise exception 'verify_failed_workspace_lookup';
  end if;

  if has_function_privilege('anon', 'public.checklist_run_workspace_id(uuid)', 'execute')
     or has_function_privilege('public', 'public.checklist_run_workspace_id(uuid)', 'execute') then
    raise exception 'verify_failed_lookup_execute_anon_or_public';
  end if;

  if not has_function_privilege('authenticated', 'public.checklist_run_workspace_id(uuid)', 'execute') then
    raise exception 'verify_failed_lookup_execute_authenticated';
  end if;

  foreach expected_policy in array expected_policies loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and policyname = expected_policy
        and roles @> array['authenticated']::name[]
    ) then
      raise exception 'verify_failed_missing_policy %', expected_policy;
    end if;
  end loop;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'operations_checklist_runs'
      and policyname = 'operations_checklist_runs_update_staff_complete'
  ) then
    raise exception 'verify_failed_staff_policy_on_runs';
  end if;

  for policy_row in
    select tablename, policyname, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check, roles
    from pg_policies
    where schemaname = 'public'
      and tablename in ('operations_checklist_runs', 'operations_checklist_run_steps')
  loop
    if policy_row.qual in ('true', '(true)') or policy_row.with_check in ('true', '(true)') then
      raise exception 'verify_failed_permissive_policy %', policy_row.policyname;
    end if;
    if policy_row.roles && array['anon', 'public']::name[] then
      raise exception 'verify_failed_anon_or_public_policy %', policy_row.policyname;
    end if;
  end loop;

  foreach command_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('authenticated', 'public.operations_checklist_runs', command_name)
       or not has_table_privilege('authenticated', 'public.operations_checklist_run_steps', command_name) then
      raise exception 'verify_failed_authenticated_grant %', command_name;
    end if;
    if has_table_privilege('anon', 'public.operations_checklist_runs', command_name)
       or has_table_privilege('anon', 'public.operations_checklist_run_steps', command_name) then
      raise exception 'verify_failed_anon_grant %', command_name;
    end if;
  end loop;
end $$;

commit;
