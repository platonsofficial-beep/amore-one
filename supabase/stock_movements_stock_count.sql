-- Allow stock_count movement type in stock_movements ledger.
-- Run in Supabase SQL editor after stock_movements_schema.sql.

alter table public.stock_movements
  drop constraint if exists stock_movements_type_check;

alter table public.stock_movements
  add constraint stock_movements_type_check
  check (type in ('receive', 'usage', 'adjustment', 'stock_count'));
