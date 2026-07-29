-- =============================================================================
-- P8.27.2 — Inventory Import Ready Eligibility RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. supabase/inventory_import_schema.sql (P8.15.2)
--   2. supabase/inventory_import_session_staging_rpcs.sql (P8.27.1)
--   3. public.can_manage_workspace_stock(uuid)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   SECURITY DEFINER server-authoritative transition:
--     review → ready
--   Eligibility is derived from staged inventory_import_rows + session
--   confirmations. Client counters are never trusted.
--
-- Does NOT:
--   - Apply / write stock_items or stock_movements
--   - Create/stage/cancel sessions (P8.27.1)
--   - Wire wizard UI
--   - Alter inventory_import_schema.sql
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
-- =============================================================================

drop function if exists public.mark_inventory_import_session_ready(uuid, uuid);

create or replace function public.mark_inventory_import_session_ready(
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
  v_workspace_exists boolean := false;
  v_session public.inventory_import_sessions%rowtype;
  v_row public.inventory_import_rows%rowtype;
  v_confirmations jsonb := '{}'::jsonb;
  v_quantity_policy text := null;
  v_overwrite_confirmed boolean := false;
  v_name text;
  v_unit text;
  v_storage text;
  v_qty_raw text;
  v_qty numeric;
  v_matched_id uuid;
  v_matched_workspace uuid;
  v_seen_source integer[] := array[]::integer[];
  v_link_targets uuid[] := array[]::uuid[];
  v_has_link boolean := false;
  v_total integer := 0;
  v_valid integer := 0;
  v_warning integer := 0;
  v_error integer := 0;
  v_manual_review integer := 0;
  v_create integer := 0;
  v_link integer := 0;
  v_update integer := 0;
  v_skip integer := 0;
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

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
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

  -- Strict lifecycle: only review → ready.
  if v_session.status = 'draft' then
    raise exception 'inventory_import_session_not_readyable'
      using hint = 'Session status draft cannot be marked ready.';
  end if;

  if v_session.status = 'ready' then
    raise exception 'inventory_import_session_already_ready'
      using hint = 'Session is already ready.';
  end if;

  if v_session.status in ('applying', 'completed', 'cancelled') then
    raise exception 'inventory_import_session_not_readyable'
      using hint = format('Session status %s cannot be marked ready.', v_session.status);
  end if;

  if v_session.status is distinct from 'review' then
    raise exception 'inventory_import_session_not_readyable'
      using hint = format('Session status %s cannot be marked ready.', v_session.status);
  end if;

  -- Session confirmations / quantity policy (server-authoritative).
  v_confirmations := coalesce(v_session.confirmations, '{}'::jsonb);
  if jsonb_typeof(v_confirmations) <> 'object' then
    raise exception 'inventory_import_ready_confirmations_invalid'
      using hint = 'Session confirmations must be a JSON object.';
  end if;

  v_quantity_policy := nullif(btrim(coalesce(v_confirmations->>'quantityPolicy', '')), '');
  if v_quantity_policy is null
    or v_quantity_policy not in ('no_change', 'opening_stock')
  then
    raise exception 'inventory_import_ready_quantity_policy_unset'
      using hint = 'quantityPolicy must be no_change or opening_stock.';
  end if;

  v_overwrite_confirmed := coalesce(
    (v_confirmations->>'existingQuantityOverwriteConfirmed')::boolean,
    false
  );

  -- Derive eligibility from staged rows (never trust session counters).
  for v_row in
    select r.*
    from public.inventory_import_rows r
    where r.session_id = p_session_id
      and r.workspace_id = p_workspace_id
    order by r.source_row_number asc
  loop
    v_total := v_total + 1;

    if v_row.source_row_number = any (v_seen_source) then
      raise exception 'inventory_import_ready_duplicate_source_row_number'
        using hint = format('Duplicate source_row_number %s.', v_row.source_row_number);
    end if;
    v_seen_source := array_append(v_seen_source, v_row.source_row_number);

    if v_row.validation_state not in ('pending', 'valid', 'warning', 'error') then
      raise exception 'inventory_import_ready_validation_state_invalid'
        using hint = format('Row %s has invalid validation_state.', v_row.source_row_number);
    end if;

    if v_row.conflict_state not in (
      'none',
      'exact_match',
      'possible_match',
      'duplicate_in_file',
      'duplicate_previous_import',
      'ambiguous'
    ) then
      raise exception 'inventory_import_ready_conflict_state_invalid'
        using hint = format('Row %s has invalid conflict_state.', v_row.source_row_number);
    end if;

    if v_row.apply_state is distinct from 'pending' then
      raise exception 'inventory_import_ready_apply_state_invalid'
        using hint = format('Row %s apply_state must be pending before Ready.', v_row.source_row_number);
    end if;

    if v_row.proposed_action = 'update' or v_row.selected_action = 'update' then
      raise exception 'inventory_import_ready_update_action_forbidden'
        using hint = format('Row %s update action is forbidden.', v_row.source_row_number);
    end if;

    if v_row.selected_action = 'manual_review'
      or v_row.proposed_action = 'manual_review'
    then
      raise exception 'inventory_import_ready_unresolved_row'
        using hint = format('Row %s is unresolved/manual_review.', v_row.source_row_number);
    end if;

    -- Staged "blocked" evidence (conflict ambiguous without skip/create/link).
    if v_row.selected_action is null
      or v_row.selected_action not in ('create', 'link', 'skip')
    then
      raise exception 'inventory_import_ready_blocked_row'
        using hint = format('Row %s has blocked/unsupported selected_action.', v_row.source_row_number);
    end if;

    if v_row.validation_state = 'valid' then
      v_valid := v_valid + 1;
    elsif v_row.validation_state = 'warning' then
      v_warning := v_warning + 1;
    elsif v_row.validation_state = 'error' then
      v_error := v_error + 1;
    end if;

    if v_row.selected_action = 'skip' then
      v_skip := v_skip + 1;
      continue;
    end if;

    -- Applicable create/link rows must not be in error/pending validation.
    if v_row.validation_state not in ('valid', 'warning') then
      raise exception 'inventory_import_ready_row_not_valid'
        using hint = format(
          'Row %s validation_state %s cannot be marked ready.',
          v_row.source_row_number,
          v_row.validation_state
        );
    end if;

    if v_row.selected_action = 'create' then
      v_create := v_create + 1;

      v_name := nullif(btrim(coalesce(v_row.normalized_payload->>'name', '')), '');
      if v_name is null then
        raise exception 'inventory_import_ready_missing_create_name'
          using hint = format('Row %s create requires name.', v_row.source_row_number);
      end if;

      v_unit := nullif(btrim(coalesce(v_row.normalized_payload->>'unit', '')), '');
      if v_unit is null then
        raise exception 'inventory_import_ready_missing_create_unit'
          using hint = format('Row %s create requires unit.', v_row.source_row_number);
      end if;

      v_storage := nullif(btrim(coalesce(
        v_row.normalized_payload->>'locationKey',
        v_row.normalized_payload->>'storageLocation',
        ''
      )), '');
      if v_storage is null or char_length(v_storage) > 80 then
        raise exception 'inventory_import_ready_missing_create_storage'
          using hint = format('Row %s create requires storage locationKey.', v_row.source_row_number);
      end if;

    elsif v_row.selected_action = 'link' then
      v_link := v_link + 1;
      v_has_link := true;

      v_matched_id := v_row.matched_stock_item_id;
      if v_matched_id is null then
        raise exception 'inventory_import_ready_missing_link_target'
          using hint = format('Row %s link requires matched_stock_item_id.', v_row.source_row_number);
      end if;

      if v_matched_id = any (v_link_targets) then
        raise exception 'inventory_import_ready_duplicate_existing_target'
          using hint = format('Duplicate matched stock item %s.', v_matched_id);
      end if;
      v_link_targets := array_append(v_link_targets, v_matched_id);

      select si.workspace_id
      into v_matched_workspace
      from public.stock_items si
      where si.id = v_matched_id;

      if not found then
        raise exception 'inventory_import_ready_matched_item_missing'
          using hint = format('Row %s matched stock item was not found.', v_row.source_row_number);
      end if;

      if v_matched_workspace is distinct from p_workspace_id then
        raise exception 'inventory_import_ready_matched_item_workspace_mismatch'
          using hint = format(
            'Row %s matched stock item belongs to another workspace.',
            v_row.source_row_number
          );
      end if;
    end if;

    if v_quantity_policy = 'opening_stock'
      and v_row.selected_action in ('create', 'link')
    then
      v_qty_raw := nullif(btrim(coalesce(v_row.normalized_payload->>'resolvedQuantity', '')), '');
      if v_qty_raw is null then
        raise exception 'inventory_import_ready_missing_opening_quantity'
          using hint = format('Row %s opening_stock requires resolvedQuantity.', v_row.source_row_number);
      end if;

      begin
        v_qty := v_qty_raw::numeric;
      exception
        when others then
          raise exception 'inventory_import_ready_invalid_opening_quantity'
            using hint = format('Row %s resolvedQuantity is not numeric.', v_row.source_row_number);
      end;

      if v_qty is null or v_qty < 0 then
        raise exception 'inventory_import_ready_invalid_opening_quantity'
          using hint = format('Row %s resolvedQuantity must be >= 0.', v_row.source_row_number);
      end if;
    end if;
  end loop;

  if v_quantity_policy = 'opening_stock'
    and v_has_link
    and v_overwrite_confirmed is not true
  then
    raise exception 'inventory_import_ready_overwrite_unconfirmed'
      using hint = 'opening_stock with link rows requires existingQuantityOverwriteConfirmed.';
  end if;

  update public.inventory_import_sessions s
  set
    status = 'ready',
    ready_at = coalesce(s.ready_at, now()),
    total_rows = v_total,
    valid_rows = v_valid,
    warning_rows = v_warning,
    error_rows = v_error,
    manual_review_rows = v_manual_review,
    create_rows = v_create,
    link_rows = v_link,
    update_rows = v_update,
    skip_rows = v_skip,
    updated_by = v_auth_user_id,
    updated_at = now()
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  returning * into v_session;

  return jsonb_build_object(
    'session_id', v_session.id,
    'workspace_id', v_session.workspace_id,
    'status', v_session.status,
    'ready_at', v_session.ready_at,
    'quantity_policy', v_quantity_policy,
    'counters', jsonb_build_object(
      'total_rows', v_session.total_rows,
      'valid_rows', v_session.valid_rows,
      'warning_rows', v_session.warning_rows,
      'error_rows', v_session.error_rows,
      'manual_review_rows', v_session.manual_review_rows,
      'create_rows', v_session.create_rows,
      'link_rows', v_session.link_rows,
      'update_rows', v_session.update_rows,
      'skip_rows', v_session.skip_rows
    ),
    'updated_by', v_session.updated_by,
    'updated_at', v_session.updated_at
  );
end;
$$;

comment on function public.mark_inventory_import_session_ready(uuid, uuid) is
  'P8.27.2 SECURITY DEFINER review→ready eligibility gate. Derives counters from staged rows. No Apply / no stock writes.';

revoke all on function public.mark_inventory_import_session_ready(uuid, uuid) from public;
revoke all on function public.mark_inventory_import_session_ready(uuid, uuid) from anon;
grant execute on function public.mark_inventory_import_session_ready(uuid, uuid) to authenticated;
