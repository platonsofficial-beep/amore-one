-- =============================================================================
-- P8.5.1 — Shared Inventory Count Finish Reconciliation (internal)
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (P8.3.0)
--   2. inventory_count_rls_policies.sql (P8.3.0)
--   3. inventory_count_snapshot_at_hardening.sql (P8.3.9c)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Single authoritative Strategy 4 reconciliation for Finish Preview and the
--   future post_inventory_count_finish RPC. Read-only; no stock/session writes.
--
-- Visibility:
--   Internal helper. No EXECUTE grant to authenticated / anon / public.
--   Invoked only by approved SECURITY DEFINER RPCs (preview, future post).
--
-- Security model:
--   SECURITY INVOKER + revoked client grants. When called from a SECURITY
--   DEFINER RPC owned by the table owner, it runs with that owner's rights
--   for the duration of the call (minimum privilege; not a new client API).
--
-- Does NOT:
--   - INSERT / UPDATE / DELETE / MERGE
--   - Lock stock rows (callers may lock before invoking)
--   - Change session status
--   - Create stock_movements
--   - Accept client-supplied quantities, deltas, or timestamps
--
-- Reconciliation (locked Strategy 4 / P8.29.8 location-aware):
--   snapshot_at = inventory_count_sessions.snapshot_at (authoritative)
--   Window (exclusive start, inclusive end):
--     snapshot_at < stock_movements.created_at <= counted_at
--   Eligible movement deltas (scoped to session line storage_location):
--     receive / transfer_in at destination_location_key → +abs(quantity)
--     usage / transfer_out at source_location_key → -abs(quantity)
--     adjustment at destination or source location_key → +quantity (signed)
--     legacy null location keys apply only when item.storage_location = line location
--     stock_count → NOT an additive delta; in-window at location → blocker
--   expected_at_count = expected_snapshot + net eligible delta
--   variance_quantity = counted_quantity - expected_at_count
--   current_live_quantity = stock_item_location_balances.quantity at line location
--   resulting_quantity_after_post = current_live_quantity + variance_quantity
-- =============================================================================

drop function if exists public.reconcile_inventory_count_finish(uuid, uuid);

create or replace function public.reconcile_inventory_count_finish(
  p_workspace_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_session public.inventory_count_sessions%rowtype;
  v_snapshot_at timestamptz;
  v_generated_at timestamptz := now();
  v_counted_lines jsonb := '[]'::jsonb;
  v_skipped_lines jsonb := '[]'::jsonb;
  v_blocking_issues jsonb := '[]'::jsonb;
  v_summary jsonb;
  v_total_lines integer := 0;
  v_counted_line_count integer := 0;
  v_skipped_line_count integer := 0;
  v_blocking_issue_count integer := 0;
  v_can_post boolean := false;
begin
  if p_workspace_id is null then
    raise exception 'inventory_count_reconcile_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_count_reconcile_session_required';
  end if;

  select s.*
  into v_session
  from public.inventory_count_sessions s
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id;

  if not found then
    if exists (
      select 1
      from public.inventory_count_sessions s
      where s.id = p_session_id
    ) then
      raise exception 'inventory_count_reconcile_workspace_mismatch';
    end if;

    raise exception 'inventory_count_reconcile_session_not_found';
  end if;

  -- Authoritative freeze timestamp (P8.3.9c sessions.snapshot_at)
  v_snapshot_at := v_session.snapshot_at;

  if v_snapshot_at is null then
    raise exception 'inventory_count_reconcile_snapshot_missing';
  end if;

  -- Blocking issues: counted lines missing counted_at / linked stock item
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'code', issue_code,
        'session_item_id', session_item_id,
        'item_id', item_id,
        'item_name', item_name,
        'message', message
      )
      order by item_name, session_item_id
    ),
    '[]'::jsonb
  )
  into v_blocking_issues
  from (
    select
      i.id as session_item_id,
      i.item_id,
      i.item_name,
      case
        when i.counted_at is null then 'missing_counted_at'
        when i.item_id is null then 'missing_stock_item'
        when si.id is null then 'missing_stock_item'
        else null
      end as issue_code,
      case
        when i.counted_at is null then
          'Counted line is missing counted_at and cannot be reconciled.'
        when i.item_id is null or si.id is null then
          'Counted line is missing a linked stock item and cannot be posted.'
        else null
      end as message
    from public.inventory_count_session_items i
    left join public.stock_items si
      on si.id = i.item_id
     and si.workspace_id = i.workspace_id
    where i.session_id = p_session_id
      and i.workspace_id = p_workspace_id
      and i.line_status = 'counted'
      and i.counted_quantity is not null
      and (
        i.counted_at is null
        or i.item_id is null
        or si.id is null
      )
  ) blockers
  where issue_code is not null;

  -- Mid-window absolute stock_count movements cannot be treated as deltas.
  -- P8.29.8: scoped to the session line location (or legacy primary match).
  select coalesce(v_blocking_issues, '[]'::jsonb) || coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'code', 'unsupported_stock_count_in_window',
          'session_item_id', session_item_id,
          'item_id', item_id,
          'item_name', item_name,
          'message', message
        )
        order by item_name, session_item_id
      )
      from (
        select distinct
          i.id as session_item_id,
          i.item_id,
          i.item_name,
          'A stock_count movement exists between snapshot and counted_at. Absolute-set movements cannot be reconciled as deltas.' as message
        from public.inventory_count_session_items i
        inner join public.stock_items si
          on si.id = i.item_id
         and si.workspace_id = i.workspace_id
        inner join public.stock_movements m
          on m.item_id = i.item_id
         and m.workspace_id = i.workspace_id
         and m.type = 'stock_count'
         and m.created_at > v_snapshot_at
         and m.created_at <= i.counted_at
         and (
           m.destination_location_key = i.storage_location
           or (
             m.destination_location_key is null
             and m.source_location_key is null
             and si.storage_location = i.storage_location
           )
         )
        where i.session_id = p_session_id
          and i.workspace_id = p_workspace_id
          and i.line_status = 'counted'
          and i.counted_quantity is not null
          and i.counted_at is not null
          and i.item_id is not null
      ) stock_count_blockers
    ),
    '[]'::jsonb
  )
  into v_blocking_issues;

  -- Skipped lines: identity + warning only (no fabricated variance)
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'session_item_id', i.id,
        'item_id', i.item_id,
        'item_name', i.item_name,
        'storage_location', i.storage_location,
        'unit', i.unit,
        'line_status', i.line_status,
        'warning', 'Skipped lines are not posted and keep live quantity unchanged.'
      )
      order by i.storage_location, i.item_name, i.id
    ),
    '[]'::jsonb
  )
  into v_skipped_lines
  from public.inventory_count_session_items i
  where i.session_id = p_session_id
    and i.workspace_id = p_workspace_id
    and i.line_status = 'skipped';

  -- Counted lines eligible for reconciliation (P8.29.8: live qty from location balance)
  select coalesce(
    jsonb_agg(line_row order by line_row ->> 'storage_location', line_row ->> 'item_name', line_row ->> 'session_item_id'),
    '[]'::jsonb
  )
  into v_counted_lines
  from (
    select jsonb_build_object(
      'session_item_id', i.id,
      'item_id', i.item_id,
      'item_name', i.item_name,
      'storage_location', i.storage_location,
      'unit', i.unit,
      'expected_snapshot', i.expected_snapshot,
      'movement_delta_since_snapshot', coalesce(deltas.net_delta, 0),
      'expected_at_count', (i.expected_snapshot + coalesce(deltas.net_delta, 0)),
      'counted_quantity', i.counted_quantity,
      'counted_at', i.counted_at,
      'variance_quantity', (i.counted_quantity - (i.expected_snapshot + coalesce(deltas.net_delta, 0))),
      'current_live_quantity', coalesce(bal.quantity, 0),
      'resulting_quantity_after_post', (
        coalesce(bal.quantity, 0)
        + (i.counted_quantity - (i.expected_snapshot + coalesce(deltas.net_delta, 0)))
      )
    ) as line_row
    from public.inventory_count_session_items i
    inner join public.stock_items si
      on si.id = i.item_id
     and si.workspace_id = i.workspace_id
    left join public.stock_item_location_balances bal
      on bal.workspace_id = i.workspace_id
     and bal.stock_item_id = i.item_id
     and bal.location_key = i.storage_location
    left join lateral (
      select coalesce(sum(
        case
          when m.type in ('receive', 'transfer_in')
               and (
                 m.destination_location_key = i.storage_location
                 or (
                   m.destination_location_key is null
                   and m.source_location_key is null
                   and si.storage_location = i.storage_location
                 )
               )
            then abs(m.quantity)
          when m.type in ('usage', 'transfer_out')
               and (
                 m.source_location_key = i.storage_location
                 or (
                   m.destination_location_key is null
                   and m.source_location_key is null
                   and si.storage_location = i.storage_location
                 )
               )
            then -abs(m.quantity)
          when m.type = 'adjustment'
               and (
                 m.destination_location_key = i.storage_location
                 or m.source_location_key = i.storage_location
                 or (
                   m.destination_location_key is null
                   and m.source_location_key is null
                   and si.storage_location = i.storage_location
                 )
               )
            then m.quantity
          else 0
        end
      ), 0) as net_delta
      from public.stock_movements m
      where m.workspace_id = i.workspace_id
        and m.item_id = i.item_id
        and m.type in ('receive', 'usage', 'adjustment', 'transfer_out', 'transfer_in')
        and m.created_at > v_snapshot_at
        and m.created_at <= i.counted_at
    ) deltas on true
    where i.session_id = p_session_id
      and i.workspace_id = p_workspace_id
      and i.line_status = 'counted'
      and i.counted_quantity is not null
      and i.counted_at is not null
      and i.item_id is not null
      -- Exclude lines that already have stock_count blockers in-window at this location
      and not exists (
        select 1
        from public.stock_movements m
        where m.workspace_id = i.workspace_id
          and m.item_id = i.item_id
          and m.type = 'stock_count'
          and m.created_at > v_snapshot_at
          and m.created_at <= i.counted_at
          and (
            m.destination_location_key = i.storage_location
            or (
              m.destination_location_key is null
              and m.source_location_key is null
              and si.storage_location = i.storage_location
            )
          )
      )
  ) counted;

  select count(*)::integer
  into v_total_lines
  from public.inventory_count_session_items i
  where i.session_id = p_session_id
    and i.workspace_id = p_workspace_id;

  v_counted_line_count := jsonb_array_length(coalesce(v_counted_lines, '[]'::jsonb));
  v_skipped_line_count := jsonb_array_length(coalesce(v_skipped_lines, '[]'::jsonb));
  v_blocking_issue_count := jsonb_array_length(coalesce(v_blocking_issues, '[]'::jsonb));

  -- Skipped lines block posting readiness in V1 (every line must be counted).
  if v_skipped_line_count > 0 then
    v_blocking_issues := coalesce(v_blocking_issues, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'code', 'skipped_lines_present',
        'session_item_id', null,
        'item_id', null,
        'item_name', null,
        'message', format(
          '%s skipped line(s) must be counted before posting. Skipped lines are not treated as zero.',
          v_skipped_line_count
        )
      )
    );
    v_blocking_issue_count := jsonb_array_length(v_blocking_issues);
  end if;

  -- Pending lines should not remain after counting_complete; treat as blockers.
  if exists (
    select 1
    from public.inventory_count_session_items i
    where i.session_id = p_session_id
      and i.workspace_id = p_workspace_id
      and i.line_status = 'pending'
  ) then
    v_blocking_issues := coalesce(v_blocking_issues, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'code', 'pending_lines_present',
        'session_item_id', null,
        'item_id', null,
        'item_name', null,
        'message', 'Pending lines remain and must be counted or skipped before posting.'
      )
    );
    v_blocking_issue_count := jsonb_array_length(v_blocking_issues);
  end if;

  select jsonb_build_object(
    'total_lines', v_total_lines,
    'counted_lines', v_counted_line_count,
    'skipped_lines', v_skipped_line_count,
    'changed_items', count(*) filter (
      where (line_elem ->> 'variance_quantity')::numeric is distinct from 0
    )::integer,
    'unchanged_items', count(*) filter (
      where (line_elem ->> 'variance_quantity')::numeric = 0
    )::integer,
    'positive_variances', count(*) filter (
      where (line_elem ->> 'variance_quantity')::numeric > 0
    )::integer,
    'negative_variances', count(*) filter (
      where (line_elem ->> 'variance_quantity')::numeric < 0
    )::integer,
    'zero_variances', count(*) filter (
      where (line_elem ->> 'variance_quantity')::numeric = 0
    )::integer,
    'blocking_issue_count', v_blocking_issue_count,
    'can_post', (v_blocking_issue_count = 0)
  )
  into v_summary
  from jsonb_array_elements(coalesce(v_counted_lines, '[]'::jsonb)) as line_elem;

  v_can_post := coalesce((v_summary ->> 'can_post')::boolean, false);

  return jsonb_build_object(
    'session_id', p_session_id,
    'workspace_id', p_workspace_id,
    'session_status', v_session.status,
    'snapshot_at', v_snapshot_at,
    'preview_generated_at', v_generated_at,
    'summary', coalesce(v_summary, jsonb_build_object(
      'total_lines', v_total_lines,
      'counted_lines', 0,
      'skipped_lines', v_skipped_line_count,
      'changed_items', 0,
      'unchanged_items', 0,
      'positive_variances', 0,
      'negative_variances', 0,
      'zero_variances', 0,
      'blocking_issue_count', v_blocking_issue_count,
      'can_post', false
    )),
    'lines', coalesce(v_counted_lines, '[]'::jsonb),
    'skipped', coalesce(v_skipped_lines, '[]'::jsonb),
    'blocking_issues', coalesce(v_blocking_issues, '[]'::jsonb),
    'can_post', v_can_post
  );
end;
$$;

revoke all on function public.reconcile_inventory_count_finish(uuid, uuid) from public;
revoke all on function public.reconcile_inventory_count_finish(uuid, uuid) from anon;
revoke all on function public.reconcile_inventory_count_finish(uuid, uuid) from authenticated;

comment on function public.reconcile_inventory_count_finish(uuid, uuid) is
  'P8.5.1/P8.29.8 Internal read-only Strategy 4 inventory count reconciliation (live qty + deltas scoped to location balances). Not a client API. Called by preview_inventory_count_finish and post_inventory_count_finish.';

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.reconcile_inventory_count_finish(uuid, uuid);
