-- Run with explicit owner approval
-- =============================================================================
-- weekly_schedule_templates RLS rollback note (SQL NOT APPLIED)
-- =============================================================================
-- Do not drop workspace_id. Do not delete weekly_schedule_templates rows or
-- weekly_schedule_template_shifts rows. That would destroy saved templates.
--
-- The previous production policy text is not restored here. A permissive or
-- anon policy would reopen the table. The safe rollback is to keep the
-- workspace-scoped member-read / manager-write policies from
-- weekly_schedule_templates_rls.sql.
--
-- If the apply transaction raised before commit, nothing changed and this
-- file does not need to be run.
--
-- This script only re-asserts those same policies. It does not remove
-- workspace_id and it does not grant anon or public.
-- =============================================================================

begin;

alter table public.weekly_schedule_templates enable row level security;
alter table public.weekly_schedule_template_shifts enable row level security;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_schedule_templates'
  loop
    execute format('drop policy if exists %I on public.weekly_schedule_templates', policy_row.policyname);
  end loop;

  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_schedule_template_shifts'
  loop
    execute format('drop policy if exists %I on public.weekly_schedule_template_shifts', policy_row.policyname);
  end loop;
end $$;

create policy weekly_schedule_templates_select_members
  on public.weekly_schedule_templates
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy weekly_schedule_templates_insert_managers
  on public.weekly_schedule_templates
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

create policy weekly_schedule_templates_update_managers
  on public.weekly_schedule_templates
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

create policy weekly_schedule_templates_delete_managers
  on public.weekly_schedule_templates
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

create policy weekly_schedule_template_shifts_select_members
  on public.weekly_schedule_template_shifts
  for select
  to authenticated
  using (
    exists (
      select 1 from public.weekly_schedule_templates t
      where t.id = template_id
        and public.is_workspace_member(t.workspace_id)
    )
  );

create policy weekly_schedule_template_shifts_insert_managers
  on public.weekly_schedule_template_shifts
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.weekly_schedule_templates t
      where t.id = template_id
        and public.can_manage_workspace_stock(t.workspace_id)
    )
  );

create policy weekly_schedule_template_shifts_update_managers
  on public.weekly_schedule_template_shifts
  for update
  to authenticated
  using (
    exists (
      select 1 from public.weekly_schedule_templates t
      where t.id = template_id
        and public.can_manage_workspace_stock(t.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.weekly_schedule_templates t
      where t.id = template_id
        and public.can_manage_workspace_stock(t.workspace_id)
    )
  );

create policy weekly_schedule_template_shifts_delete_managers
  on public.weekly_schedule_template_shifts
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.weekly_schedule_templates t
      where t.id = template_id
        and public.can_manage_workspace_stock(t.workspace_id)
    )
  );

revoke all on table public.weekly_schedule_templates from public, anon;
revoke all on table public.weekly_schedule_template_shifts from public, anon;
grant select, insert, update, delete on table public.weekly_schedule_templates to authenticated;
grant select, insert, update, delete on table public.weekly_schedule_template_shifts to authenticated;

notify pgrst, 'reload schema';
commit;
