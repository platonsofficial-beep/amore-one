-- RLS policies for operations announcements and read tracking.
-- Run after operations_announcement_reads_schema.sql and stock_rls_policies.sql.

grant select, insert, update, delete on table public.operations_announcements to authenticated;
grant select, insert, update, delete on table public.operations_announcement_reads to authenticated;

alter table public.operations_announcements enable row level security;
alter table public.operations_announcement_reads enable row level security;

-- operations_announcements

drop policy if exists operations_announcements_select_members on public.operations_announcements;
create policy operations_announcements_select_members
  on public.operations_announcements
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists operations_announcements_insert_managers on public.operations_announcements;
create policy operations_announcements_insert_managers
  on public.operations_announcements
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists operations_announcements_update_managers on public.operations_announcements;
create policy operations_announcements_update_managers
  on public.operations_announcements
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists operations_announcements_delete_managers on public.operations_announcements;
create policy operations_announcements_delete_managers
  on public.operations_announcements
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

-- operations_announcement_reads

drop policy if exists operations_announcement_reads_select_members on public.operations_announcement_reads;
create policy operations_announcement_reads_select_members
  on public.operations_announcement_reads
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.operations_announcements a
      where a.id = announcement_id
        and public.can_manage_workspace_stock(a.workspace_id)
    )
  );

drop policy if exists operations_announcement_reads_insert_members on public.operations_announcement_reads;
create policy operations_announcement_reads_insert_members
  on public.operations_announcement_reads
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.operations_announcements a
      where a.id = announcement_id
        and public.is_workspace_member(a.workspace_id)
    )
  );

drop policy if exists operations_announcement_reads_update_own on public.operations_announcement_reads;
create policy operations_announcement_reads_update_own
  on public.operations_announcement_reads
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
