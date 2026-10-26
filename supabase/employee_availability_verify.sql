-- Run with explicit owner approval
-- =============================================================================
-- employee_availability verification (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED until the owner runs it.
-- Run only AFTER supabase/employee_availability.sql has committed.
--
-- Read-only. One transaction. The last statement is ROLLBACK.
-- A failed assertion raises and aborts the transaction. Then run: ROLLBACK;
--
-- Pass line:
--   employee_availability verify PASS
-- =============================================================================

begin;

do $employee_availability_verify$
declare
  v_column record;
  v_policy record;
  v_delete_rule text;
  v_command text;
  v_expression text;
  v_policy_count integer;
  v_role_count integer;
begin
  if to_regclass('public.employee_availability') is null then
    raise exception 'employee_availability verify: table is missing';
  end if;

  if to_regprocedure('public.is_workspace_member(uuid)') is null then
    raise exception 'employee_availability verify: is_workspace_member(uuid) is missing';
  end if;

  if to_regprocedure('public.can_manage_workspace_stock(uuid)') is null then
    raise exception 'employee_availability verify: can_manage_workspace_stock(uuid) is missing';
  end if;

  if to_regprocedure('public.set_employee_availability_updated_at()') is null then
    raise exception 'employee_availability verify: updated_at trigger function is missing';
  end if;

  for v_column in
    select *
    from (values
      ('id', 'uuid', 'NO'),
      ('workspace_id', 'uuid', 'NO'),
      ('employee_id', 'uuid', 'NO'),
      ('week_start_date', 'date', 'NO'),
      ('day_of_week', 'text', 'NO'),
      ('status', 'text', 'NO'),
      ('start_time', 'time without time zone', 'YES'),
      ('end_time', 'time without time zone', 'YES'),
      ('note', 'text', 'YES'),
      ('created_at', 'timestamp with time zone', 'NO'),
      ('updated_at', 'timestamp with time zone', 'NO')
    ) as listed(column_name, data_type, is_nullable)
  loop
    if not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'employee_availability'
        and c.column_name = v_column.column_name
        and c.data_type = v_column.data_type
        and c.is_nullable = v_column.is_nullable
    ) then
      raise exception
        'employee_availability verify: column % must be % nullable %',
        v_column.column_name,
        v_column.data_type,
        v_column.is_nullable;
    end if;
  end loop;

  if (
    select count(*)
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'employee_availability'
  ) <> 11 then
    raise exception 'employee_availability verify: unexpected column count';
  end if;

  select rc.delete_rule
    into v_delete_rule
  from information_schema.referential_constraints rc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = rc.constraint_name
   and kcu.constraint_schema = rc.constraint_schema
  where rc.constraint_schema = 'public'
    and kcu.table_name = 'employee_availability'
    and kcu.column_name = 'workspace_id'
    and rc.unique_constraint_schema = 'public';

  if v_delete_rule is distinct from 'CASCADE' then
    raise exception
      'employee_availability verify: workspace_id FK must be ON DELETE CASCADE (found %)',
      coalesce(v_delete_rule, '<missing>');
  end if;

  select rc.delete_rule
    into v_delete_rule
  from information_schema.referential_constraints rc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = rc.constraint_name
   and kcu.constraint_schema = rc.constraint_schema
  where rc.constraint_schema = 'public'
    and kcu.table_name = 'employee_availability'
    and kcu.column_name = 'employee_id';

  if v_delete_rule is distinct from 'CASCADE' then
    raise exception
      'employee_availability verify: employee_id FK must be ON DELETE CASCADE (found %)',
      coalesce(v_delete_rule, '<missing>');
  end if;

  if not exists (
    select 1
    from pg_constraint con
    join pg_class tbl on tbl.oid = con.conrelid
    join pg_namespace n on n.oid = tbl.relnamespace
    where n.nspname = 'public'
      and tbl.relname = 'employee_availability'
      and con.contype = 'u'
      and pg_get_constraintdef(con.oid) ilike '%workspace_id%'
      and pg_get_constraintdef(con.oid) ilike '%employee_id%'
      and pg_get_constraintdef(con.oid) ilike '%week_start_date%'
      and pg_get_constraintdef(con.oid) ilike '%day_of_week%'
  ) then
    raise exception 'employee_availability verify: unique employee day is missing';
  end if;

  if not exists (
    select 1
    from pg_constraint con
    join pg_class tbl on tbl.oid = con.conrelid
    join pg_namespace n on n.oid = tbl.relnamespace
    where n.nspname = 'public'
      and tbl.relname = 'employee_availability'
      and con.conname = 'employee_availability_status_check'
      and pg_get_constraintdef(con.oid) ilike '%AVAILABLE%'
      and pg_get_constraintdef(con.oid) ilike '%UNAVAILABLE%'
      and pg_get_constraintdef(con.oid) ilike '%PREFERRED%'
  ) or not exists (
    select 1
    from pg_constraint con
    join pg_class tbl on tbl.oid = con.conrelid
    join pg_namespace n on n.oid = tbl.relnamespace
    where n.nspname = 'public'
      and tbl.relname = 'employee_availability'
      and con.conname = 'employee_availability_day_of_week_check'
      and pg_get_constraintdef(con.oid) ilike '%monday%'
      and pg_get_constraintdef(con.oid) ilike '%sunday%'
  ) then
    raise exception 'employee_availability verify: status or weekday check is missing';
  end if;

  if not exists (
    select 1
    from pg_class tbl
    join pg_namespace n on n.oid = tbl.relnamespace
    where n.nspname = 'public'
      and tbl.relname = 'employee_availability'
      and tbl.relrowsecurity
  ) then
    raise exception 'employee_availability verify: row level security is off';
  end if;

  if not exists (
    select 1
    from pg_trigger trg
    join pg_class tbl on tbl.oid = trg.tgrelid
    join pg_namespace n on n.oid = tbl.relnamespace
    where n.nspname = 'public'
      and tbl.relname = 'employee_availability'
      and trg.tgname = 'employee_availability_set_updated_at'
      and not trg.tgisinternal
  ) then
    raise exception 'employee_availability verify: updated_at trigger is missing';
  end if;

  select count(*)::integer
    into v_policy_count
  from pg_policy pol
  where pol.polrelid = 'public.employee_availability'::regclass;

  if v_policy_count <> 7 then
    raise exception 'employee_availability verify: expected 7 policies, found %', v_policy_count;
  end if;

  for v_policy in
    select *
    from (values
      ('employee_availability_select_members', 'r', 'is_workspace_member'),
      ('employee_availability_insert_managers', 'a', 'can_manage_workspace_stock'),
      ('employee_availability_insert_self', 'a', 'workspace_members'),
      ('employee_availability_update_managers', 'w', 'can_manage_workspace_stock'),
      ('employee_availability_update_self', 'w', 'workspace_members'),
      ('employee_availability_delete_managers', 'd', 'can_manage_workspace_stock'),
      ('employee_availability_delete_self', 'd', 'workspace_members')
    ) as listed(policy_name, command, expression)
  loop
    if not exists (
      select 1
      from pg_policy pol
      where pol.polrelid = 'public.employee_availability'::regclass
        and pol.polname = v_policy.policy_name
        and pol.polcmd = v_policy.command
        and (
          coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
          || ' '
          || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
        ) ilike '%' || v_policy.expression || '%'
        and cardinality(pol.polroles) > 0
    ) then
      raise exception
        'employee_availability verify: policy % is missing, open, or lost its % check',
        v_policy.policy_name,
        v_policy.expression;
    end if;
  end loop;

  for v_policy in
    select pol.polname, pol.polroles, pol.polqual, pol.polwithcheck, pol.polrelid
    from pg_policy pol
    where pol.polrelid = 'public.employee_availability'::regclass
  loop
    v_expression := lower(trim(coalesce(pg_get_expr(v_policy.polqual, v_policy.polrelid), '')));
    if v_expression = 'true' then
      raise exception 'employee_availability verify: policy % uses true', v_policy.polname;
    end if;

    v_expression := lower(trim(coalesce(pg_get_expr(v_policy.polwithcheck, v_policy.polrelid), '')));
    if v_expression = 'true' then
      raise exception 'employee_availability verify: policy % checks true', v_policy.polname;
    end if;

    select count(*)::integer
      into v_role_count
    from unnest(v_policy.polroles) role_oid
    join pg_roles r on r.oid = role_oid
    where r.rolname in ('anon', 'public');

    if v_role_count <> 0 then
      raise exception 'employee_availability verify: policy % is granted to anon or public', v_policy.polname;
    end if;

    if not exists (
      select 1
      from unnest(v_policy.polroles) role_oid
      join pg_roles r on r.oid = role_oid
      where r.rolname = 'authenticated'
    ) then
      raise exception 'employee_availability verify: policy % is not limited to authenticated', v_policy.polname;
    end if;
  end loop;

  foreach v_command in array array['select', 'insert', 'update', 'delete']
  loop
    if has_table_privilege('anon', 'public.employee_availability', v_command) then
      raise exception 'employee_availability verify: anon must not % employee_availability', v_command;
    end if;

    if not has_table_privilege('authenticated', 'public.employee_availability', v_command) then
      raise exception 'employee_availability verify: authenticated must % employee_availability', v_command;
    end if;
  end loop;

  if not has_function_privilege(
    'authenticated',
    'public.set_employee_availability_updated_at()',
    'execute'
  ) then
    raise exception 'employee_availability verify: authenticated must execute the updated_at trigger';
  end if;

  if has_function_privilege('anon', 'public.set_employee_availability_updated_at()', 'execute') then
    raise exception 'employee_availability verify: anon must not execute the updated_at trigger';
  end if;

  raise notice 'employee_availability verify PASS';
end
$employee_availability_verify$;

rollback;
