-- =============================================================================
-- P7.8.11 — Inventory Migration Auto Create stage-owned RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_migration_sessions.sql
--   2. inventory_migration_session_steps.sql
--   3. inventory_migration_activity.sql
--   4. inventory_migration_step_results.sql (P7.8.5)
--   5. inventory_migration_start_session_rpc.sql (bootstrap steps)
--   6. inventory_migration_persist_rpc.sql / auto_link_rpc.sql (prior stages)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER stage RPC for canonical step `auto_create`:
--     authorize → lock session/steps → waiting→running → P7.4.5a auto-create
--     → persist step result → running→completed → activity note
--
-- Business writes:
--   - INSERT public.stock_items (from source_snapshot only; supplier_id NULL)
--   - UPDATE inventory_stock_item_map: stock_item_id + status='created' only
--
-- Does NOT:
--   - Set migrated_at
--   - Write supplier_id / suppliers
--   - UPDATE existing stock_items quantities
--   - Process auto_link rows
--   - Create movements
--   - Call the generic state-only step transition RPC
--
-- Prerequisites: foundation + persist + auto_link completed.
-- Idempotency (step): reject if already completed / result exists.
-- Idempotency (map): rows with stock_item_id / non-eligible status are skipped.
-- Per-row unexpected errors are counted (subtransaction) per P7.4.5a.
-- =============================================================================

drop function if exists public.run_inventory_migration_auto_create(uuid, uuid);

create or replace function public.run_inventory_migration_auto_create(
  p_workspace_id uuid,
  p_session_id uuid
)
returns table (
  session_id uuid,
  step_id uuid,
  step_name text,
  step_status text,
  result_id uuid,
  result_status text,
  critical_finding_count bigint,
  attention_finding_count bigint,
  total_findings bigint,
  executed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_workspace_exists boolean := false;
  v_operator_display_name text := '';
  v_session public.inventory_migration_sessions%rowtype;
  v_step public.inventory_migration_session_steps%rowtype;
  v_existing_result_id uuid := null;
  v_pred_incomplete boolean := false;
  v_other_running boolean := false;

  cand record;
  locked record;
  v_new_stock_id uuid;
  v_name text;
  v_category text;
  v_item_type text;
  v_unit text;
  v_supplier text;
  v_qty numeric;
  v_par numeric;
  v_cost numeric;
  v_location text;

  v_created bigint := 0;
  v_skipped bigint := 0;
  v_invalid_snapshot bigint := 0;
  v_invalid_name bigint := 0;
  v_already_has_stock_id bigint := 0;
  v_race_skipped bigint := 0;
  v_errors bigint := 0;
  v_eligible bigint := 0;
  v_already_created bigint := 0;

  v_result_status text;
  v_critical_count bigint := 0;
  v_attention_count bigint := 0;
  v_total_findings bigint := 0;
  v_result_summary jsonb;
  v_result_id uuid;
  v_executed_at timestamptz;
  v_activity_text text;
begin
  if v_auth_user_id is null then
    raise exception 'inventory_migration_auto_create_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_migration_auto_create_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_migration_auto_create_session_required';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'inventory_migration_auto_create_workspace_not_found';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_migration_auto_create_forbidden';
  end if;

  select coalesce(nullif(btrim(wm.display_name), ''), '')
  into v_operator_display_name
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.auth_user_id = v_auth_user_id
  limit 1;

  if v_operator_display_name is null then
    v_operator_display_name := '';
  end if;

  -- Lock order 1: session (session-level mutex).
  select s.*
  into v_session
  from public.inventory_migration_sessions s
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'inventory_migration_auto_create_session_not_found';
  end if;

  if v_session.status is distinct from 'running' then
    raise exception 'inventory_migration_auto_create_session_not_running';
  end if;

  -- Lock order 2: all session steps in canonical order.
  perform 1
  from public.inventory_migration_session_steps st
  where st.session_id = p_session_id
    and st.workspace_id = p_workspace_id
  order by
    case st.step_name
      when 'foundation' then 1
      when 'persist' then 2
      when 'auto_link' then 3
      when 'auto_create' then 4
      when 'integrity_audit' then 5
      when 'preflight' then 6
      when 'preview' then 7
      when 'phase1' then 8
      when 'phase2' then 9
      when 'post_apply_audit' then 10
      else 11
    end
  for update;

  select st.*
  into v_step
  from public.inventory_migration_session_steps st
  where st.session_id = p_session_id
    and st.workspace_id = p_workspace_id
    and st.step_name = 'auto_create';

  if not found then
    raise exception 'inventory_migration_auto_create_step_not_found';
  end if;

  select r.id
  into v_existing_result_id
  from public.inventory_migration_step_results r
  where r.step_id = v_step.id
  limit 1;

  if v_existing_result_id is not null or v_step.status = 'completed' then
    raise exception 'inventory_migration_auto_create_already_completed';
  end if;

  if v_step.status is distinct from 'waiting' then
    raise exception 'inventory_migration_auto_create_invalid_step_state';
  end if;

  if v_step.started_at is not null or v_step.completed_at is not null then
    raise exception 'inventory_migration_auto_create_invalid_step_state';
  end if;

  -- Prerequisites: foundation → auto_link completed.
  select exists (
    select 1
    from unnest(array['foundation', 'persist', 'auto_link']) as pred(step_name)
    where not exists (
      select 1
      from public.inventory_migration_session_steps st
      where st.session_id = p_session_id
        and st.workspace_id = p_workspace_id
        and st.step_name = pred.step_name
        and st.status = 'completed'
    )
  )
  into v_pred_incomplete;

  if v_pred_incomplete then
    raise exception 'inventory_migration_auto_create_prerequisite_incomplete';
  end if;

  select exists (
    select 1
    from public.inventory_migration_session_steps st
    where st.session_id = p_session_id
      and st.workspace_id = p_workspace_id
      and st.status = 'running'
      and st.step_name is distinct from 'auto_create'
  )
  into v_other_running;

  if v_other_running then
    raise exception 'inventory_migration_auto_create_another_step_running';
  end if;

  -- waiting → running
  update public.inventory_migration_session_steps st
  set
    status = 'running',
    started_at = now()
  where st.id = v_step.id
  returning * into v_step;

  -- ---------------------------------------------------------------------------
  -- P7.4.5a Auto Create (workspace-scoped; meanings preserved)
  -- ---------------------------------------------------------------------------

  select count(*)::bigint into v_already_created
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status = 'created'
    and m.resolution_type = 'auto_create';

  select count(*)::bigint into v_eligible
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status = 'classified'
    and m.resolution_type = 'auto_create'
    and m.stock_item_id is null
    and m.source_snapshot is not null
    and m.source_snapshot <> '{}'::jsonb;

  for cand in
    select m.id as map_id
    from public.inventory_stock_item_map m
    where m.workspace_id = p_workspace_id
      and m.status = 'classified'
      and m.resolution_type = 'auto_create'
      and m.stock_item_id is null
      and m.source_snapshot is not null
      and m.source_snapshot <> '{}'::jsonb
    order by m.legacy_inventory_item_id, m.id
  loop
    begin
      -- Lock map row; re-check eligibility under lock
      select
        m.id,
        m.workspace_id,
        m.stock_item_id,
        m.status,
        m.resolution_type,
        m.source_snapshot
      into locked
      from public.inventory_stock_item_map m
      where m.id = cand.map_id
      for update;

      if not found then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if locked.status is distinct from 'classified'
         or locked.resolution_type is distinct from 'auto_create' then
        v_race_skipped := v_race_skipped + 1;
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if locked.stock_item_id is not null then
        v_already_has_stock_id := v_already_has_stock_id + 1;
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if locked.source_snapshot is null
         or locked.source_snapshot = '{}'::jsonb then
        v_invalid_snapshot := v_invalid_snapshot + 1;
        v_skipped := v_skipped + 1;
        continue;
      end if;

      -- Payload ONLY from source_snapshot; workspace_id ONLY from map row
      v_name := nullif(trim(coalesce(locked.source_snapshot ->> 'item_name', '')), '');
      if v_name is null then
        v_invalid_name := v_invalid_name + 1;
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_category := case trim(coalesce(locked.source_snapshot ->> 'category', ''))
        when 'Wines' then 'Wine'
        when 'Wine' then 'Wine'
        when 'Beers' then 'Beverages'
        when 'Beer' then 'Beverages'
        when 'Soft Drinks' then 'Beverages'
        when 'Coffee' then 'Beverages'
        when 'Kitchen' then 'Other'
        when 'Bar Supplies' then 'Consumables'
        when 'Housekeeping' then 'Consumables'
        when 'Spirits' then 'Spirits'
        when 'Syrups & Purées' then 'Syrups & Purées'
        when 'Beverages' then 'Beverages'
        when 'Fresh' then 'Fresh'
        when 'Consumables' then 'Consumables'
        when 'Other' then 'Other'
        when '' then 'Other'
        else 'Other'
      end;

      v_item_type := case
        when trim(coalesce(locked.source_snapshot ->> 'subcategory', '')) = '' then 'Other'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in (
          'vodka', 'gin', 'rum', 'whiskey', 'tequila', 'other'
        ) then initcap(lower(trim(locked.source_snapshot ->> 'subcategory')))
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'mezcal' then 'Tequila'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('liqueurs', 'liqueur', 'vermouth')
          then 'Vermouth & Liqueur'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'brandy' then 'Cognac'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('aperitifs', 'aperitif')
          then 'Aperitif'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'red wine' then 'Red Wine'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'white wine' then 'White Wine'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('rose wine', 'rosé wine')
          then 'Rosé Wine'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('sparkling', 'sparkling wine')
          then 'Sparkling Wine'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'champagne' then 'Champagne'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in (
          'lager', 'ipa', 'ale', 'stout', 'cider', 'alcohol free'
        ) then 'Beer'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('soda', 'tonic')
          then 'Soda / Tonic'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('cola', 'lemonade', 'orangeade')
          then 'Soft Drink'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('juices', 'juice') then 'Juice'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'energy drinks' then 'Energy Drink'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('napkins', 'straws', 'cleaning')
          then initcap(lower(trim(locked.source_snapshot ->> 'subcategory')))
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('purees', 'purées', 'purée')
          then 'Purée'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'syrups' then 'Syrup'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('fruits', 'fruit') then 'Fruit'
        else 'Other'
      end;

      v_unit := case trim(coalesce(locked.source_snapshot ->> 'unit', ''))
        when 'Bottle 0.7L' then 'Bottle 700ml'
        when 'Bottle 1L' then 'Bottle 1L'
        when 'Case 6' then 'Case 6 bottles'
        when 'Case 12' then 'Case 12 bottles'
        when 'Liter' then 'Litre'
        else trim(coalesce(locked.source_snapshot ->> 'unit', ''))
      end;

      -- Compatibility text only; no supplier_id / no suppliers write
      v_supplier := coalesce(locked.source_snapshot ->> 'supplier', '');
      v_qty := greatest(coalesce((locked.source_snapshot ->> 'quantity')::numeric, 0), 0);
      v_par := greatest(coalesce((locked.source_snapshot ->> 'minimum_quantity')::numeric, 0), 0);
      v_cost := greatest(coalesce((locked.source_snapshot ->> 'cost')::numeric, 0), 0);

      v_location := case v_category
        when 'Spirits' then 'Bar'
        when 'Syrups & Purées' then 'Bar'
        when 'Beverages' then 'Main Storage'
        when 'Wine' then 'Wine Storage'
        when 'Fresh' then 'Fridge'
        when 'Consumables' then 'Main Storage'
        else 'Main Storage'
      end;

      insert into public.stock_items (
        workspace_id,
        name,
        category,
        item_type,
        supplier,
        unit,
        current_quantity,
        minimum_quantity,
        target_quantity,
        order_quantity,
        cost_price,
        storage_location,
        active
      ) values (
        locked.workspace_id,
        v_name,
        v_category,
        v_item_type,
        v_supplier,
        v_unit,
        v_qty,
        0,
        nullif(v_par, 0),
        null,
        v_cost,
        v_location,
        true
      )
      returning id into v_new_stock_id;

      update public.inventory_stock_item_map m
      set
        stock_item_id = v_new_stock_id,
        status = 'created'
      where m.id = locked.id
        and m.status = 'classified'
        and m.resolution_type = 'auto_create'
        and m.stock_item_id is null;

      if not found then
        raise exception 'map row % lost eligibility after insert', locked.id;
      end if;

      v_created := v_created + 1;

    exception
      when others then
        v_errors := v_errors + 1;
        -- subtransaction rolls back orphan stock insert for this row
    end;
  end loop;

  -- Remaining classified auto_create rows + per-row errors require attention.
  v_critical_count := v_errors;
  select count(*)::bigint into v_attention_count
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status = 'classified'
    and m.resolution_type = 'auto_create';

  v_attention_count := v_attention_count + v_errors;
  v_total_findings := v_attention_count;

  if v_attention_count > 0 then
    v_result_status := 'attention_required';
  else
    v_result_status := 'passed';
  end if;

  v_result_summary := jsonb_build_object(
    'auto_create_version', 1,
    'groups', jsonb_build_array(
      jsonb_build_object(
        'key', 'eligible',
        'label', 'Eligible classified auto_create rows',
        'count', v_eligible,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'created',
        'label', 'Stock items created',
        'count', v_created,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'already_created',
        'label', 'Already created map rows',
        'count', v_already_created,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'skipped',
        'label', 'Skipped rows',
        'count', v_skipped,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'invalid_snapshot',
        'label', 'Invalid or empty source_snapshot',
        'count', v_invalid_snapshot,
        'requires_attention', v_invalid_snapshot > 0
      ),
      jsonb_build_object(
        'key', 'invalid_name',
        'label', 'Invalid or blank item_name',
        'count', v_invalid_name,
        'requires_attention', v_invalid_name > 0
      ),
      jsonb_build_object(
        'key', 'already_had_stock_item_id',
        'label', 'Already had stock_item_id',
        'count', v_already_has_stock_id,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'race_skipped',
        'label', 'Race skipped (eligibility lost)',
        'count', v_race_skipped,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'errors',
        'label', 'Per-row errors',
        'count', v_errors,
        'requires_attention', v_errors > 0
      )
    ),
    'totals', jsonb_build_object(
      'eligible_rows', v_eligible,
      'created_rows', v_created,
      'already_created_rows', v_already_created,
      'attention_rows', v_attention_count,
      'skipped_rows', v_skipped,
      'error_rows', v_errors
    )
  );

  v_executed_at := now();

  update public.inventory_migration_session_steps st
  set
    status = 'completed',
    completed_at = v_executed_at
  where st.id = v_step.id
  returning * into v_step;

  insert into public.inventory_migration_step_results (
    session_id,
    step_id,
    workspace_id,
    step_name,
    result_status,
    result_summary,
    critical_finding_count,
    attention_finding_count,
    executed_by,
    operator_display_name,
    executed_at
  )
  values (
    v_session.id,
    v_step.id,
    p_workspace_id,
    'auto_create',
    v_result_status,
    v_result_summary,
    v_critical_count,
    v_attention_count,
    v_auth_user_id,
    v_operator_display_name,
    v_executed_at
  )
  returning id into v_result_id;

  v_activity_text := format(
    'Auto create completed: %s (result_id=%s, created=%s, skipped=%s, errors=%s, attention=%s).',
    v_result_status,
    v_result_id,
    v_created,
    v_skipped,
    v_errors,
    v_attention_count
  );

  insert into public.inventory_migration_activity (
    session_id,
    workspace_id,
    activity_type,
    activity_text,
    created_by,
    operator_display_name
  )
  values (
    v_session.id,
    p_workspace_id,
    'note',
    v_activity_text,
    v_auth_user_id,
    v_operator_display_name
  );

  session_id := v_session.id;
  step_id := v_step.id;
  step_name := v_step.step_name;
  step_status := v_step.status;
  result_id := v_result_id;
  result_status := v_result_status;
  critical_finding_count := v_critical_count;
  attention_finding_count := v_attention_count;
  total_findings := v_total_findings;
  executed_at := v_executed_at;
  return next;
end;
$$;

revoke all on function public.run_inventory_migration_auto_create(uuid, uuid) from public;
revoke all on function public.run_inventory_migration_auto_create(uuid, uuid) from anon;
grant execute on function public.run_inventory_migration_auto_create(uuid, uuid) to authenticated;

comment on function public.run_inventory_migration_auto_create(uuid, uuid) is
  'P7.8.11 stage-owned Auto Create: locks session/step, creates stock_items from map source_snapshot for classified+auto_create rows, sets map stock_item_id+created. No migrated_at; no supplier_id; no movements.';

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- select pg_get_functiondef(
--   'public.run_inventory_migration_auto_create(uuid,uuid)'::regprocedure
-- );

-- Example:
--   select * from public.run_inventory_migration_auto_create(
--     '<workspace_uuid>',
--     '<session_uuid>'
--   );

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.run_inventory_migration_auto_create(uuid, uuid);
