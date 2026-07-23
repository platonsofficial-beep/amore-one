-- =============================================================================
-- P8.16.34 — Repair Inventory Count Current Location RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (P8.3.0)
--   2. inventory_count_rls_policies.sql (P8.3.0)
--   3. inventory_count_create_session_rpc.sql (P8.3.1 / hardened)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Preview / repair legacy in_progress|paused sessions that have zero
--   location rows with status = current (lifecycle invariant violation).
--
-- Does NOT:
--   - Change session status
--   - Mutate session items / counted quantities
--   - Mutate stock_items or stock_movements
--   - Reorder locations
--   - Bulk-repair all sessions
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
-- =============================================================================

drop function if exists public.repair_inventory_count_current_location(uuid, uuid, boolean);

create or replace function public.repair_inventory_count_current_location(
  p_workspace_id uuid,
  p_session_id uuid,
  p_preview boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_session public.inventory_count_sessions%rowtype;
  v_preview boolean := coalesce(p_preview, true);
  v_now timestamptz := now();

  v_total_locations integer := 0;
  v_current_count integer := 0;
  v_completed_count integer := 0;
  v_not_started_count integer := 0;

  v_candidate public.inventory_count_session_locations%rowtype;
  v_first_sort_order integer := null;
  v_tie_count integer := 0;

  v_blockers text[] := array[]::text[];
  v_eligible boolean := false;
  v_outcome text := 'blocked';
  v_previous_status text := null;
  v_current_count_after integer := 0;
begin
  if v_auth_user_id is null then
    raise exception 'inventory_count_repair_unauthenticated'
      using hint = 'Sign in required.';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_count_repair_workspace_required'
      using hint = 'workspace_id is required.';
  end if;

  if p_session_id is null then
    raise exception 'inventory_count_repair_session_required'
      using hint = 'session_id is required.';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_count_repair_forbidden'
      using hint = 'owner / general_manager / manager required. host / staff / anonymous denied.';
  end if;

  select s.*
  into v_session
  from public.inventory_count_sessions s
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  for update of s;

  if not found then
    if exists (
      select 1
      from public.inventory_count_sessions s
      where s.id = p_session_id
    ) then
      raise exception 'inventory_count_repair_workspace_mismatch'
        using hint = 'Session belongs to a different workspace.';
    end if;

    raise exception 'inventory_count_repair_session_not_found'
      using hint = 'Inventory count session was not found.';
  end if;

  if v_session.status = 'counting_complete' then
    raise exception 'inventory_count_repair_session_counting_complete'
      using hint = 'counting_complete sessions cannot be repaired.';
  end if;

  if v_session.status = 'posted' then
    raise exception 'inventory_count_repair_session_posted'
      using hint = 'Posted sessions cannot be repaired.';
  end if;

  if v_session.status = 'cancelled' then
    raise exception 'inventory_count_repair_session_cancelled'
      using hint = 'Cancelled sessions cannot be repaired.';
  end if;

  if v_session.status not in ('in_progress', 'paused') then
    raise exception 'inventory_count_repair_session_status_invalid'
      using hint = 'Only in_progress or paused sessions can be repaired.';
  end if;

  -- Lock all location rows for this session before counting / selecting.
  perform 1
  from public.inventory_count_session_locations l
  where l.session_id = p_session_id
    and l.workspace_id = p_workspace_id
  for update;

  select
    count(*)::integer,
    count(*) filter (where l.status = 'current')::integer,
    count(*) filter (where l.status = 'completed')::integer,
    count(*) filter (where l.status = 'not_started')::integer
  into
    v_total_locations,
    v_current_count,
    v_completed_count,
    v_not_started_count
  from public.inventory_count_session_locations l
  where l.session_id = p_session_id
    and l.workspace_id = p_workspace_id;

  if v_current_count > 1 then
    raise exception 'inventory_count_repair_multiple_current_locations'
      using hint = 'Session has more than one current location; repair refused.';
  end if;

  if v_current_count = 1 then
    return jsonb_build_object(
      'success', true,
      'outcome', 'already_valid',
      'eligible', false,
      'blockers', jsonb_build_array('already_has_current_location'),
      'mutation_performed', false,
      'preview', v_preview,
      'session_id', v_session.id,
      'workspace_id', v_session.workspace_id,
      'session_status', v_session.status,
      'total_locations', v_total_locations,
      'current_count', v_current_count,
      'completed_count', v_completed_count,
      'not_started_count', v_not_started_count,
      'proposed_location_id', null,
      'proposed_location_key', null,
      'proposed_previous_status', null,
      'proposed_new_status', null,
      'repaired_location_id', null,
      'repaired_location_key', null,
      'previous_status', null,
      'new_status', null,
      'current_count_after', v_current_count,
      'mutations', jsonb_build_object(
        'location_status_changed', false,
        'session_status_changed', false,
        'session_items_changed', false,
        'counted_quantities_changed', false,
        'stock_quantity_changed', false,
        'stock_movements_changed', false
      )
    );
  end if;

  if v_total_locations < 1 then
    v_blockers := array_append(v_blockers, 'zero_locations');
  end if;

  if v_current_count <> 0 then
    v_blockers := array_append(v_blockers, 'unexpected_current_count');
  end if;

  -- Deterministic candidate: sort_order, created_at, id.
  -- Block if the winning sort_order is shared by multiple rows (ambiguous first tier).
  if v_total_locations >= 1 then
    select min(l.sort_order)
    into v_first_sort_order
    from public.inventory_count_session_locations l
    where l.session_id = p_session_id
      and l.workspace_id = p_workspace_id;

    select count(*)::integer
    into v_tie_count
    from public.inventory_count_session_locations l
    where l.session_id = p_session_id
      and l.workspace_id = p_workspace_id
      and l.sort_order = v_first_sort_order;

    if v_tie_count > 1 then
      v_blockers := array_append(v_blockers, 'duplicate_sort_order_ambiguity');
    end if;

    select l.*
    into v_candidate
    from public.inventory_count_session_locations l
    where l.session_id = p_session_id
      and l.workspace_id = p_workspace_id
    order by l.sort_order asc, l.created_at asc, l.id asc
    limit 1;
  end if;

  if v_candidate.id is null and v_total_locations >= 1 then
    v_blockers := array_append(v_blockers, 'candidate_not_found');
  end if;

  v_eligible := coalesce(array_length(v_blockers, 1), 0) = 0
    and v_candidate.id is not null
    and v_current_count = 0
    and v_total_locations >= 1;

  if v_eligible then
    v_outcome := case when v_preview then 'preview_eligible' else 'repaired' end;
    v_previous_status := v_candidate.status;
  else
    v_outcome := 'blocked';
  end if;

  if v_preview or not v_eligible then
    return jsonb_build_object(
      'success', true,
      'outcome', v_outcome,
      'eligible', v_eligible,
      'blockers', to_jsonb(v_blockers),
      'mutation_performed', false,
      'preview', v_preview,
      'session_id', v_session.id,
      'workspace_id', v_session.workspace_id,
      'session_status', v_session.status,
      'total_locations', v_total_locations,
      'current_count', v_current_count,
      'completed_count', v_completed_count,
      'not_started_count', v_not_started_count,
      'proposed_location_id', v_candidate.id,
      'proposed_location_key', v_candidate.location_key,
      'proposed_previous_status', v_candidate.status,
      'proposed_new_status', case when v_eligible then 'current' else null end,
      'repaired_location_id', null,
      'repaired_location_key', null,
      'previous_status', null,
      'new_status', null,
      'current_count_after', v_current_count,
      'mutations', jsonb_build_object(
        'location_status_changed', false,
        'session_status_changed', false,
        'session_items_changed', false,
        'counted_quantities_changed', false,
        'stock_quantity_changed', false,
        'stock_movements_changed', false
      )
    );
  end if;

  -- Execute: promote only the deterministic candidate to current.
  update public.inventory_count_session_locations l
  set status = 'current'
  where l.id = v_candidate.id
    and l.session_id = p_session_id
    and l.workspace_id = p_workspace_id
    and l.status is distinct from 'current';

  update public.inventory_count_sessions s
  set updated_at = v_now
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id;

  select count(*) filter (where l.status = 'current')::integer
  into v_current_count_after
  from public.inventory_count_session_locations l
  where l.session_id = p_session_id
    and l.workspace_id = p_workspace_id;

  if v_current_count_after is distinct from 1 then
    raise exception 'inventory_count_repair_postcondition_failed'
      using hint = 'Repair did not leave exactly one current location.';
  end if;

  return jsonb_build_object(
    'success', true,
    'outcome', 'repaired',
    'eligible', true,
    'blockers', '[]'::jsonb,
    'mutation_performed', true,
    'preview', false,
    'session_id', v_session.id,
    'workspace_id', v_session.workspace_id,
    'session_status', v_session.status,
    'total_locations', v_total_locations,
    'current_count', v_current_count,
    'completed_count', v_completed_count,
    'not_started_count', v_not_started_count,
    'proposed_location_id', v_candidate.id,
    'proposed_location_key', v_candidate.location_key,
    'proposed_previous_status', v_previous_status,
    'proposed_new_status', 'current',
    'repaired_location_id', v_candidate.id,
    'repaired_location_key', v_candidate.location_key,
    'previous_status', v_previous_status,
    'new_status', 'current',
    'current_count_after', v_current_count_after,
    'mutations', jsonb_build_object(
      'location_status_changed', true,
      'session_status_changed', false,
      'session_items_changed', false,
      'counted_quantities_changed', false,
      'stock_quantity_changed', false,
      'stock_movements_changed', false
    )
  );
end;
$$;

revoke all on function public.repair_inventory_count_current_location(uuid, uuid, boolean) from public;
revoke all on function public.repair_inventory_count_current_location(uuid, uuid, boolean) from anon;

grant execute on function public.repair_inventory_count_current_location(uuid, uuid, boolean)
  to authenticated;

comment on function public.repair_inventory_count_current_location(uuid, uuid, boolean) is
  'P8.16.34 SECURITY DEFINER preview/execute repair for inventory count sessions with zero current locations. Manager-only. Does not mutate items, counts, stock, or session status.';

-- =============================================================================
-- AMORE.NICOSIA one-time runbook (manual — do NOT auto-execute)
-- Workspace: 712e7fd4-2b1d-4382-9e40-491bd3e68a47
-- Sessions:
--   5d09543a-9f28-4988-94db-f1ea92742834
--   a09c9fdd-d4ee-4308-af92-7823cd8a2cb1
-- =============================================================================
--
-- 1) Preview session A
-- select public.repair_inventory_count_current_location(
--   '712e7fd4-2b1d-4382-9e40-491bd3e68a47'::uuid,
--   '5d09543a-9f28-4988-94db-f1ea92742834'::uuid,
--   true
-- );
--
-- 2) Preview session B
-- select public.repair_inventory_count_current_location(
--   '712e7fd4-2b1d-4382-9e40-491bd3e68a47'::uuid,
--   'a09c9fdd-d4ee-4308-af92-7823cd8a2cb1'::uuid,
--   true
-- );
--
-- 3) Execute session A (only after eligible preview)
-- select public.repair_inventory_count_current_location(
--   '712e7fd4-2b1d-4382-9e40-491bd3e68a47'::uuid,
--   '5d09543a-9f28-4988-94db-f1ea92742834'::uuid,
--   false
-- );
--
-- 4) Execute session B separately
-- select public.repair_inventory_count_current_location(
--   '712e7fd4-2b1d-4382-9e40-491bd3e68a47'::uuid,
--   'a09c9fdd-d4ee-4308-af92-7823cd8a2cb1'::uuid,
--   false
-- );
--
-- 5) Re-check invariants
-- select session_id, status, count(*) filter (where status = 'current') as current_count
-- from public.inventory_count_session_locations
-- where workspace_id = '712e7fd4-2b1d-4382-9e40-491bd3e68a47'
--   and session_id in (
--     '5d09543a-9f28-4988-94db-f1ea92742834',
--     'a09c9fdd-d4ee-4308-af92-7823cd8a2cb1'
--   )
-- group by session_id, status;
--
-- Better:
-- select
--   session_id,
--   count(*) filter (where status = 'current')::int as current_count,
--   count(*)::int as total_locations
-- from public.inventory_count_session_locations
-- where workspace_id = '712e7fd4-2b1d-4382-9e40-491bd3e68a47'
--   and session_id in (
--     '5d09543a-9f28-4988-94db-f1ea92742834'::uuid,
--     'a09c9fdd-d4ee-4308-af92-7823cd8a2cb1'::uuid
--   )
-- group by session_id;
--
-- 6) Open each session in UI → Complete Location → Finish/Post or Cancel
-- 7) Retry THE BOTANIST permanent delete
-- =============================================================================
