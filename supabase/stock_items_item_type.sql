-- Add product type to stock_items (broad category + specific type).
-- Run in Supabase SQL editor after stock_items_schema.sql.

alter table public.stock_items
  add column if not exists item_type text not null default 'Other';

create index if not exists stock_items_workspace_category_type_idx
  on public.stock_items (workspace_id, category, item_type);
