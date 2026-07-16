-- =============================================================================
-- P7.2.5 — Production RLS for public.suppliers
-- =============================================================================
-- Matches stock_items / stock_orders permission model exactly.
-- Uses existing helpers only:
--   public.is_workspace_member(uuid)
--   public.can_manage_workspace_stock(uuid)
--
-- Prerequisites (run / confirm first):
--   1. supabase/suppliers_workspace_id.sql     (workspace_id column)
--   2. App dual-read + workspace writes        (P7.2.1 / P7.2.3)
--   3. supabase/suppliers_workspace_backfill.sql applied in the target DB
--      so legacy rows are not left with NULL workspace_id (those become
--      invisible under these policies)
--   4. Helpers available (from stock_rls_policies.sql or equivalent)
--
-- Policies:
--   SELECT → workspace members
--   INSERT → owner / general_manager / manager
--   UPDATE → owner / general_manager / manager
--   DELETE → owner / general_manager / manager
--
-- No anon policies. Temp open policies are dropped.
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

grant select, insert, update, delete on table public.suppliers to authenticated;

alter table public.suppliers enable row level security;

-- Remove TEMP DEVELOPMENT open policies (anon + authenticated using true).
drop policy if exists suppliers_dev_select_all on public.suppliers;
drop policy if exists suppliers_dev_insert_all on public.suppliers;
drop policy if exists suppliers_dev_update_all on public.suppliers;
drop policy if exists suppliers_dev_delete_all on public.suppliers;

-- Re-runnable production policy names.
drop policy if exists suppliers_select_members on public.suppliers;
drop policy if exists suppliers_insert_managers on public.suppliers;
drop policy if exists suppliers_update_managers on public.suppliers;
drop policy if exists suppliers_delete_managers on public.suppliers;

create policy suppliers_select_members
  on public.suppliers
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy suppliers_insert_managers
  on public.suppliers
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

create policy suppliers_update_managers
  on public.suppliers
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

create policy suppliers_delete_managers
  on public.suppliers
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

-- =============================================================================
-- Verification queries (run after applying; expect matching stock_items model)
-- =============================================================================

-- Policies present (expect 4 production names; zero suppliers_dev_*)
-- select polname, polcmd, polroles::regrole[]
-- from pg_policy
-- where polrelid = 'public.suppliers'::regclass
-- order by polname;

-- Remaining NULL workspace_id (expect 0 after backfill)
-- select count(*) from public.suppliers where workspace_id is null;

-- =============================================================================
-- Rollback (emergency only — restores open TEMP policies; not for production)
-- =============================================================================
-- drop policy if exists suppliers_select_members on public.suppliers;
-- drop policy if exists suppliers_insert_managers on public.suppliers;
-- drop policy if exists suppliers_update_managers on public.suppliers;
-- drop policy if exists suppliers_delete_managers on public.suppliers;
-- create policy suppliers_dev_select_all on public.suppliers for select to anon, authenticated using (true);
-- create policy suppliers_dev_insert_all on public.suppliers for insert to anon, authenticated with check (true);
-- create policy suppliers_dev_update_all on public.suppliers for update to anon, authenticated using (true) with check (true);
-- create policy suppliers_dev_delete_all on public.suppliers for delete to anon, authenticated using (true);
