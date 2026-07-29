-- =============================================================================
-- P8.27.1 — Inventory Import Session Staging RPC Foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. supabase/inventory_import_schema.sql (P8.15.2)
--   2. public.can_manage_workspace_stock(uuid) / public.is_workspace_member(uuid)
--   3. public.stock_items (matched_stock_item_id workspace checks)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   SECURITY DEFINER staging lifecycle for reviewed Spreadsheet Import payloads:
--     - create_inventory_import_session
--     - stage_inventory_import_rows
--     - cancel_inventory_import_session
--
-- Does NOT:
--   - Mark ready
--   - Apply / write stock_items or stock_movements
--   - Upload file bytes
--   - Change inventory_import_schema.sql
--   - Wire wizard UI
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_inventory_import_session
-- -----------------------------------------------------------------------------
drop function if exists public.create_inventory_import_session(
  uuid, text, text, bigint, text, text, integer, text, text, text, text, jsonb, jsonb, jsonb, text
);

create or replace function public.create_inventory_import_session(
  p_workspace_id uuid,
  p_source_filename text,
  p_source_format text default null,
  p_source_file_size_bytes bigint default null,
  p_source_fingerprint text default null,
  p_selected_sheet text default '',
  p_header_row_number integer default null,
  p_parser_version text default null,
  p_normalization_version text default null,
  p_validation_version text default null,
  p_contract_version text default 'import_v1.0',
  p_mapping jsonb default '{}'::jsonb,
  p_confirmations jsonb default '{}'::jsonb,
  p_source_metadata jsonb default '{}'::jsonb,
  p_staging_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_workspace_exists boolean := false;
  v_filename text := '';
  v_format text := null;
  v_fingerprint text := null;
  v_sheet text := '';
  v_contract text := '';
  v_parser text := null;
  v_normalization text := null;
  v_validation text := null;
  v_mapping jsonb := '{}'::jsonb;
  v_confirmations jsonb := '{}'::jsonb;
  v_source_metadata jsonb := '{}'::jsonb;
  v_session public.inventory_import_sessions%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'inventory_import_session_unauthenticated'
      using hint = 'Sign in required.';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_import_session_workspace_required'
      using hint = 'workspace_id is required.';
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

  v_filename := btrim(coalesce(p_source_filename, ''));
  if length(v_filename) = 0 then
    raise exception 'inventory_import_session_source_filename_required';
  end if;

  if p_source_format is not null then
    v_format := lower(btrim(p_source_format));
    if v_format not in ('csv', 'xlsx') then
      raise exception 'inventory_import_session_source_format_invalid';
    end if;
  end if;

  if p_source_file_size_bytes is not null and p_source_file_size_bytes < 0 then
    raise exception 'inventory_import_session_source_file_size_invalid';
  end if;

  if p_source_fingerprint is not null then
    v_fingerprint := btrim(p_source_fingerprint);
    if length(v_fingerprint) = 0 then
      raise exception 'inventory_import_session_source_fingerprint_invalid';
    end if;
  end if;

  v_sheet := coalesce(p_selected_sheet, '');

  if p_header_row_number is not null and p_header_row_number <= 0 then
    raise exception 'inventory_import_session_header_row_number_invalid';
  end if;

  v_contract := nullif(btrim(coalesce(p_contract_version, '')), '');
  if v_contract is null then
    v_contract := 'import_v1.0';
  end if;

  if p_parser_version is not null then
    v_parser := nullif(btrim(p_parser_version), '');
    if v_parser is null then
      raise exception 'inventory_import_session_parser_version_invalid';
    end if;
  end if;

  if p_normalization_version is not null then
    v_normalization := nullif(btrim(p_normalization_version), '');
    if v_normalization is null then
      raise exception 'inventory_import_session_normalization_version_invalid';
    end if;
  end if;

  if p_validation_version is not null then
    v_validation := nullif(btrim(p_validation_version), '');
    if v_validation is null then
      raise exception 'inventory_import_session_validation_version_invalid';
    end if;
  end if;

  if p_mapping is null or jsonb_typeof(p_mapping) <> 'object' then
    raise exception 'inventory_import_session_mapping_invalid';
  end if;
  v_mapping := p_mapping;

  if p_confirmations is null or jsonb_typeof(p_confirmations) <> 'object' then
    raise exception 'inventory_import_session_confirmations_invalid';
  end if;
  v_confirmations := p_confirmations;

  if p_source_metadata is null or jsonb_typeof(p_source_metadata) <> 'object' then
    raise exception 'inventory_import_session_source_metadata_invalid';
  end if;
  v_source_metadata := p_source_metadata;

  if p_staging_version is not null and length(btrim(p_staging_version)) > 0 then
    v_source_metadata := v_source_metadata
      || jsonb_build_object('stagingVersion', btrim(p_staging_version));
  end if;

  insert into public.inventory_import_sessions (
    workspace_id,
    created_by,
    updated_by,
    source_filename,
    source_format,
    source_file_size_bytes,
    source_fingerprint,
    selected_sheet,
    header_row_number,
    contract_version,
    parser_version,
    normalization_version,
    validation_version,
    mapping,
    confirmations,
    source_metadata,
    status
  )
  values (
    p_workspace_id,
    v_auth_user_id,
    v_auth_user_id,
    v_filename,
    v_format,
    p_source_file_size_bytes,
    v_fingerprint,
    v_sheet,
    p_header_row_number,
    v_contract,
    v_parser,
    v_normalization,
    v_validation,
    v_mapping,
    v_confirmations,
    v_source_metadata,
    'draft'
  )
  returning * into v_session;

  return jsonb_build_object(
    'session_id', v_session.id,
    'workspace_id', v_session.workspace_id,
    'status', v_session.status,
    'source_filename', v_session.source_filename,
    'source_format', v_session.source_format,
    'source_file_size_bytes', v_session.source_file_size_bytes,
    'source_fingerprint', v_session.source_fingerprint,
    'selected_sheet', v_session.selected_sheet,
    'header_row_number', v_session.header_row_number,
    'contract_version', v_session.contract_version,
    'parser_version', v_session.parser_version,
    'normalization_version', v_session.normalization_version,
    'validation_version', v_session.validation_version,
    'mapping', v_session.mapping,
    'confirmations', v_session.confirmations,
    'source_metadata', v_session.source_metadata,
    'total_rows', v_session.total_rows,
    'valid_rows', v_session.valid_rows,
    'warning_rows', v_session.warning_rows,
    'error_rows', v_session.error_rows,
    'manual_review_rows', v_session.manual_review_rows,
    'create_rows', v_session.create_rows,
    'link_rows', v_session.link_rows,
    'update_rows', v_session.update_rows,
    'skip_rows', v_session.skip_rows,
    'created_by', v_session.created_by,
    'updated_by', v_session.updated_by,
    'created_at', v_session.created_at,
    'updated_at', v_session.updated_at
  );
end;
$$;

comment on function public.create_inventory_import_session(
  uuid, text, text, bigint, text, text, integer, text, text, text, text, jsonb, jsonb, jsonb, text
) is
  'P8.27.1 SECURITY DEFINER create inventory import session as draft. Manager-only. No Apply.';

revoke all on function public.create_inventory_import_session(
  uuid, text, text, bigint, text, text, integer, text, text, text, text, jsonb, jsonb, jsonb, text
) from public;
revoke all on function public.create_inventory_import_session(
  uuid, text, text, bigint, text, text, integer, text, text, text, text, jsonb, jsonb, jsonb, text
) from anon;
grant execute on function public.create_inventory_import_session(
  uuid, text, text, bigint, text, text, integer, text, text, text, text, jsonb, jsonb, jsonb, text
) to authenticated;

-- -----------------------------------------------------------------------------
-- stage_inventory_import_rows
-- -----------------------------------------------------------------------------
drop function if exists public.stage_inventory_import_rows(uuid, uuid, jsonb);

create or replace function public.stage_inventory_import_rows(
  p_workspace_id uuid,
  p_session_id uuid,
  p_rows jsonb
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
  v_row jsonb;
  v_index integer := 0;
  v_source_row_number integer;
  v_seen_numbers integer[] := array[]::integer[];
  v_raw jsonb;
  v_normalized jsonb;
  v_mapping_evidence jsonb;
  v_validation_state text;
  v_conflict_state text;
  v_proposed_action text;
  v_selected_action text;
  v_matched_id uuid;
  v_confirm_qty boolean;
  v_confirm_fallback boolean;
  v_apply_state text;
  v_validation_messages jsonb;
  v_conflict_evidence jsonb;
  v_source_fingerprint text;
  v_validation_version text;
  v_matched_workspace uuid;
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
    -- Distinguish missing vs cross-workspace when possible.
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

  if v_session.status in ('ready', 'applying', 'completed', 'cancelled') then
    raise exception 'inventory_import_session_not_editable'
      using hint = format('Session status %s cannot be restaged.', v_session.status);
  end if;

  if v_session.status not in ('draft', 'review', 'failed') then
    raise exception 'inventory_import_session_not_editable'
      using hint = format('Session status %s cannot be restaged.', v_session.status);
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'inventory_import_rows_payload_must_be_array';
  end if;

  -- Validate the full payload before mutating any staged rows.
  for v_row in
    select value
    from jsonb_array_elements(p_rows)
  loop
    v_index := v_index + 1;

    if jsonb_typeof(v_row) <> 'object' then
      raise exception 'inventory_import_row_must_be_object'
        using hint = format('Row at index %s must be a JSON object.', v_index);
    end if;

    begin
      v_source_row_number := (v_row->>'source_row_number')::integer;
    exception
      when others then
        raise exception 'inventory_import_row_source_row_number_invalid'
          using hint = format('Row at index %s has invalid source_row_number.', v_index);
    end;

    if v_source_row_number is null or v_source_row_number <= 0 then
      raise exception 'inventory_import_row_source_row_number_invalid'
        using hint = format('Row at index %s source_row_number must be > 0.', v_index);
    end if;

    if v_source_row_number = any (v_seen_numbers) then
      raise exception 'inventory_import_row_duplicate_source_row_number'
        using hint = format('Duplicate source_row_number %s.', v_source_row_number);
    end if;
    v_seen_numbers := array_append(v_seen_numbers, v_source_row_number);

    v_raw := coalesce(v_row->'raw_payload', '{}'::jsonb);
    if jsonb_typeof(v_raw) <> 'object' then
      raise exception 'inventory_import_row_raw_payload_invalid'
        using hint = format('Row %s raw_payload must be an object.', v_source_row_number);
    end if;

    v_normalized := coalesce(v_row->'normalized_payload', '{}'::jsonb);
    if jsonb_typeof(v_normalized) <> 'object' then
      raise exception 'inventory_import_row_normalized_payload_invalid'
        using hint = format('Row %s normalized_payload must be an object.', v_source_row_number);
    end if;

    v_mapping_evidence := coalesce(v_row->'mapping_evidence', '{}'::jsonb);
    if jsonb_typeof(v_mapping_evidence) <> 'object' then
      raise exception 'inventory_import_row_mapping_evidence_invalid'
        using hint = format('Row %s mapping_evidence must be an object.', v_source_row_number);
    end if;

    v_validation_state := coalesce(nullif(btrim(v_row->>'validation_state'), ''), 'pending');
    if v_validation_state not in ('pending', 'valid', 'warning', 'error') then
      raise exception 'inventory_import_row_validation_state_invalid'
        using hint = format('Row %s has invalid validation_state.', v_source_row_number);
    end if;

    v_conflict_state := coalesce(nullif(btrim(v_row->>'conflict_state'), ''), 'none');
    if v_conflict_state not in (
      'none',
      'exact_match',
      'possible_match',
      'duplicate_in_file',
      'duplicate_previous_import',
      'ambiguous'
    ) then
      raise exception 'inventory_import_row_conflict_state_invalid'
        using hint = format('Row %s has invalid conflict_state.', v_source_row_number);
    end if;

    v_proposed_action := nullif(btrim(v_row->>'proposed_action'), '');
    v_selected_action := nullif(btrim(v_row->>'selected_action'), '');

    if v_proposed_action is not null and v_proposed_action not in (
      'create', 'link', 'update', 'skip', 'manual_review'
    ) then
      raise exception 'inventory_import_row_proposed_action_invalid'
        using hint = format('Row %s has invalid proposed_action.', v_source_row_number);
    end if;

    if v_selected_action is not null and v_selected_action not in (
      'create', 'link', 'update', 'skip', 'manual_review'
    ) then
      raise exception 'inventory_import_row_selected_action_invalid'
        using hint = format('Row %s has invalid selected_action.', v_source_row_number);
    end if;

    if v_proposed_action = 'update' or v_selected_action = 'update' then
      raise exception 'inventory_import_row_update_action_forbidden'
        using hint = format('Row %s update action is forbidden in Import V1.', v_source_row_number);
    end if;

    v_apply_state := coalesce(nullif(btrim(v_row->>'apply_state'), ''), 'pending');
    if v_apply_state <> 'pending' then
      raise exception 'inventory_import_row_apply_state_invalid'
        using hint = format('Row %s apply_state must be pending during staging.', v_source_row_number);
    end if;

    v_confirm_qty := coalesce((v_row->>'confirm_quantity_update')::boolean, false);
    v_confirm_fallback := coalesce((v_row->>'confirm_location_fallback')::boolean, false);

    v_validation_messages := coalesce(v_row->'validation_messages', '[]'::jsonb);
    if jsonb_typeof(v_validation_messages) <> 'array' then
      raise exception 'inventory_import_row_validation_messages_invalid'
        using hint = format('Row %s validation_messages must be an array.', v_source_row_number);
    end if;

    v_conflict_evidence := coalesce(v_row->'conflict_evidence', '{}'::jsonb);
    if jsonb_typeof(v_conflict_evidence) <> 'object' then
      raise exception 'inventory_import_row_conflict_evidence_invalid'
        using hint = format('Row %s conflict_evidence must be an object.', v_source_row_number);
    end if;

    v_source_fingerprint := coalesce(v_row->>'source_fingerprint', '');
    if v_source_fingerprint is distinct from btrim(v_source_fingerprint) then
      raise exception 'inventory_import_row_source_fingerprint_invalid'
        using hint = format('Row %s source_fingerprint cannot be outer-padded.', v_source_row_number);
    end if;
    if v_source_fingerprint <> '' and length(btrim(v_source_fingerprint)) = 0 then
      raise exception 'inventory_import_row_source_fingerprint_invalid';
    end if;

    v_validation_version := nullif(btrim(coalesce(v_row->>'validation_version', '')), '');

    v_matched_id := null;
    if v_row ? 'matched_stock_item_id'
      and v_row->>'matched_stock_item_id' is not null
      and btrim(v_row->>'matched_stock_item_id') <> ''
      and btrim(v_row->>'matched_stock_item_id') <> 'null'
    then
      begin
        v_matched_id := (v_row->>'matched_stock_item_id')::uuid;
      exception
        when others then
          raise exception 'inventory_import_row_matched_item_invalid'
            using hint = format('Row %s matched_stock_item_id is not a uuid.', v_source_row_number);
      end;

      select si.workspace_id
      into v_matched_workspace
      from public.stock_items si
      where si.id = v_matched_id;

      if not found then
        raise exception 'inventory_import_row_matched_item_missing'
          using hint = format('Row %s matched stock item was not found.', v_source_row_number);
      end if;

      if v_matched_workspace is distinct from p_workspace_id then
        raise exception 'inventory_import_row_matched_item_workspace_mismatch'
          using hint = format('Row %s matched stock item belongs to another workspace.', v_source_row_number);
      end if;
    end if;
  end loop;

  -- Atomic replace: delete existing staged rows, then insert validated payload.
  delete from public.inventory_import_rows r
  where r.session_id = p_session_id
    and r.workspace_id = p_workspace_id;

  for v_row in
    select value
    from jsonb_array_elements(p_rows)
  loop
    v_source_row_number := (v_row->>'source_row_number')::integer;
    v_raw := coalesce(v_row->'raw_payload', '{}'::jsonb);
    v_normalized := coalesce(v_row->'normalized_payload', '{}'::jsonb);
    v_mapping_evidence := coalesce(v_row->'mapping_evidence', '{}'::jsonb);
    v_validation_state := coalesce(nullif(btrim(v_row->>'validation_state'), ''), 'pending');
    v_conflict_state := coalesce(nullif(btrim(v_row->>'conflict_state'), ''), 'none');
    v_proposed_action := nullif(btrim(v_row->>'proposed_action'), '');
    v_selected_action := nullif(btrim(v_row->>'selected_action'), '');
    v_confirm_qty := coalesce((v_row->>'confirm_quantity_update')::boolean, false);
    v_confirm_fallback := coalesce((v_row->>'confirm_location_fallback')::boolean, false);
    v_apply_state := 'pending';
    v_validation_messages := coalesce(v_row->'validation_messages', '[]'::jsonb);
    v_conflict_evidence := coalesce(v_row->'conflict_evidence', '{}'::jsonb);
    v_source_fingerprint := coalesce(v_row->>'source_fingerprint', '');
    v_validation_version := nullif(btrim(coalesce(v_row->>'validation_version', '')), '');

    v_matched_id := null;
    if v_row ? 'matched_stock_item_id'
      and v_row->>'matched_stock_item_id' is not null
      and btrim(v_row->>'matched_stock_item_id') <> ''
      and btrim(v_row->>'matched_stock_item_id') <> 'null'
    then
      v_matched_id := (v_row->>'matched_stock_item_id')::uuid;
    end if;

    insert into public.inventory_import_rows (
      session_id,
      workspace_id,
      source_row_number,
      raw_payload,
      normalized_payload,
      mapping_evidence,
      source_fingerprint,
      validation_state,
      validation_messages,
      validation_version,
      conflict_state,
      conflict_evidence,
      matched_stock_item_id,
      proposed_action,
      selected_action,
      confirm_quantity_update,
      confirm_location_fallback,
      apply_state
    )
    values (
      p_session_id,
      p_workspace_id,
      v_source_row_number,
      v_raw,
      v_normalized,
      v_mapping_evidence,
      v_source_fingerprint,
      v_validation_state,
      v_validation_messages,
      v_validation_version,
      v_conflict_state,
      v_conflict_evidence,
      v_matched_id,
      v_proposed_action,
      v_selected_action,
      v_confirm_qty,
      v_confirm_fallback,
      v_apply_state
    );

    v_total := v_total + 1;

    if v_validation_state = 'valid' then
      v_valid := v_valid + 1;
    elsif v_validation_state = 'warning' then
      v_warning := v_warning + 1;
    elsif v_validation_state = 'error' then
      v_error := v_error + 1;
    end if;

    if v_selected_action = 'create' then
      v_create := v_create + 1;
    elsif v_selected_action = 'link' then
      v_link := v_link + 1;
    elsif v_selected_action = 'update' then
      v_update := v_update + 1;
    elsif v_selected_action = 'skip' then
      v_skip := v_skip + 1;
    elsif v_selected_action = 'manual_review' then
      v_manual_review := v_manual_review + 1;
    end if;
  end loop;

  update public.inventory_import_sessions s
  set
    status = 'review',
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
    'staged_row_count', v_total,
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

comment on function public.stage_inventory_import_rows(uuid, uuid, jsonb) is
  'P8.27.1 SECURITY DEFINER atomic replace of inventory_import_rows. Derives counters server-side. Status→review. No Apply / no stock writes.';

revoke all on function public.stage_inventory_import_rows(uuid, uuid, jsonb) from public;
revoke all on function public.stage_inventory_import_rows(uuid, uuid, jsonb) from anon;
grant execute on function public.stage_inventory_import_rows(uuid, uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- cancel_inventory_import_session
-- -----------------------------------------------------------------------------
drop function if exists public.cancel_inventory_import_session(uuid, uuid);

create or replace function public.cancel_inventory_import_session(
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

  -- Idempotent replay for already cancelled sessions.
  if v_session.status = 'cancelled' then
    return jsonb_build_object(
      'session_id', v_session.id,
      'workspace_id', v_session.workspace_id,
      'status', v_session.status,
      'cancelled_at', v_session.cancelled_at,
      'updated_by', v_session.updated_by,
      'updated_at', v_session.updated_at,
      'idempotent', true
    );
  end if;

  if v_session.status in ('applying', 'completed') then
    raise exception 'inventory_import_session_not_cancellable'
      using hint = format('Session status %s cannot be cancelled.', v_session.status);
  end if;

  if v_session.status not in ('draft', 'review', 'ready', 'failed') then
    raise exception 'inventory_import_session_not_cancellable'
      using hint = format('Session status %s cannot be cancelled.', v_session.status);
  end if;

  update public.inventory_import_sessions s
  set
    status = 'cancelled',
    cancelled_at = coalesce(s.cancelled_at, now()),
    updated_by = v_auth_user_id,
    updated_at = now()
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  returning * into v_session;

  -- Preserve staged rows / session evidence — no deletes.
  return jsonb_build_object(
    'session_id', v_session.id,
    'workspace_id', v_session.workspace_id,
    'status', v_session.status,
    'cancelled_at', v_session.cancelled_at,
    'updated_by', v_session.updated_by,
    'updated_at', v_session.updated_at,
    'idempotent', false
  );
end;
$$;

comment on function public.cancel_inventory_import_session(uuid, uuid) is
  'P8.27.1 SECURITY DEFINER cancel unfinished import session. Preserves session/rows. No Apply.';

revoke all on function public.cancel_inventory_import_session(uuid, uuid) from public;
revoke all on function public.cancel_inventory_import_session(uuid, uuid) from anon;
grant execute on function public.cancel_inventory_import_session(uuid, uuid) to authenticated;
