-- Stock movement ledger for ONE Stock V1.
-- Prerequisite: public.stock_items exists.
-- Run after stock_items_schema.sql, then stock_rls_policies.sql.

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  item_id uuid not null references public.stock_items(id) on delete cascade,
  type text not null check (type in ('receive', 'usage', 'adjustment', 'stock_count')),
  quantity numeric(12, 3) not null,
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_workspace_idx
  on public.stock_movements (workspace_id, created_at desc);

create index if not exists stock_movements_item_idx
  on public.stock_movements (item_id, created_at desc);
