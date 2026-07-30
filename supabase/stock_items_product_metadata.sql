-- =============================================================================
-- P8.31.6a — Product Metadata Schema Foundation
-- =============================================================================
-- MANUAL EXECUTION ONLY — Supabase SQL Editor after stock_items_schema.sql.
-- Do NOT auto-run from the app. Do NOT wire into migrations runners.
--
-- Adds optional descriptive product metadata:
--   brand   text  — max 120 (enforce on write in app; DB remains unbounded text)
--   size    text  — max 80  (descriptive only; never inventory unit / multiplier)
--   barcode text  — max 64  (identifier only; no uniqueness in this sprint)
--
-- Semantics:
--   All columns nullable. Existing rows stay NULL.
--   No quantity, unit, valuation, packaging conversion, or scanner behavior.
--
-- Limits follow repository optional-metadata convention (see packaging_note):
--   nullable text in SQL; recommended max lengths documented for P8.31.6b wiring.
--   Location keys use DB char_length CHECKs because they are operational keys;
--   product brand/size/barcode are informational metadata (same pattern as
--   packaging_note), so length is not CHECKed at the database in this sprint.
-- =============================================================================

alter table public.stock_items
  add column if not exists brand text;

alter table public.stock_items
  add column if not exists size text;

alter table public.stock_items
  add column if not exists barcode text;

comment on column public.stock_items.brand is
  'P8.31.6a Optional product brand. Descriptive metadata only. Recommended max length 120. Never affects quantity or valuation.';

comment on column public.stock_items.size is
  'P8.31.6a Optional physical size label (e.g. 700 ml, 1 L). Descriptive metadata only. Recommended max length 80. Never an inventory unit or quantity multiplier.';

comment on column public.stock_items.barcode is
  'P8.31.6a Optional barcode/identifier. Descriptive only. Recommended max length 64. No uniqueness constraint in P8.31.6a. No scanner workflow.';
