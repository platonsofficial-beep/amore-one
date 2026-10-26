-- =============================================================================
-- Undo a completed inventory import session (NOT APPLIED)
-- =============================================================================
-- Do NOT run this from the app. Apply manually in the Supabase SQL editor
-- only after review.
--
-- Adds three functions. Does not replace the live apply function.
--
--   inventory_import_collect_undo_refusals(uuid, uuid)
--     Internal. Returns refusal text and the ids an undo would remove.
--     EXECUTE is revoked from public, anon, and authenticated.
--
--   inventory_import_undo_eligibility(uuid, uuid)
--     Read-only. { allowed, reasons, session_id, status }.
--     The app shows Undo import only when allowed is true.
--
--   undo_inventory_import_session(uuid, uuid)
--     Re-checks under row locks. On success, removes products created by
--     that apply, removes suppliers created by that apply when nothing else
--     uses them, stores undo evidence on apply_result, and sets the session
--     to cancelled.
--
-- Refusals:
--   not signed in
--   caller is not owner / general_manager / manager
--   session missing, or in another workspace
--   session is not completed
--   a created product has a stock movement that is not this import
--   a link row wrote an opening quantity (location_count or movement_id)
--   a created supplier is used by another product or by an order
--   a created product is on an order
--   a created product is on an inventory count
--
-- Each function:
--   SECURITY DEFINER
--   SET search_path = public
--   can_manage_workspace_stock (collect and eligibility return a reason;
--   undo raises inventory_import_session_forbidden)
--
-- eligibility and undo: REVOKE public and anon, GRANT EXECUTE to authenticated.
-- collect: REVOKE public, anon, and authenticated. No grant.
--
-- Apply any time. It does not depend on the cost or supplier scripts.
-- Supplier ids are present only after the supplier script has been used
-- for an apply. Undo still removes created products when that list is absent.
-- =============================================================================

drop function if exists public.undo_inventory_import_session(uuid, uuid);
drop function if exists public.inventory_import_undo_eligibility(uuid, uuid);
drop function if exists public.inventory_import_collect_undo_refusals(uuid, uuid);

create or replace function public.inventory_import_collect_undo_refusals(
  p_workspace_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.inventory_import_sessions%rowtype;
  v_reasons text[] := array[]::text[];
  v_created uuid[] := array[]::uuid[];
  v_suppliers uuid[] := array[]::uuid[];
  v_has_item_supplier boolean := false;
  v_has_order_supplier boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'reasons', jsonb_build_array('Sign in required.'),
      'created_stock_item_ids', '[]'::jsonb,
      'created_supplier_ids', '[]'::jsonb,
      'status', null
    );
  end if;

  if p_workspace_id is null or not exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  ) then
    return jsonb_build_object(
      'reasons', jsonb_build_array('Workspace was not found.'),
      'created_stock_item_ids', '[]'::jsonb,
      'created_supplier_ids', '[]'::jsonb,
      'status', null
    );
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    return jsonb_build_object(
      'reasons', jsonb_build_array('Only an owner, general manager, or manager can undo an import.'),
      'created_stock_item_ids', '[]'::jsonb,
      'created_supplier_ids', '[]'::jsonb,
      'status', null
    );
  end if;

  select s.*
  into v_session
  from public.inventory_import_sessions s
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id;

  if not found then
    if exists (
      select 1
      from public.inventory_import_sessions s
      where s.id = p_session_id
    ) then
      v_reasons := array_append(v_reasons, 'This import belongs to another workspace.');
    else
      v_reasons := array_append(v_reasons, 'This import was not found.');
    end if;

    return jsonb_build_object(
      'reasons', to_jsonb(v_reasons),
      'created_stock_item_ids', '[]'::jsonb,
      'created_supplier_ids', '[]'::jsonb,
      'status', null
    );
  end if;

  if v_session.status is distinct from 'completed' then
    v_reasons := array_append(
      v_reasons,
      'This import is not finished, so there is nothing to undo.'
    );
  end if;

  if jsonb_typeof(v_session.apply_result->'created_stock_item_ids') = 'array' then
    select coalesce(array_agg(parsed.id), array[]::uuid[])
    into v_created
    from (
      select elem::uuid as id
      from jsonb_array_elements_text(v_session.apply_result->'created_stock_item_ids') as t(elem)
      where elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) parsed;
  end if;

  if jsonb_typeof(v_session.apply_result->'created_supplier_ids') = 'array' then
    select coalesce(array_agg(parsed.id), array[]::uuid[])
    into v_suppliers
    from (
      select elem::uuid as id
      from jsonb_array_elements_text(v_session.apply_result->'created_supplier_ids') as t(elem)
      where elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) parsed;
  end if;

  if exists (
    select 1
    from public.stock_movements m
    where m.workspace_id = p_workspace_id
      and m.item_id = any (v_created)
      and not (
        m.origin_workflow = 'spreadsheet_import'
        and m.origin_ref_id = p_session_id
      )
  ) then
    v_reasons := array_append(
      v_reasons,
      'A product from this import was changed again after it was applied.'
    );
  end if;

  if exists (
    select 1
    from public.inventory_import_rows r
    where r.session_id = p_session_id
      and r.workspace_id = p_workspace_id
      and r.selected_action = 'link'
      and (
        coalesce((r.apply_result->>'location_count')::integer, 0) > 0
        or (
          nullif(btrim(coalesce(r.apply_result->>'movement_id', '')), '') is not null
          and btrim(r.apply_result->>'movement_id') <> 'null'
        )
      )
  ) then
    v_reasons := array_append(
      v_reasons,
      'This import replaced the quantity on an existing product.'
    );
  end if;

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'stock_items'
      and c.column_name = 'supplier_id'
      and c.udt_name = 'uuid'
  )
  into v_has_item_supplier;

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'stock_orders'
      and c.column_name = 'supplier_id'
      and c.udt_name = 'uuid'
  )
  into v_has_order_supplier;

  if cardinality(v_suppliers) > 0 and (
    (
      v_has_item_supplier
      and exists (
        select 1
        from public.stock_items si
        where si.workspace_id = p_workspace_id
          and si.supplier_id = any (v_suppliers)
          and not (si.id = any (v_created))
      )
    )
    or (
      v_has_order_supplier
      and exists (
        select 1
        from public.stock_orders so
        where so.workspace_id = p_workspace_id
          and so.supplier_id = any (v_suppliers)
      )
    )
  ) then
    v_reasons := array_append(
      v_reasons,
      'A supplier created by this import is used by another product or order.'
    );
  end if;

  if cardinality(v_created) > 0
    and to_regclass('public.stock_order_items') is not null
    and exists (
      select 1
      from public.stock_order_items oi
      join public.stock_orders so on so.id = oi.order_id
      where so.workspace_id = p_workspace_id
        and oi.stock_item_id = any (v_created)
    )
  then
    v_reasons := array_append(
      v_reasons,
      'A product from this import is on an order.'
    );
  end if;

  if cardinality(v_created) > 0
    and to_regclass('public.inventory_count_session_items') is not null
    and exists (
      select 1
      from public.inventory_count_session_items ci
      where ci.workspace_id = p_workspace_id
        and ci.item_id = any (v_created)
    )
  then
    v_reasons := array_append(
      v_reasons,
      'A product from this import is on an inventory count.'
    );
  end if;

  return jsonb_build_object(
    'reasons', to_jsonb(v_reasons),
    'created_stock_item_ids', to_jsonb(v_created),
    'created_supplier_ids', to_jsonb(v_suppliers),
    'status', v_session.status
  );
end;
$$;

comment on function public.inventory_import_collect_undo_refusals(uuid, uuid) is
  'Internal read-only list of reasons a completed import cannot be undone, plus the created ids. Not granted to authenticated.';

revoke all on function public.inventory_import_collect_undo_refusals(uuid, uuid) from public;
revoke all on function public.inventory_import_collect_undo_refusals(uuid, uuid) from anon;
revoke all on function public.inventory_import_collect_undo_refusals(uuid, uuid) from authenticated;

create or replace function public.inventory_import_undo_eligibility(
  p_workspace_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_info jsonb;
  v_reasons jsonb;
begin
  v_info := public.inventory_import_collect_undo_refusals(p_workspace_id, p_session_id);
  v_reasons := coalesce(v_info->'reasons', '[]'::jsonb);

  return jsonb_build_object(
    'allowed', jsonb_typeof(v_reasons) = 'array' and jsonb_array_length(v_reasons) = 0,
    'reasons', v_reasons,
    'session_id', p_session_id,
    'status', v_info->'status'
  );
end;
$$;

comment on function public.inventory_import_undo_eligibility(uuid, uuid) is
  'Read-only. allowed is true only when undo_inventory_import_session would currently succeed.';

revoke all on function public.inventory_import_undo_eligibility(uuid, uuid) from public;
revoke all on function public.inventory_import_undo_eligibility(uuid, uuid) from anon;
grant execute on function public.inventory_import_undo_eligibility(uuid, uuid) to authenticated;

create or replace function public.undo_inventory_import_session(
  p_workspace_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_session public.inventory_import_sessions%rowtype;
  v_info jsonb;
  v_reasons text[] := array[]::text[];
  v_created uuid[] := array[]::uuid[];
  v_suppliers uuid[] := array[]::uuid[];
  v_reason text;
  v_undo jsonb;
  v_has_supplier_workspace boolean := false;
begin
  if v_auth_user_id is null then
    raise exception 'inventory_import_session_unauthenticated'
      using hint = 'Sign in required.';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_import_session_workspace_required'
      using hint = 'workspace_id is required.';
  end if;

  if p_session_id is null then
    raise exception 'inventory_import_session_required'
      using hint = 'session_id is required.';
  end if;

  if not exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  ) then
    raise exception 'inventory_import_session_workspace_not_found'
      using hint = 'Workspace does not exist.';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_import_session_forbidden'
      using hint = 'owner / general_manager / manager required.';
  end if;

  select s.*
  into v_session
  from public.inventory_import_sessions s
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  for update;

  if not found then
    if exists (
      select 1
      from public.inventory_import_sessions s
      where s.id = p_session_id
    ) then
      raise exception 'inventory_import_session_workspace_mismatch'
        using hint = 'Session does not belong to this workspace.';
    end if;
    raise exception 'inventory_import_session_not_found'
      using hint = 'Import session was not found in this workspace.';
  end if;

  v_info := public.inventory_import_collect_undo_refusals(p_workspace_id, p_session_id);

  if jsonb_typeof(v_info->'created_stock_item_ids') = 'array' then
    select coalesce(array_agg(parsed.id), array[]::uuid[])
    into v_created
    from (
      select elem::uuid as id
      from jsonb_array_elements_text(v_info->'created_stock_item_ids') as t(elem)
      where elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) parsed;
  end if;

  if cardinality(v_created) > 0 then
    perform 1
    from public.stock_items si
    where si.workspace_id = p_workspace_id
      and si.id = any (v_created)
    for update;
  end if;

  v_info := public.inventory_import_collect_undo_refusals(p_workspace_id, p_session_id);
  v_reasons := array[]::text[];

  if jsonb_typeof(v_info->'reasons') = 'array' then
    select coalesce(array_agg(elem), array[]::text[])
    into v_reasons
    from jsonb_array_elements_text(v_info->'reasons') as t(elem);
  end if;

  if cardinality(v_reasons) > 0 then
    raise exception 'inventory_import_undo_refused'
      using hint = array_to_string(v_reasons, ' ');
  end if;

  if jsonb_typeof(v_info->'created_stock_item_ids') = 'array' then
    select coalesce(array_agg(parsed.id), array[]::uuid[])
    into v_created
    from (
      select elem::uuid as id
      from jsonb_array_elements_text(v_info->'created_stock_item_ids') as t(elem)
      where elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) parsed;
  else
    v_created := array[]::uuid[];
  end if;

  if jsonb_typeof(v_info->'created_supplier_ids') = 'array' then
    select coalesce(array_agg(parsed.id), array[]::uuid[])
    into v_suppliers
    from (
      select elem::uuid as id
      from jsonb_array_elements_text(v_info->'created_supplier_ids') as t(elem)
      where elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) parsed;
  else
    v_suppliers := array[]::uuid[];
  end if;

  delete from public.stock_items si
  where si.workspace_id = p_workspace_id
    and si.id = any (v_created);

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'suppliers'
      and c.column_name = 'workspace_id'
  )
  into v_has_supplier_workspace;

  if v_has_supplier_workspace and cardinality(v_suppliers) > 0 then
    delete from public.suppliers sp
    where sp.workspace_id = p_workspace_id
      and sp.id = any (v_suppliers);
  end if;

  v_undo := jsonb_build_object(
    'undone_at', now(),
    'undone_by', v_auth_user_id,
    'deleted_stock_item_ids', to_jsonb(v_created),
    'deleted_supplier_ids', to_jsonb(v_suppliers),
    'previous_status', 'completed'
  );

  update public.inventory_import_sessions s
  set
    status = 'cancelled',
    cancelled_at = now(),
    apply_result = coalesce(s.apply_result, '{}'::jsonb) || jsonb_build_object('undo', v_undo),
    updated_by = v_auth_user_id,
    updated_at = now()
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  returning * into v_session;

  return jsonb_build_object(
    'session_id', v_session.id,
    'workspace_id', v_session.workspace_id,
    'status', v_session.status,
    'allowed', true,
    'undo', v_session.apply_result->'undo',
    'cancelled_at', v_session.cancelled_at
  );
end;
$$;

comment on function public.undo_inventory_import_session(uuid, uuid) is
  'Undo a completed import: remove created products and unused created suppliers, store undo evidence, set status cancelled. Refuses later movements, overwritten links, and suppliers or products used elsewhere.';

revoke all on function public.undo_inventory_import_session(uuid, uuid) from public;
revoke all on function public.undo_inventory_import_session(uuid, uuid) from anon;
grant execute on function public.undo_inventory_import_session(uuid, uuid) to authenticated;
