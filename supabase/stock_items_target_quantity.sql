-- Par level / target stock for ONE Stock.
-- Run after stock_items_schema.sql on existing databases.

alter table public.stock_items
  add column if not exists target_quantity numeric(12, 3);
