-- Workspace-scoped stock catalog for ONE Stock V1.
-- Prerequisite: public.workspaces exists.
-- Run in Supabase SQL editor, then stock_rls_policies.sql.

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  category text not null default 'Other',
  item_type text not null default 'Other',
  supplier text not null default '',
  unit text not null default '',
  packaging_note text,
  brand text,
  size text,
  barcode text,
  current_quantity numeric(12, 3) not null default 0,
  minimum_quantity numeric(12, 3) not null default 0,
  target_quantity numeric(12, 3),
  order_quantity numeric(12, 3),
  cost_price numeric(12, 2) not null default 0,
  storage_location text not null default 'Main Storage',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_items_workspace_idx
  on public.stock_items (workspace_id);

create index if not exists stock_items_workspace_category_idx
  on public.stock_items (workspace_id, category);

create index if not exists stock_items_workspace_active_idx
  on public.stock_items (workspace_id, active);

create or replace function public.set_stock_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stock_items_set_updated_at on public.stock_items;

create trigger stock_items_set_updated_at
  before update on public.stock_items
  for each row
  execute function public.set_stock_items_updated_at();
