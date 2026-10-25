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
--   - Restores the exact open policy set confirmed read-only in production
--     before this change (8 policies). suppliers_delete_managers did not
--     exist and is not restored.
--       TO public, USING/WITH CHECK (true):
--         "Allow public read suppliers"    SELECT
--         "Allow public insert suppliers"  INSERT
--         "Allow public update suppliers"  UPDATE
--         "Allow public delete suppliers"  DELETE
--       TO anon, authenticated, USING/WITH CHECK (true):
--         suppliers_dev_select_all
--         suppliers_dev_insert_all
--         suppliers_dev_update_all
--         suppliers_dev_delete_all
--   - Does not restore a supplier workspace_id that this rollback dropped.
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

drop policy if exists "Allow public read suppliers" on public.suppliers;
drop policy if exists "Allow public insert suppliers" on public.suppliers;
drop policy if exists "Allow public update suppliers" on public.suppliers;
drop policy if exists "Allow public delete suppliers" on public.suppliers;

drop policy if exists suppliers_dev_select_all on public.suppliers;
drop policy if exists suppliers_dev_insert_all on public.suppliers;
drop policy if exists suppliers_dev_update_all on public.suppliers;
drop policy if exists suppliers_dev_delete_all on public.suppliers;

create policy "Allow public read suppliers"
  on public.suppliers
  for select
  to public
  using (true);

create policy "Allow public insert suppliers"
  on public.suppliers
  for insert
  to public
  with check (true);

create policy "Allow public update suppliers"
  on public.suppliers
  for update
  to public
  using (true)
  with check (true);

create policy "Allow public delete suppliers"
  on public.suppliers
  for delete
  to public
  using (true);

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
