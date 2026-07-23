-- =============================================================================
-- P8.16.28a — Cancel Inventory Count Completion RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (P8.3.0)
--   2. inventory_count_rls_policies.sql (P8.3.0)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER entry point that cancels a counting_complete
--   inventory count session without mutating stock, session items, or snapshots.
--
-- Transition:
--   counting_complete → cancelled
--
-- Does NOT:
--   - DELETE inventory_count_sessions / session_items / locations
--   - Mutate stock_items or stock_movements
--   - Create stock movements
--   - Alter counted quantities or freeze fields
--   - Post or pause/resume
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
-- =============================================================================

drop function if exists public.cancel_inventory_count_completion(uuid, uuid);

create or replace function public.cancel_inventory_count_completion(
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
  v_session public.inventory_count_sessions%rowtype;
  v_now timestamptz := now();
begin
  if v_auth_user_id is null then
    raise exception 'inventory_count_cancel_unauthenticated'
      using hint = 'Sign in required.';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_count_cancel_workspace_required'
      using hint = 'workspace_id is required.';
  end if;

  if p_session_id is null then
    raise exception 'inventory_count_cancel_session_required'
      using hint = 'session_id is required.';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_count_cancel_forbidden'
      using hint = 'owner / general_manager / manager required.';
  end if;

  -- Lock session for Post-versus-Cancel race safety
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
      raise exception 'inventory_count_cancel_workspace_mismatch'
        using hint = 'Session belongs to a different workspace.';
    end if;

    raise exception 'inventory_count_cancel_session_not_found'
      using hint = 'Inventory count session was not found.';
  end if;

  if v_session.workspace_id is distinct from p_workspace_id then
    raise exception 'inventory_count_cancel_workspace_mismatch'
      using hint = 'Session belongs to a different workspace.';
  end if;

  if v_session.status = 'posted'
     or v_session.posted_at is not null then
    raise exception 'inventory_count_cancel_session_posted'
      using hint = 'Posted inventory counts cannot be cancelled.';
  end if;

  if v_session.status = 'cancelled'
     or v_session.cancelled_at is not null then
    raise exception 'inventory_count_cancel_session_cancelled'
      using hint = 'Inventory count session is already cancelled.';
  end if;

  if v_session.status = 'in_progress' then
    raise exception 'inventory_count_cancel_session_in_progress'
      using hint = 'Only counting-complete sessions can be cancelled from Home.';
  end if;

  if v_session.status = 'paused' then
    raise exception 'inventory_count_cancel_session_paused'
      using hint = 'Only counting-complete sessions can be cancelled from Home.';
  end if;

  if v_session.status is distinct from 'counting_complete' then
    raise exception 'inventory_count_cancel_not_counting_complete'
      using hint = 'Only counting-complete sessions can be cancelled from Home.',
            detail = format('status=%s', coalesce(v_session.status, 'null'));
  end if;

  update public.inventory_count_sessions s
  set
    status = 'cancelled',
    cancelled_at = v_now,
    updated_at = v_now
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
    and s.status = 'counting_complete';

  if not found then
    -- Concurrent Post (or other transition) won the race after FOR UPDATE wait
    raise exception 'inventory_count_cancel_stale_status'
      using hint = 'Session status changed before cancel could complete. Refresh and try again.';
  end if;

  select s.*
  into v_session
  from public.inventory_count_sessions s
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id;

  return jsonb_build_object(
    'session_id', v_session.id,
    'workspace_id', v_session.workspace_id,
    'status', v_session.status,
    'cancelled_at', v_session.cancelled_at,
    'updated_at', v_session.updated_at,
    'preserved', jsonb_build_object(
      'session_items', true,
      'session_locations', true,
      'stock_items', true,
      'stock_movements', true
    ),
    'mutations', jsonb_build_object(
      'stock_quantity_changed', false,
      'stock_movements_created', false,
      'stock_movements_deleted', false,
      'session_items_deleted', false
    )
  );
end;
$$;

revoke all on function public.cancel_inventory_count_completion(uuid, uuid) from public;
revoke all on function public.cancel_inventory_count_completion(uuid, uuid) from anon;
grant execute on function public.cancel_inventory_count_completion(uuid, uuid) to authenticated;

comment on function public.cancel_inventory_count_completion(uuid, uuid) is
  'P8.16.28a SECURITY DEFINER cancel of counting_complete inventory count sessions. No stock or snapshot mutations. FOR UPDATE race-safe vs post.';

-- =============================================================================
-- Contract notes
-- =============================================================================
-- Transition:
--   counting_complete → cancelled (+ cancelled_at, updated_at)
--
-- Rejects:
--   in_progress / paused / posted / already cancelled / missing / wrong workspace
--
-- Never mutates:
--   inventory_count_session_items, inventory_count_session_locations,
--   stock_items, stock_movements
--
-- Errors:
--   unauthenticated        → inventory_count_cancel_unauthenticated
--   forbidden              → inventory_count_cancel_forbidden
--   workspace required     → inventory_count_cancel_workspace_required
--   session required       → inventory_count_cancel_session_required
--   session not found      → inventory_count_cancel_session_not_found
--   workspace mismatch     → inventory_count_cancel_workspace_mismatch
--   in_progress            → inventory_count_cancel_session_in_progress
--   paused                 → inventory_count_cancel_session_paused
--   posted                 → inventory_count_cancel_session_posted
--   already cancelled      → inventory_count_cancel_session_cancelled
--   other non-complete     → inventory_count_cancel_not_counting_complete
--   stale after lock       → inventory_count_cancel_stale_status
--
-- Example:
--   select public.cancel_inventory_count_completion(
--     '<workspace_uuid>',
--     '<session_uuid>'
--   );
-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.cancel_inventory_count_completion(uuid, uuid);
