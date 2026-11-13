-- ONE subscriptions — PROPOSAL ONLY. SQL NOT APPLIED.
-- Do not run this against the live Supabase project from the planning pass.
-- See docs/subscriptions/PLAN.md.

-- Billing account: the person who pays. A venue (workspaces row) does not
-- hold its own Stripe customer. Several venues can share one account.

create table if not exists public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_auth_user_id uuid not null references auth.users (id),
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null default 'start'
    check (plan in ('start', 'pro', 'group')),
  billing_interval text not null default 'month'
    check (billing_interval in ('month', 'month3', 'month6', 'year')),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'locked', 'canceled')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  past_due_since timestamptz,
  extra_venue_qty integer not null default 0 check (extra_venue_qty >= 0),
  comped boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists billing_accounts_owner_idx
  on public.billing_accounts (owner_auth_user_id);

create unique index if not exists billing_accounts_stripe_customer_idx
  on public.billing_accounts (stripe_customer_id)
  where stripe_customer_id is not null;

create table if not exists public.billing_account_venues (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  billing_account_id uuid not null references public.billing_accounts (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists billing_account_venues_account_idx
  on public.billing_account_venues (billing_account_id);

alter table public.billing_accounts enable row level security;
alter table public.billing_account_venues enable row level security;

-- Members of a linked venue may read status. They may not change it.
-- The Stripe webhook uses the service role and bypasses RLS.

drop policy if exists billing_accounts_select_members on public.billing_accounts;
create policy billing_accounts_select_members
  on public.billing_accounts
  for select
  to authenticated
  using (
    owner_auth_user_id = auth.uid()
    or exists (
      select 1
      from public.billing_account_venues v
      join public.workspace_members wm on wm.workspace_id = v.workspace_id
      where v.billing_account_id = billing_accounts.id
        and wm.auth_user_id = auth.uid()
    )
  );

drop policy if exists billing_account_venues_select_members on public.billing_account_venues;
create policy billing_account_venues_select_members
  on public.billing_account_venues
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = billing_account_venues.workspace_id
        and wm.auth_user_id = auth.uid()
    )
  );

revoke insert, update, delete on public.billing_accounts from anon, authenticated;
revoke insert, update, delete on public.billing_account_venues from anon, authenticated;

-- True when this venue may still change data.
-- comped: demo and internal venues.
-- trialing: free month still in the future.
-- active: paid period still open.
-- past_due: 3 days of grace, then the webhook or the daily job sets locked.

create or replace function public.workspace_allows_writes(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.billing_account_venues v
    join public.billing_accounts a on a.id = v.billing_account_id
    where v.workspace_id = target_workspace_id
      and (
        a.comped
        or (a.status = 'trialing' and a.trial_ends_at is not null and a.trial_ends_at > now())
        or (a.status = 'active' and (a.current_period_end is null or a.current_period_end > now()))
        or (
          a.status = 'past_due'
          and a.past_due_since is not null
          and a.past_due_since > now() - interval '3 days'
        )
      )
  );
$$;

revoke all on function public.workspace_allows_writes(uuid) from public, anon;
grant execute on function public.workspace_allows_writes(uuid) to authenticated;

-- Writes on operational tables should call this. Reads stay allowed.
-- Security-definer RPCs (chat, stock, schedule publish, create_workspace_venue)
-- bypass row policies and must call workspace_allows_writes themselves.
-- Applying the trigger to every table is a later, reviewed migration.
-- This proposal only installs the function. It does not attach triggers yet,
-- so running the file by mistake does not lock the live app.

comment on function public.workspace_allows_writes(uuid) is
  'PLAN ONLY. Not attached to tables in this file.';
