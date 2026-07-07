-- Workspace scope for positions catalog.
-- Prerequisite: public.workspaces, positions_schema.sql.
-- Run before using positions from the app with workspace_id filtering.

alter table public.positions add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

create index if not exists positions_workspace_sort_idx
  on public.positions (workspace_id, sort_order, name);

drop index if exists public.positions_name_department_unique;

create unique index if not exists positions_workspace_name_department_unique
  on public.positions (workspace_id, lower(name), lower(department));

grant select, insert, update, delete on table public.positions to authenticated;

alter table public.positions enable row level security;

drop policy if exists positions_select_members on public.positions;
create policy positions_select_members
  on public.positions
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists positions_insert_managers on public.positions;
create policy positions_insert_managers
  on public.positions
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists positions_update_managers on public.positions;
create policy positions_update_managers
  on public.positions
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists positions_delete_managers on public.positions;
create policy positions_delete_managers
  on public.positions
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));
