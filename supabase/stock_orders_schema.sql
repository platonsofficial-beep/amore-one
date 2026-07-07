-- Workspace-scoped purchase orders for ONE Stock V1.
-- Prerequisite: public.workspaces, public.stock_items.
-- Run in Supabase SQL editor, then stock_orders_rls_policies.sql.

create table if not exists public.stock_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  supplier text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'received', 'cancelled')),
  total_cost numeric(12, 2) not null default 0,
  notes text not null default '',
  expected_delivery_date date,
  sent_at timestamptz,
  sent_by uuid references auth.users(id) on delete set null,
  partial_received_at timestamptz,
  partial_received_by uuid references auth.users(id) on delete set null,
  received_at timestamptz,
  received_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_orders_workspace_idx
  on public.stock_orders (workspace_id);

create index if not exists stock_orders_workspace_status_idx
  on public.stock_orders (workspace_id, status);

create index if not exists stock_orders_workspace_created_idx
  on public.stock_orders (workspace_id, created_at desc);

create table if not exists public.stock_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.stock_orders(id) on delete cascade,
  stock_item_id uuid references public.stock_items(id) on delete set null,
  item_name text not null default '',
  quantity numeric(12, 3) not null default 0,
  received_quantity numeric(12, 3) not null default 0,
  unit text not null default '',
  cost_price numeric(12, 2) not null default 0,
  total_price numeric(12, 2) not null default 0
);

create index if not exists stock_order_items_order_idx
  on public.stock_order_items (order_id);

create index if not exists stock_order_items_stock_item_idx
  on public.stock_order_items (stock_item_id);

create or replace function public.set_stock_orders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stock_orders_set_updated_at on public.stock_orders;

create trigger stock_orders_set_updated_at
  before update on public.stock_orders
  for each row
  execute function public.set_stock_orders_updated_at();
