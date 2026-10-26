-- =============================================================================
-- Staff shelf count verification (SQL NOT APPLIED)
-- =============================================================================
-- Read-only. Raises verify_failed_* when the staff shelf allowance is missing
-- or when posting was opened to staff.
-- =============================================================================

do $$
declare
  v_create text;
  v_snapshot text;
  v_item text;
  v_complete text;
  v_post text;
  v_staff boolean;
  v_edit boolean;
begin
  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'is_workspace_staff_counter'
  ) into v_staff;
  if v_staff is distinct from true then
    raise exception 'verify_failed_staff_counter_helper';
  end if;

  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'can_staff_edit_shelf_count'
  ) into v_edit;
  if v_edit is distinct from true then
    raise exception 'verify_failed_staff_edit_helper';
  end if;

  v_create := pg_get_functiondef('public.create_inventory_count_session(uuid, text, text, boolean, boolean, text, text[])'::regprocedure);
  v_snapshot := pg_get_functiondef('public.build_inventory_count_snapshot(uuid, uuid)'::regprocedure);
  v_item := pg_get_functiondef('public.update_inventory_count_session_item(uuid, uuid, uuid, numeric)'::regprocedure);
  v_complete := pg_get_functiondef('public.complete_inventory_count_location(uuid, uuid, uuid)'::regprocedure);
  v_post := pg_get_functiondef('public.post_inventory_count_finish(uuid, uuid)'::regprocedure);

  if v_create is null or v_create not ilike '%is_workspace_staff_counter%' then
    raise exception 'verify_failed_staff_create';
  end if;
  if v_create not ilike '%v_location_count <> 1%' then
    raise exception 'verify_failed_staff_create_one_shelf';
  end if;
  if v_snapshot is null or v_snapshot not ilike '%can_staff_edit_shelf_count%' then
    raise exception 'verify_failed_staff_snapshot';
  end if;
  if v_item is null or v_item not ilike '%can_staff_edit_shelf_count%' then
    raise exception 'verify_failed_staff_item';
  end if;
  if v_complete is null or v_complete not ilike '%can_staff_edit_shelf_count%' then
    raise exception 'verify_failed_staff_complete';
  end if;
  if v_post ilike '%can_staff_edit_shelf_count%' or v_post ilike '%is_workspace_staff_counter%' then
    raise exception 'verify_failed_staff_post_opened';
  end if;
end $$;
