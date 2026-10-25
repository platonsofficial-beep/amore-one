-- Run with explicit owner approval
-- =============================================================================
-- Suppliers per workspace verification (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED until the owner runs it.
-- Run only AFTER supabase/suppliers_workspace.sql has committed.
--
-- Read-only. One transaction. The last statement is ROLLBACK.
-- A failed assertion raises and aborts the transaction. Then run: ROLLBACK;
--
-- Pass line:
--   suppliers_workspace verify PASS
-- =============================================================================

begin;

do $suppliers_workspace_verify$
declare
  v_nullable text;
  v_data_type text;
  v_delete_rule text;
  v_rls boolean;
  v_index_def text;
  v_policy_count integer;
  v_has_item_supplier boolean;
  v_has_order_supplier boolean;
  v_null_suppliers bigint;
  v_open_names text;
begin
  if to_regclass('public.suppliers') is null then
    raise exception 'suppliers_workspace verify: public.suppliers is missing';
  end if;

  select c.data_type, c.is_nullable
    into v_data_type, v_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'suppliers'
    and c.column_name = 'workspace_id';

  if v_data_type is distinct from 'uuid' or v_nullable is distinct from 'YES' then
    raise exception
      'suppliers_workspace verify: workspace_id must be nullable uuid (found type %, nullable %)',
      coalesce(v_data_type, '<missing>'),
      coalesce(v_nullable, '<missing>');
  end if;

  select rc.delete_rule
    into v_delete_rule
  from information_schema.referential_constraints rc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = rc.constraint_name
   and kcu.constraint_schema = rc.constraint_schema
  where rc.constraint_schema = 'public'
    and rc.constraint_name = 'suppliers_workspace_id_fkey'
    and kcu.column_name = 'workspace_id';

  if v_delete_rule is distinct from 'CASCADE' then
    raise exception
      'suppliers_workspace verify: suppliers_workspace_id_fkey delete rule must be CASCADE (found %)',
      coalesce(v_delete_rule, '<missing>');
  end if;

  select pg_get_indexdef(indexrel.oid)
    into v_index_def
  from pg_class indexrel
  join pg_namespace n on n.oid = indexrel.relnamespace
  where n.nspname = 'public'
    and indexrel.relname = 'suppliers_workspace_company_name_idx';

  if v_index_def is null
     or v_index_def not ilike '%(workspace_id, company_name)%' then
    raise exception
      'suppliers_workspace verify: index suppliers_workspace_company_name_idx on (workspace_id, company_name) is missing';
  end if;

  select c.relrowsecurity
    into v_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'suppliers';

  if v_rls is distinct from true then
    raise exception 'suppliers_workspace verify: RLS is not enabled on public.suppliers';
  end if;

  if to_regprocedure('public.is_workspace_member(uuid)') is null
     or to_regprocedure('public.can_manage_workspace_stock(uuid)') is null then
    raise exception 'suppliers_workspace verify: workspace member helpers are missing';
  end if;

  select count(*)::integer
    into v_policy_count
  from pg_policy pol
  where pol.polrelid = 'public.suppliers'::regclass
    and pol.polname in (
      'suppliers_select_members',
      'suppliers_insert_managers',
      'suppliers_update_managers'
    );

  if v_policy_count <> 3 then
    raise exception
      'suppliers_workspace verify: expected 3 suppliers policies, found %',
      v_policy_count;
  end if;

  if not exists (
    select 1
    from pg_policy pol
    where pol.polrelid = 'public.suppliers'::regclass
      and pol.polname = 'suppliers_select_members'
      and pol.polcmd = 'r'
      and pg_get_expr(pol.polqual, pol.polrelid) ilike '%is_workspace_member%'
  ) then
    raise exception 'suppliers_workspace verify: suppliers_select_members is missing or not member-scoped';
  end if;

  if not exists (
    select 1
    from pg_policy pol
    where pol.polrelid = 'public.suppliers'::regclass
      and pol.polname = 'suppliers_insert_managers'
      and pol.polcmd = 'a'
      and pg_get_expr(pol.polwithcheck, pol.polrelid) ilike '%can_manage_workspace_stock%'
  ) then
    raise exception 'suppliers_workspace verify: suppliers_insert_managers is missing or not manager-scoped';
  end if;

  if not exists (
    select 1
    from pg_policy pol
    where pol.polrelid = 'public.suppliers'::regclass
      and pol.polname = 'suppliers_update_managers'
      and pol.polcmd = 'w'
      and pg_get_expr(pol.polqual, pol.polrelid) ilike '%can_manage_workspace_stock%'
      and pg_get_expr(pol.polwithcheck, pol.polrelid) ilike '%can_manage_workspace_stock%'
  ) then
    raise exception 'suppliers_workspace verify: suppliers_update_managers is missing or not manager-scoped';
  end if;

  select string_agg(pol.polname, ', ' order by pol.polname)
    into v_open_names
  from pg_policy pol
  where pol.polrelid = 'public.suppliers'::regclass
    and pol.polname in (
      'Allow public read suppliers',
      'Allow public insert suppliers',
      'Allow public update suppliers',
      'Allow public delete suppliers',
      'suppliers_dev_select_all',
      'suppliers_dev_insert_all',
      'suppliers_dev_update_all',
      'suppliers_dev_delete_all'
    );

  if v_open_names is not null then
    raise exception
      'suppliers_workspace verify: previous open suppliers policies still present: %',
      v_open_names;
  end if;

  if exists (
    select 1
    from pg_policy pol
    where pol.polrelid = 'public.suppliers'::regclass
      and (
        pol.polcmd = 'd'
        or pol.polcmd = '*'
        or pol.polname like 'suppliers_dev_%'
        or pol.polname = 'suppliers_delete_managers'
        or pg_get_expr(pol.polqual, pol.polrelid) = 'true'
        or pg_get_expr(pol.polwithcheck, pol.polrelid) = 'true'
      )
  ) then
    raise exception 'suppliers_workspace verify: a delete or allow-all suppliers policy is still present';
  end if;

  if to_regprocedure('public.enforce_supplier_same_workspace()') is null then
    raise exception 'suppliers_workspace verify: enforce_supplier_same_workspace() is missing';
  end if;

  if to_regprocedure('public.suppliers_prevent_workspace_move()') is null then
    raise exception 'suppliers_workspace verify: suppliers_prevent_workspace_move() is missing';
  end if;

  if not exists (
    select 1
    from pg_trigger trg
    join pg_class tbl on tbl.oid = trg.tgrelid
    join pg_namespace n on n.oid = tbl.relnamespace
    where n.nspname = 'public'
      and tbl.relname = 'suppliers'
      and trg.tgname = 'suppliers_prevent_workspace_move'
      and not trg.tgisinternal
  ) then
    raise exception 'suppliers_workspace verify: suppliers_prevent_workspace_move trigger is missing';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_items'
      and column_name = 'supplier_id'
  ) into v_has_item_supplier;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_orders'
      and column_name = 'supplier_id'
  ) into v_has_order_supplier;

  if v_has_item_supplier
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
     )
     and not exists (
    select 1
    from pg_trigger trg
    join pg_class tbl on tbl.oid = trg.tgrelid
    join pg_namespace n on n.oid = tbl.relnamespace
    where n.nspname = 'public'
      and tbl.relname = 'stock_items'
      and trg.tgname = 'stock_items_enforce_supplier_workspace'
      and not trg.tgisinternal
  ) then
    raise exception 'suppliers_workspace verify: stock_items supplier workspace trigger is missing';
  end if;

  if v_has_order_supplier
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
     )
     and not exists (
    select 1
    from pg_trigger trg
    join pg_class tbl on tbl.oid = trg.tgrelid
    join pg_namespace n on n.oid = tbl.relnamespace
    where n.nspname = 'public'
      and tbl.relname = 'stock_orders'
      and trg.tgname = 'stock_orders_enforce_supplier_workspace'
      and not trg.tgisinternal
  ) then
    raise exception 'suppliers_workspace verify: stock_orders supplier workspace trigger is missing';
  end if;

  select count(*)::bigint
    into v_null_suppliers
  from public.suppliers
  where workspace_id is null;

  raise notice
    'suppliers_workspace verify: NULL workspace_id rows=% (allowed when backfill was ambiguous)',
    v_null_suppliers;

  raise notice 'suppliers_workspace verify PASS';
end
$suppliers_workspace_verify$;

rollback;
