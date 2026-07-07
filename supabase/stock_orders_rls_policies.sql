-- RLS policies for stock_orders and stock_order_items.
-- Run after stock_orders_schema.sql.
-- Requires public.is_workspace_member and public.can_manage_workspace_stock from stock_rls_policies.sql.

grant select, insert, update, delete on table public.stock_orders to authenticated;
grant select, insert, update, delete on table public.stock_order_items to authenticated;

alter table public.stock_orders enable row level security;
alter table public.stock_order_items enable row level security;

drop policy if exists stock_orders_select_members on public.stock_orders;
create policy stock_orders_select_members
  on public.stock_orders
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists stock_orders_insert_managers on public.stock_orders;
create policy stock_orders_insert_managers
  on public.stock_orders
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists stock_orders_update_managers on public.stock_orders;
create policy stock_orders_update_managers
  on public.stock_orders
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists stock_orders_delete_managers on public.stock_orders;
create policy stock_orders_delete_managers
  on public.stock_orders
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

drop policy if exists stock_order_items_select_members on public.stock_order_items;
create policy stock_order_items_select_members
  on public.stock_order_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.stock_orders so
      where so.id = stock_order_items.order_id
        and public.is_workspace_member(so.workspace_id)
    )
  );

drop policy if exists stock_order_items_insert_managers on public.stock_order_items;
create policy stock_order_items_insert_managers
  on public.stock_order_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.stock_orders so
      where so.id = stock_order_items.order_id
        and public.can_manage_workspace_stock(so.workspace_id)
    )
  );

drop policy if exists stock_order_items_update_managers on public.stock_order_items;
create policy stock_order_items_update_managers
  on public.stock_order_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.stock_orders so
      where so.id = stock_order_items.order_id
        and public.can_manage_workspace_stock(so.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.stock_orders so
      where so.id = stock_order_items.order_id
        and public.can_manage_workspace_stock(so.workspace_id)
    )
  );

drop policy if exists stock_order_items_delete_managers on public.stock_order_items;
create policy stock_order_items_delete_managers
  on public.stock_order_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.stock_orders so
      where so.id = stock_order_items.order_id
        and public.can_manage_workspace_stock(so.workspace_id)
    )
  );
