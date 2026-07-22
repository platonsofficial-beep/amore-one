-- =============================================================================
-- P8.15.2 — Inventory Import V1 session schema foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor.
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Persistent workspace-scoped staging for spreadsheet import sessions and
--   staged rows (Inventory Import V1). Final destination remains stock_items
--   via a future server-authoritative Apply RPC (not created here).
--
-- Contract:
--   docs/stock_inventory_import_v1_contract.md (import_v1.0)
--
-- This script:
--   - Creates public.inventory_import_sessions
--   - Creates public.inventory_import_rows
--   - Adds CHECKs, indexes, updated_at triggers, grants, RLS
--
-- Does NOT:
--   - Create Apply / parser / validation RPCs
--   - Mutate stock_items / stock_movements / inventory_items
--   - Touch inventory_stock_item_map or migration session tables
--   - Store raw file bytes
--
-- Lifecycle transition enforcement is a future service/RPC responsibility.
--
-- Prerequisites:
--   1. public.workspaces exists
--   2. auth.users exists
--   3. public.workspace_members exists
--   4. public.stock_items exists (nullable FK targets only)
--   5. public.is_workspace_member / can_manage_workspace_stock (ensured below)
-- =============================================================================

-- Ensure Stock permission helpers exist (idempotent; same bodies as stock_rls_policies).
-- Does not alter helper semantics; required so this file is self-contained.
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
-- Table 1: inventory_import_sessions
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_import_sessions (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  created_by uuid not null
    references auth.users(id),

  updated_by uuid
    references auth.users(id) on delete set null,

  -- Source metadata (no raw file bytes)
  source_filename text not null default '',
  source_format text
    constraint inventory_import_sessions_source_format_chk
      check (
        source_format is null
        or source_format in ('csv', 'xlsx')
      ),
  source_file_size_bytes bigint
    constraint inventory_import_sessions_source_file_size_chk
      check (
        source_file_size_bytes is null
        or source_file_size_bytes >= 0
      ),
  source_fingerprint text
    constraint inventory_import_sessions_source_fingerprint_chk
      check (
        source_fingerprint is null
        or length(trim(source_fingerprint)) > 0
      ),
  selected_sheet text not null default '',
  header_row_number integer
    constraint inventory_import_sessions_header_row_number_chk
      check (
        header_row_number is null
        or header_row_number > 0
      ),

  -- Contract / version metadata
  contract_version text not null default 'import_v1.0'
    constraint inventory_import_sessions_contract_version_chk
      check (length(trim(contract_version)) > 0),
  parser_version text
    constraint inventory_import_sessions_parser_version_chk
      check (
        parser_version is null
        or length(trim(parser_version)) > 0
      ),
  normalization_version text
    constraint inventory_import_sessions_normalization_version_chk
      check (
        normalization_version is null
        or length(trim(normalization_version)) > 0
      ),
  validation_version text
    constraint inventory_import_sessions_validation_version_chk
      check (
        validation_version is null
        or length(trim(validation_version)) > 0
      ),

  -- Mapping and configuration evidence
  mapping jsonb not null default '{}'::jsonb,
  confirmations jsonb not null default '{}'::jsonb,
  source_metadata jsonb not null default '{}'::jsonb,

  -- Session lifecycle (exact Import V1 statuses)
  status text not null default 'draft'
    constraint inventory_import_sessions_status_chk
      check (status in (
        'draft',
        'parsing',
        'mapping',
        'validating',
        'review',
        'ready',
        'applying',
        'completed',
        'failed',
        'cancelled'
      )),

  -- Operator summary counters (non-negative)
  total_rows integer not null default 0
    constraint inventory_import_sessions_total_rows_chk check (total_rows >= 0),
  valid_rows integer not null default 0
    constraint inventory_import_sessions_valid_rows_chk check (valid_rows >= 0),
  warning_rows integer not null default 0
    constraint inventory_import_sessions_warning_rows_chk check (warning_rows >= 0),
  error_rows integer not null default 0
    constraint inventory_import_sessions_error_rows_chk check (error_rows >= 0),
  manual_review_rows integer not null default 0
    constraint inventory_import_sessions_manual_review_rows_chk check (manual_review_rows >= 0),
  create_rows integer not null default 0
    constraint inventory_import_sessions_create_rows_chk check (create_rows >= 0),
  link_rows integer not null default 0
    constraint inventory_import_sessions_link_rows_chk check (link_rows >= 0),
  update_rows integer not null default 0
    constraint inventory_import_sessions_update_rows_chk check (update_rows >= 0),
  skip_rows integer not null default 0
    constraint inventory_import_sessions_skip_rows_chk check (skip_rows >= 0),
  applied_rows integer not null default 0
    constraint inventory_import_sessions_applied_rows_chk check (applied_rows >= 0),
  failed_rows integer not null default 0
    constraint inventory_import_sessions_failed_rows_chk check (failed_rows >= 0),

  -- Apply lifecycle evidence (Apply RPC not created in this sprint)
  ready_at timestamptz,
  apply_started_at timestamptz,
  apply_completed_at timestamptz,
  apply_started_by uuid
    references auth.users(id) on delete set null,
  apply_idempotency_key text
    constraint inventory_import_sessions_apply_idempotency_key_chk
      check (
        apply_idempotency_key is null
        or length(trim(apply_idempotency_key)) > 0
      ),
  apply_result jsonb not null default '{}'::jsonb,
  failure_summary text not null default '',

  completed_at timestamptz,
  cancelled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inventory_import_sessions_apply_timestamps_chk
    check (
      apply_completed_at is null
      or (
        apply_started_at is not null
        and apply_completed_at >= apply_started_at
      )
    )
);

comment on table public.inventory_import_sessions is
  'P8.15.2 Inventory Import V1 session envelope. Staging only; Apply RPC writes stock_items later. Separate from inventory migration.';

comment on column public.inventory_import_sessions.status is
  'Import session lifecycle. Transition enforcement is a future RPC/service responsibility.';

comment on column public.inventory_import_sessions.mapping is
  'Column mapping configuration JSON. Not operational status.';

comment on column public.inventory_import_sessions.confirmations is
  'Session-level operator confirmations (e.g. location/category fallbacks, apply intent).';

comment on column public.inventory_import_sessions.apply_idempotency_key is
  'Nullable until apply; unique per workspace when set for duplicate apply detection.';

comment on column public.inventory_import_sessions.apply_result is
  'Server apply evidence JSON. Empty until Apply RPC runs.';

-- -----------------------------------------------------------------------------
-- Table 2: inventory_import_rows
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_import_rows (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null
    references public.inventory_import_sessions(id) on delete cascade,

  -- Denormalized for indexes; RLS authorizes via parent session workspace.
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  source_row_number integer not null
    constraint inventory_import_rows_source_row_number_chk
      check (source_row_number > 0),

  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  mapping_evidence jsonb not null default '{}'::jsonb,

  source_fingerprint text not null default ''
    constraint inventory_import_rows_source_fingerprint_chk
      check (
        source_fingerprint = ''
        or length(trim(source_fingerprint)) > 0
      ),

  -- Validation state (orthogonal to conflict / action / apply)
  validation_state text not null default 'pending'
    constraint inventory_import_rows_validation_state_chk
      check (validation_state in (
        'pending',
        'valid',
        'warning',
        'error'
      )),
  validation_messages jsonb not null default '[]'::jsonb,
  validation_version text
    constraint inventory_import_rows_validation_version_chk
      check (
        validation_version is null
        or length(trim(validation_version)) > 0
      ),

  -- Conflict state
  conflict_state text not null default 'none'
    constraint inventory_import_rows_conflict_state_chk
      check (conflict_state in (
        'none',
        'exact_match',
        'possible_match',
        'duplicate_in_file',
        'duplicate_previous_import',
        'ambiguous'
      )),
  conflict_evidence jsonb not null default '{}'::jsonb,

  matched_stock_item_id uuid
    references public.stock_items(id) on delete set null,

  proposed_action text
    constraint inventory_import_rows_proposed_action_chk
      check (
        proposed_action is null
        or proposed_action in (
          'create',
          'link',
          'update',
          'skip',
          'manual_review'
        )
      ),
  selected_action text
    constraint inventory_import_rows_selected_action_chk
      check (
        selected_action is null
        or selected_action in (
          'create',
          'link',
          'update',
          'skip',
          'manual_review'
        )
      ),

  -- Critical row-level confirmations (typed; not ambiguous text)
  confirm_quantity_update boolean not null default false,
  confirm_location_fallback boolean not null default false,

  -- Apply state
  apply_state text not null default 'pending'
    constraint inventory_import_rows_apply_state_chk
      check (apply_state in (
        'pending',
        'applied',
        'skipped',
        'failed'
      )),
  applied_stock_item_id uuid
    references public.stock_items(id) on delete set null,
  apply_result jsonb not null default '{}'::jsonb,
  apply_error_code text not null default '',
  apply_error_message text not null default '',
  applied_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inventory_import_rows_session_row_uidx
    unique (session_id, source_row_number)
);

comment on table public.inventory_import_rows is
  'P8.15.2 Staged import rows. Raw vs normalized payloads remain distinct. Does not write stock_items.';

comment on column public.inventory_import_rows.raw_payload is
  'Original parsed cell evidence. Never authoritative for apply.';

comment on column public.inventory_import_rows.normalized_payload is
  'Normalized candidate field values after import normalization.';

comment on column public.inventory_import_rows.validation_state is
  'Row validation lifecycle; separate from conflict_state, actions, and apply_state.';

comment on column public.inventory_import_rows.conflict_state is
  'Conflict classification; duplicate_in_file rows are staged for review (no unique fingerprint reject).';

comment on column public.inventory_import_rows.matched_stock_item_id is
  'Optional existing stock_items match. FK does not prove workspace alignment; Apply RPC must verify.';

comment on column public.inventory_import_rows.applied_stock_item_id is
  'Stock item created or linked after apply. Null until Apply RPC succeeds.';

comment on column public.inventory_import_rows.session_id is
  'ON DELETE CASCADE: draft/cancelled session cleanup removes staged rows. Terminal apply protection is a future mutation RPC concern.';

-- -----------------------------------------------------------------------------
-- Indexes (sessions)
-- -----------------------------------------------------------------------------
create index if not exists inventory_import_sessions_workspace_created_at_idx
  on public.inventory_import_sessions (workspace_id, created_at desc);

create index if not exists inventory_import_sessions_workspace_status_idx
  on public.inventory_import_sessions (workspace_id, status);

create index if not exists inventory_import_sessions_source_fingerprint_idx
  on public.inventory_import_sessions (workspace_id, source_fingerprint)
  where source_fingerprint is not null;

create index if not exists inventory_import_sessions_created_by_idx
  on public.inventory_import_sessions (created_by);

-- One non-null apply idempotency key per workspace (not global across workspaces).
-- Separate sessions may proceed in parallel; duplicate apply submits reuse the same key.
create unique index if not exists inventory_import_sessions_apply_idempotency_uidx
  on public.inventory_import_sessions (workspace_id, apply_idempotency_key)
  where apply_idempotency_key is not null;

-- -----------------------------------------------------------------------------
-- Indexes (rows)
-- -----------------------------------------------------------------------------
-- unique (session_id, source_row_number) already covers session + row lookups.
-- In-flight apply exclusivity is represented by status = 'applying' (one row per session PK)
-- and enforced by the future Apply RPC — no extra partial unique required.

create index if not exists inventory_import_rows_session_validation_state_idx
  on public.inventory_import_rows (session_id, validation_state);

create index if not exists inventory_import_rows_session_conflict_state_idx
  on public.inventory_import_rows (session_id, conflict_state);

create index if not exists inventory_import_rows_session_selected_action_idx
  on public.inventory_import_rows (session_id, selected_action);

create index if not exists inventory_import_rows_session_apply_state_idx
  on public.inventory_import_rows (session_id, apply_state);

create index if not exists inventory_import_rows_matched_stock_item_id_idx
  on public.inventory_import_rows (matched_stock_item_id)
  where matched_stock_item_id is not null;

create index if not exists inventory_import_rows_applied_stock_item_id_idx
  on public.inventory_import_rows (applied_stock_item_id)
  where applied_stock_item_id is not null;

-- Non-unique: duplicate fingerprints must be staggable for duplicate_in_file review.
create index if not exists inventory_import_rows_session_source_fingerprint_idx
  on public.inventory_import_rows (session_id, source_fingerprint)
  where source_fingerprint <> '';

create index if not exists inventory_import_rows_workspace_source_fingerprint_idx
  on public.inventory_import_rows (workspace_id, source_fingerprint)
  where source_fingerprint <> '';

create index if not exists inventory_import_rows_workspace_idx
  on public.inventory_import_rows (workspace_id);

-- -----------------------------------------------------------------------------
-- updated_at triggers (per-table functions; repository convention)
-- -----------------------------------------------------------------------------
create or replace function public.set_inventory_import_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inventory_import_sessions_set_updated_at
  on public.inventory_import_sessions;

create trigger inventory_import_sessions_set_updated_at
  before update on public.inventory_import_sessions
  for each row
  execute function public.set_inventory_import_sessions_updated_at();

create or replace function public.set_inventory_import_rows_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inventory_import_rows_set_updated_at
  on public.inventory_import_rows;

create trigger inventory_import_rows_set_updated_at
  before update on public.inventory_import_rows
  for each row
  execute function public.set_inventory_import_rows_updated_at();

-- -----------------------------------------------------------------------------
-- Privileges + RLS
-- -----------------------------------------------------------------------------
alter table public.inventory_import_sessions enable row level security;
alter table public.inventory_import_rows enable row level security;

revoke all on table public.inventory_import_sessions from public;
revoke all on table public.inventory_import_sessions from anon;
revoke all on table public.inventory_import_sessions from authenticated;

revoke all on table public.inventory_import_rows from public;
revoke all on table public.inventory_import_rows from anon;
revoke all on table public.inventory_import_rows from authenticated;

grant select, insert, update, delete on table public.inventory_import_sessions to authenticated;
grant select, insert, update, delete on table public.inventory_import_rows to authenticated;

-- Sessions: members read; stock managers write
drop policy if exists inventory_import_sessions_select_members
  on public.inventory_import_sessions;
create policy inventory_import_sessions_select_members
  on public.inventory_import_sessions
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists inventory_import_sessions_insert_managers
  on public.inventory_import_sessions;
create policy inventory_import_sessions_insert_managers
  on public.inventory_import_sessions
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists inventory_import_sessions_update_managers
  on public.inventory_import_sessions;
create policy inventory_import_sessions_update_managers
  on public.inventory_import_sessions
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists inventory_import_sessions_delete_managers
  on public.inventory_import_sessions;
create policy inventory_import_sessions_delete_managers
  on public.inventory_import_sessions
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

-- Rows: authorize through parent session workspace (do not trust row.workspace_id alone).
drop policy if exists inventory_import_rows_select_members
  on public.inventory_import_rows;
create policy inventory_import_rows_select_members
  on public.inventory_import_rows
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.inventory_import_sessions s
      where s.id = inventory_import_rows.session_id
        and s.workspace_id = inventory_import_rows.workspace_id
        and public.is_workspace_member(s.workspace_id)
    )
  );

drop policy if exists inventory_import_rows_insert_managers
  on public.inventory_import_rows;
create policy inventory_import_rows_insert_managers
  on public.inventory_import_rows
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.inventory_import_sessions s
      where s.id = inventory_import_rows.session_id
        and s.workspace_id = inventory_import_rows.workspace_id
        and public.can_manage_workspace_stock(s.workspace_id)
    )
  );

drop policy if exists inventory_import_rows_update_managers
  on public.inventory_import_rows;
create policy inventory_import_rows_update_managers
  on public.inventory_import_rows
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.inventory_import_sessions s
      where s.id = inventory_import_rows.session_id
        and s.workspace_id = inventory_import_rows.workspace_id
        and public.can_manage_workspace_stock(s.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.inventory_import_sessions s
      where s.id = inventory_import_rows.session_id
        and s.workspace_id = inventory_import_rows.workspace_id
        and public.can_manage_workspace_stock(s.workspace_id)
    )
  );

drop policy if exists inventory_import_rows_delete_managers
  on public.inventory_import_rows;
create policy inventory_import_rows_delete_managers
  on public.inventory_import_rows
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.inventory_import_sessions s
      where s.id = inventory_import_rows.session_id
        and s.workspace_id = inventory_import_rows.workspace_id
        and public.can_manage_workspace_stock(s.workspace_id)
    )
  );

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================
-- select to_regclass('public.inventory_import_sessions');
-- select to_regclass('public.inventory_import_rows');
-- select tablename, rowsecurity from pg_tables
--   where schemaname = 'public'
--     and tablename in ('inventory_import_sessions', 'inventory_import_rows');
-- select policyname, cmd, qual, with_check
--   from pg_policies
--   where tablename in ('inventory_import_sessions', 'inventory_import_rows')
--   order by tablename, policyname;
