-- RLS policies for stock_items and stock_movements.
-- Run after stock_items_schema.sql and stock_movements_schema.sql.
-- Requires public.workspace_members (is_workspace_member may already exist from floor_plans).

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.auth_user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_workspace_stock(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.auth_user_id = auth.uid()
      and wm.role in ('owner', 'general_manager', 'manager')
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.can_manage_workspace_stock(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_manage_workspace_stock(uuid) to authenticated;

grant select, insert, update, delete on table public.stock_items to authenticated;
grant select, insert on table public.stock_movements to authenticated;

alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists stock_items_select_members on public.stock_items;
create policy stock_items_select_members
  on public.stock_items
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists stock_items_insert_managers on public.stock_items;
create policy stock_items_insert_managers
  on public.stock_items
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists stock_items_update_managers on public.stock_items;
create policy stock_items_update_managers
  on public.stock_items
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists stock_items_delete_managers on public.stock_items;
create policy stock_items_delete_managers
  on public.stock_items
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

drop policy if exists stock_movements_select_members on public.stock_movements;
create policy stock_movements_select_members
  on public.stock_movements
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists stock_movements_insert_managers on public.stock_movements;
create policy stock_movements_insert_managers
  on public.stock_movements
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));
