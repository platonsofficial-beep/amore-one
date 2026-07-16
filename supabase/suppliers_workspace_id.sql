-- Phase 1 foundation: optional workspace ownership on suppliers.
-- Run in the Supabase SQL editor after public.suppliers and public.workspaces exist.
--
-- SAFE / NON-BREAKING:
-- - Adds nullable workspace_id only.
-- - Does NOT backfill existing rows.
-- - Does NOT set NOT NULL.
-- - Does NOT replace TEMP DEVELOPMENT RLS policies.
-- - Existing app queries (global select/insert/update/delete) keep working.
--
-- NOT in this script (later Phase 1 cutover):
-- - Backfill workspace_id for existing suppliers
-- - Workspace-scoped RLS (member select / manager mutate)
-- - App-side filter by workspace_id on getSuppliers
-- - supplier_id FK on stock_items / stock_orders

alter table public.suppliers
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

create index if not exists suppliers_workspace_idx
  on public.suppliers (workspace_id);

create index if not exists suppliers_workspace_active_idx
  on public.suppliers (workspace_id, active);

create index if not exists suppliers_workspace_company_name_idx
  on public.suppliers (workspace_id, company_name);
