-- =============================================================================
-- P8.5.2 — Post Inventory Count Finish RPC (foundation only)
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (P8.3.0)
--   2. inventory_count_rls_policies.sql (P8.3.0)
--   3. inventory_count_snapshot_at_hardening.sql (P8.3.9c)
--   4. inventory_count_reconcile_finish.sql (P8.5.1)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   SECURITY DEFINER execution framework for inventory count posting.
--   Validates auth, session state, and Strategy 4 readiness via
--   public.reconcile_inventory_count_finish. Does NOT mutate stock yet.
--
-- Does NOT (this sprint):
--   - Lock stock_items
--   - Insert stock_movements
--   - Update stock_items.current_quantity
--   - Persist session item posting audit fields
--   - Set session status to posted
--   - Enable Confirm Finish Count in the UI
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
-- =============================================================================

drop function if exists public.post_inventory_count_finish(uuid, uuid);

create or replace function public.post_inventory_count_finish(
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
  v_reconcile jsonb;
  v_can_post boolean := false;
  v_blocker_count integer := 0;
  v_summary jsonb := '{}'::jsonb;
begin
  -- Authentication
  if v_auth_user_id is null then
    raise exception 'inventory_count_post_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_count_post_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_count_post_session_required';
  end if;

  -- Authorization (owner / general_manager / manager)
  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_count_post_forbidden';
  end if;

  -- Session must exist and belong to workspace
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
      raise exception 'inventory_count_post_workspace_mismatch';
    end if;

    raise exception 'inventory_count_post_session_not_found';
  end if;

  -- Reject cancelled
  if v_session.status = 'cancelled'
     or v_session.cancelled_at is not null then
    raise exception 'inventory_count_post_session_cancelled';
  end if;

  -- Reject already posted
  if v_session.status = 'posted'
     or v_session.posted_at is not null then
    raise exception 'inventory_count_post_already_posted';
  end if;

  -- Require counting_complete
  if v_session.status is distinct from 'counting_complete' then
    raise exception 'inventory_count_post_session_not_complete';
  end if;

  -- Require authoritative snapshot boundary
  if v_session.snapshot_at is null then
    raise exception 'inventory_count_post_snapshot_missing';
  end if;

  -- Strategy 4 readiness (shared reconciliation; no writes)
  begin
    v_reconcile := public.reconcile_inventory_count_finish(p_workspace_id, p_session_id);
  exception
    when others then
      if sqlerrm like '%inventory_count_reconcile_snapshot_missing%' then
        raise exception 'inventory_count_post_snapshot_missing';
      end if;
      raise;
  end;

  v_can_post := coalesce((v_reconcile ->> 'can_post')::boolean, false);
  v_summary := coalesce(v_reconcile -> 'summary', '{}'::jsonb);
  v_blocker_count := coalesce(
    (v_summary ->> 'blocking_issue_count')::integer,
    jsonb_array_length(coalesce(v_reconcile -> 'blocking_issues', '[]'::jsonb)),
    0
  );

  if not v_can_post then
    raise exception 'inventory_count_post_blocked';
  end if;

  -- Foundation placeholder only (no stock mutations in P8.5.2)
  return jsonb_build_object(
    'session_id', p_session_id,
    'workspace_id', p_workspace_id,
    'session_status', v_session.status,
    'can_post', v_can_post,
    'blocker_count', v_blocker_count,
    'reconciliation_summary', v_summary,
    'posting_enabled', false,
    'message', 'Posting engine foundation complete. Stock mutations not implemented.'
  );
end;
$$;

revoke all on function public.post_inventory_count_finish(uuid, uuid) from public;
grant execute on function public.post_inventory_count_finish(uuid, uuid) to authenticated;

comment on function public.post_inventory_count_finish(uuid, uuid) is
  'P8.5.2 SECURITY DEFINER posting foundation. Validates readiness via reconcile_inventory_count_finish. No stock mutations yet.';

-- =============================================================================
-- Errors:
--   unauthenticated     → inventory_count_post_unauthenticated
--   forbidden           → inventory_count_post_forbidden
--   workspace required  → inventory_count_post_workspace_required
--   session required    → inventory_count_post_session_required
--   session not found   → inventory_count_post_session_not_found
--   workspace mismatch  → inventory_count_post_workspace_mismatch
--   cancelled           → inventory_count_post_session_cancelled
--   already posted      → inventory_count_post_already_posted
--   not complete        → inventory_count_post_session_not_complete
--   snapshot missing    → inventory_count_post_snapshot_missing
--   blockers present    → inventory_count_post_blocked
-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.post_inventory_count_finish(uuid, uuid);
