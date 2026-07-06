-- Add storage location and optional order quantity to stock_items.
-- Run in Supabase SQL editor after stock_items_schema.sql.

alter table public.stock_items
  add column if not exists storage_location text not null default 'Main Storage';

alter table public.stock_items
  add column if not exists order_quantity numeric(12, 3);

create index if not exists stock_items_workspace_location_idx
  on public.stock_items (workspace_id, storage_location);
