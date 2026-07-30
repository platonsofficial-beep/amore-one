-- P8.31.3 — Packaging metadata foundation for ONE Stock products.
-- Optional human-readable packaging note. Never used in quantity math.
-- Run after stock_items_schema.sql on existing databases.
-- Do not treat this as an inventory unit or multiplier.

alter table public.stock_items
  add column if not exists packaging_note text;

comment on column public.stock_items.packaging_note is
  'P8.31.3 Optional free-text packaging note. Informational only; never multiplies or converts inventory quantities.';
