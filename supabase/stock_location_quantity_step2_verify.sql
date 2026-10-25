-- =============================================================================
-- Step 2 verification — SQL NOT APPLIED until the owner runs it
-- =============================================================================
-- MANUAL EXECUTION ONLY — Supabase SQL Editor.
-- Run only AFTER supabase/stock_location_quantity_step2.sql has committed.
--
-- This file is NOT a migration and NOT an RPC deployment.
-- Part A is read-only.
-- Part B is one transaction and its last statement is ROLLBACK.
-- It creates fixture rows in amore-nicosia, proves the new writers, then
-- rolls them back. It does not call run_inventory_migration_auto_create or
-- run_inventory_migration_phase2: those functions scan every map row in the
-- workspace. Their bodies are checked from pg_proc in Part A.
--
-- If an assertion raises, the open transaction is aborted. Run: ROLLBACK;
--
-- Pass line:
--   ALL STEP 2 VERIFY ASSERTIONS PASSED — TRANSACTION ROLLED BACK
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Part A — read-only definition and grant checks
-- -----------------------------------------------------------------------------
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  p.proconfig as config,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('public', p.oid, 'execute') as public_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'prepare_absent_location_balance',
    'ensure_stock_item_location_balance',
    'record_location_receive',
    'record_location_usage',
    'record_location_adjustment',
    'record_location_stock_count',
    'apply_inventory_import_session',
    'run_inventory_migration_auto_create',
    'run_inventory_migration_phase2'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid);

do $step2_readonly$
declare
  v_src text;
begin
  if to_regprocedure('public.prepare_absent_location_balance(uuid,uuid,uuid)') is null then
    raise exception 'step2 verify: prepare_absent_location_balance is missing. Apply stock_location_quantity_step2.sql first.';
  end if;

  if has_function_privilege('authenticated', 'public.prepare_absent_location_balance(uuid,uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'public.prepare_absent_location_balance(uuid,uuid,uuid)', 'execute')
     or has_function_privilege('public', 'public.prepare_absent_location_balance(uuid,uuid,uuid)', 'execute') then
    raise exception 'step2 verify: prepare_absent_location_balance must stay revoked from authenticated, anon, and public';
  end if;

  if has_function_privilege('authenticated', 'public.ensure_stock_item_location_balance(uuid,uuid,uuid,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.ensure_stock_item_location_balance(uuid,uuid,uuid,text,uuid)', 'execute')
     or has_function_privilege('public', 'public.ensure_stock_item_location_balance(uuid,uuid,uuid,text,uuid)', 'execute') then
    raise exception 'step2 verify: ensure_stock_item_location_balance must stay revoked from authenticated, anon, and public';
  end if;

  if not has_function_privilege('authenticated', 'public.record_location_receive(uuid,uuid,uuid,numeric,bigint,text,text,uuid)', 'execute') then
    raise exception 'step2 verify: authenticated must still execute record_location_receive';
  end if;

  select p.prosrc into v_src
  from pg_proc p
  where p.oid = 'public.record_location_receive(uuid,uuid,uuid,numeric,bigint,text,text,uuid)'::regprocedure;
  if v_src not like '%prepare_absent_location_balance%' then
    raise exception 'step2 verify: record_location_receive does not create a missing shelf';
  end if;
  if to_regprocedure('public.record_location_receive(uuid,uuid,uuid,numeric,bigint,text,text,uuid)') is null
     or to_regprocedure('public.record_location_adjustment(uuid,uuid,uuid,numeric,bigint,text,text,uuid)') is null
     or to_regprocedure('public.record_location_stock_count(uuid,uuid,uuid,numeric,bigint,text,text,uuid)') is null
     or to_regprocedure('public.record_location_usage(uuid,uuid,uuid,numeric,bigint,text,text,uuid)') is null then
    raise exception 'step2 verify: a location RPC signature changed';
  end if;

  select p.prosrc into v_src
  from pg_proc p
  where p.oid = 'public.record_location_usage(uuid,uuid,uuid,numeric,bigint,text,text,uuid)'::regprocedure;
  if v_src like '%prepare_absent_location_balance%' or v_src like '%ensure_stock_item_location_balance%' then
    raise exception 'step2 verify: record_location_usage must not auto-create a balance';
  end if;

  select p.prosrc into v_src
  from pg_proc p
  where p.oid = 'public.record_location_adjustment(uuid,uuid,uuid,numeric,bigint,text,text,uuid)'::regprocedure;
  if v_src not like '%p_quantity > 0%' or v_src not like '%prepare_absent_location_balance%' then
    raise exception 'step2 verify: positive adjustment is not the only adjustment that can create a shelf';
  end if;

  select p.prosrc into v_src
  from pg_proc p
  where p.oid = 'public.apply_inventory_import_session(uuid,uuid,text)'::regprocedure;
  if position('set current_quantity = v_qty' in v_src) > 0 then
    raise exception 'step2 verify: import still writes the cache from the raw quantity';
  end if;
  if position('action=create|location=' in v_src) = 0 or position('action=link|location=' in v_src) = 0 then
    raise exception 'step2 verify: legacy import create/link is still location-blind';
  end if;

  select p.prosrc into v_src
  from pg_proc p
  where p.oid = 'public.run_inventory_migration_auto_create(uuid,uuid)'::regprocedure;
  if position('inventory_migration_auto_create_storage_not_found' in v_src) = 0
     or position('stock_item_location_balances' in v_src) = 0 then
    raise exception 'step2 verify: auto_create does not insert the matching balance';
  end if;

  select p.prosrc into v_src
  from pg_proc p
  where p.oid = 'public.run_inventory_migration_phase2(uuid,uuid,boolean)'::regprocedure;
  if position('v_missing_location_balance' in v_src) = 0
     or position('current_quantity = v_aggregate' in v_src) = 0 then
    raise exception 'step2 verify: phase2 does not adjust the location balance before the cache';
  end if;

  raise notice 'step2 verify part A passed (read-only)';
end
$step2_readonly$;

-- -----------------------------------------------------------------------------
-- Part B — transactional proof. The last statement is ROLLBACK.
-- -----------------------------------------------------------------------------
begin;

do $step2_behavior$
declare
  v_workspace_id uuid;
  v_workspace_count bigint;
  v_manager uuid;
  v_marker text := 'step2v' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  v_storage_id uuid;
  v_storage_two uuid;
  v_storage_three uuid;
  v_item_id uuid;
  v_drift_id uuid;
  v_result jsonb;
  v_qty numeric(12, 3);
  v_version bigint;
  v_cache numeric(12, 3);
  v_balance_count integer;
  v_dest uuid;
  v_session_id uuid;
  v_import jsonb;
  v_imported_id uuid;
begin
  select count(*) into v_workspace_count
  from public.workspaces w
  where w.slug = 'amore-nicosia' or w.name = 'AMORE.NICOSIA';
  if v_workspace_count is distinct from 1 then
    raise exception 'step2 verify: expected exactly one amore-nicosia workspace, found %', v_workspace_count;
  end if;

  select w.id into v_workspace_id
  from public.workspaces w
  where w.slug = 'amore-nicosia' or w.name = 'AMORE.NICOSIA';

  select wm.auth_user_id into v_manager
  from public.workspace_members wm
  where wm.workspace_id = v_workspace_id
    and wm.role in ('owner', 'general_manager', 'manager')
  order by case wm.role when 'owner' then 1 when 'general_manager' then 2 else 3 end,
    wm.auth_user_id
  limit 1;
  if v_manager is null then
    raise exception 'step2 verify: no stock manager on amore-nicosia';
  end if;

  perform set_config('request.jwt.claim.sub', v_manager::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_manager::text, 'role', 'authenticated', 'aud', 'authenticated')::text,
    true
  );
  if auth.uid() is distinct from v_manager then
    raise exception 'step2 verify: auth.uid() did not follow the manager claim';
  end if;

  insert into public.workspace_storages (workspace_id, location_key, name, active, created_by)
  values (v_workspace_id, v_marker, v_marker, true, v_manager)
  returning id into v_storage_id;

  insert into public.workspace_storages (workspace_id, location_key, name, active, created_by)
  values (v_workspace_id, v_marker || '-b', v_marker || '-b', true, v_manager)
  returning id into v_storage_two;

  insert into public.stock_items (workspace_id, name, storage_location, current_quantity, active)
  values (v_workspace_id, v_marker || ' item', v_marker, 0, true)
  returning id into v_item_id;

  v_result := public.record_location_receive(
    v_workspace_id, v_item_id, v_storage_id, 4, 0, v_marker, 'manual', null
  );
  if (v_result->>'quantity_after')::numeric is distinct from 4
     or (v_result->>'quantity_version')::bigint is distinct from 2
     or (v_result->>'current_quantity')::numeric is distinct from 4 then
    raise exception 'step2 verify: empty-shelf receive returned %', v_result;
  end if;

  select b.quantity, b.quantity_version, si.current_quantity
  into v_qty, v_version, v_cache
  from public.stock_item_location_balances b
  join public.stock_items si on si.id = b.stock_item_id
  where b.stock_item_id = v_item_id
    and b.workspace_storage_id = v_storage_id;
  if v_qty is distinct from 4 or v_version is distinct from 2 or v_cache is distinct from 4 then
    raise exception 'step2 verify: receive balance/cache mismatch qty=% version=% cache=%', v_qty, v_version, v_cache;
  end if;

  -- Existing optimistic lock still applies. Version 0 must not be reused.
  begin
    perform public.record_location_receive(
      v_workspace_id, v_item_id, v_storage_id, 1, 0, v_marker, 'manual', null
    );
    raise exception 'step2 verify: second version-0 receive should see the row';
  exception
    when others then
      if sqlerrm not like '%stock_location_balance_version_mismatch%' then
        raise;
      end if;
  end;

  -- Usage never creates a shelf.
  select count(*) into v_balance_count
  from public.stock_item_location_balances b
  where b.stock_item_id = v_item_id and b.workspace_storage_id = v_storage_two;
  begin
    perform public.record_location_usage(
      v_workspace_id, v_item_id, v_storage_two, 1, 0, v_marker, 'manual', null
    );
    raise exception 'step2 verify: usage version 0 should be rejected';
  exception
    when others then
      if sqlerrm not like '%stock_location_balance_version_required%'
         and sqlerrm not like '%stock_location_balance_not_found%' then
        raise;
      end if;
  end;
  if (select count(*) from public.stock_item_location_balances b
      where b.stock_item_id = v_item_id and b.workspace_storage_id = v_storage_two) <> v_balance_count then
    raise exception 'step2 verify: usage created a balance row';
  end if;

  begin
    perform public.record_location_adjustment(
      v_workspace_id, v_item_id, v_storage_two, -1, 0, v_marker, 'manual', null
    );
    raise exception 'step2 verify: negative adjustment version 0 should be rejected';
  exception
    when others then
      if sqlerrm not like '%stock_location_balance_version_required%'
         and sqlerrm not like '%stock_location_balance_not_found%' then
        raise;
      end if;
  end;

  v_result := public.record_location_adjustment(
    v_workspace_id, v_item_id, v_storage_two, 2, 0, v_marker, 'manual', null
  );
  if (v_result->>'quantity_after')::numeric is distinct from 2
     or (v_result->>'current_quantity')::numeric is distinct from 6 then
    raise exception 'step2 verify: positive adjustment onto an empty shelf returned %', v_result;
  end if;

  v_result := public.record_location_stock_count(
    v_workspace_id, v_item_id, v_storage_id, 7, 2, v_marker, 'manual', null
  );
  if (v_result->>'quantity_after')::numeric is distinct from 7
     or (v_result->>'current_quantity')::numeric is distinct from 9 then
    raise exception 'step2 verify: stock count on an existing row returned %', v_result;
  end if;

  -- Version >= 1 does not create a missing row.
  insert into public.workspace_storages (workspace_id, location_key, name, active, created_by)
  values (v_workspace_id, v_marker || '-c', v_marker || '-c', true, v_manager)
  returning id into v_storage_three;
  begin
    perform public.record_location_receive(
      v_workspace_id, v_item_id, v_storage_three, 1, 1, v_marker, 'manual', null
    );
    raise exception 'step2 verify: version 1 with no row should not create one';
  exception
    when others then
      if sqlerrm not like '%stock_location_balance_not_found%' then
        raise;
      end if;
  end;
  if exists (
    select 1 from public.stock_item_location_balances b
    where b.stock_item_id = v_item_id and b.workspace_storage_id = v_storage_three
  ) then
    raise exception 'step2 verify: version 1 created a missing row';
  end if;

  insert into public.stock_items (workspace_id, name, storage_location, current_quantity, active)
  values (v_workspace_id, v_marker || ' drift', v_marker, 5, true)
  returning id into v_drift_id;
  begin
    perform public.record_location_receive(
      v_workspace_id, v_drift_id, v_storage_id, 1, 0, v_marker, 'manual', null
    );
    raise exception 'step2 verify: drifted cache should refuse a new shelf';
  exception
    when others then
      if sqlerrm not like '%stock_location_balance_reconciliation_required%' then
        raise;
      end if;
  end;
  if exists (
    select 1 from public.stock_item_location_balances b where b.stock_item_id = v_drift_id
  ) then
    raise exception 'step2 verify: drift guard still inserted a balance';
  end if;

  insert into public.inventory_import_sessions (
    workspace_id, created_by, status, confirmations, source_filename
  ) values (
    v_workspace_id,
    v_manager,
    'ready',
    jsonb_build_object('quantityPolicy', 'opening_stock'),
    v_marker || '.csv'
  )
  returning id into v_session_id;

  insert into public.inventory_import_rows (
    session_id,
    workspace_id,
    source_row_number,
    normalized_payload,
    selected_action,
    proposed_action,
    validation_state
  ) values (
    v_session_id,
    v_workspace_id,
    1,
    jsonb_build_object(
      'name', v_marker || ' import',
      'unit', 'btl',
      'category', 'Other',
      'itemType', 'Other',
      'locationKey', v_marker,
      'resolvedQuantity', '6'
    ),
    'create',
    'create',
    'valid'
  );

  v_import := public.apply_inventory_import_session(v_workspace_id, v_session_id, v_marker);
  if (v_import->>'status') is distinct from 'completed' or (v_import->>'created_count')::int is distinct from 1 then
    raise exception 'step2 verify: legacy import apply returned %', v_import;
  end if;

  select si.id, si.current_quantity, b.quantity, b.workspace_storage_id, sm.destination_workspace_storage_id
  into v_imported_id, v_cache, v_qty, v_storage_id, v_dest
  from public.stock_items si
  join public.stock_item_location_balances b on b.stock_item_id = si.id
  join public.stock_movements sm on sm.item_id = si.id and sm.workspace_id = si.workspace_id
  where si.workspace_id = v_workspace_id
    and si.name = v_marker || ' import';
  if v_cache is distinct from 6 or v_qty is distinct from 6 or v_dest is distinct from v_storage_id then
    raise exception 'step2 verify: legacy import cache=% balance=% dest=% storage=%', v_cache, v_qty, v_dest, v_storage_id;
  end if;
  if exists (
    select 1 from public.stock_movements sm
    where sm.item_id = v_imported_id
      and sm.destination_workspace_storage_id is null
  ) then
    raise exception 'step2 verify: legacy import still wrote a location-blind movement';
  end if;

  raise notice 'step2 verify part B passed for marker %', v_marker;
end
$step2_behavior$;

select 'ALL STEP 2 VERIFY ASSERTIONS PASSED — TRANSACTION ROLLED BACK' as result;

rollback;
