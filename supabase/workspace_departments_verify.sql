-- =============================================================================
-- Departments and supply storages verification (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED until the owner runs it.
-- Run only AFTER supabase/workspace_departments.sql has committed.
--
-- This file is NOT a migration.
-- Part A is read-only.
-- Part B is one transaction and its last statement is ROLLBACK.
-- Part B inserts fixture workspaces, departments, and storages, proves many
-- supply storages are allowed, then rolls them back.
--
-- If an assertion raises, the open transaction is aborted. Run: ROLLBACK;
--
-- Pass line:
--   ALL WORKSPACE DEPARTMENTS VERIFY ASSERTIONS PASSED — TRANSACTION ROLLED BACK
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Part A — read-only catalog, RLS, and grant checks
-- -----------------------------------------------------------------------------
select
  c.relname,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('workspace_departments', 'workspace_storages')
order by c.relname;

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'workspace_storages'
  and column_name in ('department_id', 'is_supply', 'location_key', 'replenish_from')
order by column_name;

select
  pol.polname,
  pol.polcmd
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'workspace_departments'
order by pol.polname;

select
  indexrel.relname as index_name,
  i.indisunique as is_unique,
  pg_get_expr(i.indpred, i.indrelid) as predicate
from pg_index i
join pg_class tbl on tbl.oid = i.indrelid
join pg_class indexrel on indexrel.oid = i.indexrelid
join pg_namespace n on n.oid = tbl.relnamespace
where n.nspname = 'public'
  and tbl.relname = 'workspace_storages'
  and (
    indexrel.relname in (
      'workspace_storages_department_id_idx',
      'workspace_storages_workspace_supply_idx'
    )
    or pg_get_expr(i.indpred, i.indrelid) ilike '%is_supply%'
  )
order by indexrel.relname;

do $departments_readonly$
declare
  v_src text;
begin
  if to_regclass('public.workspace_departments') is null then
    raise exception 'departments verify: workspace_departments is missing. Apply workspace_departments.sql first.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_storages'
      and column_name = 'department_id'
      and is_nullable = 'YES'
  ) then
    raise exception 'departments verify: department_id must be a nullable column';
  end if;

  if not exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname = 'public'
      and c.relname = 'workspace_storages'
      and a.attname = 'is_supply'
      and a.attnotnull
      and a.atttypid = 'boolean'::regtype
      and pg_get_expr(d.adbin, d.adrelid) = 'false'
  ) then
    raise exception 'departments verify: is_supply must be boolean not null default false';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_storages'
      and column_name = 'replenish_from'
  ) then
    raise exception 'departments verify: replenish_from is out of scope for this step';
  end if;

  if exists (
    select 1
    from pg_index i
    join pg_class tbl on tbl.oid = i.indrelid
    join pg_namespace n on n.oid = tbl.relnamespace
    where n.nspname = 'public'
      and tbl.relname = 'workspace_storages'
      and i.indisunique
      and pg_get_expr(i.indpred, i.indrelid) ilike '%is_supply%'
  ) then
    raise exception 'departments verify: is_supply must not have a uniqueness limit';
  end if;

  if not exists (
    select 1
    from pg_index i
    join pg_class indexrel on indexrel.oid = i.indexrelid
    where indexrel.relname = 'workspace_storages_workspace_supply_idx'
      and i.indisunique is false
  ) then
    raise exception 'departments verify: workspace_storages_workspace_supply_idx must exist and must not be unique';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'workspace_departments'
      and c.relrowsecurity
  ) then
    raise exception 'departments verify: workspace_departments RLS is off';
  end if;

  if exists (
    select 1
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'workspace_departments'
      and pol.polcmd = 'd'
  ) then
    raise exception 'departments verify: workspace_departments must not have a delete policy';
  end if;

  if (
    select count(*)
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'workspace_departments'
      and pol.polcmd in ('r', 'a', 'w')
  ) is distinct from 3 then
    raise exception 'departments verify: expected select, insert, and update policies';
  end if;

  if not has_table_privilege('authenticated', 'public.workspace_departments', 'select')
     or not has_table_privilege('authenticated', 'public.workspace_departments', 'insert')
     or not has_table_privilege('authenticated', 'public.workspace_departments', 'update')
     or has_table_privilege('authenticated', 'public.workspace_departments', 'delete') then
    raise exception 'departments verify: authenticated must select/insert/update departments and must not delete';
  end if;

  if has_table_privilege('anon', 'public.workspace_departments', 'select')
     or has_table_privilege('anon', 'public.workspace_departments', 'insert')
     or has_table_privilege('anon', 'public.workspace_departments', 'update')
     or has_table_privilege('anon', 'public.workspace_departments', 'delete') then
    raise exception 'departments verify: anon must not access workspace_departments';
  end if;

  if not has_table_privilege('authenticated', 'public.workspace_storages', 'select')
     or not has_table_privilege('authenticated', 'public.workspace_storages', 'update')
     or has_table_privilege('authenticated', 'public.workspace_storages', 'delete') then
    raise exception 'departments verify: workspace_storages grants changed';
  end if;

  if to_regprocedure('public.workspace_storages_enforce_department_workspace()') is null then
    raise exception 'departments verify: same-workspace department trigger function is missing';
  end if;

  select p.prosrc into v_src
  from pg_proc p
  where p.oid = 'public.workspace_storages_enforce_department_workspace()'::regprocedure;

  if v_src like '%new.location_key%' or v_src ilike '%is_supply%' then
    raise exception 'departments verify: department trigger must not rewrite location_key or is_supply';
  end if;

  if to_regprocedure('public.prevent_workspace_storages_key_mutation()') is null then
    raise exception 'departments verify: location_key immutability function is missing';
  end if;
end
$departments_readonly$;

-- -----------------------------------------------------------------------------
-- Part B — transactional proof. The last statement is ROLLBACK.
-- -----------------------------------------------------------------------------
begin;

do $departments_behavior$
declare
  v_marker text := 'deptv' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_workspace_id uuid;
  v_other_workspace_id uuid;
  v_bar_id uuid;
  v_kitchen_id uuid;
  v_other_department_id uuid;
  v_soft_id uuid;
  v_spirits_id uuid;
  v_back_bar_id uuid;
  v_fresh_id uuid;
  v_supply_count integer;
  v_location_key text;
  v_is_supply boolean;
  v_department_id uuid;
begin
  insert into public.workspaces (name, slug)
  values ('Dept verify ' || v_marker, 'dept-verify-' || v_marker)
  returning id into v_workspace_id;

  insert into public.workspaces (name, slug)
  values ('Dept verify other ' || v_marker, 'dept-verify-other-' || v_marker)
  returning id into v_other_workspace_id;

  insert into public.workspace_departments (workspace_id, name, sort_order)
  values (v_workspace_id, 'Bar', 0)
  returning id into v_bar_id;

  insert into public.workspace_departments (workspace_id, name, sort_order)
  values (v_workspace_id, 'Kitchen', 1)
  returning id into v_kitchen_id;

  insert into public.workspace_departments (workspace_id, name)
  values (v_other_workspace_id, 'Other')
  returning id into v_other_department_id;

  insert into public.workspace_storages (workspace_id, location_key, name, active)
  values (v_workspace_id, v_marker || ' soft', v_marker || ' soft', true)
  returning id into v_soft_id;

  insert into public.workspace_storages (workspace_id, location_key, name, active)
  values (v_workspace_id, v_marker || ' spirits', v_marker || ' spirits', true)
  returning id into v_spirits_id;

  insert into public.workspace_storages (workspace_id, location_key, name, active)
  values (v_workspace_id, v_marker || ' back', v_marker || ' back', true)
  returning id into v_back_bar_id;

  -- Venue-wide supply store, and a department's own supply store. Both stay supply.
  update public.workspace_storages
  set is_supply = true,
      department_id = null
  where id = v_soft_id;

  update public.workspace_storages
  set is_supply = true,
      department_id = v_bar_id
  where id = v_spirits_id;

  update public.workspace_storages
  set is_supply = false,
      department_id = v_bar_id
  where id = v_back_bar_id;

  select count(*) into v_supply_count
  from public.workspace_storages
  where workspace_id = v_workspace_id
    and is_supply;

  if v_supply_count is distinct from 2 then
    raise exception 'departments verify: expected 2 supply storages, found %', v_supply_count;
  end if;

  select location_key, is_supply, department_id
  into v_location_key, v_is_supply, v_department_id
  from public.workspace_storages
  where id = v_soft_id;

  if v_location_key is distinct from (v_marker || ' soft')
     or v_is_supply is distinct from true
     or v_department_id is not null then
    raise exception 'departments verify: venue-wide supply storage was rewritten';
  end if;

  select location_key, is_supply, department_id
  into v_location_key, v_is_supply, v_department_id
  from public.workspace_storages
  where id = v_spirits_id;

  if v_location_key is distinct from (v_marker || ' spirits')
     or v_is_supply is distinct from true
     or v_department_id is distinct from v_bar_id then
    raise exception 'departments verify: department supply storage was rewritten';
  end if;

  select is_supply, department_id
  into v_is_supply, v_department_id
  from public.workspace_storages
  where id = v_back_bar_id;

  if v_is_supply is distinct from false or v_department_id is distinct from v_bar_id then
    raise exception 'departments verify: shelf assignment failed';
  end if;

  insert into public.workspace_storages (workspace_id, location_key, name, active)
  values (v_workspace_id, v_marker || ' fresh', v_marker || ' fresh', true)
  returning id into v_fresh_id;

  select is_supply, department_id
  into v_is_supply, v_department_id
  from public.workspace_storages
  where id = v_fresh_id;

  if v_is_supply is distinct from false or v_department_id is not null then
    raise exception 'departments verify: new storage must default to not supply and unassigned';
  end if;

  update public.workspace_storages
  set department_id = v_kitchen_id
  where id = v_back_bar_id;

  select department_id, location_key
  into v_department_id, v_location_key
  from public.workspace_storages
  where id = v_back_bar_id;

  if v_department_id is distinct from v_kitchen_id
     or v_location_key is distinct from (v_marker || ' back') then
    raise exception 'departments verify: reassignment changed location_key or missed the department';
  end if;

  begin
    update public.workspace_storages
    set department_id = v_other_department_id
    where id = v_back_bar_id;
    raise exception 'departments verify: cross-workspace department was accepted';
  exception
    when others then
      if sqlerrm not like '%workspace_storage_department_workspace_mismatch%' then
        raise;
      end if;
  end;

  select department_id, location_key
  into v_department_id, v_location_key
  from public.workspace_storages
  where id = v_back_bar_id;

  if v_department_id is distinct from v_kitchen_id
     or v_location_key is distinct from (v_marker || ' back') then
    raise exception 'departments verify: rejected cross-workspace update changed the shelf';
  end if;

  begin
    insert into public.workspace_departments (workspace_id, name)
    values (v_workspace_id, 'Bar');
    raise exception 'departments verify: duplicate department name was accepted';
  exception
    when unique_violation then
      null;
  end;

  update public.workspace_departments
  set active = false
  where id = v_bar_id;

  if not exists (
    select 1
    from public.workspace_storages
    where id = v_spirits_id
      and department_id = v_bar_id
      and is_supply
  ) then
    raise exception 'departments verify: archiving a department cleared its storages';
  end if;

  raise notice 'departments verify part B passed for marker %', v_marker;
end
$departments_behavior$;

select 'ALL WORKSPACE DEPARTMENTS VERIFY ASSERTIONS PASSED — TRANSACTION ROLLED BACK' as result;

rollback;
