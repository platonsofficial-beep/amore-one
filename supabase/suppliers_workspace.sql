-- Run with explicit owner approval
-- =============================================================================
-- Suppliers per workspace (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor. Do NOT auto-run from the app.
-- Idempotent. Wrapped in begin/commit.
--
-- Purpose:
--   Each supplier belongs to one venue so later supplier-order drafts stay
--   inside that workspace. public.suppliers has no workspace_id in the
--   schema this repo shipped, and production requests that filter on it
--   receive HTTP 400.
--
-- This script:
--   - Adds nullable public.suppliers.workspace_id uuid
--   - Foreign key to public.workspaces(id) ON DELETE CASCADE
--   - Backfills only rows whose workspace_id is still null
--   - Index suppliers_workspace_company_name_idx on (workspace_id, company_name)
--   - Same-workspace triggers on stock_items / stock_orders when supplier_id
--     exists and its type matches suppliers.id (bigint in suppliers_schema.sql,
--     uuid in stock_supplier_id_uuid_repair.sql). A type mismatch is noticed
--     and skipped so the script still commits.
--   - Blocks moving a supplier to another workspace once workspace_id is set
--   - RLS: members select, can_manage_workspace_stock insert and update, no delete
--
-- ON DELETE CASCADE:
--   stock_items, stock_orders, and workspace_storages already cascade from
--   workspaces. A supplier is venue data. Deleting the venue removes its
--   directory with the venue. SET NULL would leave rows that member RLS
--   cannot see (is_workspace_member(null) is false). RESTRICT would block
--   every workspace delete until somebody deleted the supplier rows by hand,
--   which this policy set does not allow.
--
-- NOT NULL is not set. Backfill leaves a row null when stock_items and
-- stock_orders disagree about its workspace, or when it has no link and
-- more than one workspace exists. A NOT NULL constraint would abort the
-- script on those rows.
--
-- Policies dropped by name when present (each drop raises a notice):
--   Allow public read suppliers
--   Allow public insert suppliers
--   Allow public update suppliers
--   Allow public delete suppliers
--   suppliers_dev_select_all
--   suppliers_dev_insert_all
--   suppliers_dev_update_all
--   suppliers_dev_delete_all
--   suppliers_delete_managers
--   suppliers_select_members      (recreated below)
--   suppliers_insert_managers     (recreated below)
--   suppliers_update_managers     (recreated below)
-- Any other suppliers policy whose USING or WITH CHECK expression is exactly
-- true is also dropped, with a notice. The eight open names above are dropped
-- by name even if that sweep were skipped.
--
-- Policies created:
--   suppliers_select_members
--   suppliers_insert_managers
--   suppliers_update_managers
--
-- Does NOT:
--   - Set workspace_id NOT NULL
--   - Grant or create a DELETE policy
--   - Rewrite stock_items.supplier text or stock_orders.supplier text
--   - Change quantity, par, storage, or order math
--
-- Do not run supabase/suppliers_rls_policies.sql after this file. That older
-- file creates suppliers_delete_managers.
--
-- Prerequisites (already applied; this file does not recreate them):
--   1. public.suppliers
--   2. public.workspaces
--   3. public.is_workspace_member(uuid)
--   4. public.can_manage_workspace_stock(uuid)
--
-- How to verify:
--   After this file commits, run supabase/suppliers_workspace_verify.sql.
--
-- Rollback:
--   Run supabase/suppliers_workspace_rollback.sql.
-- =============================================================================

begin;

alter table public.suppliers
  add column if not exists workspace_id uuid;

do $suppliers_workspace_fk$
begin
  if to_regclass('public.workspaces') is null then
    raise exception 'public.workspaces is missing. Cannot add suppliers.workspace_id.';
  end if;

  if to_regprocedure('public.is_workspace_member(uuid)') is null
     or to_regprocedure('public.can_manage_workspace_stock(uuid)') is null then
    raise exception
      'is_workspace_member / can_manage_workspace_stock are missing. Suppliers RLS needs those helpers.';
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.suppliers'::regclass
      and conname = 'suppliers_workspace_id_fkey'
  ) then
    if (
      select c.confdeltype
      from pg_constraint c
      where c.conrelid = 'public.suppliers'::regclass
        and c.conname = 'suppliers_workspace_id_fkey'
    ) is distinct from 'c' then
      raise exception
        'suppliers_workspace_id_fkey already exists and is not ON DELETE CASCADE. Refusing to continue.';
    end if;
  else
    alter table public.suppliers
      add constraint suppliers_workspace_id_fkey
      foreign key (workspace_id)
      references public.workspaces(id)
      on delete cascade;
  end if;
end
$suppliers_workspace_fk$;

comment on column public.suppliers.workspace_id is
  'Venue that owns this supplier. Null means backfill could not choose one workspace. Not a global directory.';

create index if not exists suppliers_workspace_company_name_idx
  on public.suppliers (workspace_id, company_name);

-- -----------------------------------------------------------------------------
-- Backfill. Never overwrites a workspace_id that is already set.
-- -----------------------------------------------------------------------------
do $suppliers_workspace_backfill$
declare
  v_workspace_count integer;
  v_only_workspace uuid;
  v_has_item_supplier boolean;
  v_has_order_supplier boolean;
  v_supplier record;
  v_from_items uuid[];
  v_from_orders uuid[];
  v_links uuid[];
  v_ambiguous text[] := array[]::text[];
  v_supplier_id_type oid;
  v_linked_type oid;
  v_assigned_from_links integer := 0;
  v_assigned_only_workspace integer := 0;
  v_left record;
begin
  select count(*)::integer into v_workspace_count from public.workspaces;

  if v_workspace_count = 1 then
    select id into v_only_workspace
    from public.workspaces
    order by id
    limit 1;
  end if;

  v_has_item_supplier := exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_items'
      and column_name = 'supplier_id'
  );
  v_has_order_supplier := exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_orders'
      and column_name = 'supplier_id'
  );

  select a.atttypid
    into v_supplier_id_type
  from pg_attribute a
  where a.attrelid = 'public.suppliers'::regclass
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if v_has_item_supplier then
    select a.atttypid
      into v_linked_type
    from pg_attribute a
    where a.attrelid = 'public.stock_items'::regclass
      and a.attname = 'supplier_id'
      and a.attnum > 0
      and not a.attisdropped;

    if v_linked_type is distinct from v_supplier_id_type then
      v_has_item_supplier := false;
      raise notice
        'stock_items.supplier_id type does not match suppliers.id. That link is not used for backfill.';
    end if;
  end if;

  if v_has_order_supplier then
    select a.atttypid
      into v_linked_type
    from pg_attribute a
    where a.attrelid = 'public.stock_orders'::regclass
      and a.attname = 'supplier_id'
      and a.attnum > 0
      and not a.attisdropped;

    if v_linked_type is distinct from v_supplier_id_type then
      v_has_order_supplier := false;
      raise notice
        'stock_orders.supplier_id type does not match suppliers.id. That link is not used for backfill.';
    end if;
  end if;

  raise notice
    'suppliers backfill: workspaces=%, stock_items.supplier_id=%, stock_orders.supplier_id=%',
    v_workspace_count,
    v_has_item_supplier,
    v_has_order_supplier;

  for v_supplier in
    select id, company_name
    from public.suppliers
    where workspace_id is null
    order by id
  loop
    v_from_items := array[]::uuid[];
    v_from_orders := array[]::uuid[];

    if v_has_item_supplier then
      execute
        'select coalesce(array_agg(distinct workspace_id), array[]::uuid[])
         from public.stock_items
         where supplier_id = $1
           and workspace_id is not null'
        into v_from_items
        using v_supplier.id;
    end if;

    if v_has_order_supplier then
      execute
        'select coalesce(array_agg(distinct workspace_id), array[]::uuid[])
         from public.stock_orders
         where supplier_id = $1
           and workspace_id is not null'
        into v_from_orders
        using v_supplier.id;
    end if;

    select coalesce(array_agg(distinct link_id), array[]::uuid[])
      into v_links
    from unnest(coalesce(v_from_items, array[]::uuid[]) || coalesce(v_from_orders, array[]::uuid[])) as link_id;

    if coalesce(array_length(v_links, 1), 0) = 1 then
      update public.suppliers
      set workspace_id = v_links[1]
      where id = v_supplier.id
        and workspace_id is null;
      v_assigned_from_links := v_assigned_from_links + 1;
    elsif coalesce(array_length(v_links, 1), 0) > 1 then
      v_ambiguous := array_append(v_ambiguous, v_supplier.id::text);
      raise notice
        'supplier % (%) left NULL: linked workspaces %',
        v_supplier.id,
        v_supplier.company_name,
        v_links;
    end if;
  end loop;

  if v_workspace_count = 1 then
    update public.suppliers
    set workspace_id = v_only_workspace
    where workspace_id is null
      and not (id::text = any(v_ambiguous));
    get diagnostics v_assigned_only_workspace = row_count;
  end if;

  raise notice
    'suppliers backfill assigned from links=%, assigned because one workspace exists=%, left ambiguous=%',
    v_assigned_from_links,
    v_assigned_only_workspace,
    coalesce(array_length(v_ambiguous, 1), 0);

  for v_left in
    select id, company_name
    from public.suppliers
    where workspace_id is null
    order by id
  loop
    raise notice
      'supplier % (%) still has NULL workspace_id',
      v_left.id,
      v_left.company_name;
  end loop;
end
$suppliers_workspace_backfill$;

-- -----------------------------------------------------------------------------
-- Same-workspace guard. A null supplier workspace stays linkable.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_supplier_same_workspace()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_supplier_workspace uuid;
begin
  if new.supplier_id is null then
    return new;
  end if;

  select s.workspace_id
    into v_supplier_workspace
  from public.suppliers s
  where s.id = new.supplier_id;

  if v_supplier_workspace is null then
    return new;
  end if;

  if new.workspace_id is distinct from v_supplier_workspace then
    raise exception 'supplier_workspace_mismatch'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_supplier_same_workspace() from public;
revoke all on function public.enforce_supplier_same_workspace() from anon;
revoke all on function public.enforce_supplier_same_workspace() from authenticated;

create or replace function public.suppliers_prevent_workspace_move()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.workspace_id is not null
     and new.workspace_id is distinct from old.workspace_id then
    raise exception 'supplier_workspace_immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.suppliers_prevent_workspace_move() from public;
revoke all on function public.suppliers_prevent_workspace_move() from anon;
revoke all on function public.suppliers_prevent_workspace_move() from authenticated;

drop trigger if exists suppliers_prevent_workspace_move on public.suppliers;
create trigger suppliers_prevent_workspace_move
  before update of workspace_id on public.suppliers
  for each row
  execute function public.suppliers_prevent_workspace_move();

do $suppliers_workspace_link_triggers$
begin
  if to_regclass('public.stock_items') is not null
     and exists (
    select 1
    from pg_attribute item_supplier
    join pg_attribute supplier_pk
      on supplier_pk.atttypid = item_supplier.atttypid
    where item_supplier.attrelid = 'public.stock_items'::regclass
      and item_supplier.attname = 'supplier_id'
      and item_supplier.attnum > 0
      and not item_supplier.attisdropped
      and supplier_pk.attrelid = 'public.suppliers'::regclass
      and supplier_pk.attname = 'id'
      and supplier_pk.attnum > 0
      and not supplier_pk.attisdropped
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_items'
      and column_name = 'workspace_id'
  ) then
    drop trigger if exists stock_items_enforce_supplier_workspace on public.stock_items;
    create trigger stock_items_enforce_supplier_workspace
      before insert or update of supplier_id, workspace_id
      on public.stock_items
      for each row
      execute function public.enforce_supplier_same_workspace();
  else
    raise notice
      'stock_items same-workspace guard was not attached (supplier_id missing, or its type does not match suppliers.id).';
  end if;

  if to_regclass('public.stock_orders') is not null
     and exists (
    select 1
    from pg_attribute order_supplier
    join pg_attribute supplier_pk
      on supplier_pk.atttypid = order_supplier.atttypid
    where order_supplier.attrelid = 'public.stock_orders'::regclass
      and order_supplier.attname = 'supplier_id'
      and order_supplier.attnum > 0
      and not order_supplier.attisdropped
      and supplier_pk.attrelid = 'public.suppliers'::regclass
      and supplier_pk.attname = 'id'
      and supplier_pk.attnum > 0
      and not supplier_pk.attisdropped
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_orders'
      and column_name = 'workspace_id'
  ) then
    drop trigger if exists stock_orders_enforce_supplier_workspace on public.stock_orders;
    create trigger stock_orders_enforce_supplier_workspace
      before insert or update of supplier_id, workspace_id
      on public.stock_orders
      for each row
      execute function public.enforce_supplier_same_workspace();
  else
    raise notice
      'stock_orders same-workspace guard was not attached (supplier_id missing, or its type does not match suppliers.id).';
  end if;
end
$suppliers_workspace_link_triggers$;

-- -----------------------------------------------------------------------------
-- RLS. Members read. Stock managers insert and update. Nobody deletes.
-- -----------------------------------------------------------------------------
alter table public.suppliers enable row level security;

grant select, insert, update on table public.suppliers to authenticated;

do $suppliers_workspace_policies$
declare
  v_name text;
  v_qual text;
  v_check text;
  v_known text[] := array[
    'Allow public read suppliers',
    'Allow public insert suppliers',
    'Allow public update suppliers',
    'Allow public delete suppliers',
    'suppliers_dev_select_all',
    'suppliers_dev_insert_all',
    'suppliers_dev_update_all',
    'suppliers_dev_delete_all',
    'suppliers_delete_managers',
    'suppliers_select_members',
    'suppliers_insert_managers',
    'suppliers_update_managers'
  ];
begin
  foreach v_name in array v_known loop
    if exists (
      select 1
      from pg_policy pol
      where pol.polrelid = 'public.suppliers'::regclass
        and pol.polname = v_name
    ) then
      raise notice 'Dropping suppliers policy %', v_name;
      execute format('drop policy %I on public.suppliers', v_name);
    end if;
  end loop;

  for v_name, v_qual, v_check in
    select
      pol.polname,
      pg_get_expr(pol.polqual, pol.polrelid),
      pg_get_expr(pol.polwithcheck, pol.polrelid)
    from pg_policy pol
    where pol.polrelid = 'public.suppliers'::regclass
  loop
    if v_qual = 'true' or v_check = 'true' then
      raise notice 'Dropping suppliers policy %', v_name;
      execute format('drop policy %I on public.suppliers', v_name);
    end if;
  end loop;
end
$suppliers_workspace_policies$;

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

notify pgrst, 'reload schema';

commit;
