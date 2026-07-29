-- =============================================================================
-- P8.29.3 — Location-Aware Movement Schema Extension
-- =============================================================================
-- Run manually in the Supabase SQL editor.
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Extend public.stock_movements for multi-location identity, transfers, and
--   origin workflow traceability. All new columns are nullable so existing
--   writers (receive, adjustment, Count post, Import Apply) keep working.
--
-- Contract:
--   P8.29.1 — Multi-Location Product Contract Lock
--
-- Prerequisites:
--   1. public.stock_movements exists (stock_movements_schema.sql)
--   2. public.workspace_storages exists (workspace_storages_schema.sql)
--   3. Prefer after stock_movements_stock_count.sql (type check already named)
--
-- This script:
--   - Adds nullable location / transfer / origin columns
--   - Extends type CHECK with transfer_out / transfer_in
--   - Adds origin_workflow CHECK
--   - Adds location_key CHECKs
--   - Adds lookup indexes
--
-- Does NOT:
--   - Populate new fields on existing or new rows
--   - Change movement writers / RPCs / services
--   - Mutate balances, stock_items, Count, or Import
--   - Enforce transfer_group_id for transfer types yet
--   - Change RLS or grants
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Nullable location / transfer / origin columns
-- -----------------------------------------------------------------------------
alter table public.stock_movements
  add column if not exists source_workspace_storage_id uuid
    references public.workspace_storages(id) on delete restrict;

alter table public.stock_movements
  add column if not exists destination_workspace_storage_id uuid
    references public.workspace_storages(id) on delete restrict;

alter table public.stock_movements
  add column if not exists source_location_key text;

alter table public.stock_movements
  add column if not exists destination_location_key text;

alter table public.stock_movements
  add column if not exists transfer_group_id uuid;

alter table public.stock_movements
  add column if not exists origin_workflow text;

alter table public.stock_movements
  add column if not exists origin_ref_id uuid;

comment on column public.stock_movements.source_workspace_storage_id is
  'P8.29.3 Optional FK to source workspace_storages. Nullable for legacy writers.';

comment on column public.stock_movements.destination_workspace_storage_id is
  'P8.29.3 Optional FK to destination workspace_storages. Nullable for legacy writers.';

comment on column public.stock_movements.source_location_key is
  'P8.29.3 Exact source location_key snapshot when present. Not fuzzy-normalized.';

comment on column public.stock_movements.destination_location_key is
  'P8.29.3 Exact destination location_key snapshot when present. Not fuzzy-normalized.';

comment on column public.stock_movements.transfer_group_id is
  'P8.29.3 Shared UUID for transfer_out + transfer_in pair. Required by future transfer RPC only.';

comment on column public.stock_movements.origin_workflow is
  'P8.29.3 Workflow origin for traceability. Nullable until writers populate it.';

comment on column public.stock_movements.origin_ref_id is
  'P8.29.3 Optional origin reference (session/order/import/transfer group/etc).';

-- -----------------------------------------------------------------------------
-- Movement types: keep existing; add transfer_out / transfer_in
-- -----------------------------------------------------------------------------
alter table public.stock_movements
  drop constraint if exists stock_movements_type_check;

alter table public.stock_movements
  add constraint stock_movements_type_check
  check (
    type in (
      'receive',
      'usage',
      'adjustment',
      'stock_count',
      'transfer_out',
      'transfer_in'
    )
  );

-- -----------------------------------------------------------------------------
-- Origin workflow CHECK (nullable; prefer CHECK over enum — repository convention)
-- -----------------------------------------------------------------------------
alter table public.stock_movements
  drop constraint if exists stock_movements_origin_workflow_chk;

alter table public.stock_movements
  add constraint stock_movements_origin_workflow_chk
  check (
    origin_workflow is null
    or origin_workflow in (
      'manual',
      'order_receive',
      'inventory_count_post',
      'inventory_count_correction',
      'inventory_count_reversal',
      'spreadsheet_import',
      'transfer',
      'migration',
      'repair'
    )
  );

-- -----------------------------------------------------------------------------
-- Location key CHECKs: nullable; if present → trimmed, non-empty, <=80
-- -----------------------------------------------------------------------------
alter table public.stock_movements
  drop constraint if exists stock_movements_source_location_key_chk;

alter table public.stock_movements
  add constraint stock_movements_source_location_key_chk
  check (
    source_location_key is null
    or (
      source_location_key = btrim(source_location_key)
      and length(source_location_key) > 0
      and char_length(source_location_key) <= 80
    )
  );

alter table public.stock_movements
  drop constraint if exists stock_movements_destination_location_key_chk;

alter table public.stock_movements
  add constraint stock_movements_destination_location_key_chk
  check (
    destination_location_key is null
    or (
      destination_location_key = btrim(destination_location_key)
      and length(destination_location_key) > 0
      and char_length(destination_location_key) <= 80
    )
  );

-- -----------------------------------------------------------------------------
-- Indexes (lookup only; transfer_group_id required later for transfer pairs)
-- -----------------------------------------------------------------------------
create index if not exists stock_movements_workspace_source_storage_idx
  on public.stock_movements (workspace_id, source_workspace_storage_id);

create index if not exists stock_movements_workspace_destination_storage_idx
  on public.stock_movements (workspace_id, destination_workspace_storage_id);

create index if not exists stock_movements_transfer_group_idx
  on public.stock_movements (transfer_group_id);

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================
-- select column_name, is_nullable, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'stock_movements'
-- order by ordinal_position;
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.stock_movements'::regclass
-- order by conname;
-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop index if exists public.stock_movements_transfer_group_idx;
-- drop index if exists public.stock_movements_workspace_destination_storage_idx;
-- drop index if exists public.stock_movements_workspace_source_storage_idx;
-- alter table public.stock_movements drop constraint if exists stock_movements_destination_location_key_chk;
-- alter table public.stock_movements drop constraint if exists stock_movements_source_location_key_chk;
-- alter table public.stock_movements drop constraint if exists stock_movements_origin_workflow_chk;
-- alter table public.stock_movements drop constraint if exists stock_movements_type_check;
-- alter table public.stock_movements add constraint stock_movements_type_check
--   check (type in ('receive', 'usage', 'adjustment', 'stock_count'));
-- alter table public.stock_movements drop column if exists origin_ref_id;
-- alter table public.stock_movements drop column if exists origin_workflow;
-- alter table public.stock_movements drop column if exists transfer_group_id;
-- alter table public.stock_movements drop column if exists destination_location_key;
-- alter table public.stock_movements drop column if exists source_location_key;
-- alter table public.stock_movements drop column if exists destination_workspace_storage_id;
-- alter table public.stock_movements drop column if exists source_workspace_storage_id;
