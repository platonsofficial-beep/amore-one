-- Delivery dates, receiving audit fields, and partial receiving for stock orders.
-- Run after stock_orders_schema.sql on existing databases.

alter table public.stock_orders
  add column if not exists expected_delivery_date date;

alter table public.stock_orders
  add column if not exists sent_at timestamptz;

alter table public.stock_orders
  add column if not exists sent_by uuid references auth.users(id) on delete set null;

alter table public.stock_orders
  add column if not exists partial_received_at timestamptz;

alter table public.stock_orders
  add column if not exists partial_received_by uuid references auth.users(id) on delete set null;

alter table public.stock_orders
  add column if not exists received_at timestamptz;

alter table public.stock_orders
  add column if not exists received_by uuid references auth.users(id) on delete set null;

alter table public.stock_order_items
  add column if not exists received_quantity numeric(12, 3) not null default 0;
