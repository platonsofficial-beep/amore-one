-- =============================================================================
-- P8.3.9 / P8.3.9a / P8.3.9c / P8.5.1 — Preview Inventory Count Finish RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (P8.3.0)
--   2. inventory_count_rls_policies.sql (P8.3.0)
--   3. inventory_count_create_session_rpc.sql (P8.3.1)
--   4. inventory_count_snapshot_at_hardening.sql (P8.3.9c)
--   5. inventory_count_build_snapshot_rpc.sql (P8.3.9c)
--   6. inventory_count_reconcile_finish.sql (P8.5.1)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Thin read-only SECURITY DEFINER wrapper around
--   public.reconcile_inventory_count_finish (Strategy 4).
--
-- Does NOT:
--   - Duplicate movement aggregation or variance arithmetic
--   - Insert stock_movements
--   - Update stock_items quantities
--   - Persist expected_at_count / variance_quantity / live_quantity_at_post
--   - Change session status
--   - Mutate session locations or items
--   - Post or finish the count
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
-- =============================================================================

drop function if exists public.preview_inventory_count_finish(uuid, uuid);

create or replace function public.preview_inventory_count_finish(
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
  v_result jsonb;
begin
  -- Authentication
  if v_auth_user_id is null then
    raise exception 'inventory_count_preview_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_count_preview_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_count_preview_session_required';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_count_preview_forbidden';
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
      raise exception 'inventory_count_preview_workspace_mismatch';
    end if;

    raise exception 'inventory_count_preview_session_not_found';
  end if;

  if v_session.status is distinct from 'counting_complete' then
    raise exception 'inventory_count_preview_session_not_complete';
  end if;

  -- Preserve preview-specific snapshot_missing code for existing clients.
  if v_session.snapshot_at is null then
    raise exception 'inventory_count_preview_snapshot_missing';
  end if;

  begin
    v_result := public.reconcile_inventory_count_finish(p_workspace_id, p_session_id);
  exception
    when others then
      if sqlerrm like '%inventory_count_reconcile_snapshot_missing%' then
        raise exception 'inventory_count_preview_snapshot_missing';
      end if;
      raise;
  end;

  return v_result;
end;
$$;

revoke all on function public.preview_inventory_count_finish(uuid, uuid) from public;
grant execute on function public.preview_inventory_count_finish(uuid, uuid) to authenticated;

comment on function public.preview_inventory_count_finish(uuid, uuid) is
  'P8.5.1 Thin SECURITY DEFINER Finish Preview wrapper. Delegates Strategy 4 to reconcile_inventory_count_finish. Read-only; no stock mutations.';

-- =============================================================================
-- Errors:
--   unauthenticated     → inventory_count_preview_unauthenticated
--   forbidden           → inventory_count_preview_forbidden
--   workspace required  → inventory_count_preview_workspace_required
--   session required    → inventory_count_preview_session_required
--   session not found   → inventory_count_preview_session_not_found
--   workspace mismatch  → inventory_count_preview_workspace_mismatch
--   not complete        → inventory_count_preview_session_not_complete
--   snapshot missing    → inventory_count_preview_snapshot_missing
-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.preview_inventory_count_finish(uuid, uuid);
