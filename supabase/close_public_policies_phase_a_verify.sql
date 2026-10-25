-- Run with explicit owner approval
-- =============================================================================
-- Close open RLS policies, phase A verification (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED until the owner runs it.
-- Run only AFTER supabase/close_public_policies_phase_a.sql has committed.
--
-- Read-only. One transaction. The last statement is ROLLBACK.
-- A failed assertion raises and aborts the transaction. Then run: ROLLBACK;
--
-- Pass line:
--   close_public_policies_phase_a verify PASS
-- =============================================================================

begin;

do $close_public_policies_phase_a_verify$
declare
  v_table text;
  v_public_name text;
  v_member record;
begin
  for v_table in
    select unnest(array['shifts', 'reservations', 'schedule_publications'])
  loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'phase a verify: public.% is missing', v_table;
    end if;
  end loop;

  for v_public_name, v_table in
    select *
    from (values
      ('Allow public delete shifts', 'shifts'),
      ('Allow public insert shifts', 'shifts'),
      ('Allow public read shifts', 'shifts'),
      ('Allow public update shifts', 'shifts'),
      ('Allow public delete reservations', 'reservations'),
      ('Allow public insert reservations', 'reservations'),
      ('Allow public read reservations', 'reservations'),
      ('Allow public update reservations', 'reservations'),
      ('Allow public delete schedule_publications', 'schedule_publications'),
      ('Allow public insert schedule_publications', 'schedule_publications'),
      ('Allow public read schedule_publications', 'schedule_publications'),
      ('Allow public update schedule_publications', 'schedule_publications')
    ) as listed(policy_name, table_name)
  loop
    if exists (
      select 1
      from pg_policy pol
      where pol.polrelid = ('public.' || v_table)::regclass
        and pol.polname = v_public_name
    ) then
      raise exception 'phase a verify: policy "%" is still on %', v_public_name, v_table;
    end if;
  end loop;

  for v_member in
    select *
    from (values
      ('shifts', 'shifts_select_members', 'r', 'is_workspace_member'),
      ('shifts', 'shifts_insert_managers', 'a', 'can_manage_workspace_stock'),
      ('shifts', 'shifts_update_managers', 'w', 'can_manage_workspace_stock'),
      ('shifts', 'shifts_delete_managers', 'd', 'can_manage_workspace_stock'),
      ('reservations', 'reservations_select_members', 'r', 'is_workspace_member'),
      ('reservations', 'reservations_insert_managers', 'a', 'can_manage_workspace_reservations'),
      ('reservations', 'reservations_update_managers', 'w', 'can_manage_workspace_reservations'),
      ('reservations', 'reservations_delete_managers', 'd', 'can_manage_workspace_reservations'),
      ('schedule_publications', 'schedule_publications_select_members', 'r', 'has_any_workspace_membership'),
      ('schedule_publications', 'schedule_publications_insert_managers', 'a', 'can_manage_any_workspace_schedule'),
      ('schedule_publications', 'schedule_publications_update_managers', 'w', 'can_manage_any_workspace_schedule'),
      ('schedule_publications', 'schedule_publications_delete_managers', 'd', 'can_manage_any_workspace_schedule')
    ) as listed(table_name, policy_name, command, expression)
  loop
    if not exists (
      select 1
      from pg_policy pol
      where pol.polrelid = ('public.' || v_member.table_name)::regclass
        and pol.polname = v_member.policy_name
        and pol.polcmd = v_member.command
        and (
          coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
          || ' '
          || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
        ) ilike '%' || v_member.expression || '%'
    ) then
      raise exception
        'phase a verify: % policy % (%) is missing or lost its % check',
        v_member.table_name,
        v_member.policy_name,
        v_member.command,
        v_member.expression;
    end if;
  end loop;

  raise notice 'close_public_policies_phase_a verify PASS';
end
$close_public_policies_phase_a_verify$;

rollback;
