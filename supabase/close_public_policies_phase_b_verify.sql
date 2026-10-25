-- Run with explicit owner approval
-- =============================================================================
-- Close open RLS policies, phase B verification (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED until the owner runs it.
-- Run only AFTER supabase/close_public_policies_phase_b.sql has committed.
--
-- Read-only. One transaction. The last statement is ROLLBACK.
-- A failed assertion raises and aborts the transaction. Then run: ROLLBACK;
--
-- Pass line:
--   close_public_policies_phase_b verify PASS
-- =============================================================================

begin;

do $close_public_policies_phase_b_verify$
declare
  v_table text;
  v_parent text;
  v_nullable text;
  v_data_type text;
  v_delete_rule text;
  v_old_name text;
  v_new record;
  v_workspace_count integer;
  v_nulls bigint;
  v_command text;
begin
  foreach v_parent in array array['shift_templates', 'tasks', 'task_templates']
  loop
    select c.data_type, c.is_nullable
      into v_data_type, v_nullable
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_parent
      and c.column_name = 'workspace_id';

    if v_data_type is distinct from 'uuid' or v_nullable is distinct from 'YES' then
      raise exception
        'phase b verify: %.workspace_id must be nullable uuid (found type %, nullable %)',
        v_parent,
        coalesce(v_data_type, '<missing>'),
        coalesce(v_nullable, '<missing>');
    end if;

    select rc.delete_rule
      into v_delete_rule
    from information_schema.referential_constraints rc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = rc.constraint_name
     and kcu.constraint_schema = rc.constraint_schema
    where rc.constraint_schema = 'public'
      and rc.constraint_name = v_parent || '_workspace_id_fkey'
      and kcu.column_name = 'workspace_id';

    if v_delete_rule is distinct from 'CASCADE' then
      raise exception
        'phase b verify: %_workspace_id_fkey must be ON DELETE CASCADE (found %)',
        v_parent,
        coalesce(v_delete_rule, '<missing>');
    end if;
  end loop;

  foreach v_table in array array[
    'schedule_capacity',
    'task_checklist_items',
    'task_template_checklist_items',
    'inventory_items',
    'bar_refills',
    'bar_refill_items'
  ]
  loop
    if exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = v_table
        and c.column_name = 'workspace_id'
    ) then
      raise exception 'phase b verify: % must not gain workspace_id', v_table;
    end if;
  end loop;

  if to_regprocedure('public.can_complete_workspace_task(uuid,uuid)') is null then
    raise exception 'phase b verify: can_complete_workspace_task is missing';
  end if;

  if not exists (
    select 1
    from pg_trigger trg
    join pg_class tbl on tbl.oid = trg.tgrelid
    join pg_namespace n on n.oid = tbl.relnamespace
    where n.nspname = 'public'
      and tbl.relname = 'tasks'
      and trg.tgname = 'tasks_guard_staff_update'
      and not trg.tgisinternal
  ) or not exists (
    select 1
    from pg_trigger trg
    join pg_class tbl on tbl.oid = trg.tgrelid
    join pg_namespace n on n.oid = tbl.relnamespace
    where n.nspname = 'public'
      and tbl.relname = 'task_checklist_items'
      and trg.tgname = 'task_checklist_items_guard_staff_update'
      and not trg.tgisinternal
  ) then
    raise exception 'phase b verify: staff update guards are missing';
  end if;

  for v_old_name, v_table in
    select *
    from (values
      ('Allow public delete shift_templates', 'shift_templates'),
      ('Allow public insert shift_templates', 'shift_templates'),
      ('Allow public read shift_templates', 'shift_templates'),
      ('Allow public update shift_templates', 'shift_templates'),
      ('Allow public delete schedule_capacity', 'schedule_capacity'),
      ('Allow public insert schedule_capacity', 'schedule_capacity'),
      ('Allow public read schedule_capacity', 'schedule_capacity'),
      ('Allow public update schedule_capacity', 'schedule_capacity'),
      ('Allow all tasks access', 'tasks'),
      ('task_templates_dev_select_all', 'task_templates'),
      ('task_templates_dev_insert_all', 'task_templates'),
      ('task_templates_dev_update_all', 'task_templates'),
      ('task_templates_dev_delete_all', 'task_templates'),
      ('task_template_checklist_items_dev_select_all', 'task_template_checklist_items'),
      ('task_template_checklist_items_dev_insert_all', 'task_template_checklist_items'),
      ('task_template_checklist_items_dev_update_all', 'task_template_checklist_items'),
      ('task_template_checklist_items_dev_delete_all', 'task_template_checklist_items'),
      ('task_checklist_items_dev_select_all', 'task_checklist_items'),
      ('task_checklist_items_dev_insert_all', 'task_checklist_items'),
      ('task_checklist_items_dev_update_all', 'task_checklist_items'),
      ('task_checklist_items_dev_delete_all', 'task_checklist_items'),
      ('Allow public read inventory_items', 'inventory_items'),
      ('Allow public insert inventory_items', 'inventory_items'),
      ('Allow public update inventory_items', 'inventory_items'),
      ('Allow public delete inventory_items', 'inventory_items'),
      ('inventory_items_dev_select_all', 'inventory_items'),
      ('inventory_items_dev_insert_all', 'inventory_items'),
      ('inventory_items_dev_update_all', 'inventory_items'),
      ('inventory_items_dev_delete_all', 'inventory_items'),
      ('bar_refills_dev_select_all', 'bar_refills'),
      ('bar_refills_dev_insert_all', 'bar_refills'),
      ('bar_refills_dev_update_all', 'bar_refills'),
      ('bar_refills_dev_delete_all', 'bar_refills'),
      ('bar_refill_items_dev_select_all', 'bar_refill_items'),
      ('bar_refill_items_dev_insert_all', 'bar_refill_items'),
      ('bar_refill_items_dev_update_all', 'bar_refill_items'),
      ('bar_refill_items_dev_delete_all', 'bar_refill_items')
    ) as listed(policy_name, table_name)
  loop
    if exists (
      select 1
      from pg_policy pol
      where pol.polrelid = ('public.' || v_table)::regclass
        and pol.polname = v_old_name
    ) then
      raise exception 'phase b verify: open policy "%" is still on %', v_old_name, v_table;
    end if;
  end loop;

  for v_new in
    select *
    from (values
      ('shift_templates', 'shift_templates_select_members', 'r', 'is_workspace_member'),
      ('shift_templates', 'shift_templates_insert_managers', 'a', 'can_manage_workspace_stock'),
      ('shift_templates', 'shift_templates_update_managers', 'w', 'can_manage_workspace_stock'),
      ('shift_templates', 'shift_templates_delete_managers', 'd', 'can_manage_workspace_stock'),
      ('schedule_capacity', 'schedule_capacity_select_members', 'r', 'is_workspace_member'),
      ('schedule_capacity', 'schedule_capacity_insert_managers', 'a', 'can_manage_workspace_stock'),
      ('schedule_capacity', 'schedule_capacity_update_managers', 'w', 'can_manage_workspace_stock'),
      ('schedule_capacity', 'schedule_capacity_delete_managers', 'd', 'can_manage_workspace_stock'),
      ('tasks', 'tasks_select_members', 'r', 'is_workspace_member'),
      ('tasks', 'tasks_insert_managers', 'a', 'can_manage_workspace_stock'),
      ('tasks', 'tasks_update_workspace', 'w', 'can_complete_workspace_task'),
      ('tasks', 'tasks_delete_managers', 'd', 'can_manage_workspace_stock'),
      ('task_templates', 'task_templates_select_members', 'r', 'is_workspace_member'),
      ('task_templates', 'task_templates_insert_managers', 'a', 'can_manage_workspace_stock'),
      ('task_templates', 'task_templates_update_managers', 'w', 'can_manage_workspace_stock'),
      ('task_templates', 'task_templates_delete_managers', 'd', 'can_manage_workspace_stock'),
      ('task_template_checklist_items', 'task_template_checklist_items_select_members', 'r', 'is_workspace_member'),
      ('task_template_checklist_items', 'task_template_checklist_items_insert_managers', 'a', 'can_manage_workspace_stock'),
      ('task_template_checklist_items', 'task_template_checklist_items_update_managers', 'w', 'can_manage_workspace_stock'),
      ('task_template_checklist_items', 'task_template_checklist_items_delete_managers', 'd', 'can_manage_workspace_stock'),
      ('task_checklist_items', 'task_checklist_items_select_members', 'r', 'is_workspace_member'),
      ('task_checklist_items', 'task_checklist_items_insert_managers', 'a', 'can_manage_workspace_stock'),
      ('task_checklist_items', 'task_checklist_items_update_workspace', 'w', 'can_complete_workspace_task'),
      ('task_checklist_items', 'task_checklist_items_delete_managers', 'd', 'can_manage_workspace_stock'),
      ('inventory_items', 'inventory_items_select_members', 'r', 'has_any_workspace_membership'),
      ('inventory_items', 'inventory_items_insert_managers', 'a', 'can_manage_any_workspace_schedule'),
      ('inventory_items', 'inventory_items_update_managers', 'w', 'can_manage_any_workspace_schedule'),
      ('inventory_items', 'inventory_items_delete_managers', 'd', 'can_manage_any_workspace_schedule'),
      ('bar_refills', 'bar_refills_select_members', 'r', 'has_any_workspace_membership'),
      ('bar_refills', 'bar_refills_insert_managers', 'a', 'can_manage_any_workspace_schedule'),
      ('bar_refills', 'bar_refills_update_managers', 'w', 'can_manage_any_workspace_schedule'),
      ('bar_refills', 'bar_refills_delete_managers', 'd', 'can_manage_any_workspace_schedule'),
      ('bar_refill_items', 'bar_refill_items_select_members', 'r', 'has_any_workspace_membership'),
      ('bar_refill_items', 'bar_refill_items_insert_managers', 'a', 'can_manage_any_workspace_schedule'),
      ('bar_refill_items', 'bar_refill_items_update_managers', 'w', 'can_manage_any_workspace_schedule'),
      ('bar_refill_items', 'bar_refill_items_delete_managers', 'd', 'can_manage_any_workspace_schedule')
    ) as listed(table_name, policy_name, command, expression)
  loop
    if not exists (
      select 1
      from pg_policy pol
      where pol.polrelid = ('public.' || v_new.table_name)::regclass
        and pol.polname = v_new.policy_name
        and pol.polcmd = v_new.command
        and (
          coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
          || ' '
          || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
        ) ilike '%' || v_new.expression || '%'
    ) then
      raise exception
        'phase b verify: % policy % is missing or lost its % check',
        v_new.table_name,
        v_new.policy_name,
        v_new.expression;
    end if;
  end loop;

  foreach v_table in array array[
    'shift_templates',
    'schedule_capacity',
    'tasks',
    'task_templates',
    'task_template_checklist_items',
    'task_checklist_items',
    'inventory_items',
    'bar_refills',
    'bar_refill_items'
  ]
  loop
    foreach v_command in array array['select', 'insert', 'update', 'delete']
    loop
      if has_table_privilege('anon', 'public.' || v_table, v_command) then
        raise exception 'phase b verify: anon must not % on %', v_command, v_table;
      end if;
    end loop;
  end loop;

  select count(*)::integer into v_workspace_count from public.workspaces;

  foreach v_parent in array array['shift_templates', 'tasks', 'task_templates']
  loop
    execute format('select count(*) from public.%I where workspace_id is null', v_parent) into v_nulls;
    raise notice 'phase b verify: %.workspace_id null rows=% (workspace count=%)', v_parent, v_nulls, v_workspace_count;
    if v_workspace_count = 1 and v_nulls <> 0 then
      raise exception
        'phase b verify: % still has % null workspace_id rows while exactly one workspace exists',
        v_parent,
        v_nulls;
    end if;
  end loop;

  raise notice 'close_public_policies_phase_b verify PASS';
end
$close_public_policies_phase_b_verify$;

rollback;
