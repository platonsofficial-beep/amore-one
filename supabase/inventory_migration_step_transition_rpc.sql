-- =============================================================================
-- P7.8.2 — Inventory Migration Session Step Transition RPC foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_migration_sessions.sql (P7.7.4)
--   2. inventory_migration_session_steps.sql (P7.8.0)
--   3. inventory_migration_start_session_rpc.sql (P7.8.1 bootstrap)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER state transitions for one session step at a time:
--     waiting → running
--     running → completed
--   Enforces canonical ordering and a single running step per session.
--   Authenticated clients must not UPDATE steps directly (no client UPDATE policy).
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
--
-- Denied:
--   host / staff / anonymous / wrong workspace
--
-- Does NOT:
--   - Execute migration SQL
--   - Touch inventory_stock_item_map / stock_items / stock_movements
--   - Write activity rows
--   - Start / complete / cancel sessions
--   - Change UI, Operator, Health, Audit Evidence, or services
--   - Change grants beyond this RPC / create client write policies
--
-- Concurrency:
--   1. Lock the session row FOR UPDATE (session-level mutex)
--   2. Lock all session step rows FOR UPDATE in canonical order
--   3. Validate prerequisites + single-running-step
--   4. Update the target step only
--   Session FOR UPDATE serializes concurrent transitions for the same session,
--   so two waiting→running races cannot both succeed without a partial unique index.
--
-- Ordering examples:
--   foundation may run first without a predecessor.
--   persist may run only after foundation = completed.
--   auto_link may run only after foundation and persist are completed.
--   phase2 may run only after every prior step through phase1 is completed.
-- =============================================================================

drop function if exists public.transition_inventory_migration_step(uuid, uuid, text, text);

create or replace function public.transition_inventory_migration_step(
  p_workspace_id uuid,
  p_session_id uuid,
  p_step_name text,
  p_target_status text
)
returns setof public.inventory_migration_session_steps
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_workspace_exists boolean := false;
  v_session public.inventory_migration_sessions%rowtype;
  v_step public.inventory_migration_session_steps%rowtype;
  v_step_name text := nullif(btrim(coalesce(p_step_name, '')), '');
  v_target_status text := nullif(btrim(coalesce(p_target_status, '')), '');
  v_step_index integer := null;
  v_pred_incomplete boolean := false;
  v_other_running boolean := false;
  v_canonical_steps text[] := array[
    'foundation',
    'persist',
    'auto_link',
    'auto_create',
    'integrity_audit',
    'preflight',
    'preview',
    'phase1',
    'phase2',
    'post_apply_audit'
  ];
begin
  if v_auth_user_id is null then
    raise exception 'inventory_migration_step_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_migration_step_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_migration_step_session_required';
  end if;

  if v_step_name is null then
    raise exception 'inventory_migration_step_name_required';
  end if;

  if v_target_status is null then
    raise exception 'inventory_migration_step_target_status_required';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'inventory_migration_step_workspace_not_found';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_migration_step_forbidden';
  end if;

  -- Canonical name + target status validation before locks (fail fast).
  select i.ordinality::integer
  into v_step_index
  from unnest(v_canonical_steps) with ordinality as i(step_name, ordinality)
  where i.step_name = v_step_name
  limit 1;

  if v_step_index is null then
    raise exception 'inventory_migration_step_invalid_name';
  end if;

  if v_target_status not in ('running', 'completed') then
    raise exception 'inventory_migration_step_invalid_target_status';
  end if;

  -- Lock order 1: session row (session-level mutex for all step transitions).
  select s.*
  into v_session
  from public.inventory_migration_sessions s
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'inventory_migration_step_session_not_found';
  end if;

  if v_session.status is distinct from 'running' then
    raise exception 'inventory_migration_step_session_not_running';
  end if;

  -- Lock order 2: all session steps in canonical order (deterministic).
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
    and st.step_name = v_step_name;

  if not found then
    raise exception 'inventory_migration_step_not_found';
  end if;

  -- Transition matrix (completed is immutable; waiting is never a target).
  if v_target_status = 'running' then
    if v_step.status is distinct from 'waiting' then
      raise exception 'inventory_migration_step_invalid_transition';
    end if;

    if v_step.started_at is not null or v_step.completed_at is not null then
      raise exception 'inventory_migration_step_invalid_transition';
    end if;

    -- Prerequisites: every earlier canonical step must be completed.
    if v_step_index > 1 then
      select exists (
        select 1
        from unnest(v_canonical_steps[1:v_step_index - 1]) as pred(step_name)
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
        raise exception 'inventory_migration_step_prerequisite_incomplete';
      end if;
    end if;

    -- Single-running-step: no other step in this session may already be running.
    select exists (
      select 1
      from public.inventory_migration_session_steps st
      where st.session_id = p_session_id
        and st.workspace_id = p_workspace_id
        and st.status = 'running'
        and st.step_name is distinct from v_step_name
    )
    into v_other_running;

    if v_other_running then
      raise exception 'inventory_migration_step_another_step_running';
    end if;

    update public.inventory_migration_session_steps st
    set
      status = 'running',
      started_at = now()
    where st.id = v_step.id
    returning * into v_step;

  elsif v_target_status = 'completed' then
    if v_step.status is distinct from 'running' then
      raise exception 'inventory_migration_step_invalid_transition';
    end if;

    if v_step.started_at is null or v_step.completed_at is not null then
      raise exception 'inventory_migration_step_invalid_transition';
    end if;

    -- Preserve started_at; set only status + completed_at.
    update public.inventory_migration_session_steps st
    set
      status = 'completed',
      completed_at = now()
    where st.id = v_step.id
    returning * into v_step;

  else
    raise exception 'inventory_migration_step_invalid_target_status';
  end if;

  return next v_step;
end;
$$;

revoke all on function public.transition_inventory_migration_step(uuid, uuid, text, text) from public;
revoke all on function public.transition_inventory_migration_step(uuid, uuid, text, text) from anon;
grant execute on function public.transition_inventory_migration_step(uuid, uuid, text, text) to authenticated;

comment on function public.transition_inventory_migration_step(uuid, uuid, text, text) is
  'P7.8.2 SECURITY DEFINER waiting→running / running→completed for one session step. No migration execution. No activity writes.';

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- Function present
-- select pg_get_functiondef(
--   'public.transition_inventory_migration_step(uuid,uuid,text,text)'::regprocedure
-- );

-- Grants (expect authenticated EXECUTE; no public / anon)
-- select grantee, privilege_type
-- from information_schema.routine_privileges
-- where routine_schema = 'public'
--   and routine_name = 'transition_inventory_migration_step';

-- Manual matrix:
--   owner / general_manager / manager → valid transitions succeed
--   host / staff                     → inventory_migration_step_forbidden
--   anonymous                        → inventory_migration_step_unauthenticated
--   completed/cancelled session      → inventory_migration_step_session_not_running
--   waiting → completed              → inventory_migration_step_invalid_transition
--   predecessor incomplete           → inventory_migration_step_prerequisite_incomplete
--   another step running             → inventory_migration_step_another_step_running
--
-- Example:
--   select * from public.transition_inventory_migration_step(
--     '<workspace>', '<session>', 'foundation', 'completed'
--   );
--   select * from public.transition_inventory_migration_step(
--     '<workspace>', '<session>', 'persist', 'running'
--   );

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.transition_inventory_migration_step(uuid, uuid, text, text);
