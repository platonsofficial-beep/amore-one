-- Proof of consent for the Terms, Privacy Policy, and Data Processing Agreement.
-- NOT APPLIED. Platon reviews this file before anyone runs it.
-- Do not apply it to the live project from the app or from CI.
-- Until this table exists, the app stores the same record in localStorage
-- and still shows the acceptance gate.

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid,
  bundle_id text not null,
  document_versions jsonb not null,
  includes_dpa boolean not null default false,
  accepted_at timestamptz not null default now(),
  locale text,
  user_agent text
);

create index if not exists legal_acceptances_user_idx
  on public.legal_acceptances (user_id, bundle_id);

alter table public.legal_acceptances enable row level security;

create policy legal_acceptances_insert_own
  on public.legal_acceptances
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy legal_acceptances_select_own
  on public.legal_acceptances
  for select
  to authenticated
  using (user_id = auth.uid());

create policy legal_acceptances_select_venue_owner
  on public.legal_acceptances
  for select
  to authenticated
  using (
    workspace_id is not null
    and exists (
      select 1 from public.workspace_members
      where workspace_id = legal_acceptances.workspace_id
        and auth_user_id = auth.uid()
        and role = 'owner'
    )
  );
