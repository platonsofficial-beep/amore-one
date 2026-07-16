-- =============================================================================
-- P7.9.4 — Inventory Migration Stage Attention Acknowledgements foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_migration_sessions.sql
--   2. inventory_migration_session_steps.sql
--   3. inventory_migration_step_results.sql
--   4. inventory_migration_activity.sql
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Durable immutable acknowledgements for the three V1 attention boundaries:
--     integrity_audit → preflight
--     preview → phase1
--     phase1 → phase2
--   When a prior stage result is attention_required, an authorized stock manager
--   must explicitly acknowledge before a later sprint may allow the next stage.
--
-- This script:
--   - Creates public.inventory_migration_stage_attention_acknowledgements
--   - Adds uniqueness, indexes, SELECT-only RLS
--   - Creates SECURITY DEFINER acknowledge RPC (only write path)
--
-- Does NOT:
--   - Enforce stage RPC prerequisites (later sprint)
--   - Modify stage / finish / transition RPCs
--   - Alter sessions / steps / results / activity schemas
--   - Create UI / Operator wiring
--   - Allow acknowledgement of post_apply_audit or session completion
--
-- Acknowledgement is NOT a force override and does not change result_status.
-- =============================================================================

-- Ensure Stock permission helpers exist (idempotent).
create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.auth_user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_workspace_stock(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.auth_user_id = auth.uid()
      and wm.role in ('owner', 'general_manager', 'manager')
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.can_manage_workspace_stock(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_manage_workspace_stock(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Table (immutable — no updated_at)
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_migration_stage_attention_acknowledgements (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  session_id uuid not null
    references public.inventory_migration_sessions(id) on delete cascade,

  prior_step_id uuid not null
    references public.inventory_migration_session_steps(id) on delete cascade,

  prior_result_id uuid not null
    references public.inventory_migration_step_results(id) on delete cascade,

  prior_step_name text not null,
  next_step_id uuid not null
    references public.inventory_migration_session_steps(id) on delete cascade,

  next_step_name text not null,

  acknowledged_by uuid
    references auth.users(id) on delete set null,

  operator_display_name text not null default '',

  note text null,

  acknowledged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint inventory_migration_ack_boundary_chk
    check (
      (prior_step_name = 'integrity_audit' and next_step_name = 'preflight')
      or (prior_step_name = 'preview' and next_step_name = 'phase1')
      or (prior_step_name = 'phase1' and next_step_name = 'phase2')
    ),

  constraint inventory_migration_ack_prior_result_next_uidx
    unique (prior_result_id, next_step_name),

  constraint inventory_migration_ack_session_prior_step_fkey
    foreign key (session_id, prior_step_name)
    references public.inventory_migration_session_steps (session_id, step_name)
    on delete cascade,

  constraint inventory_migration_ack_session_next_step_fkey
    foreign key (session_id, next_step_name)
    references public.inventory_migration_session_steps (session_id, step_name)
    on delete cascade
);

comment on table public.inventory_migration_stage_attention_acknowledgements is
  'P7.9.4 immutable attention acknowledgements for three V1 stage boundaries. Not a force override. No client writes.';

comment on column public.inventory_migration_stage_attention_acknowledgements.note is
  'Optional operator note. Empty input stored as null.';

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
create index if not exists inventory_migration_ack_workspace_idx
  on public.inventory_migration_stage_attention_acknowledgements (workspace_id);

create index if not exists inventory_migration_ack_session_idx
  on public.inventory_migration_stage_attention_acknowledgements (session_id);

create index if not exists inventory_migration_ack_prior_result_idx
  on public.inventory_migration_stage_attention_acknowledgements (prior_result_id);

create index if not exists inventory_migration_ack_acknowledged_at_idx
  on public.inventory_migration_stage_attention_acknowledgements (acknowledged_at desc);

-- -----------------------------------------------------------------------------
-- Privileges + RLS (SELECT only for stock managers)
-- -----------------------------------------------------------------------------
alter table public.inventory_migration_stage_attention_acknowledgements
  enable row level security;

revoke all on table public.inventory_migration_stage_attention_acknowledgements from public;
revoke all on table public.inventory_migration_stage_attention_acknowledgements from anon;
revoke all on table public.inventory_migration_stage_attention_acknowledgements from authenticated;
grant select on table public.inventory_migration_stage_attention_acknowledgements to authenticated;

drop policy if exists inventory_migration_ack_select_managers
  on public.inventory_migration_stage_attention_acknowledgements;
drop policy if exists inventory_migration_ack_insert_managers
  on public.inventory_migration_stage_attention_acknowledgements;
drop policy if exists inventory_migration_ack_update_managers
  on public.inventory_migration_stage_attention_acknowledgements;
drop policy if exists inventory_migration_ack_delete_managers
  on public.inventory_migration_stage_attention_acknowledgements;

create policy inventory_migration_ack_select_managers
  on public.inventory_migration_stage_attention_acknowledgements
  for select
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

-- Intentionally no INSERT / UPDATE / DELETE policies for authenticated or anon.
-- Writes only via SECURITY DEFINER acknowledge RPC below.

-- -----------------------------------------------------------------------------
-- Acknowledge RPC (only write path)
-- -----------------------------------------------------------------------------
drop function if exists public.acknowledge_inventory_migration_stage_attention(
  uuid, uuid, uuid, text, text
);

create or replace function public.acknowledge_inventory_migration_stage_attention(
  p_workspace_id uuid,
  p_session_id uuid,
  p_prior_result_id uuid,
  p_next_step_name text,
  p_note text default null
)
returns setof public.inventory_migration_stage_attention_acknowledgements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_workspace_exists boolean := false;
  v_operator_display_name text := '';
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_next_step_name text := nullif(btrim(coalesce(p_next_step_name, '')), '');
  v_session public.inventory_migration_sessions%rowtype;
  v_prior_result public.inventory_migration_step_results%rowtype;
  v_prior_step public.inventory_migration_session_steps%rowtype;
  v_next_step public.inventory_migration_session_steps%rowtype;
  v_existing public.inventory_migration_stage_attention_acknowledgements%rowtype;
  v_ack public.inventory_migration_stage_attention_acknowledgements%rowtype;
  v_activity_text text;
begin
  if v_auth_user_id is null then
    raise exception 'inventory_migration_ack_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_migration_ack_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_migration_ack_session_required';
  end if;

  if p_prior_result_id is null then
    raise exception 'inventory_migration_ack_prior_result_required';
  end if;

  if v_next_step_name is null then
    raise exception 'inventory_migration_ack_next_step_required';
  end if;

  if v_next_step_name not in ('preflight', 'phase1', 'phase2') then
    raise exception 'inventory_migration_ack_invalid_boundary';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'inventory_migration_ack_workspace_not_found';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_migration_ack_forbidden';
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

  -- Lock order 1: session.
  select s.*
  into v_session
  from public.inventory_migration_sessions s
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'inventory_migration_ack_session_not_found';
  end if;

  if v_session.status is distinct from 'running' then
    raise exception 'inventory_migration_ack_session_not_running';
  end if;

  -- Lock order 2: all session steps (canonical order).
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

  select r.*
  into v_prior_result
  from public.inventory_migration_step_results r
  where r.id = p_prior_result_id
  for update;

  if not found then
    raise exception 'inventory_migration_ack_prior_result_not_found';
  end if;

  if v_prior_result.workspace_id is distinct from p_workspace_id
     or v_prior_result.session_id is distinct from p_session_id then
    raise exception 'inventory_migration_ack_prior_result_inconsistent';
  end if;

  if v_prior_result.result_status is distinct from 'attention_required' then
    raise exception 'inventory_migration_ack_prior_result_not_attention';
  end if;

  select st.*
  into v_prior_step
  from public.inventory_migration_session_steps st
  where st.id = v_prior_result.step_id
    and st.session_id = p_session_id
    and st.workspace_id = p_workspace_id;

  if not found then
    raise exception 'inventory_migration_ack_prior_step_not_found';
  end if;

  if v_prior_step.status is distinct from 'completed' then
    raise exception 'inventory_migration_ack_prior_step_not_completed';
  end if;

  if v_prior_step.step_name is distinct from v_prior_result.step_name then
    raise exception 'inventory_migration_ack_prior_result_inconsistent';
  end if;

  -- Exact V1 boundaries only.
  if not (
    (v_prior_step.step_name = 'integrity_audit' and v_next_step_name = 'preflight')
    or (v_prior_step.step_name = 'preview' and v_next_step_name = 'phase1')
    or (v_prior_step.step_name = 'phase1' and v_next_step_name = 'phase2')
  ) then
    raise exception 'inventory_migration_ack_invalid_boundary';
  end if;

  select st.*
  into v_next_step
  from public.inventory_migration_session_steps st
  where st.session_id = p_session_id
    and st.workspace_id = p_workspace_id
    and st.step_name = v_next_step_name;

  if not found then
    raise exception 'inventory_migration_ack_next_step_not_found';
  end if;

  if v_next_step.status = 'completed' then
    raise exception 'inventory_migration_ack_next_step_already_completed';
  end if;

  -- Idempotent: return existing acknowledgement for same prior result + next stage.
  select a.*
  into v_existing
  from public.inventory_migration_stage_attention_acknowledgements a
  where a.prior_result_id = v_prior_result.id
    and a.next_step_name = v_next_step_name;

  if found then
    return next v_existing;
    return;
  end if;

  insert into public.inventory_migration_stage_attention_acknowledgements (
    workspace_id,
    session_id,
    prior_step_id,
    prior_result_id,
    prior_step_name,
    next_step_id,
    next_step_name,
    acknowledged_by,
    operator_display_name,
    note,
    acknowledged_at
  )
  values (
    p_workspace_id,
    p_session_id,
    v_prior_step.id,
    v_prior_result.id,
    v_prior_step.step_name,
    v_next_step.id,
    v_next_step.step_name,
    v_auth_user_id,
    v_operator_display_name,
    v_note,
    now()
  )
  returning * into v_ack;

  v_activity_text := format(
    'Attention acknowledged: %s → %s (result_id=%s, ack_id=%s%s).',
    v_ack.prior_step_name,
    v_ack.next_step_name,
    v_ack.prior_result_id,
    v_ack.id,
    case
      when v_ack.note is null then ''
      else format(', note=%s', left(v_ack.note, 120))
    end
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
    p_session_id,
    p_workspace_id,
    'note',
    v_activity_text,
    v_auth_user_id,
    v_operator_display_name
  );

  return next v_ack;
end;
$$;

revoke all on function public.acknowledge_inventory_migration_stage_attention(
  uuid, uuid, uuid, text, text
) from public;
revoke all on function public.acknowledge_inventory_migration_stage_attention(
  uuid, uuid, uuid, text, text
) from anon;
grant execute on function public.acknowledge_inventory_migration_stage_attention(
  uuid, uuid, uuid, text, text
) to authenticated;

comment on function public.acknowledge_inventory_migration_stage_attention(
  uuid, uuid, uuid, text, text
) is
  'P7.9.4 SECURITY DEFINER acknowledgement of attention_required prior result for one V1 next-stage boundary. Immutable. Not a force override. Does not execute stages.';

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- select to_regclass('public.inventory_migration_stage_attention_acknowledgements');

-- select pg_get_functiondef(
--   'public.acknowledge_inventory_migration_stage_attention(uuid,uuid,uuid,text,text)'::regprocedure
-- );

-- Example:
--   select * from public.acknowledge_inventory_migration_stage_attention(
--     '<workspace>',
--     '<session>',
--     '<prior_result_id>',
--     'preflight',
--     null
--   );

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.acknowledge_inventory_migration_stage_attention(
--   uuid, uuid, uuid, text, text
-- );
-- drop table if exists public.inventory_migration_stage_attention_acknowledgements;
