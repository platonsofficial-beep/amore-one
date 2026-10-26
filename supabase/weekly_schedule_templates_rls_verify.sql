-- Run with explicit owner approval
-- =============================================================================
-- Verify weekly_schedule_templates RLS (SQL NOT APPLIED)
-- =============================================================================
-- Read-only. Raises if workspace_id is nullable, a policy is missing, a policy
-- is USING (true), or anon/public can use a policy. Does not write rows.
-- =============================================================================

begin;

do $$
declare
  policy_row record;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'weekly_schedule_templates'
      and column_name = 'workspace_id'
      and is_nullable = 'YES'
  ) then
    raise exception 'verify_failed_workspace_id_nullable';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_schedule_templates'
      and policyname = 'weekly_schedule_templates_select_members'
      and cmd = 'SELECT'
      and roles @> array['authenticated']::name[]
  ) then
    raise exception 'verify_failed_member_select_policy';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_schedule_templates'
      and policyname = 'weekly_schedule_templates_insert_managers'
      and cmd = 'INSERT'
      and roles @> array['authenticated']::name[]
  ) then
    raise exception 'verify_failed_manager_insert_policy';
  end if;

  for policy_row in
    select tablename, policyname, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check, roles
    from pg_policies
    where schemaname = 'public'
      and tablename in ('weekly_schedule_templates', 'weekly_schedule_template_shifts')
  loop
    if policy_row.qual in ('true', '(true)') or policy_row.with_check in ('true', '(true)') then
      raise exception 'verify_failed_permissive_policy %', policy_row.policyname;
    end if;
    if policy_row.roles && array['anon', 'public']::name[] then
      raise exception 'verify_failed_anon_or_public_policy %', policy_row.policyname;
    end if;
  end loop;
end $$;

commit;
