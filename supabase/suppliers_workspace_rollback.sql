-- Run with explicit owner approval
-- =============================================================================
-- Suppliers per workspace ROLLBACK (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Run only to undo supabase/suppliers_workspace.sql
-- after that file has been applied. Do NOT auto-run from the app.
-- Idempotent. Wrapped in begin/commit.
--
-- Impact:
--   - Drops suppliers.workspace_id. Every assigned venue id on a supplier
--     is discarded. Supplier rows, names, and contact fields stay.
--   - Drops suppliers_workspace_company_name_idx and suppliers_workspace_id_fkey
--     with the column.
--   - Drops the same-workspace triggers and the move-prevention trigger.
--   - Drops the three member/manager policies.
--   - Restores the open policies that supabase/suppliers_schema.sql and
--     supabase/suppliers_rls_policies.sql document as the previous allow-all
--     set, for anon and authenticated, USING/WITH CHECK (true):
--       suppliers_dev_select_all
--       suppliers_dev_insert_all
--       suppliers_dev_update_all
--       suppliers_dev_delete_all
--   - Does not restore suppliers_delete_managers.
--   - Does not restore a supplier workspace_id that this rollback dropped.
--
-- If production had no suppliers_dev_* policies before the forward script,
-- this rollback puts those four open policies back. Confirm the live policy
-- list before applying the forward script.
--
-- stock_items and stock_orders rows are not deleted or rewritten.
-- =============================================================================

begin;

drop trigger if exists stock_items_enforce_supplier_workspace on public.stock_items;
drop trigger if exists stock_orders_enforce_supplier_workspace on public.stock_orders;
drop trigger if exists suppliers_prevent_workspace_move on public.suppliers;

drop function if exists public.enforce_supplier_same_workspace();
drop function if exists public.suppliers_prevent_workspace_move();

drop policy if exists suppliers_select_members on public.suppliers;
drop policy if exists suppliers_insert_managers on public.suppliers;
drop policy if exists suppliers_update_managers on public.suppliers;
drop policy if exists suppliers_delete_managers on public.suppliers;

alter table public.suppliers
  drop column if exists workspace_id;

drop policy if exists suppliers_dev_select_all on public.suppliers;
drop policy if exists suppliers_dev_insert_all on public.suppliers;
drop policy if exists suppliers_dev_update_all on public.suppliers;
drop policy if exists suppliers_dev_delete_all on public.suppliers;

create policy suppliers_dev_select_all
  on public.suppliers
  for select
  to anon, authenticated
  using (true);

create policy suppliers_dev_insert_all
  on public.suppliers
  for insert
  to anon, authenticated
  with check (true);

create policy suppliers_dev_update_all
  on public.suppliers
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy suppliers_dev_delete_all
  on public.suppliers
  for delete
  to anon, authenticated
  using (true);

commit;
