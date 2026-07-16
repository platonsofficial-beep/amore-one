-- =============================================================================
-- P7.6.6 — Production-safe READ access for inventory_stock_item_map
-- =============================================================================
-- Run manually in the Supabase SQL editor after inventory_stock_item_map.sql.
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Allow the Inventory Migration Dashboard to SELECT map rows for authorized
--   workspace managers. No client writes. No migration execution.
--
-- Authorization pattern:
--   Matches Stock RLS helpers from stock_rls_policies.sql /
--   suppliers_rls_policies.sql (direct RLS, not a new RPC architecture).
--
-- Allowed SELECT (workspace-scoped):
--   - owner
--   - general_manager
--   - manager
--
-- Denied:
--   - host
--   - staff
--   - anonymous / unauthenticated
--   - members of a different workspace
--
-- Writes remain ops-only (service role / SQL editor bypass RLS).
-- No INSERT / UPDATE / DELETE policies for authenticated or anon.
--
-- Prerequisites:
--   1. public.inventory_stock_item_map exists
--   2. public.workspace_members exists
--   3. Helpers available (created idempotently below if missing)
-- =============================================================================

-- Ensure the same production helpers stock_items uses (idempotent).
create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.auth_user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_workspace_stock(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.auth_user_id = auth.uid()
      and wm.role in ('owner', 'general_manager', 'manager')
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.can_manage_workspace_stock(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_manage_workspace_stock(uuid) to authenticated;

alter table public.inventory_stock_item_map enable row level security;

-- Table privileges: SELECT only for authenticated. No anon. No client writes.
revoke all on table public.inventory_stock_item_map from public;
revoke all on table public.inventory_stock_item_map from anon;
revoke all on table public.inventory_stock_item_map from authenticated;
grant select on table public.inventory_stock_item_map to authenticated;

-- Drop any prior client policies (idempotent / re-runnable).
drop policy if exists inventory_stock_item_map_select_managers
  on public.inventory_stock_item_map;
drop policy if exists inventory_stock_item_map_select_members
  on public.inventory_stock_item_map;
drop policy if exists inventory_stock_item_map_insert_managers
  on public.inventory_stock_item_map;
drop policy if exists inventory_stock_item_map_update_managers
  on public.inventory_stock_item_map;
drop policy if exists inventory_stock_item_map_delete_managers
  on public.inventory_stock_item_map;

-- SELECT only: owner / general_manager / manager for their workspace rows.
create policy inventory_stock_item_map_select_managers
  on public.inventory_stock_item_map
  for select
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

-- Intentionally no INSERT / UPDATE / DELETE policies for authenticated or anon.

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- Policies (expect exactly one SELECT policy for managers)
-- select polname, polcmd::text, polroles::regrole[]
-- from pg_policy
-- where polrelid = 'public.inventory_stock_item_map'::regclass
-- order by polname;

-- Privileges (expect SELECT for authenticated only; no anon)
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and table_name = 'inventory_stock_item_map'
-- order by grantee, privilege_type;

-- Role matrix (manual):
--   owner / general_manager / manager in workspace → SELECT rows for that workspace_id
--   host / staff in workspace                     → 0 rows (policy denies)
--   manager of workspace A querying workspace B   → 0 rows
--   anon / unauthenticated                        → permission denied / no access

-- =============================================================================
-- Rollback (emergency only — removes client read access)
-- =============================================================================
-- drop policy if exists inventory_stock_item_map_select_managers
--   on public.inventory_stock_item_map;
-- revoke all on table public.inventory_stock_item_map from authenticated;
-- revoke all on table public.inventory_stock_item_map from anon;
