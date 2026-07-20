-- =============================================================================
-- P8.3.0 — Inventory Count Session RLS policies
-- =============================================================================
-- Run manually in the Supabase SQL editor AFTER using the tables from the app.
-- Prerequisite: inventory_count_schema.sql
--
-- Permission model (matches Stock):
--   SELECT  → workspace members (is_workspace_member)
--   INSERT / UPDATE / DELETE → stock managers
--     (owner | general_manager | manager via can_manage_workspace_stock)
--
-- Does NOT create RPCs or change stock_items / stock_movements policies.
-- =============================================================================

-- Ensure Stock permission helpers exist (idempotent; same bodies as stock_rls_policies).
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

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on table public.inventory_count_sessions to authenticated;
grant select, insert, update, delete on table public.inventory_count_session_locations to authenticated;
grant select, insert, update, delete on table public.inventory_count_session_items to authenticated;

alter table public.inventory_count_sessions enable row level security;
alter table public.inventory_count_session_locations enable row level security;
alter table public.inventory_count_session_items enable row level security;

-- -----------------------------------------------------------------------------
-- inventory_count_sessions policies
-- -----------------------------------------------------------------------------
drop policy if exists inventory_count_sessions_select_members
  on public.inventory_count_sessions;
create policy inventory_count_sessions_select_members
  on public.inventory_count_sessions
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists inventory_count_sessions_insert_managers
  on public.inventory_count_sessions;
create policy inventory_count_sessions_insert_managers
  on public.inventory_count_sessions
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists inventory_count_sessions_update_managers
  on public.inventory_count_sessions;
create policy inventory_count_sessions_update_managers
  on public.inventory_count_sessions
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists inventory_count_sessions_delete_managers
  on public.inventory_count_sessions;
create policy inventory_count_sessions_delete_managers
  on public.inventory_count_sessions
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

-- -----------------------------------------------------------------------------
-- inventory_count_session_locations policies
-- -----------------------------------------------------------------------------
drop policy if exists inventory_count_session_locations_select_members
  on public.inventory_count_session_locations;
create policy inventory_count_session_locations_select_members
  on public.inventory_count_session_locations
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists inventory_count_session_locations_insert_managers
  on public.inventory_count_session_locations;
create policy inventory_count_session_locations_insert_managers
  on public.inventory_count_session_locations
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists inventory_count_session_locations_update_managers
  on public.inventory_count_session_locations;
create policy inventory_count_session_locations_update_managers
  on public.inventory_count_session_locations
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists inventory_count_session_locations_delete_managers
  on public.inventory_count_session_locations;
create policy inventory_count_session_locations_delete_managers
  on public.inventory_count_session_locations
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

-- -----------------------------------------------------------------------------
-- inventory_count_session_items policies
-- -----------------------------------------------------------------------------
drop policy if exists inventory_count_session_items_select_members
  on public.inventory_count_session_items;
create policy inventory_count_session_items_select_members
  on public.inventory_count_session_items
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists inventory_count_session_items_insert_managers
  on public.inventory_count_session_items;
create policy inventory_count_session_items_insert_managers
  on public.inventory_count_session_items
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists inventory_count_session_items_update_managers
  on public.inventory_count_session_items;
create policy inventory_count_session_items_update_managers
  on public.inventory_count_session_items
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists inventory_count_session_items_delete_managers
  on public.inventory_count_session_items;
create policy inventory_count_session_items_delete_managers
  on public.inventory_count_session_items
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- select schemaname, tablename, policyname, cmd
-- from pg_policies
-- where tablename like 'inventory_count%'
-- order by tablename, policyname;

-- select c.relname, c.relrowsecurity
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relname like 'inventory_count%';
