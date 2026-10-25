-- =============================================================================
-- Per-shelf par verification (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED until the owner runs it.
-- Run only AFTER supabase/stock_item_storage_pars.sql has committed.
--
-- This file is NOT a migration.
-- Part A is read-only.
-- Part B is one transaction and its last statement is ROLLBACK.
-- Part B uses amore-nicosia. Fixture rows are inserted inside the transaction
-- and removed by ROLLBACK. A second workspace is created only inside this
-- transaction to prove the same-workspace check, then rolled back with it.
--
-- If an assertion raises, the open transaction is aborted. Run: ROLLBACK;
--
-- Pass line:
--   ALL STOCK ITEM STORAGE PARS VERIFY ASSERTIONS PASSED — TRANSACTION ROLLED BACK
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Part A — read-only catalog, RLS, and grant checks
-- -----------------------------------------------------------------------------
select
  c.relname,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'stock_item_storage_pars';

select
  column_name,
  data_type,
  numeric_precision,
  numeric_scale,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('stock_item_storage_pars', 'stock_items')
  and column_name in (
    'par_quantity',
    'workspace_id',
    'stock_item_id',
    'workspace_storage_id',
    'updated_by',
    'minimum_quantity',
    'target_quantity'
  )
order by table_name, column_name;

select pol.polname, pol.polcmd
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'stock_item_storage_pars'
order by pol.polname;

do $storage_pars_readonly$
declare
  v_src text;
begin
  if to_regclass('public.stock_item_storage_pars') is null then
    raise exception 'storage par verify: stock_item_storage_pars is missing. Apply stock_item_storage_pars.sql first.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_item_storage_pars'
      and column_name = 'par_quantity'
      and data_type = 'numeric'
      and numeric_precision = 12
      and numeric_scale = 3
      and is_nullable = 'NO'
  ) then
    raise exception 'storage par verify: par_quantity must be numeric(12,3) not null';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_item_storage_pars_par_quantity_chk'
      and contype = 'c'
  ) then
    raise exception 'storage par verify: par_quantity >= 0 check is missing';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_item_storage_pars_workspace_item_storage_uidx'
      and contype = 'u'
  ) then
    raise exception 'storage par verify: unique (workspace, item, storage) is missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_items'
      and column_name = 'minimum_quantity'
      and is_nullable = 'NO'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_items'
      and column_name = 'target_quantity'
      and is_nullable = 'YES'
  ) then
    raise exception 'storage par verify: global minimum_quantity or target_quantity changed';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'stock_item_storage_pars'
      and c.relrowsecurity
  ) then
    raise exception 'storage par verify: RLS is off';
  end if;

  if (
    select count(*)
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'stock_item_storage_pars'
      and pol.polcmd in ('r', 'a', 'w', 'd')
  ) is distinct from 4 then
    raise exception 'storage par verify: expected select, insert, update, and delete policies';
  end if;

  if not has_table_privilege('authenticated', 'public.stock_item_storage_pars', 'select')
     or not has_table_privilege('authenticated', 'public.stock_item_storage_pars', 'insert')
     or not has_table_privilege('authenticated', 'public.stock_item_storage_pars', 'update')
     or not has_table_privilege('authenticated', 'public.stock_item_storage_pars', 'delete') then
    raise exception 'storage par verify: authenticated must select/insert/update/delete pars';
  end if;

  if has_table_privilege('anon', 'public.stock_item_storage_pars', 'select')
     or has_table_privilege('anon', 'public.stock_item_storage_pars', 'insert')
     or has_table_privilege('anon', 'public.stock_item_storage_pars', 'update')
     or has_table_privilege('anon', 'public.stock_item_storage_pars', 'delete') then
    raise exception 'storage par verify: anon must not access pars';
  end if;

  if not exists (
    select 1
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'stock_item_storage_pars'
      and pol.polcmd = 'd'
      and pg_get_expr(pol.polqual, pol.polrelid) like '%can_manage_workspace_stock%'
  ) then
    raise exception 'storage par verify: only stock managers may clear a par';
  end if;

  if not exists (
    select 1
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'stock_item_storage_pars'
      and pol.polcmd = 'r'
      and pg_get_expr(pol.polqual, pol.polrelid) like '%is_workspace_member%'
  ) then
    raise exception 'storage par verify: members must be able to read pars';
  end if;

  if to_regprocedure('public.stock_item_storage_pars_enforce()') is null then
    raise exception 'storage par verify: same-workspace trigger function is missing';
  end if;

  select p.prosrc into v_src
  from pg_proc p
  where p.oid = 'public.stock_item_storage_pars_enforce()'::regprocedure;

  if v_src like '%target_quantity%'
     or v_src like '%minimum_quantity%'
     or v_src like '%current_quantity%'
     or v_src like '%location_key%' then
    raise exception 'storage par verify: par trigger must not write global par or quantity';
  end if;

  if v_src not like '%stock_item_storage_par_item_workspace_mismatch%'
     or v_src not like '%stock_item_storage_par_storage_workspace_mismatch%' then
    raise exception 'storage par verify: same-workspace checks are missing';
  end if;
end
$storage_pars_readonly$;

-- -----------------------------------------------------------------------------
-- Part B — transactional proof on amore-nicosia. The last statement is ROLLBACK.
-- -----------------------------------------------------------------------------
begin;

do $storage_pars_behavior$
declare
  v_marker text := 'parv' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_workspace_id uuid;
  v_workspace_count bigint;
  v_other_workspace_id uuid;
  v_storage_id uuid;
  v_other_storage_id uuid;
  v_item_id uuid;
  v_other_item_id uuid;
  v_minimum numeric(12, 3);
  v_target numeric(12, 3);
  v_minimum_after numeric(12, 3);
  v_target_after numeric(12, 3);
  v_par numeric(12, 3);
  v_on_hand numeric(12, 3);
  v_short numeric(12, 3);
  v_balance_count integer;
begin
  select count(*) into v_workspace_count
  from public.workspaces w
  where w.slug = 'amore-nicosia' or w.name = 'AMORE.NICOSIA';
  if v_workspace_count is distinct from 1 then
    raise exception 'storage par verify: expected exactly one amore-nicosia workspace, found %', v_workspace_count;
  end if;

  select w.id into v_workspace_id
  from public.workspaces w
  where w.slug = 'amore-nicosia' or w.name = 'AMORE.NICOSIA';

  insert into public.workspace_storages (workspace_id, location_key, name, active)
  values (v_workspace_id, v_marker || ' shelf', v_marker || ' shelf', true)
  returning id into v_storage_id;

  insert into public.stock_items (
    workspace_id,
    name,
    minimum_quantity,
    target_quantity,
    current_quantity
  )
  values (v_workspace_id, v_marker || ' cola', 6, 12, 0)
  returning id into v_item_id;

  select minimum_quantity, target_quantity
  into v_minimum, v_target
  from public.stock_items
  where id = v_item_id;

  insert into public.stock_item_storage_pars (
    workspace_id,
    stock_item_id,
    workspace_storage_id,
    par_quantity
  )
  values (v_workspace_id, v_item_id, v_storage_id, 10);

  select count(*) into v_balance_count
  from public.stock_item_location_balances b
  where b.stock_item_id = v_item_id
    and b.workspace_storage_id = v_storage_id;

  if v_balance_count is distinct from 0 then
    raise exception 'storage par verify: fixture unexpectedly created a balance row';
  end if;

  select p.par_quantity into v_par
  from public.stock_item_storage_pars p
  where p.workspace_id = v_workspace_id
    and p.stock_item_id = v_item_id
    and p.workspace_storage_id = v_storage_id;

  v_on_hand := 0;
  v_short := greatest(0, v_par - v_on_hand);
  if v_par is distinct from 10 or v_short is distinct from 10 then
    raise exception 'storage par verify: missing balance must count as on hand 0, short %', v_short;
  end if;

  update public.stock_item_storage_pars
  set par_quantity = 4
  where stock_item_id = v_item_id
    and workspace_storage_id = v_storage_id;

  select par_quantity into v_par
  from public.stock_item_storage_pars
  where stock_item_id = v_item_id
    and workspace_storage_id = v_storage_id;

  if v_par is distinct from 4 then
    raise exception 'storage par verify: par update failed, found %', v_par;
  end if;

  update public.stock_item_storage_pars
  set par_quantity = 0
  where stock_item_id = v_item_id
    and workspace_storage_id = v_storage_id;

  if not exists (
    select 1
    from public.stock_item_storage_pars
    where stock_item_id = v_item_id
      and workspace_storage_id = v_storage_id
      and par_quantity = 0
  ) then
    raise exception 'storage par verify: zero must remain a tracked par row';
  end if;

  delete from public.stock_item_storage_pars
  where stock_item_id = v_item_id
    and workspace_storage_id = v_storage_id;

  if exists (
    select 1
    from public.stock_item_storage_pars
    where stock_item_id = v_item_id
      and workspace_storage_id = v_storage_id
  ) then
    raise exception 'storage par verify: delete did not clear the par';
  end if;

  insert into public.stock_item_storage_pars (
    workspace_id,
    stock_item_id,
    workspace_storage_id,
    par_quantity
  )
  values (v_workspace_id, v_item_id, v_storage_id, 2.5);

  begin
    insert into public.stock_item_storage_pars (
      workspace_id,
      stock_item_id,
      workspace_storage_id,
      par_quantity
    )
    values (v_workspace_id, v_item_id, v_storage_id, 1);
    raise exception 'storage par verify: duplicate par was accepted';
  exception
    when unique_violation then
      null;
  end;

  begin
    insert into public.stock_item_storage_pars (
      workspace_id,
      stock_item_id,
      workspace_storage_id,
      par_quantity
    )
    values (v_workspace_id, v_item_id, v_storage_id, -1);
    raise exception 'storage par verify: negative par was accepted';
  exception
    when check_violation then
      null;
  end;

  insert into public.workspaces (name, slug)
  values ('Par verify other ' || v_marker, 'par-verify-other-' || v_marker)
  returning id into v_other_workspace_id;

  insert into public.workspace_storages (workspace_id, location_key, name, active)
  values (v_other_workspace_id, v_marker || ' other', v_marker || ' other', true)
  returning id into v_other_storage_id;

  insert into public.stock_items (workspace_id, name)
  values (v_other_workspace_id, v_marker || ' other item')
  returning id into v_other_item_id;

  begin
    insert into public.stock_item_storage_pars (
      workspace_id,
      stock_item_id,
      workspace_storage_id,
      par_quantity
    )
    values (v_workspace_id, v_other_item_id, v_storage_id, 3);
    raise exception 'storage par verify: cross-workspace item was accepted';
  exception
    when others then
      if sqlerrm not like '%stock_item_storage_par_item_workspace_mismatch%' then
        raise;
      end if;
  end;

  begin
    insert into public.stock_item_storage_pars (
      workspace_id,
      stock_item_id,
      workspace_storage_id,
      par_quantity
    )
    values (v_workspace_id, v_item_id, v_other_storage_id, 3);
    raise exception 'storage par verify: cross-workspace storage was accepted';
  exception
    when others then
      if sqlerrm not like '%stock_item_storage_par_storage_workspace_mismatch%' then
        raise;
      end if;
  end;

  select minimum_quantity, target_quantity
  into v_minimum_after, v_target_after
  from public.stock_items
  where id = v_item_id;

  if v_minimum_after is distinct from v_minimum
     or v_target_after is distinct from v_target then
    raise exception 'storage par verify: global par changed minimum % -> % target % -> %',
      v_minimum, v_minimum_after, v_target, v_target_after;
  end if;

  if (
    select count(*)
    from public.stock_item_storage_pars
    where stock_item_id = v_item_id
      and workspace_storage_id = v_storage_id
  ) is distinct from 1 then
    raise exception 'storage par verify: expected the original par row to remain after rejected writes';
  end if;

  raise notice 'storage par verify part B passed for marker %', v_marker;
end
$storage_pars_behavior$;

select 'ALL STOCK ITEM STORAGE PARS VERIFY ASSERTIONS PASSED — TRANSACTION ROLLED BACK' as result;

rollback;
